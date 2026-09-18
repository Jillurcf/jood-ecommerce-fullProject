// Load environment variables
require('dotenv').config();

// Import PostgreSQL Pool
const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
  max: 10,                  // max connections
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 2000 // 2 seconds
});

// Wrapper for queries
const query = async (text, params) => {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } catch (err) {
    console.error('DB Query Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

// Optional: test connection
pool.on('connect', () => console.log('PostgreSQL connected'));
pool.on('error', err => console.error('Unexpected DB error', err));

// Export for inclusion
module.exports = { pool, query };
