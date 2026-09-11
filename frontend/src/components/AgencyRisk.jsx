import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Radar, RadarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAgencyRisk, getAgencyRiskProfile, requestAgencySuspension } from '../services/api.js';
import { downloadCsv } from '../utils/download.js';

const riskColors = { high: '#913941', medium: '#705b36', low: '#4d6278' };

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('en-IN')}%`;
}

function formatMoney(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')} L`;
}

function EmptyMetric({ text = 'No data available' }) {
  return <div className="agency-empty">{text}</div>;
}

export default function AgencyRisk({ agencyKey, onOpenAgency, onBack }) {
  if (agencyKey) return <AgencyRiskProfile agencyKey={agencyKey} onBack={onBack} />;
  return <AgencyRiskList onOpenAgency={onOpenAgency} />;
}

function AgencyRiskList({ onOpenAgency }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [risk, setRisk] = useState('');

  useEffect(() => {
    getAgencyRisk().then(setData).catch(() => setError('Unable to load agency risk data. Please try again.'));
  }, []);

  if (error) return <main className="agency-page loading-risk">{error}</main>;
  if (!data) return <main className="agency-page loading-risk">Loading implementing agency risk...</main>;

  const states = [...new Set(data.agencies.map((agency) => agency.state))].sort();
  const agencies = data.agencies.filter((agency) => `${agency.agency} ${agency.state}`.toLowerCase().includes(query.toLowerCase()) && (!state || agency.state === state) && (!risk || agency.riskLevel === risk));
  const { summary } = data;
  const downloadReport = () => downloadCsv('agency-risk-report.csv', ['Agency', 'State', 'Total Works', 'Completed', 'Delayed', 'Average Delay (Months)', 'Cost Deviation (%)', 'Incomplete (%)', 'Risk Level', 'Risk Score'], agencies.map((agency) => [agency.agency, agency.state, agency.totalWorks, agency.completed, agency.delayed, agency.averageDelay, agency.costDeviation, agency.incompletePercent, agency.riskLevel, agency.riskScore]));

  return <main className="agency-page"><header className="agency-top"><input placeholder="Search work ID, district, agency..." value={query} onChange={(event) => setQuery(event.target.value)} /><span>{state || 'India'}</span></header><section className="agency-content"><header className="agency-title"><div><h1>Implementing Agency Risk</h1><p>Compare agency performance, delays, cost deviations and incomplete works across the MPLADS network.</p></div><div><button onClick={downloadReport}>Export Report</button><button className="agency-filter" onClick={() => { setState(''); setRisk(''); setQuery(''); }}>Reset Filters</button></div></header><section className="agency-kpis"><article><p>Total Agencies</p><strong>{agencies.length.toLocaleString('en-IN')}</strong><small>{state || 'Active nationwide'}</small></article><article className="risk"><p>High-Risk Agencies</p><strong>{agencies.filter((agency) => agency.riskLevel === 'high').length}</strong><small>Requires priority review</small></article><article><p>Average Delay</p><strong>{agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.averageDelay, 0) / agencies.length).toFixed(1)) : 0} <b>Mo</b></strong><i><b /></i></article><article><p>Avg Cost Deviation</p><strong className="risk-text">{agencies.length ? Number((agencies.reduce((sum, agency) => sum + agency.costDeviation, 0) / agencies.length).toFixed(1)) : 0}%</strong><small>Across selected agencies</small></article></section><section className="agency-table"><header><label><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Agency Name..." /></label><div><select value={state} onChange={(event) => setState(event.target.value)}><option value="">India (All States)</option>{states.map((item) => <option key={item}>{item}</option>)}</select><select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">All Risks</option>{['high', 'medium', 'low'].map((item) => <option key={item} value={item}>{item[0].toUpperCase()}{item.slice(1)}</option>)}</select></div></header><table><thead><tr><th>Agency Name</th><th>State</th><th>Total Works</th><th>Completed</th><th>Delayed</th><th>Avg Delay</th><th>Cost Overrun</th><th>Incomplete %</th><th>Risk Score</th></tr></thead><tbody>{agencies.map((agency) => <tr key={agency.agencyKey} className="agency-click-row" onClick={() => onOpenAgency(agency.agencyKey)} tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter') onOpenAgency(agency.agencyKey); }}><td><strong>{agency.agency}</strong><small>Open agency profile</small></td><td>{agency.state}</td><td>{agency.totalWorks}</td><td>{agency.completed}</td><td className={agency.delayed ? 'risk-text' : ''}>{agency.delayed}</td><td>{agency.averageDelay} Mo</td><td className={agency.costDeviation > 0 ? 'risk-text' : ''}>{agency.costDeviation > 0 ? '+' : ''}{agency.costDeviation}%</td><td>{agency.incompletePercent}% <i className="agency-progress"><b style={{ width: `${agency.incompletePercent}%` }} /></i></td><td><span className={`agency-level ${agency.riskLevel}`}>{agency.riskLevel}</span> <b className={`agency-score ${agency.riskLevel}`}>{agency.riskScore}</b></td></tr>)}</tbody></table></section></section></main>;
}

function AgencyRiskProfile({ agencyKey, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    getAgencyRiskProfile(agencyKey).then(setData).catch(() => setError('Unable to load agency profile. Please try again.'));
  }, [agencyKey]);

  const radarData = useMemo(() => {
    if (!data) return [];
    return data.riskDrivers.map((driver) => ({ subject: driver.label.replace(' Risk', ''), score: Math.min(100, Math.max(0, Number(driver.value || 0))) }));
  }, [data]);

  if (error) return <main className="agency-page"><section className="agency-content"><button className="agency-back" onClick={onBack}>Back to Agency Risk</button><section className="agency-profile-state"><h1>Unable to load agency profile</h1><p>Please try again.</p><button onClick={() => window.location.reload()}>Retry</button></section></section></main>;
  if (!data) return <main className="agency-page loading-risk">Loading agency profile...</main>;

  const { profile, breakdown, performanceSummary, riskDrivers, peerComparison, trend, works } = data;
  const heading = profile.riskLevel === 'high' ? 'Why is this agency high risk?' : 'Why this agency is being monitored';
  const peerData = peerComparison.map((agency) => ({ ...agency, name: agency.agency.length > 18 ? `${agency.agency.slice(0, 18)}...` : agency.agency }));

  return <main className="agency-page"><header className="agency-top"><input placeholder="Search work ID, district, agency..." readOnly /><span>FY 24-25</span></header><section className="agency-content agency-detail-content"><button className="agency-back" onClick={onBack}>Back to Agency Risk</button><header className="agency-profile-header"><div><p>Agency Risk Profile</p><h1>{profile.agency}</h1><span>{profile.agencyKey} / {profile.state} / {profile.district}</span><small>{profile.agencyType}</small></div><aside><strong>{profile.riskScore}</strong><span className={`agency-level ${profile.riskLevel}`}>{profile.riskLevel} risk</span></aside></header>
    <section className="agency-summary-grid">{[['Total Works', performanceSummary.totalWorks], ['Completed Works', performanceSummary.completedWorks], ['Ongoing Works', performanceSummary.ongoingWorks], ['Delayed Works', performanceSummary.delayedWorks], ['Total Allocation', formatMoney(performanceSummary.totalAllocation)], ['Expenditure', formatMoney(performanceSummary.expenditure)], ['Utilization', formatPercent(performanceSummary.utilization)], ['High-Risk Works', performanceSummary.highRiskWorks]].map(([label, value]) => <article key={label}><p>{label}</p><strong>{value}</strong></article>)}</section>
    <section className="agency-detail-grid"><article className="agency-detail-card"><h2>Risk Breakdown</h2><div className="agency-breakdown">{[['Delay Risk', `${breakdown.delay.delayedWorks} delayed`, formatPercent(breakdown.delay.delayRate), `${breakdown.delay.averageDelay} mo avg`], ['Cost Risk', `${formatPercent(breakdown.cost.costDeviation)} deviation`, formatPercent(breakdown.cost.costOverrunRate), `${breakdown.cost.costAnomalies} anomalies`], ['Completion Risk', `${formatPercent(breakdown.completion.completionRate)} complete`, `${breakdown.completion.incompleteWorks} incomplete`, `${breakdown.completion.ongoingWorks} ongoing`], ['Payment Risk', `${breakdown.payment.paymentProgressMismatch} mismatch`, formatPercent(breakdown.payment.mismatchRate), 'Derived from expenditure vs progress']].map(([title, a, b, c]) => <section key={title}><h3>{title}</h3><p>{a}</p><strong>{b}</strong><small>{c}</small></section>)}</div></article>
      <article className="agency-detail-card"><h2>Risk Score Visualization</h2>{radarData.length ? <ResponsiveContainer width="100%" height={260}><RadarChart data={radarData}><PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis domain={[0, 100]} /><Radar dataKey="score" stroke={riskColors[profile.riskLevel]} fill={riskColors[profile.riskLevel]} fillOpacity={0.28} /></RadarChart></ResponsiveContainer> : <EmptyMetric />}</article>
      <article className="agency-detail-card"><h2>Risk / Performance Trend</h2>{trend.length ? <ResponsiveContainer width="100%" height={240}><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="riskScore" fill="#913941" /></BarChart></ResponsiveContainer> : <EmptyMetric text="Historical data unavailable" />}</article>
      <article className="agency-detail-card risk-drivers"><h2>{heading}</h2>{riskDrivers.map((driver) => <p key={driver.label}><span>{driver.label}</span><strong className={driver.level.toLowerCase()}>{driver.level}</strong><small>{driver.value} {driver.unit}</small></p>)}</article>
      <article className="agency-detail-card agency-peer-card"><h2>Peer Comparison</h2>{peerData.length > 1 ? <ResponsiveContainer width="100%" height={310}><BarChart data={peerData} layout="vertical" margin={{ left: 20, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="name" width={115} /><Tooltip /><Bar dataKey="delayRate" name="Delay Rate" fill="#8a7448" /><Bar dataKey="overrunRate" name="Overrun Rate" fill="#913941" /><Bar dataKey="incompleteMarkingRate" name="Incomplete-Marking Rate" fill="#60738b" /></BarChart></ResponsiveContainer> : <EmptyMetric text="No same-state peer agencies available" />}</article>
      <article className="agency-detail-card agency-work-list"><h2>Highest-Risk Works</h2><table><thead><tr><th>Work</th><th>District</th><th>Status</th><th>Risk</th></tr></thead><tbody>{works.slice(0, 6).map((work) => <tr key={work.workId}><td><strong>{work.workId}</strong><small>{work.title}</small></td><td>{work.district}</td><td>{work.status}</td><td><span className={`agency-score ${work.riskLevel}`}>{work.riskScore}</span></td></tr>)}</tbody></table></article>
      <article className="agency-detail-card confirmed-pattern-card">
        <h2>Confirmed / Reviewed Risk Pattern</h2>
        <p style={{ fontSize: '0.72rem', color: '#526173', margin: '6px 0 14px' }}>
          Responsible Governance Protocol: An agency is never automatically suspended because of a single AI flag. Administrative action requires multiple independently confirmed works and explicit Ministry authorization.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '12px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '4px' }}>
            <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', color: '#64748b' }}>Total Portfolio</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#0f172a' }}>{performanceSummary.totalWorks}</strong>
          </div>
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', padding: '10px', borderRadius: '4px' }}>
            <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', color: '#991b1b' }}>High-Risk Works</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#991b1b' }}>{works.filter((w) => w.riskLevel === 'high').length}</strong>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px', borderRadius: '4px' }}>
            <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', color: '#166534' }}>Completion Rate</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#166534' }}>{formatPercent(breakdown.completion.completionRate)}</strong>
          </div>
        </div>

        {works.filter((w) => w.riskLevel === 'high').length >= 2 ? (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px', borderRadius: '6px', marginTop: '10px' }}>
            <strong style={{ color: '#9a3412', fontSize: '0.75rem', display: 'block' }}>&#x26A0; Ministry Review Recommended</strong>
            <p style={{ fontSize: '0.67rem', color: '#7c2d12', margin: '4px 0 10px' }}>
              Multiple recurring high-risk works ({works.filter((w) => w.riskLevel === 'high').length} works) identified across this agency&apos;s portfolio. Authorized Ministry officials may initiate formal suspension proceedings.
            </p>
            <button
              type="button"
              style={{ background: '#152b4b', color: '#fff', border: 0, padding: '7px 13px', fontSize: '0.66rem', borderRadius: '4px', cursor: 'pointer' }}
              onClick={async () => {
                const justification = window.prompt(`Enter Ministry justification for agency suspension review (${profile.agency}):`);
                if (!justification || !justification.trim()) return;
                try {
                  const res = await requestAgencySuspension(profile.agency, { justification: justification.trim() });
                  alert(res.message || 'Suspension review initiated.');
                } catch (err) {
                  alert(err.message || 'Failed to submit suspension request.');
                }
              }}
            >
              Initiate Ministry Suspension Review
            </button>
          </div>
        ) : (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
            <p style={{ fontSize: '0.67rem', color: '#475569', margin: 0 }}>
              &#x2713; <strong>Threshold Condition Satisfied:</strong> No recurring multi-work escalation pattern detected. Agency remains eligible for ongoing MPLADS works.
            </p>
          </div>
        )}
      </article>
    </section></section></main>;
}
