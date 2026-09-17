import crypto from 'node:crypto';
import asyncHandler from 'express-async-handler';
import { User, PROFILE_TYPES } from '../models/User.js';
import { GovernanceAudit, GovernanceChange, GovernanceConfig, IntegrationKey } from '../models/Governance.js';

const safeUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, profileType: user.profileType, organization: user.organization, state: user.state, district: user.district, agencyName: user.agencyName, isActive: user.isActive, lastLoginAt: user.lastLoginAt });
const audit = (req, action, target, reason, payload = {}) => GovernanceAudit.create({ actorId: req.user._id, actorName: req.user.name, action, target, reason, payload });
const highImpact = new Set(['ROLE_CHANGE', 'DEACTIVATE_USER', 'PUBLIC_REDACTION', 'API_KEY_CREATE', 'INTEGRATION_CHANGE', 'RETENTION_CHANGE']);

export const getGovernance = asyncHandler(async (req, res) => {
  const [users, configs, audits, changes, keys] = await Promise.all([User.find({}, 'name email role profileType organization state district agencyName isActive lastLoginAt').sort({ createdAt: -1 }).limit(300).lean(), GovernanceConfig.find().lean(), GovernanceAudit.find().sort({ timestamp: -1 }).limit(100).lean(), GovernanceChange.find({ status: 'PENDING' }).sort({ createdAt: -1 }).lean(), IntegrationKey.find({}, 'name permissions active createdAt').lean()]);
  res.json({ users: users.map(safeUser), configs, audits, changes, keys, profileTypes: PROFILE_TYPES });
});

export const requestUserChange = asyncHandler(async (req, res) => {
  const { userId, role, profileType, isActive, state, district, agencyName, reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ message: 'A reason is required for governance actions.' });
  const user = await User.findById(userId); if (!user) return res.status(404).json({ message: 'User not found.' });
  if (isActive === false && String(user._id) === String(req.user._id)) return res.status(400).json({ message: 'System Admins cannot deactivate their own active session.' });
  const payload = { role, profileType, isActive, state, district, agencyName };
  const action = isActive === false ? 'DEACTIVATE_USER' : role || profileType ? 'ROLE_CHANGE' : 'USER_SCOPE_CHANGE';
  if (highImpact.has(action)) { const change = await GovernanceChange.create({ action, target: user.email, payload, reason: reason.trim(), requestedBy: req.user._id }); await audit(req, 'CHANGE_REQUESTED', user.email, reason.trim(), payload); return res.status(202).json({ change, message: 'High-impact change is awaiting second-admin approval.' }); }
  Object.entries(payload).forEach(([key, value]) => { if (value !== undefined) user[key] = value; }); await user.save(); await audit(req, action, user.email, reason.trim(), payload); res.json({ user: safeUser(user) });
});

export const approveChange = asyncHandler(async (req, res) => { const change = await GovernanceChange.findById(req.params.id); if (!change || change.status !== 'PENDING') return res.status(404).json({ message: 'Pending change not found.' }); if (String(change.requestedBy) === String(req.user._id)) return res.status(403).json({ message: 'A different System Admin must approve this change.' }); if (change.action === 'PUBLIC_REDACTION' || change.action === 'RETENTION_CHANGE') await GovernanceConfig.findOneAndUpdate({ key: change.target }, { value: change.payload.value, updatedBy: req.user._id, reason: change.reason }, { upsert: true }); else if (change.action === 'API_KEY_CREATE') await IntegrationKey.create({ name: change.target, keyHash: change.payload.keyHash, permissions: change.payload.permissions, createdBy: change.requestedBy }); else { const user = await User.findOne({ email: change.target }); if (user) { Object.entries(change.payload || {}).forEach(([key, value]) => { if (value !== undefined) user[key] = value; }); await user.save(); } } change.status = 'APPROVED'; change.approvedBy = req.user._id; await change.save(); await audit(req, 'CHANGE_APPROVED', change.target, change.reason, change.payload); res.json({ change }); });

export const saveConfig = asyncHandler(async (req, res) => { const { key, value, reason } = req.body; if (!key || !reason?.trim()) return res.status(400).json({ message: 'Configuration key and reason are required.' }); const action = key.includes('redaction') ? 'PUBLIC_REDACTION' : key.includes('retention') ? 'RETENTION_CHANGE' : 'CONFIG_CHANGE'; if (highImpact.has(action)) { const change = await GovernanceChange.create({ action, target: key, payload: { value }, reason: reason.trim(), requestedBy: req.user._id }); await audit(req, 'CHANGE_REQUESTED', key, reason.trim(), { value }); return res.status(202).json({ message: 'Configuration change is awaiting second-admin approval.' }); } const config = await GovernanceConfig.findOneAndUpdate({ key }, { value, updatedBy: req.user._id, reason: reason.trim() }, { new: true, upsert: true }); await audit(req, action, key, reason.trim(), { value }); res.json({ config }); });

export const createIntegrationKey = asyncHandler(async (req, res) => { const { name, permissions = [], reason } = req.body; if (!name || !reason?.trim()) return res.status(400).json({ message: 'Name and reason are required.' }); const rawKey = `prh_${crypto.randomBytes(24).toString('hex')}`; const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex'); const change = await GovernanceChange.create({ action: 'API_KEY_CREATE', target: name, payload: { keyHash, permissions }, reason: reason.trim(), requestedBy: req.user._id }); await audit(req, 'CHANGE_REQUESTED', name, reason.trim(), { permissions }); res.status(202).json({ change, key: rawKey, message: 'Copy this key now. Activation requires second-admin approval.' }); });
