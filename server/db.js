const dotenv = require('dotenv');
dotenv.config();
const mysql = require('mysql2/promise');
const fs = require('fs');

// Nếu .env nằm ở thư mục cha, load thêm
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  dotenv.config({ path: '../.env' });
}

// ✅ Tự động cấu hình SSL nếu cần (Render/TiDB Cloud)
let sslConfig;
if (
  process.env.DB_SSL === 'true' ||
  /tidbcloud\.com$/i.test(process.env.DB_HOST || '') ||
  process.env.DB_PORT === '4000'
) {
  try {
    const caPath = process.env.DB_SSL_CA_PATH || '/etc/secrets/isrgrootx1.pem';
    sslConfig = {
      ca: fs.readFileSync(caPath, 'utf8'),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    };
    console.log('✅ SSL enabled for TiDB Cloud');
  } catch (err) {
    console.warn('⚠️ Could not load CA cert file:', err.message);
  }
}

// ✅ Tạo connection pool
const connection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  ssl: sslConfig, // chỉ thêm khi cần
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = connection;
