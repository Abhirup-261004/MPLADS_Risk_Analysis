import React, { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { runAiAnalysis } from '../services/api.js';
import { downloadCsv } from '../utils/download.js';

const suggestedQueries = [
  'Which districts have the highest concentration of high-risk works?',
  'Find potential duplicate works.',
  'Which agencies have the highest delay rate?',
  'Show unusual expenditure patterns.',
  'Why is MPL-WB-2025-001284 high risk?',
];

export default function AiAnalyst({ onOpenWork }) {
  const [question, setQuestion] = useState('Which states have the highest financial risk?');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const [showWorks, setShowWorks] = useState(false);

  const submit = async (event) => {
    event?.preventDefault();
    if (!question.trim()) return;
    setLoading(true); setError(''); setShowEvidence(false); setShowWorks(false);
    try { setAnalysis(await runAiAnalysis(question)); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  };

  useEffect(() => { submit(); }, []);

  const generateReport = () => {
    if (!analysis) return;
    downloadCsv(`ai-analysis-${analysis.analysisId}.csv`, ['Analysis ID', 'Question', 'Result', 'Relevant works', analysis.metricLabel, 'Average risk'], analysis.rankings.map((item) => [analysis.analysisId, analysis.question, item.name, item.matchedWorks, `${item.concentration}%`, item.averageRisk]));
  };

  return <main className="ai-analyst-page"><header className="ai-topbar"><input placeholder="Search data points, agencies, or locations..." /><span>FY 2024-2025</span><b>Dr. Arvind Kumar</b></header><section className="ai-analyst-content"><header className="ai-heading"><h1>AI Analyst</h1><p>Ask questions about MPLADS works, expenditure, risks and implementation.</p></header><div className="ai-workspace"><aside className="ai-query-panel"><form onSubmit={submit}><label>Ask PRAHARI<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask PRAHARI..." rows="4" /><button type="submit" disabled={loading}>{loading ? 'Analysing...' : 'Run Analysis'}</button></label></form><h2>Suggested inquiries</h2><div className="suggested-queries">{suggestedQueries.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div><section className="recent-investigations"><h2>Recent investigations</h2>{analysis?.recentInvestigations?.map((item) => <article key={item.id}><b>◌</b><p>{item.title}<small>{new Date(item.date).toLocaleDateString('en-IN')} · {item.id}</small></p></article>)}</section></aside><section className="ai-response-panel">{loading && <div className="ai-loading">Running evidence-grounded analysis...</div>}{error && <div className="ai-error">{error}</div>}{analysis && !loading && <><div className="question-echo">{analysis.question}</div><article className="analysis-response"><header><span>✦ Analysis complete</span><small>ID: {analysis.analysisId} · {new Date(analysis.timestamp).toLocaleString('en-IN')}</small></header><p className="analysis-summary">{analysis.summary}</p><section className="state-analysis"><div><h2>{analysis.rankingTitle}</h2><div className="state-rankings">{analysis.rankings.slice(0, 3).map((item, index) => <article key={item.name}><b>{index + 1}. {item.name}</b><span>{item.matchedWorks} relevant works identified.</span><em>{item.concentration}%</em></article>)}</div></div><section className="risk-chart"><p>{analysis.metricLabel} visualized</p><ResponsiveContainer width="100%" height={190}><BarChart data={analysis.rankings}><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="concentration" radius={[4, 4, 0, 0]}>{analysis.rankings.map((item, index) => <Cell key={item.name} fill={['#a53239', '#b87828', '#c59b38', '#657184', '#a4aab4'][index]} />)}</Bar></BarChart></ResponsiveContainer></section></section><section className="evidence-summary"><article><span>Confidence</span><strong>{analysis.evidence.confidence}%</strong><small>High reliability</small></article><article><span>Evidence base</span><p><b>{analysis.evidence.relevantWorks}</b> relevant works</p><p><b>{analysis.evidence.districts}</b> districts</p><p><b>{analysis.evidence.anomalyCategories}</b> anomaly categories</p></article></section><section className="audit-trace"><h2>Audit &amp; Execution Trace</h2><ol>{analysis.trace.map((step) => <li key={step}>{step}</li>)}</ol></section><footer className="analysis-actions"><button onClick={() => setShowEvidence(!showEvidence)}>View Evidence</button><button onClick={() => setShowWorks(!showWorks)}>View Affected Works</button><button className="primary" onClick={generateReport}>Generate Report</button></footer>{showEvidence && <section className="detail-drawer"><h2>Evidence &amp; methods</h2><p>The result is based on the current authorized MPLADS work records, with financial variance, delivery status, and risk indicators evaluated together.</p><ul>{analysis.tools.map((tool) => <li key={tool}>✓ {tool}</li>)}</ul></section>}{showWorks && <section className="detail-drawer"><h2>Affected Works</h2><div className="affected-works">{analysis.affectedWorks.map((work) => <button key={work.workId} onClick={() => onOpenWork(work.workId)}><b>{work.workId}</b><span>{work.title} · {work.district}, {work.state}</span><em>Risk {work.riskScore}</em></button>)}</div></section>}</article></>}</section></div></section></main>;
}
