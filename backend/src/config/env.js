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

export const env = {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtSecret: process.env.JWT_SECRET,
  mongoUri: process.env.MONGODB_URI,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5001),
  mlApiUrl: process.env.ML_API_URL || 'http://localhost:8000',
};
