import asyncHandler from 'express-async-handler';
import { Work } from '../models/Work.js';

export const getOverview = asyncHandler(async (req, res) => {
  const [summary] = await Work.aggregate([
    {
      $group: {
        _id: null,
        totalWorks: { $sum: 1 },
        totalSanctioned: { $sum: '$sanctionedAmount' },
        totalExpenditure: { $sum: '$expenditureAmount' },
        highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
        delayedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
      },
    },
  ]);
  const riskDistribution = await Work.aggregate([{ $group: { _id: '$riskLevel', value: { $sum: 1 } } }]);
  const markers = await Work.find({ riskLevel: 'high' }, 'district state riskLevel riskScore coordinates').sort({ riskScore: -1 }).limit(50).lean();
  const totals = summary || { totalWorks: 0, totalSanctioned: 0, totalExpenditure: 0, highRiskWorks: 0, delayedWorks: 0 };
  res.json({
    ...totals,
    fundUtilization: totals.totalSanctioned ? Number(((totals.totalExpenditure / totals.totalSanctioned) * 100).toFixed(1)) : 0,
    riskDistribution: riskDistribution.map(({ _id, value }) => ({ level: _id, value })),
    markers,
    lastUpdated: new Date().toISOString(),
  });
});
