const fs = require('fs');
const path = require('path');
const mysql = require('../server/node_modules/mysql2/promise');

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getArg(name, fallback = null) {
  const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index === -1) return fallback;
  const arg = process.argv[index];
  if (arg.includes('=')) return arg.split('=').slice(1).join('=');
  return process.argv[index + 1] || fallback;
}

async function main() {
  const outputPath = getArg('--output', path.join(process.cwd(), 'database-export.sql'));
  if (!process.env.DB_PASSWORD) throw new Error('Set DB_PASSWORD for the legacy MySQL database.');
  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: getEnvInt('DB_PORT', 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'social_media_monitor'
  };

  const connection = await mysql.createConnection(dbConfig);
  const [tablesRows] = await connection.query(
    'SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [dbConfig.database]
  );
  const tables = tablesRows.map((row) => row.tableName);

  let sql = '';
  sql += 'SET NAMES utf8mb4;\n';
  sql += 'SET FOREIGN_KEY_CHECKS=0;\n\n';

  for (const table of tables) {
    const [createRows] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createRows[0]['Create Table'];
    sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
    sql += `${createSql};\n\n`;

    const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
    if (!rows.length) continue;

    const columns = Object.keys(rows[0]);
    const columnSql = columns.map((column) => `\`${column}\``).join(', ');
    const valuesSql = rows.map((row) => {
      const values = columns.map((column) => connection.escape(row[column]));
      return `(${values.join(', ')})`;
    });
    sql += `INSERT INTO \`${table}\` (${columnSql}) VALUES\n`;
    sql += `${valuesSql.join(',\n')};\n\n`;
  }

  sql += 'SET FOREIGN_KEY_CHECKS=1;\n';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql, 'utf8');
  await connection.end();
  console.log(`Database export written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
