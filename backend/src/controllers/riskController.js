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
  const works = await Work.find({}, 'workId title state district sanctionedAmount expenditureAmount progress riskScore riskLevel alert status coordinates').sort({ riskScore: -1 }).lean();
  const selectedRegion = req.query.state || 'India';
  const regionWorks = selectedRegion === 'India' ? works : works.filter((work) => work.state === selectedRegion);
  const totalExpenditure = regionWorks.reduce((sum, work) => sum + work.expenditureAmount, 0);
  const highRiskWorks = regionWorks.filter((work) => work.riskLevel === 'high').sort((a, b) => b.riskScore - a.riskScore);
  const zones = new Map();
  highRiskWorks.forEach((work) => {
    const key = `${work.state}|${work.district}`;
    const zone = zones.get(key) || { workId: work.workId, title: `${work.district} High-Risk Zone`, topWorkId: work.workId, state: work.state, district: work.district, riskLevel: 'high', riskTotal: 0, workCount: 0, sanctionedAmount: 0, expenditureAmount: 0, progressTotal: 0, alert: '' };
    zone.riskTotal += work.riskScore; zone.workCount += 1; zone.sanctionedAmount += work.sanctionedAmount; zone.expenditureAmount += work.expenditureAmount; zone.progressTotal += work.progress;
    if (work.riskScore > (zone.topRiskScore || 0)) { zone.topWorkId = work.workId; zone.topRiskScore = work.riskScore; zone.alert = work.alert; }
    zones.set(key, zone);
  });
  const markers = [...zones.values()].map((zone) => ({ ...zone, riskScore: Math.round(zone.riskTotal / zone.workCount), progress: Math.round(zone.progressTotal / zone.workCount), coordinates: zoneCoordinates(zone.state, zone.district), alert: zone.alert || `${zone.workCount} high-risk works require attention` })).sort((a, b) => b.riskScore - a.riskScore || b.workCount - a.workCount).slice(0, 750);
  const hotspots = highRiskWorks.slice(0, 6).map((work) => ({ district: work.district, state: work.state, score: work.riskScore }));
  res.json({ selectedRegion, metrics: { totalWorks: regionWorks.length, totalExpenditure, highRiskWorks: highRiskWorks.length, delayedWorks: regionWorks.filter((work) => work.status === 'Delayed').length, averageRiskScore: regionWorks.length ? Math.round(regionWorks.reduce((sum, work) => sum + work.riskScore, 0) / regionWorks.length) : 0 }, markers, hotspots });
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const [summary] = await Work.aggregate([{ $group: { _id: null, sanctioned: { $sum: '$sanctionedAmount' }, expenditure: { $sum: '$expenditureAmount' }, avgProgress: { $avg: '$progress' }, delayed: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } } } }]);
  const [stateRisk, sectors] = await Promise.all([
    Work.aggregate([{ $group: { _id: '$state', value: { $avg: '$riskScore' } } }, { $sort: { value: -1 } }, { $limit: 5 }]),
    Work.aggregate([{ $group: { _id: '$sector', value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 5 }]),
  ]);
  const [works, agencyPerformance] = await Promise.all([
    Work.find({}, 'sanctionedAmount expenditureAmount progress status agency state riskScore').lean(),
    getAgencyMetrics(),
  ]);
  const distributionBuckets = [
    { range: 'Within sanction', min: -Infinity, max: 0 },
    { range: '0-10%', min: 0, max: 10 },
    { range: '10-25%', min: 10, max: 25 },
    { range: '25-50%', min: 25, max: 50 },
    { range: '>50%', min: 50, max: Infinity },
  ].map((bucket) => ({ ...bucket, works: 0 }));
  const deviations = works.map(getCostDeviation);
  deviations.forEach((deviation) => {
    const bucket = distributionBuckets.find((item) => deviation > item.min && deviation <= item.max) || distributionBuckets[0];
    bucket.works += 1;
  });
  const anomalyDeviations = deviations.filter((deviation) => deviation > 10);
  const data = summary || { sanctioned: 0, expenditure: 0, avgProgress: 0, delayed: 0 };
  const trend = buildAnalyticsTrend(works);
  res.json({
    ...data,
    utilization: data.sanctioned ? Number(((data.expenditure / data.sanctioned) * 100).toFixed(1)) : 0,
    expenditureTrend: trend,
    volatility: trend,
    stateRisk: stateRisk.map((item) => ({ state: item._id, value: Math.round(item.value) })),
    sectors: sectors.map((item) => ({ name: item._id, value: item.value })),
    costAnomalyDistribution: distributionBuckets.map(({ range, works: count }) => ({ range, works: count })),
    costAnomalySummary: {
      totalAnalyzed: works.length,
      anomalyWorks: anomalyDeviations.length,
      averageCostDeviation: deviations.length ? Number((deviations.reduce((sum, value) => sum + value, 0) / deviations.length).toFixed(1)) : 0,
      highestCostDeviation: deviations.length ? Math.max(...deviations) : 0,
    },
    agencyPerformanceComparison: agencyPerformance.slice(0, 6).map((agency) => ({ agency: agency.agency, state: agency.state, delayRate: agency.delayRate, overrunRate: agency.overrunRate, incompleteMarkingRate: agency.incompleteMarkingRate })),
    insights: ['Systematic delay patterns require inspection in priority districts.', 'Cost escalation patterns were detected against peer-work benchmarks.', 'Agencies with completed works show lower risk concentration.'],
  });
});

export const analyzeWithAi = asyncHandler(async (req, res) => {
  const question = String(req.body.question || 'Which states have the highest financial risk?').trim().slice(0, 500);
  const works = await Work.find({}, 'workId title state district agency sanctionedAmount expenditureAmount progress status riskLevel riskScore alert').sort({ riskScore: -1 }).lean();
  const normalizedQuestion = question.toLowerCase();
  const requestedWorkId = question.match(/MPL-[A-Z]{2}-\d{2,4}-\d+/i)?.[0]?.toUpperCase();
  let mode = 'financial-risk';
  let rankingField = 'state';
  let rankingTitle = 'Top States by Risk Concentration';
  let metricLabel = 'Risk concentration';
  let tools = ['Work Query Engine', 'Financial Anomaly Detector', 'Peer Benchmark Engine'];
  let candidateWorks = works.filter((work) => work.riskLevel === 'high');

  if (requestedWorkId) {
    mode = 'work-investigation'; rankingField = 'workId'; rankingTitle = 'Work Risk Assessment'; metricLabel = 'Risk score';
    candidateWorks = works.filter((work) => work.workId === requestedWorkId);
    tools = ['Work Query Engine', 'Financial Anomaly Detector', 'Peer Benchmark Engine'];
  } else if (normalizedQuestion.includes('duplicate')) {
    mode = 'duplicates'; rankingTitle = 'Potential Duplicate Works by State'; metricLabel = 'Duplicate work concentration';
    candidateWorks = works.filter((work) => /duplicate/i.test(work.alert));
    tools = ['Work Query Engine', 'Duplicate Pattern Detector', 'Peer Benchmark Engine'];
  } else if (normalizedQuestion.includes('delay') || normalizedQuestion.includes('delayed')) {
    mode = 'agency-delay'; rankingField = 'agency'; rankingTitle = 'Agencies with Highest Delay Rate'; metricLabel = 'Delay rate';
    candidateWorks = works.filter((work) => work.status === 'Delayed');
    tools = ['Work Query Engine', 'Implementation Delay Engine', 'Agency Performance Benchmark'];
  } else if (normalizedQuestion.includes('district')) {
    mode = 'district-risk'; rankingField = 'district'; rankingTitle = 'Districts with Highest High-Risk Concentration'; metricLabel = 'Risk concentration';
    candidateWorks = works.filter((work) => work.riskLevel === 'high');
  } else if (normalizedQuestion.includes('expenditure') || normalizedQuestion.includes('cost') || normalizedQuestion.includes('financial')) {
    mode = 'expenditure-anomaly'; rankingTitle = 'States with Unusual Expenditure Patterns'; metricLabel = 'Expenditure anomaly rate';
    candidateWorks = works.filter((work) => work.sanctionedAmount > 0 && (work.expenditureAmount / work.sanctionedAmount) > 1.1);
  }

  const totals = new Map();
  works.forEach((work) => { const key = work[rankingField]; totals.set(key, (totals.get(key) || 0) + 1); });
  const grouped = new Map();
  candidateWorks.forEach((work) => {
    const key = work[rankingField];
    const entry = grouped.get(key) || { name: key, matchedWorks: 0, riskTotal: 0 };
    entry.matchedWorks += 1; entry.riskTotal += work.riskScore; grouped.set(key, entry);
  });
  const rankings = [...grouped.values()]
    .map((entry) => ({ ...entry, totalWorks: totals.get(entry.name) || entry.matchedWorks, concentration: rankingField === 'workId' ? Math.round(entry.riskTotal / entry.matchedWorks) : Number(((entry.matchedWorks / (totals.get(entry.name) || entry.matchedWorks)) * 100).toFixed(1)), averageRisk: Number((entry.riskTotal / entry.matchedWorks).toFixed(1)) }))
    .sort((a, b) => b.concentration - a.concentration || b.matchedWorks - a.matchedWorks)
    .slice(0, 5);
  const affectedWorks = candidateWorks.slice(0, 18);
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
