import asyncHandler from 'express-async-handler';
import { AgencySubmission } from '../models/AgencySubmission.js';
import { Tender } from '../models/Tender.js';
import { Work } from '../models/Work.js';
import { workScopeForUser } from '../utils/workScope.js';

const TYPES = new Set(['BID', 'PROGRESS_UPDATE', 'GEO_EVIDENCE', 'INVOICE', 'COMPLETION_CERTIFICATE', 'CLARIFICATION', 'REMEDIATION_PLAN']);
const cleanAttachments = (items) => (Array.isArray(items) ? items : []).slice(0, 8).map((item) => ({ name: String(item.name || 'Supporting document').slice(0, 120), url: String(item.url || '').slice(0, 1000) })).filter((item) => item.url);

function requireAgency(req, res) {
  if (!req.user.agencyName) { res.status(400).json({ message: 'Complete the Agency Name field in your profile before using the agency workspace.' }); return false; }
  return true;
}

export const getAgencyWorkspace = asyncHandler(async (req, res) => {
  if (!requireAgency(req, res)) return;
  const scope = workScopeForUser(req.user);
  const [summaryRows, works, submissions, openTenders] = await Promise.all([
    Work.aggregate([{ $match: scope }, { $group: { _id: null, totalWorks: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, delayed: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } }, highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } }, avgProgress: { $avg: '$progress' }, sanctioned: { $sum: '$sanctionedAmount' }, expenditure: { $sum: '$expenditureAmount' } } }]),
    Work.find(scope, 'workId title state district sector sanctionedAmount expenditureAmount progress status riskLevel riskScore alert').sort({ updatedAt: -1 }).limit(50).lean(),
    AgencySubmission.find({ agencyUserId: req.user._id }).sort({ updatedAt: -1 }).limit(30).lean(),
    Tender.find({ status: 'OPEN', deadline: { $gt: new Date() } }).sort({ deadline: 1 }).limit(50).lean(),
  ]);
  const summary = summaryRows[0] || { totalWorks: 0, completed: 0, delayed: 0, highRisk: 0, avgProgress: 0, sanctioned: 0, expenditure: 0 };
  const eligibleTenders = openTenders.filter((tender) => (!tender.eligibility?.states?.length || tender.eligibility.states.includes(req.user.state)) && (!tender.eligibility?.sectors?.length || tender.eligibility.sectors.some((sector) => works.some((work) => work.sector === sector))));
  res.json({ profile: { agencyName: req.user.agencyName, organization: req.user.organization, registrationNumber: req.user.registrationNumber || '', qualifications: req.user.qualifications || [], sectorCoverage: req.user.sectorCoverage || [], geographicCoverage: req.user.geographicCoverage || [], complianceDocuments: req.user.complianceDocuments || [] }, summary: { ...summary, avgProgress: Number((summary.avgProgress || 0).toFixed(1)) }, works, submissions, tenders: eligibleTenders });
});

export const createAgencySubmission = asyncHandler(async (req, res) => {
  if (!requireAgency(req, res)) return;
  const { workId, type, title, details, proposedAmount, proposedDurationDays, progress, invoiceAmount, coordinates, attachments } = req.body;
  if (!TYPES.has(type) || !title?.trim() || !details?.trim()) return res.status(400).json({ message: 'Type, title, and details are required.' });
  if (type === 'BID') {
    const tender = await Tender.findOne({ reference: workId, status: 'OPEN', deadline: { $gt: new Date() } }).lean();
    if (!tender) return res.status(404).json({ message: 'This tender is unavailable or its submission deadline has passed.' });
  } else {
    const work = await Work.exists({ ...workScopeForUser(req.user), workId });
    if (!work) return res.status(404).json({ message: 'This work is not assigned to your agency.' });
  }
  const submission = await AgencySubmission.create({ agencyUserId: req.user._id, agencyName: req.user.agencyName, workId: workId || '', type, title: title.trim(), details: details.trim(), proposedAmount, proposedDurationDays, progress, invoiceAmount, coordinates, attachments: cleanAttachments(attachments) });
  res.status(201).json({ submission, message: 'Submission recorded for authorized review.' });
});

export const reviseAgencySubmission = asyncHandler(async (req, res) => {
  const submission = await AgencySubmission.findOne({ _id: req.params.id, agencyUserId: req.user._id, status: { $in: ['DRAFT', 'SUBMITTED', 'REQUESTED_CHANGES'] } });
  if (!submission) return res.status(404).json({ message: 'A revisable submission was not found.' });
  if (req.body.details?.trim()) submission.details = req.body.details.trim();
  if (req.body.proposedAmount !== undefined) submission.proposedAmount = req.body.proposedAmount;
  if (req.body.proposedDurationDays !== undefined) submission.proposedDurationDays = req.body.proposedDurationDays;
  submission.attachments = cleanAttachments(req.body.attachments?.length ? req.body.attachments : submission.attachments);
  submission.revision += 1;
  await submission.save();
  res.json({ submission, message: 'Submission revised before decision.' });
});

export const updateAgencyProfile = asyncHandler(async (req, res) => {
  const list = (value, max = 20) => (Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim()).filter(Boolean).slice(0, max);
  req.user.registrationNumber = String(req.body.registrationNumber || '').trim().slice(0, 100);
  req.user.qualifications = list(req.body.qualifications);
  req.user.sectorCoverage = list(req.body.sectorCoverage);
  req.user.geographicCoverage = list(req.body.geographicCoverage);
  req.user.complianceDocuments = (Array.isArray(req.body.complianceDocuments) ? req.body.complianceDocuments : []).slice(0, 12).map((item) => ({ name: String(item.name || 'Compliance document').slice(0, 120), url: String(item.url || '').slice(0, 1000), expiresAt: item.expiresAt || undefined })).filter((item) => item.url);
  await req.user.save({ validateModifiedOnly: true });
  res.json({ profile: { registrationNumber: req.user.registrationNumber, qualifications: req.user.qualifications, sectorCoverage: req.user.sectorCoverage, geographicCoverage: req.user.geographicCoverage, complianceDocuments: req.user.complianceDocuments } });
});
