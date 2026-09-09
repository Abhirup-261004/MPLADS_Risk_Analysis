import asyncHandler from 'express-async-handler';
import { Report } from '../models/Report.js';
import { Work } from '../models/Work.js';

export const getReports = asyncHandler(async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(25).lean();
  res.json({ reports });
});

export const generateReport = asyncHandler(async (req, res) => {
  const { type = 'National Risk Report', state = '', district = '', riskLevel = '', agency = '', includeCharts = true, includeInsights = true, includeEvidence = true } = req.body;
  const filter = {};
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (riskLevel) filter.riskLevel = riskLevel;
  if (agency) filter.agency = agency;
  const works = await Work.find(filter, 'workId title state district agency sanctionedAmount expenditureAmount progress status riskLevel riskScore alert').sort({ riskScore: -1 }).limit(500).lean();
  const report = await Report.create({ name: `${type} FY 2024-2025`, type, generatedBy: req.user.name, configuration: { state, district, riskLevel, agency, includeCharts, includeInsights, includeEvidence } });
  const highRiskWorks = works.filter((work) => work.riskLevel === 'high').length;
  const delayedWorks = works.filter((work) => work.status === 'Delayed').length;
  const expenditure = works.reduce((sum, work) => sum + work.expenditureAmount, 0);
  res.status(201).json({ report, summary: { totalWorks: works.length, highRiskWorks, delayedWorks, expenditure: Number(expenditure.toFixed(2)) }, works });
});
