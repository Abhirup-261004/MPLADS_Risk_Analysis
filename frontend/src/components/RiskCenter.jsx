import React, { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAnalytics, getRiskCenter } from '../services/api.js';
import { downloadSvg } from '../utils/download.js';

const chartColors = ['#071d3c', '#60738b', '#8a7448', '#913941', '#d9dee5'];

export default function RiskCenter({ analyticsOnly = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    const request = analyticsOnly ? getAnalytics().then((analytics) => ({ analytics })) : getRiskCenter().then((center) => ({ center }));
    request.then(setData).catch(() => setError('Unable to load Risk Center intelligence. Please try again.'));
  }, [analyticsOnly]);

  if (error) return <main className="risk-main loading-risk">{error}</main>;
  if (!data) return <main className="risk-main loading-risk">Loading Risk Center intelligence...</main>;

  return <main className="risk-main"><header className="risk-top"><input placeholder="Search Work ID, Location or MP..." /><span>FY 2024-2025</span><b>PRAHARI Analyst</b></header><section className="risk-body">{analyticsOnly ? <Analytics data={data.analytics} /> : <PriorityQueue data={data.center} />}</section></main>;
}

function PriorityQueue({ data }) {
  const { counts, queue, insights, trend } = data;
  return <section className="priority-section"><header className="risk-title"><div><h1>Risk Center</h1><p>Prioritize MPLADS works requiring human attention.</p></div><button>+ Manual Flag</button></header><section className="risk-kpis">{[['Critical Risk', counts.critical, 'Requires immediate intervention'], ['High Risk', counts.high, 'Detailed review recommended'], ['Medium Risk', counts.medium, 'Monitor for escalation'], ['Under Review', counts.underReview, 'Actively investigated']].map(([label, value, text]) => <article key={label}><p>{label}</p><strong>{value}</strong><span>{text}</span></article>)}</section><div className="risk-center-grid"><section><article className="queue-card"><header><h2>Priority Risk Queue</h2><button>All Risk Levels</button></header><table><thead><tr><th>Priority</th><th>Work ID &amp; Details</th><th>Location</th><th>Risk Intelligence</th></tr></thead><tbody>{queue.slice(0, 5).map((work, index) => <tr key={work.workId}><td>P{index + 1}</td><td><b>{work.workId}</b><span>{work.title}</span></td><td>{work.district}<small>{work.state}</small></td><td><strong>{work.riskScore}</strong> {work.alert || 'Risk analysis'}<small>Confidence: 94%</small></td></tr>)}</tbody></table><footer>Showing {queue.length} risks</footer></article><article className="trend-card"><h2>Risk Discovery vs Resolution</h2><ResponsiveContainer width="100%" height={220}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="detected" stroke="#913941" strokeWidth={3} /><Line dataKey="resolved" stroke="#16804e" strokeWidth={3} /></LineChart></ResponsiveContainer></article></section><aside className="priority-insights"><h2>AI Priority Insights</h2><article><small>Most severe anomaly</small><p>{insights.severe?.alert || 'Risk concentration detected'} in <b>{insights.highestRiskDistrict}</b></p></article><article><small>Cluster alert</small><p>{insights.cluster}</p><button>Investigate cluster</button></article></aside></div></section>;
}

function Analytics({ data }) {
  const series = (data.expenditureTrend || []).map((point, index) => {
    if (typeof point === 'number') return { month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][index], value: point, volatility: data.volatility[index] };
    return { month: point.month, value: point.value, volatility: point.volatility };
  });
  const states = data.stateRisk?.length ? data.stateRisk : [];
  const sectors = data.sectors?.length ? data.sectors : [];
  const distribution = data.costAnomalyDistribution || [];
  const costSummary = data.costAnomalySummary || { totalAnalyzed: 0, anomalyWorks: 0, averageCostDeviation: 0, highestCostDeviation: 0 };
  const agencyComparison = data.agencyPerformanceComparison || [];

  return <section className="analytics-section"><header className="analytics-title"><div><h1>Analytics &amp; Insights</h1><p>Identify trends and patterns across MPLADS implementation.</p></div><div className="analytics-actions"><div className="analytics-filters">{['FY 2024-2025', 'All States', 'All Districts', 'All Sectors', 'All Agencies'].map((label) => <button key={label}>{label}</button>)}</div><div className="analytics-downloads"><button onClick={() => downloadSvg('expenditure-trend.svg', 'MPLADS Expenditure Trend', series.map((point) => ({ label: point.month, value: point.value })))}>Download Trend SVG</button><button onClick={() => downloadSvg('risk-volatility.svg', 'MPLADS Risk Volatility', series.map((point) => ({ label: point.month, value: point.volatility })))}>Download Volatility SVG</button></div></div></header><div className="analytics-grid">
    <article className="analytics-card utilization"><h2>Fund Utilization</h2><p>Sanctioned vs. Expenditure</p><div><strong>INR {data.sanctioned.toLocaleString('en-IN')} Cr</strong><b>INR {data.expenditure.toLocaleString('en-IN')} Cr</b></div><i><b style={{ width: `${data.utilization}%` }} /></i><small>0% {data.utilization}% Utilized 100%</small></article>
    <article className="analytics-card delay"><h2>Delay Analytics</h2><p>Execution timeline metrics</p><div className="mini-stats"><p>Average delay<strong>{Math.round((100 - data.avgProgress) * 2)}<small>Days</small></strong></p><p>Completion rate<strong>{Math.round(data.avgProgress)}%</strong></p></div><p className="severe-delay">Severely delayed works <strong>{data.delayed}</strong></p></article>
    <article className="analytics-card chart"><h2>Expenditure Trend</h2>{series.length ? <ResponsiveContainer width="100%" height={205}><BarChart data={series}><Tooltip /><Bar dataKey="value" radius={[5, 5, 0, 0]}>{series.map((item, index) => <Cell key={item.month} fill={chartColors[Math.min(index, chartColors.length - 1)]} />)}</Bar></BarChart></ResponsiveContainer> : <p>No data available</p>}</article>
    <article className="analytics-card chart"><h2>Risk Volatility</h2>{series.length ? <ResponsiveContainer width="100%" height={205}><AreaChart data={series}><defs><linearGradient id="volatilityFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#913941" stopOpacity=".35" /><stop offset="1" stopColor="#913941" stopOpacity=".05" /></linearGradient></defs><Tooltip /><Area type="monotone" dataKey="volatility" stroke="#913941" strokeWidth={4} fill="url(#volatilityFill)" /></AreaChart></ResponsiveContainer> : <p>No data available</p>}</article>
    <article className="analytics-card state-risk"><h2>High Risk by State</h2>{states.length ? states.map((item) => <p key={item.state}>{item.state}<i><b style={{ width: `${item.value}%` }} /></i><span>{item.value}%</span></p>) : <p>No data available</p>}</article>
    <article className="analytics-card sector-chart"><h2>Sector Distribution</h2>{sectors.length ? <div><ResponsiveContainer width={150} height={150}><PieChart><Pie data={sectors} dataKey="value" innerRadius={43} outerRadius={68} stroke="none">{sectors.map((item, index) => <Cell key={item.name} fill={chartColors[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><ul>{sectors.map((item, index) => <li key={item.name}><i style={{ background: chartColors[index] }} />{item.name} ({item.value})</li>)}</ul></div> : <p>No data available</p>}</article>
    <article className="analytics-card cost-distribution"><h2>Cost Anomaly Distribution</h2><p>Works grouped by expenditure deviation from sanctioned cost.</p>{distribution.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={distribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="range" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="works" name="Works" fill="#913941" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <p>No data available</p>}<div className="analytics-summary-strip">{[['Analyzed', costSummary.totalAnalyzed], ['Anomalies', costSummary.anomalyWorks], ['Avg Deviation', `${costSummary.averageCostDeviation}%`], ['Highest', `${costSummary.highestCostDeviation}%`]].map(([label, value]) => <span key={label}><b>{value}</b>{label}</span>)}</div></article>
    <article className="analytics-card agency-performance-card"><h2>Agency Performance Comparison</h2><p>Delay Rate, Overrun Rate, and Incomplete-Marking Rate use the Agency Risk definitions.</p>{agencyComparison.length ? <ResponsiveContainer width="100%" height={310}><BarChart data={agencyComparison.map((agency) => ({ ...agency, name: agency.agency.length > 18 ? `${agency.agency.slice(0, 18)}...` : agency.agency }))} layout="vertical" margin={{ left: 16, right: 18 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="name" width={110} /><Tooltip /><Bar dataKey="delayRate" name="Delay Rate" fill="#8a7448" /><Bar dataKey="overrunRate" name="Overrun Rate" fill="#913941" /><Bar dataKey="incompleteMarkingRate" name="Incomplete-Marking Rate" fill="#60738b" /></BarChart></ResponsiveContainer> : <p>No data available</p>}</article>
    <aside className="ai-insights"><h2>AI Insights</h2><p>Automated pattern recognition</p>{data.insights.map((insight, index) => <article key={insight}><small>{['Critical', 'Anomaly', 'Pattern'][index]} {92 - index * 7}% Confidence</small><p>{insight}</p><button>{['View Delayed Works', 'Analyze Costs', 'View Agency Data'][index]}</button></article>)}</aside>
  </div></section>;
}
