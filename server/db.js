const dotenv = require('dotenv');
dotenv.config();
const mysql = require('mysql2/promise');
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  // try loading from parent (workspace root) if user placed .env there
  dotenv.config({ path: '../.env' });
}
const connection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = connection;