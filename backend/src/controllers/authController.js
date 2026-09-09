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

export const updateProfile = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').toLowerCase().trim();

  if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' });
  if (name.length > 80) return res.status(400).json({ message: 'Name must be 80 characters or fewer.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Provide a valid email address.' });

  const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
  if (existingUser) return res.status(409).json({ message: 'This email is already in use.' });

  req.user.name = name;
  req.user.email = email;
  await req.user.save();

  res.json({ user: req.user.toSafeObject() });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const allowedViews = ['all', 'unread', 'critical', 'warnings', 'system'];
  const preferences = req.body.preferences || {};
  const notificationPreferences = req.body.notificationPreferences || {};
  const notificationDefaults = {
    riskAlerts: true,
    anomalyAlerts: true,
    delayAlerts: true,
    costAnomalies: true,
    paymentMismatch: true,
    duplicateWorkAlerts: true,
    complianceAlerts: true,
    systemNotifications: true,
    reportNotifications: true,
  };

  if (preferences.defaultFinancialYear !== undefined) req.user.preferences.defaultFinancialYear = String(preferences.defaultFinancialYear).trim().slice(0, 20);
  if (preferences.defaultState !== undefined) req.user.preferences.defaultState = String(preferences.defaultState).trim().slice(0, 80);
  if (allowedViews.includes(preferences.defaultNotificationView)) req.user.preferences.defaultNotificationView = preferences.defaultNotificationView;
  if (preferences.itemsPerPage !== undefined) req.user.preferences.itemsPerPage = Math.min(Math.max(Number(preferences.itemsPerPage) || 25, 10), 100);

  Object.keys(notificationDefaults).forEach((key) => {
    if (notificationPreferences[key] !== undefined) req.user.notificationPreferences[key] = Boolean(notificationPreferences[key]);
  });

  await req.user.save({ validateModifiedOnly: true });
  res.json({ user: req.user.toSafeObject() });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current password and new password are required.' });
  if (String(newPassword).length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(currentPassword))) return res.status(401).json({ message: 'Current password is incorrect.' });

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully.' });
});
