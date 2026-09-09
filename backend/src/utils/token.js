import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const createToken = (userId) =>
  jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
