import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { Work } from '../models/Work.js';
import { RiskAuditLog } from '../models/RiskAuditLog.js';
import { Notification } from '../models/Notification.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function derivePrimaryAnomaly(work) {
  const expenditureRatio = work.sanctionedAmount ? work.expenditureAmount / work.sanctionedAmount : 0;
  const progressRatio = work.progress / 100;

  if (/duplicate/i.test(work.alert || '')) {
    return 'Duplicate work signature in district';
  }
  if (expenditureRatio > 1.25) {
    return `Expenditure overrun (+${Math.round((expenditureRatio - 1) * 100)}% over sanction)`;
  }
  if (expenditureRatio - progressRatio > 0.3) {
    return `Payment-progress divergence (Spend: ${Math.round(expenditureRatio * 100)}%, Progress: ${work.progress}%)`;
  }
  if (work.status === 'Delayed') {
    return 'Significant timeline delay vs recorded physical progress';
  }
  if (work.riskScore >= 75) {
    return `Elevated composite risk score (${work.riskScore}/100)`;
  }
  return work.alert || 'Standard algorithmic variance review';
}

function computeSla(reviewDueAt) {
  if (!reviewDueAt) return { daysRemaining: null, isOverdue: false, label: 'No SLA' };
  const diffTime = new Date(reviewDueAt).getTime() - Date.now();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = daysRemaining < 0;
  const label = isOverdue
    ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`
    : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
  return { daysRemaining, isOverdue, label };
}

// GET /api/risk/review-queue
export const getReviewQueue = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const { state, district, agency, riskLevel, status, search, slaStatus } = req.query;

  const filter = {};

  if (state) filter.state = state;
  if (district) filter.district = district;
  if (agency) filter.agency = agency;
  if (riskLevel) filter.riskLevel = riskLevel;

  // Status filtering
  if (status && status !== 'all') {
    filter.riskStatus = status;
  } else {
    // Default queue shows items requiring attention
    filter.$or = [
      { riskLevel: 'high' },
      { riskStatus: { $in: ['FLAGGED', 'ON_HOLD', 'UNDER_REVIEW', 'ESCALATED'] } },
      { underReview: true },
      { appealStatus: 'SUBMITTED' },
    ];
  }

  // SLA filtering
  if (slaStatus === 'overdue') {
    filter.reviewDueAt = { $lt: new Date() };
    filter.riskStatus = { $nin: ['CLEARED'] };
  } else if (slaStatus === 'due_soon') {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    filter.reviewDueAt = { $gte: new Date(), $lte: threeDaysFromNow };
  }

  // Search filter
  if (search && search.trim()) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [{ workId: regex }, { title: regex }, { agency: regex }, { district: regex }],
    });
  }

  const [total, works, summaryCounts] = await Promise.all([
    Work.countDocuments(filter),
    Work.find(filter)
      .select(
        'workId title state district agency sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert riskStatus underReview holdReason holdAt reviewDueAt reviewDecision reviewerName appealStatus'
      )
      .sort({ riskScore: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Promise.all([
      Work.countDocuments({ riskStatus: 'ON_HOLD' }),
      Work.countDocuments({ riskStatus: 'UNDER_REVIEW' }),
      Work.countDocuments({ riskStatus: 'ESCALATED' }),
      Work.countDocuments({ riskStatus: 'CLEARED' }),
      Work.countDocuments({ appealStatus: 'SUBMITTED' }),
      Work.countDocuments({ reviewDueAt: { $lt: new Date() }, riskStatus: { $nin: ['CLEARED'] } }),
    ]),
  ]);

  const [onHold, underReview, escalated, cleared, pendingAppeal, overdue] = summaryCounts;

  const data = works.map((w) => {
    const effectiveStatus = w.riskStatus || (w.underReview ? 'UNDER_REVIEW' : w.riskLevel === 'high' ? 'FLAGGED' : 'ACTIVE');
    const sla = computeSla(w.reviewDueAt);
    return {
      ...w,
      riskStatus: effectiveStatus,
      primaryAnomaly: derivePrimaryAnomaly(w),
      sla,
    };
  });

  res.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    counts: {
      totalInFilter: total,
      onHold,
      underReview,
      escalated,
      cleared,
      pendingAppeal,
      overdue,
    },
  });
});

// GET /api/risk/reviews/:id
export const getReviewById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let work = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    work = await Work.findById(id).lean();
  }
  if (!work) {
    work = await Work.findOne({ workId: id }).lean();
  }

  if (!work) {
    return res.status(404).json({ message: 'Work record not found.' });
  }

  const auditTrail = await RiskAuditLog.find({ workId: work.workId })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();

  const costDeviation = work.sanctionedAmount
    ? Number((((work.expenditureAmount - work.sanctionedAmount) / work.sanctionedAmount) * 100).toFixed(1))
    : 0;
  const spendRatio = work.sanctionedAmount ? work.expenditureAmount / work.sanctionedAmount : 0;
  const progressRatio = work.progress / 100;
  const paymentMismatch = spendRatio - progressRatio > 0.25;

  const evidence = {
    costDeviation,
    paymentMismatch,
    spendRatio: Number((spendRatio * 100).toFixed(1)),
    progressPercent: work.progress,
    recordedStatus: work.status,
    rawAlert: work.alert,
    primaryAnomaly: derivePrimaryAnomaly(work),
  };

  const sla = computeSla(work.reviewDueAt);
  const effectiveStatus = work.riskStatus || (work.underReview ? 'UNDER_REVIEW' : work.riskLevel === 'high' ? 'FLAGGED' : 'ACTIVE');

  res.json({
    work: {
      ...work,
      riskStatus: effectiveStatus,
    },
    evidence,
    sla,
    auditTrail,
  });
});

// POST /api/risk/works/:workId/hold
export const holdWork = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const { reason, evidenceSnapshot } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'A specific reason is required to place a work on disbursement hold.' });
  }

  const work = await Work.findOne({ workId });
  if (!work) {
    return res.status(404).json({ message: `Work ${workId} not found.` });
  }

  const previousState = work.riskStatus || (work.underReview ? 'UNDER_REVIEW' : 'ACTIVE');

  // Default 15-day review SLA
  const reviewDueAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  work.riskStatus = 'ON_HOLD';
  work.underReview = true;
  work.holdReason = reason.trim();
  work.holdAt = new Date();
  work.holdBy = req.user._id;
  work.holdActorName = req.user.name;
  work.reviewDueAt = reviewDueAt;
  work.reviewDecision = 'PENDING';
  await work.save();

  // Create immutable audit log
  const auditEntry = await RiskAuditLog.create({
    workId: work.workId,
    eventType: 'HOLD_APPLIED',
    previousState,
    newState: 'ON_HOLD',
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: reason.trim(),
    evidenceSnapshot: evidenceSnapshot || {
      riskScore: work.riskScore,
      riskLevel: work.riskLevel,
      sanctionedAmount: work.sanctionedAmount,
      expenditureAmount: work.expenditureAmount,
      progress: work.progress,
    },
    timestamp: new Date(),
  });

  // Create notification
  await Notification.create({
    userId: req.user._id,
    type: 'RISK_ALERT',
    severity: 'CRITICAL',
    title: `Disbursement Hold: ${work.workId}`,
    message: `Disbursement hold applied to ${work.workId}. Further disbursement should remain paused pending review. SLA: 15 days.`,
    read: false,
    relatedEntityType: 'WORK',
    relatedEntityId: work.workId,
    workId: work.workId,
    state: work.state,
    district: work.district,
    status: work.status,
    riskScore: work.riskScore,
    detectionSource: 'PRAHARI Review Workflow',
    evidence: reason.trim(),
    recommendedAction: 'Verify physical site progress and vouchers before resolving hold.',
  });

  res.json({
    message: 'Disbursement hold applied successfully. 15-day SLA initiated.',
    work,
    auditEntry,
  });
});

// POST /api/risk/works/:workId/release
export const releaseHold = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const { reason } = req.body;

  const work = await Work.findOne({ workId });
  if (!work) {
    return res.status(404).json({ message: `Work ${workId} not found.` });
  }

  if (work.riskStatus !== 'ON_HOLD') {
    return res.status(400).json({ message: `Work ${workId} is not currently on hold (status: ${work.riskStatus}).` });
  }

  const previousState = work.riskStatus;
  work.riskStatus = 'UNDER_REVIEW';
  work.holdReason = '';
  work.holdAt = null;
  work.holdBy = null;
  work.holdActorName = '';
  await work.save();

  const auditEntry = await RiskAuditLog.create({
    workId: work.workId,
    eventType: 'HOLD_RELEASED',
    previousState,
    newState: 'UNDER_REVIEW',
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: reason?.trim() || 'Disbursement hold released for ongoing review.',
    timestamp: new Date(),
  });

  res.json({
    message: 'Disbursement hold released. Work remains in review status.',
    work,
    auditEntry,
  });
});

// POST /api/risk/reviews/:id/clear
export const clearWorkReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes, rationale } = req.body;

  const finalNotes = (notes || rationale || '').trim();
  if (!finalNotes) {
    return res.status(400).json({ message: 'Review rationale and notes are required to clear a flagged work.' });
  }

  let work = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    work = await Work.findById(id);
  }
  if (!work) {
    work = await Work.findOne({ workId: id });
  }

  if (!work) {
    return res.status(404).json({ message: 'Work record not found.' });
  }

  const previousState = work.riskStatus || (work.underReview ? 'UNDER_REVIEW' : 'FLAGGED');

  work.riskStatus = 'CLEARED';
  work.underReview = false;
  work.reviewDecision = 'CLEARED';
  work.reviewedAt = new Date();
  work.reviewedBy = req.user._id;
  work.reviewerName = req.user.name;
  work.reviewNotes = finalNotes;
  work.holdReason = '';
  work.holdAt = null;
  work.holdBy = null;
  work.holdActorName = '';
  await work.save();

  const auditEntry = await RiskAuditLog.create({
    workId: work.workId,
    eventType: 'WORK_CLEARED',
    previousState,
    newState: 'CLEARED',
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: finalNotes,
    evidenceSnapshot: {
      reviewedBy: req.user.name,
      role: req.user.role,
      date: new Date(),
    },
    timestamp: new Date(),
  });

  res.json({
    message: 'Work successfully cleared upon human review. Disbursement hold lifted.',
    work,
    auditEntry,
  });
});

// POST /api/risk/reviews/:id/escalate
export const escalateWorkReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, targetAuthority, evidence } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'Escalation justification is required.' });
  }

  let work = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    work = await Work.findById(id);
  }
  if (!work) {
    work = await Work.findOne({ workId: id });
  }

  if (!work) {
    return res.status(404).json({ message: 'Work record not found.' });
  }

  const previousState = work.riskStatus || 'UNDER_REVIEW';

  work.riskStatus = 'ESCALATED';
  work.underReview = true;
  work.reviewDecision = 'ESCALATED';
  work.escalationStatus = targetAuthority || 'MINISTRY_OF_STATISTICS';
  work.escalatedAt = new Date();
  work.escalatedBy = req.user._id;
  work.escalationReason = reason.trim();

  // Escalate maintains or activates hold
  if (!work.holdReason) {
    work.holdReason = `Escalated to ${work.escalationStatus}: ${reason.trim()}`;
    work.holdAt = new Date();
    work.holdBy = req.user._id;
    work.holdActorName = req.user.name;
  }

  await work.save();

  const auditEntry = await RiskAuditLog.create({
    workId: work.workId,
    eventType: 'WORK_ESCALATED',
    previousState,
    newState: 'ESCALATED',
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: reason.trim(),
    evidenceSnapshot: evidence || {
      targetAuthority: work.escalationStatus,
      riskScore: work.riskScore,
    },
    timestamp: new Date(),
  });

  await Notification.create({
    userId: req.user._id,
    type: 'COMPLIANCE',
    severity: 'CRITICAL',
    title: `Work Escalated to Ministry: ${work.workId}`,
    message: `Work ${work.workId} escalated for Ministry review. Justification: ${reason.trim()}. Disbursement hold maintained.`,
    read: false,
    relatedEntityType: 'WORK',
    relatedEntityId: work.workId,
    workId: work.workId,
    state: work.state,
    district: work.district,
    status: work.status,
    riskScore: work.riskScore,
    detectionSource: 'District Review Officer',
    evidence: reason.trim(),
    recommendedAction: 'Initiate formal state/ministry compliance investigation.',
  });

  res.json({
    message: 'Work escalated to Ministry/Central Authority. Hold maintained.',
    work,
    auditEntry,
  });
});

// GET /api/risk/works/:workId/audit
export const getWorkAuditTrail = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [total, events] = await Promise.all([
    RiskAuditLog.countDocuments({ workId }),
    RiskAuditLog.find({ workId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    workId,
    events,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/risk/works/:workId/appeal
export const submitAppeal = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const { reason, evidenceDetails, contactEmail } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'Appeal statement/justification is required.' });
  }

  const work = await Work.findOne({ workId });
  if (!work) {
    return res.status(404).json({ message: `Work ${workId} not found.` });
  }

  work.appealStatus = 'SUBMITTED';
  work.appealReason = reason.trim();
  work.appealSubmittedBy = req.user?.name || contactEmail || 'Agency Representative';
  work.appealSubmittedAt = new Date();
  work.appealEvidence = {
    details: evidenceDetails || '',
    contactEmail: contactEmail || '',
  };
  await work.save();

  const auditEntry = await RiskAuditLog.create({
    workId: work.workId,
    eventType: 'APPEAL_SUBMITTED',
    previousState: work.riskStatus || 'ACTIVE',
    newState: work.riskStatus || 'ACTIVE',
    actorId: req.user?._id,
    actorName: req.user?.name || 'Agency Representative',
    actorRole: req.user?.role || 'viewer',
    reason: reason.trim(),
    evidenceSnapshot: {
      details: evidenceDetails,
      contactEmail,
    },
    timestamp: new Date(),
  });

  res.json({
    message: 'Appeal submitted successfully. Reviewer assigned to verify provided justification.',
    work,
    auditEntry,
  });
});

// POST /api/risk/agencies/:agencyKey/suspension-request
export const requestAgencySuspension = asyncHandler(async (req, res) => {
  const { agencyKey } = req.params;
  const { justification } = req.body;

  if (!justification || !justification.trim()) {
    return res.status(400).json({ message: 'Justification is required for agency suspension requests.' });
  }

  // Strict Rule: Validate that multiple independently confirmed or escalated works exist
  const confirmedCount = await Work.countDocuments({
    agency: agencyKey,
    $or: [
      { riskStatus: 'ESCALATED' },
      { riskStatus: 'ON_HOLD', riskLevel: 'high' },
    ],
  });

  if (confirmedCount < 2) {
    return res.status(400).json({
      message: `Agency suspension requires multiple independently verified high-risk or escalated works (found: ${confirmedCount}). Single flags cannot trigger administrative agency suspension.`,
      confirmedCount,
    });
  }

  // Record audit entry for all confirmed works of this agency
  const auditEntry = await RiskAuditLog.create({
    workId: `AGENCY:${agencyKey}`,
    eventType: 'AGENCY_SUSPENSION_REQUESTED',
    previousState: 'ACTIVE',
    newState: 'AGENCY_SUSPENDED',
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: justification.trim(),
    evidenceSnapshot: {
      agency: agencyKey,
      confirmedHighRiskWorksCount: confirmedCount,
      authorizedBy: req.user.name,
      role: req.user.role,
    },
    timestamp: new Date(),
  });

  // Create Ministry alert
  await Notification.create({
    userId: req.user._id,
    type: 'COMPLIANCE',
    severity: 'CRITICAL',
    title: `Agency Suspension Initiated: ${agencyKey}`,
    message: `Agency ${agencyKey} has ${confirmedCount} confirmed high-risk/escalated works. Suspension review initiated under Ministry authorization.`,
    read: false,
    relatedEntityType: 'AGENCY',
    relatedEntityId: agencyKey,
    state: '',
    district: '',
    riskScore: 95,
    detectionSource: 'Ministry Risk Authority',
    evidence: justification.trim(),
    recommendedAction: 'Coordinate with State Nodal Department to issue formal suspension notice.',
  });

  res.json({
    message: `Agency suspension review initiated for ${agencyKey}. Confirmed cases: ${confirmedCount}.`,
    confirmedCount,
    auditEntry,
  });
});

