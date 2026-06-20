const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env'), override: true });

const required = ['JWT_SECRET'];

function validateEnv() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`Missing environment values: ${missing.join(', ')}`);
  }
}

validateEnv();

module.exports = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
};
