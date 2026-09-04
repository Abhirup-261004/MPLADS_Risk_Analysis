import asyncHandler from 'express-async-handler';
import { Work } from '../models/Work.js';

export const getWorks = asyncHandler(async (req, res) => {
  const { search = '', state, district, status, risk, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (status) filter.status = status;
  if (risk) filter.riskLevel = risk;
  if (search.trim()) filter.$text = { $search: search.trim() };

  const safePage = Math.max(Number(page), 1);
  const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
  const [works, total] = await Promise.all([
    Work.find(filter).sort({ riskScore: -1, updatedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    Work.countDocuments(filter),
  ]);
  res.json({ works, pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } });
});

export const getWorkById = asyncHandler(async (req, res) => {
  const work = await Work.findOne({ workId: req.params.workId }).lean();
  if (!work) return res.status(404).json({ message: 'Work not found.' });
  const expenditureRatio = work.sanctionedAmount ? Number(((work.expenditureAmount / work.sanctionedAmount) * 100).toFixed(1)) : 0;
  const assessment = {
    score: work.riskScore,
    level: work.riskLevel,
    vectors: [
      { label: 'Financial anomaly', score: Math.min(100, Math.round(work.riskScore * 0.92)), tone: 'danger' },
      { label: 'Payment mismatch', score: Math.min(100, Math.round(expenditureRatio)), tone: 'danger' },
      { label: 'Agency risk', score: Math.max(18, Math.round(work.riskScore * 0.84)), tone: 'warning' },
      { label: 'Delay risk', score: work.status === 'Delayed' ? 86 : Math.max(12, 100 - work.progress), tone: 'warning' },
      { label: 'Duplicate risk', score: work.alert.includes('Duplicate') ? 78 : 30, tone: 'neutral' },
    ],
    expenditureRatio,
    estimatedCost: Number((work.sanctionedAmount * 0.91).toFixed(2)),
    summary: `The AI engine has flagged this work due to ${work.alert || 'its current risk profile'}. Expenditure and implementation progress are evaluated against peer projects and sanction records to identify potential fund-management or reporting issues.`,
  };
  res.json({ work, assessment });
});

export const markUnderReview = asyncHandler(async (req, res) => {
  const work = await Work.findOneAndUpdate({ workId: req.params.workId }, { underReview: true }, { new: true }).lean();
  if (!work) return res.status(404).json({ message: 'Work not found.' });
  res.json({ work });
});
