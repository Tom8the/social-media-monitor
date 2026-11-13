const { Pool, types } = require('pg');
const timeZone = process.env.DB_TIMEZONE || 'America/Los_Angeles';
const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 5432);
const user = process.env.DB_USER || 'social_media_monitor';
const database = process.env.DB_NAME || 'social_media_monitor';

function parseInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
}

function createPool(overrides = {}) {
  return new Pool({
    host,
    port,
    user,
    database,
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_POOL_LIMIT || 10),
    connectionTimeoutMillis: 5000,
    options: '-c TimeZone=' + timeZone,
    types: {
      getTypeParser(oid, format) {
        if (format !== 'binary' && [types.builtins.INT8, types.builtins.NUMERIC].includes(oid)) return parseInteger;
        return types.getTypeParser(oid, format);
      }
    },
    ...overrides
  });
}

module.exports = { createPool, timeZone };
