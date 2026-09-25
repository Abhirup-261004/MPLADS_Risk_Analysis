import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const fastApiEnabled = process.env.FASTAPI_ENABLED === undefined
  ? nodeEnv !== 'production'
  : process.env.FASTAPI_ENABLED.toLowerCase() === 'true';
const clientUrls = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export const env = {
  clientUrls,
  fastApiEnabled,
  fastApiUrl: process.env.FASTAPI_URL || (fastApiEnabled ? 'http://localhost:8000' : null),
  fastApiApiKey: process.env.MPLADS_API_KEY || 'mpladsAPI123',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtSecret: process.env.JWT_SECRET,
  mongoUri: process.env.MONGODB_URI,
  nodeEnv,
  port: Number(process.env.PORT || 5001),
};
