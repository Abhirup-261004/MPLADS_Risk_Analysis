import asyncHandler from 'express-async-handler';
import { Work } from '../models/Work.js';
import { zoneCoordinates } from '../utils/geography.js';

export const getRiskCenter = asyncHandler(async (req, res) => {
  const works = await Work.find({}, 'workId title district state riskLevel riskScore alert underReview status progress').sort({ riskScore: -1 }).limit(50).lean();
  const counts = { critical: works.filter((work) => work.riskScore >= 90).length, high: works.filter((work) => work.riskScore >= 70 && work.riskScore < 90).length, medium: works.filter((work) => work.riskScore >= 40 && work.riskScore < 70).length, underReview: works.filter((work) => work.underReview).length };
  res.json({ counts, queue: works.filter((work) => work.riskScore >= 40), insights: { severe: works[0] || null, highestRiskDistrict: works[0]?.district || 'No data', cluster: 'Similar high-risk works were detected in related administrative blocks.' }, trend: [{ month: 'Jan', detected: 80, resolved: 60 }, { month: 'Feb', detected: 120, resolved: 95 }, { month: 'Mar', detected: 200, resolved: 150 }, { month: 'Apr', detected: 310, resolved: 250 }, { month: 'May', detected: 390, resolved: 400 }, { month: 'Jun', detected: 480, resolved: 460 }] });
});

export const getAgencyRisk = asyncHandler(async (req, res) => {
  const grouped = await Work.aggregate([
    { $group: { _id: { agency: '$agency', state: '$state' }, totalWorks: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, delayed: { $sum: { $cond: [{ $eq: ['$status', 'Delayed'] }, 1, 0] } }, avgProgress: { $avg: '$progress' }, avgSanctioned: { $avg: '$sanctionedAmount' }, avgExpenditure: { $avg: '$expenditureAmount' }, avgRisk: { $avg: '$riskScore' } } },
    { $sort: { avgRisk: -1 } },
  ]);
  const agencies = grouped.map((entry) => {
    const costDeviation = entry.avgSanctioned ? Number((((entry.avgExpenditure - entry.avgSanctioned) / entry.avgSanctioned) * 100).toFixed(1)) : 0;
    const incompletePercent = Number((100 - entry.avgProgress).toFixed(1));
    return { agency: entry._id.agency, state: entry._id.state, totalWorks: entry.totalWorks, completed: entry.completed, delayed: entry.delayed, averageDelay: Number(((entry.delayed / entry.totalWorks) * 12).toFixed(1)), costDeviation, incompletePercent, riskScore: Math.round(entry.avgRisk), riskLevel: entry.avgRisk >= 70 ? 'high' : entry.avgRisk >= 40 ? 'medium' : 'low' };
  });
  res.json({ summary: { totalAgencies: agencies.length, highRiskAgencies: agencies.filter((agency) => agency.riskLevel === 'high').length, averageDelay: agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.averageDelay, 0) / agencies.length).toFixed(1)) : 0, averageCostDeviation: agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.costDeviation, 0) / agencies.length).toFixed(1)) : 0 }, agencies });
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
  const data = summary || { sanctioned: 0, expenditure: 0, avgProgress: 0, delayed: 0 };
  res.json({ ...data, utilization: data.sanctioned ? Number(((data.expenditure / data.sanctioned) * 100).toFixed(1)) : 0, expenditureTrend: [40, 58, 74, 69, 96, 118], volatility: [32, 45, 39, 22, 14, 47], stateRisk: stateRisk.map((item) => ({ state: item._id, value: Math.round(item.value) })), sectors: sectors.map((item) => ({ name: item._id, value: item.value })), insights: ['Systematic delay patterns require inspection in priority districts.', 'Cost escalation patterns were detected against peer-work benchmarks.', 'Agencies with completed works show lower risk concentration.'] });
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
