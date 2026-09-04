import asyncHandler from 'express-async-handler';
import { User } from '../models/User.js';
import { createToken } from '../utils/token.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password)) || !user.isActive) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  res.json({ token: createToken(user._id.toString()), user: user.toSafeObject() });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' });
  const user = await User.create({ name, email, password });
  res.status(201).json({ token: createToken(user._id.toString()), user: user.toSafeObject() });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});
