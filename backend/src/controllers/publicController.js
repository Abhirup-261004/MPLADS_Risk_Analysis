import asyncHandler from 'express-async-handler';
import { Work } from '../models/Work.js';

const publicFields = 'workId title state district sector constituency sanctionedAmount expenditureAmount progress status riskLevel riskScore alert coordinates updatedAt';

function buildFilter(query) {
  const { search = '', state = '', district = '', sector = '', status = '', risk = '' } = query;
  const filter = {};
  if (state && state !== 'India') filter.state = state;
  if (district) filter.district = district;
  if (sector) filter.sector = sector;
  if (status) filter.status = status;
  if (risk) filter.riskLevel = risk;
  if (search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['workId', 'title', 'state', 'district', 'sector'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  return filter;
}

function safeWork(work) {
  return {
    workId: work.workId,
    title: work.title,
    state: work.state,
    district: work.district,
    sector: work.sector,
    constituency: work.constituency,
    sanctionedAmount: work.sanctionedAmount,
    expenditureAmount: work.expenditureAmount,
    progress: work.progress,
    status: work.status,
    riskLevel: work.riskLevel,
    riskScore: work.riskScore,
    alert: work.alert,
    coordinates: work.coordinates,
    updatedAt: work.updatedAt,
  };
}

export const getPublicOverview = asyncHandler(async (req, res) => {
  const [summary] = await Work.aggregate([{ $group: {
    _id: null,
    totalWorks: { $sum: 1 }, totalSanctioned: { $sum: '$sanctionedAmount' }, totalExpenditure: { $sum: '$expenditureAmount' },
    highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
    delayedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
    averageRisk: { $avg: '$riskScore' },
  } }]);
  const [riskDistribution, stateRisk, sectorDistribution] = await Promise.all([
    Work.aggregate([{ $group: { _id: '$riskLevel', value: { $sum: 1 } } }]),
    Work.aggregate([{ $group: { _id: '$state', works: { $sum: 1 }, highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } }, averageRisk: { $avg: '$riskScore' } } }, { $sort: { highRiskWorks: -1 } }, { $limit: 8 }]),
    Work.aggregate([{ $group: { _id: '$sector', value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 6 }]),
  ]);
  const totals = summary || {};
  res.json({
    totalWorks: totals.totalWorks || 0, totalSanctioned: totals.totalSanctioned || 0, totalExpenditure: totals.totalExpenditure || 0,
    highRiskWorks: totals.highRiskWorks || 0, delayedWorks: totals.delayedWorks || 0, averageRisk: Number((totals.averageRisk || 0).toFixed(1)),
    utilization: totals.totalSanctioned ? Number(((totals.totalExpenditure / totals.totalSanctioned) * 100).toFixed(1)) : 0,
    riskDistribution: riskDistribution.map(({ _id, value }) => ({ name: _id, value })),
    stateRisk: stateRisk.map((item) => ({ state: item._id, works: item.works, highRiskWorks: item.highRiskWorks, averageRisk: Number(item.averageRisk.toFixed(1)) })),
    sectorDistribution: sectorDistribution.map(({ _id, value }) => ({ name: _id || 'Other', value })), lastUpdated: new Date().toISOString(),
  });
});

export const getPublicWorks = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const [works, total] = await Promise.all([
    Work.find(filter, publicFields).sort({ riskScore: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Work.countDocuments(filter),
  ]);
  res.json({ works: works.map(safeWork), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

export const getPublicWork = asyncHandler(async (req, res) => {
  const work = await Work.findOne({ workId: req.params.workId }, publicFields).lean();
  if (!work) return res.status(404).json({ message: 'Public work record not found.' });
  res.json({ work: safeWork(work), disclosure: 'Risk indicators are informational and are not a finding of wrongdoing.' });
});

export const getPublicFilters = asyncHandler(async (req, res) => {
  const [states, districts, sectors] = await Promise.all([Work.distinct('state'), Work.distinct('district'), Work.distinct('sector')]);
  res.json({ states: states.filter(Boolean).sort(), districts: districts.filter(Boolean).sort(), sectors: sectors.filter(Boolean).sort() });
});

export const getPublicMap = asyncHandler(async (req, res) => {
  const filter = { ...buildFilter(req.query), riskLevel: 'high' };
  const markers = await Work.find(filter, publicFields).sort({ riskScore: -1 }).limit(250).lean();
  res.json({ markers: markers.map(safeWork), notice: 'Only high-risk zones are displayed on the public map.' });
});

export const getPublicAnalytics = asyncHandler(async (req, res) => {
  const [stateRisk, status, sector] = await Promise.all([
    Work.aggregate([{ $group: { _id: '$state', total: { $sum: 1 }, highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } }, expenditure: { $sum: '$expenditureAmount' } } }, { $sort: { highRisk: -1 } }, { $limit: 10 }]),
    Work.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }]),
    Work.aggregate([{ $group: { _id: '$sector', value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 8 }]),
  ]);
  res.json({ stateRisk: stateRisk.map((x) => ({ state: x._id, total: x.total, highRisk: x.highRisk, expenditure: Number(x.expenditure.toFixed(2)) })), status: status.map((x) => ({ name: x._id, value: x.value })), sector: sector.map((x) => ({ name: x._id || 'Other', value: x.value })) });
});
