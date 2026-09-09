import React from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';
import 'leaflet/dist/leaflet.css';
import Logo from './Logo.jsx';

function Icon({ name }) {
  const paths = { home: <path d="m3.5 10 8.5-6.5 8.5 6.5v9.5H14v-5H10v5H3.5Z" />, works: <><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="3" cy="7" r=".8" fill="currentColor" /><circle cx="3" cy="12" r=".8" fill="currentColor" /><circle cx="3" cy="17" r=".8" fill="currentColor" /></>, risk: <><path d="M12 3 21 20H3L12 3Z" /><path d="M12 9v4M12 16v.2" /></>, ai: <path d="m14.5 4-6.3 8.2 4.4 1.4-3 6.4 6.4-8.6-4.2-1.1Z" />, more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>, search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></> };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const metrics = [['Total Works', '24,821'], ['Total Sanctioned', 'INR 1,284 Cr'], ['Total Expenditure', 'INR 932 Cr'], ['Fund Utilization', '72.6%', '+2.1%'], ['High-Risk Works', '1,284', 'high'], ['Delayed Works', '642', 'delayed']];
const riskData = [{ name: 'Low Risk', value: 16133, percentage: '65%', color: '#13b882' }, { name: 'Medium Risk', value: 6205, percentage: '25%', color: '#ffa00a' }, { name: 'High Risk', value: 2483, percentage: '10%', color: '#ee3c48' }];
const riskLocations = [{ name: 'Nagpur District', position: [21.1458, 79.0882], count: 94, color: '#a83b42' }, { name: 'Ranchi District', position: [23.3441, 85.3096], count: 72, color: '#a83b42' }];

export default function Dashboard({ user, overview, onSignOut, onNavigate }) {
  const displayMetrics = overview ? [['Total Works', overview.totalWorks.toLocaleString('en-IN')], ['Total Sanctioned', `INR ${overview.totalSanctioned.toLocaleString('en-IN')} Cr`], ['Total Expenditure', `INR ${overview.totalExpenditure.toLocaleString('en-IN')} Cr`], ['Fund Utilization', `${overview.fundUtilization}%`, '+2.1%'], ['High-Risk Works', overview.highRiskWorks.toLocaleString('en-IN'), 'high'], ['Delayed Works', overview.delayedWorks.toLocaleString('en-IN'), 'delayed']] : metrics;
  const chartData = overview?.riskDistribution?.length ? overview.riskDistribution.map((risk) => ({ name: `${risk.level[0].toUpperCase()}${risk.level.slice(1)} Risk`, value: risk.value, percentage: '', color: ({ low: '#13b882', medium: '#ffa00a', high: '#ee3c48' })[risk.level] })) : riskData;
  const mapLocations = overview?.markers?.length ? overview.markers.filter((work) => work.riskLevel === 'high').map((work) => ({ name: `${work.district}, ${work.state}`, position: [work.coordinates.latitude, work.coordinates.longitude], count: work.riskScore, color: '#a83b42' })) : riskLocations;
  return <main className="dashboard">
    <header className="dashboard-header"><div className="dashboard-brand"><Logo /><div><strong>PRAHARI</strong><span>Institutional Oversight</span></div></div><div className="header-actions"><button>FY 24-25</button><span className="avatar">{user.name.charAt(0)}</span></div></header>
    <div className="command-search"><Icon name="search" /><input placeholder="Search work ID, district, agency..." aria-label="Search works" /></div>
    <section className="dashboard-content"><div className="overview-heading"><div><h1>National Monitoring Overview</h1><p>AI-powered visibility into MPLADS works, fund utilization and implementation risk.</p></div><div className="update-meta"><button>Calendar&nbsp; FY 2024-25⌄</button><span>Last updated: 14 May 2024, 09:30 AM</span></div></div>
      <section className="metric-grid">{displayMetrics.map(([label, value, type]) => <article className={`metric-card ${type || ''}`} key={label}><p>{label}</p><strong>{value}</strong>{type === '+2.1%' && <small>{type}</small>}{label === 'Fund Utilization' && <i className="progress"><b /></i>}</article>)}</section>
      <section className="visual-grid"><article className="dashboard-card map-card"><header><h2>National High-Risk Zones</h2><span className="map-legend high-only"><i /> High risk only</span></header><MapContainer className="risk-map" center={[22.5, 79]} zoom={5} scrollWheelZoom={false}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{mapLocations.map((location) => <CircleMarker key={location.name} center={location.position} radius={9} pathOptions={{ color: '#fff', fillColor: location.color, fillOpacity: 1, weight: 3 }}><Tooltip direction="top" offset={[0, -9]} opacity={1}>{location.name}</Tooltip><Popup><strong>{location.name}</strong><br />Risk score: {location.count}</Popup></CircleMarker>)}</MapContainer></article>
      <article className="dashboard-card category-card"><header><h2>Risk Categorization</h2></header><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="63%" outerRadius="88%" stroke="none">{chartData.map((risk) => <Cell key={risk.name} fill={risk.color} />)}</Pie><ChartTooltip formatter={(value) => Number(value).toLocaleString('en-IN')} /></PieChart></ResponsiveContainer><div className="chart-total"><strong>{overview ? overview.totalWorks.toLocaleString('en-IN') : '24.8k'}</strong><span>Total assessed</span></div></div><div className="risk-list">{chartData.map((risk) => <p key={risk.name}><i style={{ background: risk.color }} /> {risk.name}<span>{risk.value.toLocaleString('en-IN')} <b>{risk.percentage}</b></span></p>)}</div></article></section>
    </section>
  </main>;
}
