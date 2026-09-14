import asyncHandler from 'express-async-handler';
import { User, PROFILE_TYPES } from '../models/User.js';
import { Work } from '../models/Work.js';
import { createToken } from '../utils/token.js';

const SYSTEM_ADMIN_ALIASES = new Set(['admin', 'system_admin', 'system-admin', 'System Administrator']);
const PROFILE_TYPE_LABELS = {
  system_admin: 'System Administrator',
  admin: 'System Administrator',
  ministry: 'Ministry Officer',
  government_admin: 'Government MPLADS Admin',
  district_authority: 'District Authority',
  analyst: 'Risk Analyst',
  agency: 'Agency User',
  mp: 'Member of Parliament',
  viewer: 'Viewer',
};
const SELF_REGISTRATION_TYPES = new Set(['ministry', 'mp', 'agency']);

function normalizeProfileType(value) {
  const rawType = String(value || 'analyst').trim();
  const profileType = rawType.toLowerCase().replace(/[\s-]+/g, '_');
  if (SYSTEM_ADMIN_ALIASES.has(rawType) || SYSTEM_ADMIN_ALIASES.has(profileType)) return 'system_admin';

  return PROFILE_TYPES.includes(profileType) ? profileType : 'analyst';
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function buildSafeUser(user) {
  const safeUser = user.toSafeObject();
  safeUser.roleLabel = PROFILE_TYPE_LABELS[safeUser.profileType] || safeUser.profileType;
  return safeUser;
}

function compactWork(work) {
  return {
    workId: work.workId,
    title: work.title,
    state: work.state,
    district: work.district,
    agency: work.agency,
    sector: work.sector,
    sanctionedAmount: work.sanctionedAmount,
    expenditureAmount: work.expenditureAmount,
    progress: work.progress,
    status: work.status,
    riskLevel: work.riskLevel,
    riskScore: work.riskScore,
    alert: work.alert,
    riskStatus: work.riskStatus,
    underReview: work.underReview,
    updatedAt: work.updatedAt,
  };
}

async function getAgencyProfileData(user) {
  const filter = {};
  if (user.agencyName) filter.agency = user.agencyName;
  if (user.state) filter.state = user.state;
  if (user.district) filter.district = user.district;

  if (!Object.keys(filter).length) {
    return {
      configured: false,
      message: 'Agency, state, or district is not configured for this profile.',
      summary: null,
      highRiskWorks: [],
      recentWorks: [],
    };
  }

  const [summaryRow, highRiskWorks, recentWorks] = await Promise.all([
    Work.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalWorks: { $sum: 1 },
          completedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          delayedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
          highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
          sanctionedAmount: { $sum: '$sanctionedAmount' },
          expenditureAmount: { $sum: '$expenditureAmount' },
          averageProgress: { $avg: '$progress' },
          averageRiskScore: { $avg: '$riskScore' },
        },
      },
    ]),
    Work.find(filter, 'workId title state district agency sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert riskStatus underReview updatedAt')
      .sort({ riskScore: -1, updatedAt: -1 })
      .limit(8)
      .lean(),
    Work.find(filter, 'workId title state district agency sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert riskStatus underReview updatedAt')
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const summary = summaryRow[0] || {
    totalWorks: 0,
    completedWorks: 0,
    delayedWorks: 0,
    highRiskWorks: 0,
    sanctionedAmount: 0,
    expenditureAmount: 0,
    averageProgress: 0,
    averageRiskScore: 0,
  };

  return {
    configured: true,
    filter,
    summary: {
      totalWorks: summary.totalWorks,
      completedWorks: summary.completedWorks,
      delayedWorks: summary.delayedWorks,
      highRiskWorks: summary.highRiskWorks,
      sanctionedAmount: Number((summary.sanctionedAmount || 0).toFixed(2)),
      expenditureAmount: Number((summary.expenditureAmount || 0).toFixed(2)),
      utilizationPct: summary.sanctionedAmount
        ? Number(((summary.expenditureAmount / summary.sanctionedAmount) * 100).toFixed(1))
        : 0,
      averageProgress: Number((summary.averageProgress || 0).toFixed(1)),
      averageRiskScore: Math.round(summary.averageRiskScore || 0),
    },
    highRiskWorks: highRiskWorks.map(compactWork),
    recentWorks: recentWorks.map(compactWork),
  };
}

async function getSystemAdminProfileData() {
  const [summaryRow, roleCounts, riskCounts, recentHighRiskWorks] = await Promise.all([
    Work.aggregate([
      {
        $group: {
          _id: null,
          totalWorks: { $sum: 1 },
          totalSanctioned: { $sum: '$sanctionedAmount' },
          totalExpenditure: { $sum: '$expenditureAmount' },
          highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
          underReviewWorks: { $sum: { $cond: ['$underReview', 1, 0] } },
          delayedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
        },
      },
    ]),
    User.aggregate([{ $group: { _id: '$profileType', users: { $sum: 1 } } }, { $sort: { users: -1 } }]),
    Work.aggregate([{ $group: { _id: '$riskLevel', works: { $sum: 1 } } }, { $sort: { works: -1 } }]),
    Work.find({}, 'workId title state district agency sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert riskStatus underReview updatedAt')
      .sort({ riskScore: -1, updatedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const summary = summaryRow[0] || {
    totalWorks: 0,
    totalSanctioned: 0,
    totalExpenditure: 0,
    highRiskWorks: 0,
    underReviewWorks: 0,
    delayedWorks: 0,
  };

  return {
    summary: {
      totalWorks: summary.totalWorks,
      totalSanctioned: Number((summary.totalSanctioned || 0).toFixed(2)),
      totalExpenditure: Number((summary.totalExpenditure || 0).toFixed(2)),
      fundUtilization: summary.totalSanctioned
        ? Number(((summary.totalExpenditure / summary.totalSanctioned) * 100).toFixed(1))
        : 0,
      highRiskWorks: summary.highRiskWorks,
      underReviewWorks: summary.underReviewWorks,
      delayedWorks: summary.delayedWorks,
    },
    roleCounts: roleCounts.map(({ _id, users }) => ({
      profileType: _id || 'analyst',
      label: PROFILE_TYPE_LABELS[_id] || _id || 'Risk Analyst',
      users,
    })),
    riskCounts: riskCounts.map(({ _id, works }) => ({ riskLevel: _id || 'unknown', works })),
    recentHighRiskWorks: recentHighRiskWorks.map(compactWork),
  };
}

async function buildAuthenticatedProfilePayload(user) {
  const safeUser = buildSafeUser(user);
  const profileType = safeUser.profileType || safeUser.role;

  if (profileType === 'agency') {
    return { user: safeUser, profileData: { agency: await getAgencyProfileData(user) } };
  }

  if (profileType === 'system_admin' || profileType === 'admin') {
    return { user: safeUser, profileData: { systemAdmin: await getSystemAdminProfileData() } };
  }

  return { user: safeUser, profileData: {} };
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password)) || !user.isActive) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  const payload = await buildAuthenticatedProfilePayload(user);
  res.json({ token: createToken(user._id.toString()), ...payload });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' });

  const profileType = normalizeProfileType(req.body.profileType || req.body.role);
  if (!SELF_REGISTRATION_TYPES.has(profileType)) {
    return res.status(403).json({ message: 'This profile type must be provisioned by a system administrator.' });
  }
  const user = await User.create({
    name,
    email,
    password,
    role: profileType,
    profileType,
    organization: cleanText(req.body.organization),
    designation: cleanText(req.body.designation),
    phone: cleanText(req.body.phone, 30),
    agencyName: cleanText(req.body.agencyName || req.body.organization, 160),
    state: cleanText(req.body.state, 80),
    district: cleanText(req.body.district, 80),
  });

  const payload = await buildAuthenticatedProfilePayload(user);
  res.status(201).json({ token: createToken(user._id.toString()), ...payload });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  res.json(await buildAuthenticatedProfilePayload(req.user));
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
  req.user.organization = cleanText(req.body.organization ?? req.user.organization);
  req.user.designation = cleanText(req.body.designation ?? req.user.designation);
  req.user.phone = cleanText(req.body.phone ?? req.user.phone, 30);
  req.user.agencyName = cleanText(req.body.agencyName ?? req.user.agencyName, 160);
  req.user.state = cleanText(req.body.state ?? req.user.state, 80);
  req.user.district = cleanText(req.body.district ?? req.user.district, 80);
  await req.user.save();

  res.json(await buildAuthenticatedProfilePayload(req.user));
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
  res.json(await buildAuthenticatedProfilePayload(req.user));
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
