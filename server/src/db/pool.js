const mysql = require("mysql2/promise");

let pool;

function configFromEnv() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "stylearz",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "stylearz",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL || 10),
    namedPlaceholders: true,
    timezone: "Z",
    charset: "utf8mb4",
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(configFromEnv());
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function ping() {
  const rows = await query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  configFromEnv,
  getPool,
  query,
  withTransaction,
  ping,
  closePool,
};
