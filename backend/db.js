require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const sslEnabled = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';
let ssl;

if (sslEnabled) {
  const options = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  };

  // For providers such as Aiven, download the CA certificate and set
  // DB_SSL_CA=./certs/ca.pem in backend/.env. Never disable certificate checks.
  if (process.env.DB_SSL_CA) {
    const caPath = path.isAbsolute(process.env.DB_SSL_CA)
      ? process.env.DB_SSL_CA
      : path.resolve(__dirname, process.env.DB_SSL_CA);
    options.ca = fs.readFileSync(caPath, 'utf8');
  }
  ssl = options;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'HIRELYDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4',
  ...(ssl ? { ssl } : {})
});

module.exports = pool;
