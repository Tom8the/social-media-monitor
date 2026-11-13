const { createHash } = require('node:crypto');
const mysql = require('../server/node_modules/mysql2/promise');
require('../server/src/load-env');
const { createPool, timeZone } = require('../server/src/postgres-config');

const tables = ['platforms', 'account_groups', 'accounts', 'videos', 'sync_logs', 'alerts', 'daily_stats', 'global_cookies'];

function quoteIdentifier(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

function normalizeRow(row, fields) {
  const normalized = {};
  for (const field of fields) {
    let value = row[field.name];
    if (value !== null && field.columnType === mysql.Types.JSON) value = typeof value === 'string' ? value : JSON.stringify(value);
    if (field.name === 'is_valid' && value !== null) value = Boolean(value);
    normalized[field.name] = value;
  }
  return normalized;
}

function digestRows(rows, columns) {
  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(JSON.stringify(columns.map(column => row[column]), (_, value) => {
      if (value === null || typeof value === 'object' || typeof value === 'boolean') return value;
      return String(value);
    }));
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function migrate() {
  if (!process.env.MYSQL_SOURCE_PASSWORD) throw new Error('Set MYSQL_SOURCE_PASSWORD for the source MySQL database.');
  const source = await mysql.createConnection({
    host: process.env.MYSQL_SOURCE_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_SOURCE_PORT || 3306),
    user: process.env.MYSQL_SOURCE_USER || 'root',
    password: process.env.MYSQL_SOURCE_PASSWORD,
    database: process.env.MYSQL_SOURCE_DB || 'social_media_monitor',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    jsonStrings: true
  });
  const destination = createPool();
  let client;
  try {
    await source.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    client = await destination.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE ' + tables.join(', ') + ' IN SHARE ROW EXCLUSIVE MODE');
    for (const table of tables.filter(table => table !== 'platforms')) {
      const { rowCount } = await client.query('SELECT 1 FROM ' + table + ' LIMIT 1');
      if (rowCount) throw new Error('Destination already contains rows in ' + table + '. Use a fresh database.');
    }

    await client.query('DELETE FROM platforms');
    const report = [];
    for (const table of tables) {
      const [sourceRows, fields] = await source.query('SELECT * FROM ?? ORDER BY id', [table]);
      const columns = fields.map(field => field.name);
      const rows = sourceRows.map(row => normalizeRow(row, fields));
      const columnSql = columns.map(quoteIdentifier).join(', ');
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        const params = [];
        const placeholders = batch.map(row => '(' + columns.map(column => '$' + params.push(row[column])).join(', ') + ')');
        await client.query('INSERT INTO ' + table + ' (' + columnSql + ') VALUES ' + placeholders.join(', '), params);
      }

      // Read back the imported values in the source wall-clock timezone and compare every column.
      const selection = fields.map(field => {
        const column = quoteIdentifier(field.name);
        if ([mysql.Types.DATETIME, mysql.Types.TIMESTAMP, mysql.Types.DATE].includes(field.columnType)) {
          const pattern = field.columnType === mysql.Types.DATE ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:MI:SS';
          return "to_char(" + column + ", '" + pattern + "') AS " + column;
        }
        return column;
      });
      const { rows: restored } = await client.query('SELECT ' + selection.join(', ') + ' FROM ' + table);
      const jsonColumns = fields.filter(field => field.columnType === mysql.Types.JSON).map(field => field.name);
      for (const column of jsonColumns) {
        for (const row of rows) if (row[column] !== null) row[column] = canonicalJson(JSON.parse(row[column]));
        for (const row of restored) if (row[column] !== null) row[column] = canonicalJson(row[column]);
      }
      const byId = (left, right) => {
        const leftId = String(left.id);
        const rightId = String(right.id);
        return leftId < rightId ? -1 : Number(leftId > rightId);
      };
      if (rows.length !== restored.length || digestRows(rows.sort(byId), columns) !== digestRows(restored.sort(byId), columns)) {
        throw new Error('Verification mismatch in ' + table + ' (source timezone: ' + timeZone + ').');
      }
      report.push({ table, rows: rows.length });
    }

    const { rows: [orphans] } = await client.query(
      'SELECT COUNT(*)::integer AS total FROM videos v LEFT JOIN accounts a ON a.id = v.account_id WHERE a.id IS NULL'
    );
    await client.query("SELECT setval(pg_get_serial_sequence('platforms', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM platforms");
    await client.query('COMMIT');
    console.table(report);
    console.log('Videos with no matching account:', orphans.total);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
    await Promise.allSettled([destination.end(), source.end()]);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
  }
  return value;
}

migrate().catch(error => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
