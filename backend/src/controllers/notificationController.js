import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { Notification, NOTIFICATION_SEVERITIES, NOTIFICATION_TYPES } from '../models/Notification.js';
import { Work } from '../models/Work.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNotificationFromWork(work, userId, index) {
  const expenditureRatio = work.sanctionedAmount ? work.expenditureAmount / work.sanctionedAmount : 0;
  const type = /duplicate/i.test(work.alert)
    ? 'DUPLICATE_WORK'
    : expenditureRatio > 1.1
      ? 'COST_ANOMALY'
      : work.status === 'Delayed'
        ? 'DELAY'
        : work.progress < 45 && expenditureRatio > 0.65
          ? 'PAYMENT_MISMATCH'
          : 'RISK_ALERT';
  const severity = work.riskScore >= 90 ? 'CRITICAL' : work.riskScore >= 75 ? 'HIGH' : work.riskScore >= 45 ? 'MEDIUM' : 'LOW';
  const titleByType = {
    RISK_ALERT: 'High-risk pattern identified',
    ANOMALY: 'Potential anomaly detected',
    DELAY: 'Project execution delay detected',
    COST_ANOMALY: 'Unusual expenditure pattern detected',
    PAYMENT_MISMATCH: 'Payment-progress mismatch detected',
    DUPLICATE_WORK: 'Potential duplicate work identified',
  };
  const messageByType = {
    RISK_ALERT: `${work.workId} requires review based on the current risk score and implementation indicators.`,
    DELAY: `${work.workId} has exceeded expected implementation timing with insufficient recorded progress.`,
    COST_ANOMALY: `${work.workId} has expenditure above the expected range for comparable works and requires review.`,
    PAYMENT_MISMATCH: `Payments associated with ${work.workId} appear ahead of recorded physical progress.`,
    DUPLICATE_WORK: `${work.workId} is similar to another recorded work in the same administrative context.`,
  };

  return {
    userId,
    type,
    severity,
    title: titleByType[type] || titleByType.RISK_ALERT,
    message: messageByType[type] || messageByType.RISK_ALERT,
    read: index > 5,
    relatedEntityType: 'WORK',
    relatedEntityId: work.workId,
    workId: work.workId,
    state: work.state,
    district: work.district,
    status: work.status,
    riskScore: work.riskScore,
    detectionSource: type === 'DELAY' ? 'Implementation Delay Engine' : type === 'DUPLICATE_WORK' ? 'Duplicate Pattern Detector' : 'PRAHARI Risk Intelligence Engine',
    evidence: work.alert || 'Risk score, expenditure, progress, status, and peer-work indicators were evaluated together.',
    recommendedAction: 'Review sanction, expenditure, progress, and local verification records before taking action.',
    metadata: { developmentSeed: true, agency: work.agency, sector: work.sector },
    createdAt: new Date(Date.now() - index * 1000 * 60 * 60 * 5),
    updatedAt: new Date(Date.now() - index * 1000 * 60 * 60 * 5),
  };
}

async function ensureDevelopmentNotifications(userId) {
  const existing = await Notification.countDocuments({ userId });
  if (existing > 0) return;

  const works = await Work.find({}, 'workId title state district agency sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert')
    .sort({ riskScore: -1, updatedAt: -1 })
    .limit(10)
    .lean();

  const seeded = works.map((work, index) => buildNotificationFromWork(work, userId, index));
  seeded.push(
    {
      userId,
      type: 'DATA_SYNC',
      severity: 'INFO',
      title: 'Data synchronization completed',
      message: 'MPLADS work data was synchronized successfully for the authorized monitoring workspace.',
      read: true,
      relatedEntityType: 'SYSTEM',
      detectionSource: 'PRAHARI Data Sync',
      evidence: 'Latest sync job completed without reported import errors.',
      recommendedAction: 'No immediate action required.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
    {
      userId,
      type: 'REPORT_READY',
      severity: 'INFO',
      title: 'Risk summary report ready',
      message: 'A monitoring summary report is available for review and export.',
      read: false,
      relatedEntityType: 'REPORT',
      detectionSource: 'PRAHARI Reporting',
      evidence: 'Scheduled report generation completed.',
      recommendedAction: 'Review the report before circulation.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
    }
  );

  if (seeded.length) await Notification.insertMany(seeded);
}

function buildFilter(query, userId) {
  const filter = { userId };
  if (query.type && NOTIFICATION_TYPES.includes(query.type)) filter.type = query.type;
  if (query.severity && NOTIFICATION_SEVERITIES.includes(query.severity)) filter.severity = query.severity;
  if (query.severityGroup === 'warnings') filter.severity = { $in: ['HIGH', 'MEDIUM'] };
  if (query.typeGroup === 'system') filter.type = { $in: ['SYSTEM', 'DATA_SYNC', 'REPORT_READY'] };
  if (query.read === 'true') filter.read = true;
  if (query.read === 'false') filter.read = false;
  if (query.state) filter.state = query.state;
  if (query.district) filter.district = query.district;
  if (query.workId) filter.workId = query.workId;
  if (query.status) filter.status = query.status;
  if (query.date) {
    const start = new Date(query.date);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }
  }
  if (query.search?.trim()) {
    const pattern = new RegExp(escapeRegExp(query.search.trim()), 'i');
    filter.$or = [{ title: pattern }, { message: pattern }, { workId: pattern }, { district: pattern }, { state: pattern }];
  }
  return filter;
}

export const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await ensureDevelopmentNotifications(userId);

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = buildFilter(req.query, userId);

  const [notifications, total, summaryRows] = await Promise.all([
    Notification.find(filter).sort({ read: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, all: { $sum: 1 }, unread: { $sum: { $cond: ['$read', 0, 1] } }, critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } }, warnings: { $sum: { $cond: [{ $in: ['$severity', ['MEDIUM', 'HIGH']] }, 1, 0] } }, system: { $sum: { $cond: [{ $in: ['$type', ['SYSTEM', 'DATA_SYNC', 'REPORT_READY']] }, 1, 0] } } } },
    ]),
  ]);

  res.json({
    notifications,
    summary: summaryRows[0] || { all: 0, unread: 0, critical: 0, warnings: 0, system: 0 },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getNotificationById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ notification });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: true }, { new: true }).lean();
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ notification });
});

export const markNotificationUnread = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: false }, { new: true }).lean();
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ notification });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ updated: result.modifiedCount });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id }).lean();
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ deleted: true });
});
