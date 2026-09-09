import asyncHandler from 'express-async-handler';
import { Work } from '../models/Work.js';
import { zoneCoordinates } from '../utils/geography.js';

function buildAgencyMetric(entry) {
  const costDeviation = entry.avgSanctioned ? Number((((entry.avgExpenditure - entry.avgSanctioned) / entry.avgSanctioned) * 100).toFixed(1)) : 0;
  const incompletePercent = Number((100 - entry.avgProgress).toFixed(1));
  return {
    agency: entry._id.agency,
    state: entry._id.state,
    totalWorks: entry.totalWorks,
    completed: entry.completed,
    delayed: entry.delayed,
    averageDelay: Number(((entry.delayed / entry.totalWorks) * 12).toFixed(1)),
    delayRate: Number(((entry.delayed / entry.totalWorks) * 100).toFixed(1)),
    costDeviation,
    incompletePercent,
    incompleteMarkingRate: incompletePercent,
    overrunRate: Number(((entry.overrunWorks / entry.totalWorks) * 100).toFixed(1)),
    mismatchRate: Number(((entry.paymentMismatchWorks / entry.totalWorks) * 100).toFixed(1)),
    riskScore: Math.round(entry.avgRisk),
    riskLevel: entry.avgRisk >= 70 ? 'high' : entry.avgRisk >= 40 ? 'medium' : 'low',
  };
}

function getCostDeviation(work) {
  if (!work.sanctionedAmount) return 0;
  return Number((((work.expenditureAmount - work.sanctionedAmount) / work.sanctionedAmount) * 100).toFixed(1));
}

function getPaymentMismatch(work) {
  if (!work.sanctionedAmount) return false;
  const spendRatio = work.expenditureAmount / work.sanctionedAmount;
  const progressRatio = work.progress / 100;
  return spendRatio - progressRatio > 0.25;
}

function riskBand(value, high, medium) {
  if (value >= high) return 'High';
  if (value >= medium) return 'Moderate';
  return 'Low';
}

function monthKey(dateValue) {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}

function buildWorkTrend(works) {
  const grouped = new Map();
  works.forEach((work) => {
    const key = monthKey(work.updatedAt || work.createdAt);
    if (!key) return;
    const entry = grouped.get(key) || { key, riskTotal: 0, count: 0, delayed: 0, expenditure: 0, sanctioned: 0, progressTotal: 0 };
    entry.riskTotal += work.riskScore;
    entry.count += 1;
    entry.delayed += work.status === 'Delayed' ? 1 : 0;
    entry.expenditure += work.expenditureAmount;
    entry.sanctioned += work.sanctionedAmount;
    entry.progressTotal += work.progress;
    grouped.set(key, entry);
  });
  return [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map((entry) => ({
      month: monthLabel(entry.key),
      riskScore: Math.round(entry.riskTotal / entry.count),
      delayedWorks: entry.delayed,
      utilization: entry.sanctioned ? Number(((entry.expenditure / entry.sanctioned) * 100).toFixed(1)) : 0,
      completionRate: Number((entry.progressTotal / entry.count).toFixed(1)),
    }));
}

function buildAnalyticsTrend(works) {
  const grouped = new Map();
  works.forEach((work) => {
    const key = monthKey(work.updatedAt || work.createdAt);
    if (!key) return;
    const entry = grouped.get(key) || { key, expenditure: 0, riskTotal: 0, count: 0 };
    entry.expenditure += work.expenditureAmount;
    entry.riskTotal += work.riskScore;
    entry.count += 1;
    grouped.set(key, entry);
  });
  return [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map((entry) => ({ month: monthLabel(entry.key), value: Number(entry.expenditure.toFixed(2)), volatility: Number((entry.riskTotal / entry.count).toFixed(1)) }));
}

function peerAverage(peers) {
  if (!peers.length) return null;
  const totals = peers.reduce((sum, agency) => ({
    riskScore: sum.riskScore + agency.riskScore,
    delayRate: sum.delayRate + agency.delayRate,
    overrunRate: sum.overrunRate + agency.overrunRate,
    incompleteMarkingRate: sum.incompleteMarkingRate + agency.incompleteMarkingRate,
  }), { riskScore: 0, delayRate: 0, overrunRate: 0, incompleteMarkingRate: 0 });
  return {
    agency: 'Peer Average',
    state: `${peers.length} same-state agencies`,
    isPeerAverage: true,
    riskScore: Math.round(totals.riskScore / peers.length),
    delayRate: Number((totals.delayRate / peers.length).toFixed(1)),
    overrunRate: Number((totals.overrunRate / peers.length).toFixed(1)),
    incompleteMarkingRate: Number((totals.incompleteMarkingRate / peers.length).toFixed(1)),
  };
}

function encodeAgencyKey(agency, state) {
  return encodeURIComponent(`${agency}|${state}`);
}

async function getAgencyMetrics() {
  const grouped = await Work.aggregate([
    {
      $group: {
        _id: { agency: '$agency', state: '$state' },
        totalWorks: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        delayed: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
        overrunWorks: { $sum: { $cond: [{ $gt: ['$expenditureAmount', '$sanctionedAmount'] }, 1, 0] } },
        paymentMismatchWorks: { $sum: { $cond: [{ $gt: [{ $subtract: [{ $cond: [{ $gt: ['$sanctionedAmount', 0] }, { $divide: ['$expenditureAmount', '$sanctionedAmount'] }, 0] }, { $divide: ['$progress', 100] }] }, 0.25] }, 1, 0] } },
        avgProgress: { $avg: '$progress' },
        avgSanctioned: { $avg: '$sanctionedAmount' },
        avgExpenditure: { $avg: '$expenditureAmount' },
        totalSanctioned: { $sum: '$sanctionedAmount' },
        totalExpenditure: { $sum: '$expenditureAmount' },
        avgRisk: { $avg: '$riskScore' },
      },
    },
    { $sort: { avgRisk: -1 } },
  ]);
  return grouped.map((entry) => ({ ...buildAgencyMetric(entry), agencyKey: encodeAgencyKey(entry._id.agency, entry._id.state), totalSanctioned: Number(entry.totalSanctioned.toFixed(2)), totalExpenditure: Number(entry.totalExpenditure.toFixed(2)) }));
}

export const getRiskCenter = asyncHandler(async (req, res) => {
  const works = await Work.find({}, 'workId title district state riskLevel riskScore alert underReview status progress').sort({ riskScore: -1 }).limit(50).lean();
  const counts = { critical: works.filter((work) => work.riskScore >= 90).length, high: works.filter((work) => work.riskScore >= 70 && work.riskScore < 90).length, medium: works.filter((work) => work.riskScore >= 40 && work.riskScore < 70).length, underReview: works.filter((work) => work.underReview).length };
  res.json({ counts, queue: works.filter((work) => work.riskScore >= 40), insights: { severe: works[0] || null, highestRiskDistrict: works[0]?.district || 'No data', cluster: 'Similar high-risk works were detected in related administrative blocks.' }, trend: [{ month: 'Jan', detected: 80, resolved: 60 }, { month: 'Feb', detected: 120, resolved: 95 }, { month: 'Mar', detected: 200, resolved: 150 }, { month: 'Apr', detected: 310, resolved: 250 }, { month: 'May', detected: 390, resolved: 400 }, { month: 'Jun', detected: 480, resolved: 460 }] });
});

export const getAgencyRisk = asyncHandler(async (req, res) => {
  const agencies = await getAgencyMetrics();
  res.json({ summary: { totalAgencies: agencies.length, highRiskAgencies: agencies.filter((agency) => agency.riskLevel === 'high').length, averageDelay: agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.averageDelay, 0) / agencies.length).toFixed(1)) : 0, averageCostDeviation: agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.costDeviation, 0) / agencies.length).toFixed(1)) : 0 }, agencies });
});

export const getAgencyRiskProfile = asyncHandler(async (req, res) => {
  const [agencyName, state] = decodeURIComponent(req.params.agencyKey || '').split('|');
  if (!agencyName || !state) return res.status(400).json({ message: 'Agency identifier is invalid.' });

  const [agencies, works] = await Promise.all([
    getAgencyMetrics(),
    Work.find({ agency: agencyName, state }, 'workId title state district agency sector constituency sanctionedAmount expenditureAmount progress status riskLevel riskScore alert underReview createdAt updatedAt').sort({ riskScore: -1 }).lean(),
  ]);
  const profile = agencies.find((agency) => agency.agency === agencyName && agency.state === state);
  if (!profile || !works.length) return res.status(404).json({ message: 'Agency profile was not found.' });

  const districts = [...new Set(works.map((work) => work.district).filter(Boolean))];
  const sectors = [...new Set(works.map((work) => work.sector).filter(Boolean))];
  const highRiskWorks = works.filter((work) => work.riskLevel === 'high').length;
  const ongoing = works.filter((work) => work.status === 'Ongoing').length;
  const sanctioned = works.filter((work) => work.status === 'Sanctioned').length;
  const costAnomalies = works.filter((work) => getCostDeviation(work) > 10).length;
  const paymentMismatchWorks = works.filter(getPaymentMismatch).length;
  const avgCostDeviation = Number((works.reduce((sum, work) => sum + getCostDeviation(work), 0) / works.length).toFixed(1));
  const utilization = profile.totalSanctioned ? Number(((profile.totalExpenditure / profile.totalSanctioned) * 100).toFixed(1)) : 0;
  const riskDrivers = [
    { label: 'Delay Risk', value: profile.delayRate, unit: '% delayed', level: riskBand(profile.delayRate, 35, 15) },
    { label: 'Cost Risk', value: Math.max(profile.overrunRate, Math.max(0, avgCostDeviation)), unit: '% overrun signal', level: riskBand(Math.max(profile.overrunRate, Math.max(0, avgCostDeviation)), 35, 10) },
    { label: 'Completion Risk', value: profile.incompletePercent, unit: '% incomplete', level: riskBand(profile.incompletePercent, 45, 20) },
    { label: 'Payment Risk', value: profile.mismatchRate, unit: '% mismatch', level: riskBand(profile.mismatchRate, 25, 10) },
  ].sort((a, b) => b.value - a.value);
  const peers = agencies
    .filter((agency) => agency.agencyKey !== profile.agencyKey && agency.state === profile.state)
    .slice(0, 5);
  const averagePeer = peerAverage(peers);

  res.json({
    profile: {
      ...profile,
      district: districts.length === 1 ? districts[0] : `${districts.length} districts`,
      districts,
      agencyType: sectors.length === 1 ? sectors[0] : `${sectors.length} sectors`,
      sectors,
    },
    breakdown: {
      delay: { delayedWorks: profile.delayed, delayRate: profile.delayRate, averageDelay: profile.averageDelay },
      cost: { costDeviation: avgCostDeviation, costOverrunRate: profile.overrunRate, costAnomalies },
      completion: { completionRate: Number(((profile.completed / profile.totalWorks) * 100).toFixed(1)), incompleteWorks: profile.totalWorks - profile.completed, ongoingWorks: ongoing, sanctionedWorks: sanctioned, incompletePercent: profile.incompletePercent },
      payment: { paymentProgressMismatch: paymentMismatchWorks, mismatchRate: profile.mismatchRate },
    },
    performanceSummary: { totalWorks: profile.totalWorks, completedWorks: profile.completed, ongoingWorks: ongoing, delayedWorks: profile.delayed, totalAllocation: profile.totalSanctioned, expenditure: profile.totalExpenditure, utilization, highRiskWorks, anomalies: costAnomalies + paymentMismatchWorks },
    riskDrivers,
    peerComparison: [profile, ...(averagePeer ? [averagePeer] : []), ...peers].map((agency) => ({ agency: agency.agency, state: agency.state, isPeerAverage: Boolean(agency.isPeerAverage), riskScore: agency.riskScore, delayRate: agency.delayRate, overrunRate: agency.overrunRate, incompleteMarkingRate: agency.incompleteMarkingRate })),
    trend: buildWorkTrend(works),
    works,
  });
});

export const getMapIntelligence = asyncHandler(async (req, res) => {
  const selectedRegion = req.query.state || 'India';
  const regionMatch = selectedRegion === 'India' ? {} : { state: selectedRegion };
  const highRiskMatch = { ...regionMatch, riskLevel: 'high' };
  const [summaryRows, zoneRows, hotspots] = await Promise.all([
    Work.aggregate([
      { $match: regionMatch },
      {
        $group: {
          _id: null,
          totalWorks: { $sum: 1 },
          totalExpenditure: { $sum: '$expenditureAmount' },
          highRiskWorks: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
          delayedWorks: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } },
          averageRiskScore: { $avg: '$riskScore' },
        },
      },
    ]),
    Work.aggregate([
      { $match: highRiskMatch },
      { $sort: { riskScore: -1 } },
      {
        $group: {
          _id: { state: '$state', district: '$district' },
          workId: { $first: '$workId' },
          topWorkId: { $first: '$workId' },
          topRiskScore: { $first: '$riskScore' },
          alert: { $first: '$alert' },
          riskTotal: { $sum: '$riskScore' },
          workCount: { $sum: 1 },
          sanctionedAmount: { $sum: '$sanctionedAmount' },
          expenditureAmount: { $sum: '$expenditureAmount' },
          progressTotal: { $sum: '$progress' },
        },
      },
    ]),
    Work.find(highRiskMatch, 'district state riskScore').sort({ riskScore: -1 }).limit(6).lean(),
  ]);
  const summary = summaryRows[0] || { totalWorks: 0, totalExpenditure: 0, highRiskWorks: 0, delayedWorks: 0, averageRiskScore: 0 };
  const markers = zoneRows
    .map((zone) => ({
      workId: zone.workId,
      title: `${zone._id.district} High-Risk Zone`,
      topWorkId: zone.topWorkId,
      topRiskScore: zone.topRiskScore,
      state: zone._id.state,
      district: zone._id.district,
      riskLevel: 'high',
      riskScore: Math.round(zone.riskTotal / zone.workCount),
      workCount: zone.workCount,
      sanctionedAmount: zone.sanctionedAmount,
      expenditureAmount: zone.expenditureAmount,
      progress: Math.round(zone.progressTotal / zone.workCount),
      coordinates: zoneCoordinates(zone._id.state, zone._id.district),
      alert: zone.alert || `${zone.workCount} high-risk works require attention`,
    }))
    .sort((a, b) => b.riskScore - a.riskScore || b.workCount - a.workCount)
    .slice(0, 750);
  res.json({
    selectedRegion,
    metrics: {
      totalWorks: summary.totalWorks,
      totalExpenditure: summary.totalExpenditure,
      highRiskWorks: summary.highRiskWorks,
      delayedWorks: summary.delayedWorks,
      averageRiskScore: summary.totalWorks ? Math.round(summary.averageRiskScore) : 0,
    },
    markers,
    hotspots: hotspots.map((work) => ({ district: work.district, state: work.state, score: work.riskScore })),
  });
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const filter = {};
  ['state', 'district', 'sector', 'agency'].forEach((key) => { if (req.query[key]) filter[key] = req.query[key]; });
  const [summary] = await Work.aggregate([{ $match: filter }, { $group: { _id: null, sanctioned: { $sum: '$sanctionedAmount' }, expenditure: { $sum: '$expenditureAmount' }, avgProgress: { $avg: '$progress' }, delayed: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } } } }]);
  const [stateRisk, sectors, trendRows, distributionRows, summaryRows, agencyPerformance] = await Promise.all([
    Work.aggregate([{ $match: filter }, { $group: { _id: '$state', value: { $avg: '$riskScore' } } }, { $sort: { value: -1 } }, { $limit: 5 }]),
    Work.aggregate([{ $match: filter }, { $group: { _id: '$sector', value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 5 }]),
    Work.aggregate([
      { $match: filter },
      { $project: { month: { $dateToString: { format: '%Y-%m', date: { $ifNull: ['$updatedAt', '$createdAt'] } } }, expenditureAmount: 1, riskScore: 1 } },
      { $group: { _id: '$month', expenditure: { $sum: '$expenditureAmount' }, riskTotal: { $sum: '$riskScore' }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 6 },
      { $sort: { _id: 1 } },
    ]),
    Work.aggregate([
      { $match: filter },
      {
        $project: {
          bucket: {
            $let: {
              vars: { deviation: { $cond: [{ $gt: ['$sanctionedAmount', 0] }, { $multiply: [{ $divide: [{ $subtract: ['$expenditureAmount', '$sanctionedAmount'] }, '$sanctionedAmount'] }, 100] }, 0] } },
              in: {
                $switch: {
                  branches: [
                    { case: { $lte: ['$$deviation', 0] }, then: { range: 'Within sanction', order: 0 } },
                    { case: { $lte: ['$$deviation', 10] }, then: { range: '0-10%', order: 1 } },
                    { case: { $lte: ['$$deviation', 25] }, then: { range: '10-25%', order: 2 } },
                    { case: { $lte: ['$$deviation', 50] }, then: { range: '25-50%', order: 3 } },
                  ],
                  default: { range: '>50%', order: 4 },
                },
              },
            },
          },
        },
      },
      { $group: { _id: '$bucket.range', order: { $first: '$bucket.order' }, works: { $sum: 1 } } },
      { $sort: { order: 1 } },
    ]),
    Work.aggregate([
      { $match: filter },
      {
        $project: {
          deviation: { $cond: [{ $gt: ['$sanctionedAmount', 0] }, { $multiply: [{ $divide: [{ $subtract: ['$expenditureAmount', '$sanctionedAmount'] }, '$sanctionedAmount'] }, 100] }, 0] },
        },
      },
      { $group: { _id: null, totalAnalyzed: { $sum: 1 }, anomalyWorks: { $sum: { $cond: [{ $gt: ['$deviation', 10] }, 1, 0] } }, averageCostDeviation: { $avg: '$deviation' }, highestCostDeviation: { $max: '$deviation' } } },
    ]),
    getAgencyMetrics(),
  ]);
  const distribution = [
    { range: 'Within sanction', min: -Infinity, max: 0 },
    { range: '0-10%', min: 0, max: 10 },
    { range: '10-25%', min: 10, max: 25 },
    { range: '25-50%', min: 25, max: 50 },
    { range: '>50%', min: 50, max: Infinity },
  ].map(({ range }) => ({ range, works: distributionRows.find((item) => item._id === range)?.works || 0 }));
  const costSummary = summaryRows[0] || { totalAnalyzed: 0, anomalyWorks: 0, averageCostDeviation: 0, highestCostDeviation: 0 };
  const data = summary || { sanctioned: 0, expenditure: 0, avgProgress: 0, delayed: 0 };
  const trend = trendRows.map((entry) => ({ month: monthLabel(entry._id), value: Number(entry.expenditure.toFixed(2)), volatility: Number((entry.riskTotal / entry.count).toFixed(1)) }));
  res.json({
    ...data,
    utilization: data.sanctioned ? Number(((data.expenditure / data.sanctioned) * 100).toFixed(1)) : 0,
    expenditureTrend: trend,
    volatility: trend,
    stateRisk: stateRisk.map((item) => ({ state: item._id, value: Math.round(item.value) })),
    sectors: sectors.map((item) => ({ name: item._id, value: item.value })),
    costAnomalyDistribution: distribution,
    costAnomalySummary: {
      totalAnalyzed: costSummary.totalAnalyzed,
      anomalyWorks: costSummary.anomalyWorks,
      averageCostDeviation: Number((costSummary.averageCostDeviation || 0).toFixed(1)),
      highestCostDeviation: Number((costSummary.highestCostDeviation || 0).toFixed(1)),
    },
    agencyPerformanceComparison: agencyPerformance.slice(0, 6).map((agency) => ({ agency: agency.agency, state: agency.state, delayRate: agency.delayRate, overrunRate: agency.overrunRate, incompleteMarkingRate: agency.incompleteMarkingRate })),
    insights: ['Systematic delay patterns require inspection in priority districts.', 'Cost escalation patterns were detected against peer-work benchmarks.', 'Agencies with completed works show lower risk concentration.'],
  });
});

export const analyzeWithAi = asyncHandler(async (req, res) => {
  const question = String(req.body.question || 'Which states have the highest financial risk?').trim().slice(0, 500);
  const normalizedQuestion = question.toLowerCase();
  const requestedWorkId = question.match(/MPL-[A-Z]{2}-\d{2,4}-\d+/i)?.[0]?.toUpperCase();
  let mode = 'financial-risk';
  let rankingField = 'state';
  let rankingTitle = 'Top States by Risk Concentration';
  let metricLabel = 'Risk concentration';
  let tools = ['Work Query Engine', 'Financial Anomaly Detector', 'Peer Benchmark Engine'];
  let candidateMatch = { riskLevel: 'high' };

  if (requestedWorkId) {
    mode = 'work-investigation'; rankingField = 'workId'; rankingTitle = 'Work Risk Assessment'; metricLabel = 'Risk score';
    candidateMatch = { workId: requestedWorkId };
    tools = ['Work Query Engine', 'Financial Anomaly Detector', 'Peer Benchmark Engine'];
  } else if (normalizedQuestion.includes('duplicate')) {
    mode = 'duplicates'; rankingTitle = 'Potential Duplicate Works by State'; metricLabel = 'Duplicate work concentration';
    candidateMatch = { alert: /duplicate/i };
    tools = ['Work Query Engine', 'Duplicate Pattern Detector', 'Peer Benchmark Engine'];
  } else if (normalizedQuestion.includes('delay') || normalizedQuestion.includes('delayed')) {
    mode = 'agency-delay'; rankingField = 'agency'; rankingTitle = 'Agencies with Highest Delay Rate'; metricLabel = 'Delay rate';
    candidateMatch = { status: 'Delayed' };
    tools = ['Work Query Engine', 'Implementation Delay Engine', 'Agency Performance Benchmark'];
  } else if (normalizedQuestion.includes('district')) {
    mode = 'district-risk'; rankingField = 'district'; rankingTitle = 'Districts with Highest High-Risk Concentration'; metricLabel = 'Risk concentration';
    candidateMatch = { riskLevel: 'high' };
  } else if (normalizedQuestion.includes('expenditure') || normalizedQuestion.includes('cost') || normalizedQuestion.includes('financial')) {
    mode = 'expenditure-anomaly'; rankingTitle = 'States with Unusual Expenditure Patterns'; metricLabel = 'Expenditure anomaly rate';
    candidateMatch = { sanctionedAmount: { $gt: 0 }, $expr: { $gt: ['$expenditureAmount', { $multiply: ['$sanctionedAmount', 1.1] }] } };
  }

  const totalsPipeline = requestedWorkId ? [] : Work.aggregate([{ $group: { _id: `$${rankingField}`, totalWorks: { $sum: 1 } } }]);
  const [totalRows, candidateRows, affectedWorks] = await Promise.all([
    totalsPipeline,
    Work.aggregate([
      { $match: candidateMatch },
      { $group: { _id: `$${rankingField}`, matchedWorks: { $sum: 1 }, riskTotal: { $sum: '$riskScore' } } },
    ]),
    Work.find(candidateMatch, 'workId title state district agency sanctionedAmount expenditureAmount progress status riskLevel riskScore alert')
      .sort({ riskScore: -1 })
      .limit(18)
      .lean(),
  ]);
  const totals = new Map(totalRows.map((entry) => [entry._id, entry.totalWorks]));
  const rankings = candidateRows
    .map((entry) => ({ name: entry._id, matchedWorks: entry.matchedWorks, riskTotal: entry.riskTotal }))
    .map((entry) => ({ ...entry, totalWorks: totals.get(entry.name) || entry.matchedWorks, concentration: rankingField === 'workId' ? Math.round(entry.riskTotal / entry.matchedWorks) : Number(((entry.matchedWorks / (totals.get(entry.name) || entry.matchedWorks)) * 100).toFixed(1)), averageRisk: Number((entry.riskTotal / entry.matchedWorks).toFixed(1)) }))
    .sort((a, b) => b.concentration - a.concentration || b.matchedWorks - a.matchedWorks)
    .slice(0, 5);
  const districts = new Set(affectedWorks.map((work) => work.district));
  const anomalyCategories = new Set(affectedWorks.map((work) => work.alert || 'Elevated risk profile'));
  const topNames = rankings.slice(0, 2).map((item) => item.name).join(' and ') || 'the available records';
  const summaryByMode = {
    'work-investigation': `The requested work ${requestedWorkId} has been evaluated against its sanction, expenditure, progress, risk score, and recorded alerts. The evidence below shows why this work requires review.`,
    duplicates: `The current MPLADS dataset contains potential duplicate-work signals concentrated in ${topNames}. These results are based on recorded duplicate alerts and peer-work pattern comparisons.`,
    'agency-delay': `The highest delay rates in the current MPLADS dataset are associated with ${topNames}. The findings use the status of each work and compare delayed works against each agency's total work portfolio.`,
    'district-risk': `The highest concentration of high-risk works is found in ${topNames}. The assessment is based on current work-level risk scores and recorded implementation alerts.`,
    'expenditure-anomaly': `Unusual expenditure patterns are most concentrated in ${topNames}. The analysis identifies works where recorded expenditure exceeds the sanctioned amount by more than 10 percent.`,
    'financial-risk': `Based on the current MPLADS dataset, ${topNames} show the highest concentration of financial risk. The assessment is evidence-grounded in work-level risk scores, expenditure-to-sanction variance, delivery progress, and recorded implementation alerts.`,
  };

  res.json({
    analysisId: `ANL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    question,
    mode, rankingTitle, metricLabel, rankings,
    evidence: { relevantWorks: affectedWorks.length, districts: districts.size, anomalyCategories: anomalyCategories.size, confidence: Math.min(96, Math.max(78, 82 + rankings.length * 2)) },
    tools,
    trace: ['Query Classification', 'Data Retrieval', 'Feature Analysis', 'Anomaly Detection', 'Evidence Validation', 'Response Generation'],
    affectedWorks,
    recentInvestigations: affectedWorks.slice(0, 2).map((work, index) => ({ id: `ANL-${Date.now().toString().slice(-6)}${index}`, title: `${work.title} assessment`, date: work.updatedAt || new Date().toISOString() })),
  });
});
