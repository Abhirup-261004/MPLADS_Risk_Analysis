import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) return res.status(401).json({ message: 'Authentication is required.' });

  try {
    const { sub } = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(sub);
    if (!user || !user.isActive) throw new Error('User unavailable');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Your session is invalid or has expired.' });
  }
});
