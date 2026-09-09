import React, { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getFilterOptions, getMapIntelligence } from '../services/api.js';
import { downloadCsv } from '../utils/download.js';

const colors = { high: '#a83b42', medium: '#a67835', low: '#53738d' };

function MapFocus({ zone }) {
  const map = useMap();
  useEffect(() => {
    if (!zone?.coordinates) return;
    map.flyTo([zone.coordinates.latitude, zone.coordinates.longitude], Math.max(map.getZoom(), 7), { animate: true, duration: .55 });
  }, [map, zone?.coordinates?.latitude, zone?.coordinates?.longitude]);
  return null;
}

export default function MapIntelligence({ onOpenWork }) {
  const [data, setData] = useState(null); const [selected, setSelected] = useState(null); const [options, setOptions] = useState({ states: [] }); const [state, setState] = useState(''); const [district, setDistrict] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { getFilterOptions().then(setOptions).catch(() => setOptions({ states: [] })); }, []);
  useEffect(() => { setData(null); getMapIntelligence(state).then((result) => { setData(result); setSelected(result.markers[0] || null); }).catch(() => setData(null)); }, [state]);
  useEffect(() => {
    const matchingZones = (data?.markers || []).filter((work) => work.riskLevel === 'high' && (!district || work.district === district) && `${work.title} ${work.district} ${work.state}`.toLowerCase().includes(query.trim().toLowerCase()));
    if (matchingZones.length) setSelected(matchingZones[0]);
  }, [query, district, state, data]);
  if (!data) return <main className="map-page loading-risk">Loading geographic intelligence...</main>;
  const { metrics, markers, hotspots } = data;
  const highRiskMarkers = markers.filter((work) => work.riskLevel === 'high' && (!district || work.district === district));
  const matchingZones = highRiskMarkers.filter((work) => `${work.title} ${work.district} ${work.state}`.toLowerCase().includes(query.trim().toLowerCase()));
  const districts = [...new Set(markers.map((work) => work.district))].sort();
  const downloadData = () => downloadCsv('map-intelligence-high-risk-zones.csv', ['Zone', 'State', 'District', 'High-Risk Works', 'Average Risk Score', 'Average Progress'], highRiskMarkers.map((work) => [work.title, work.state, work.district, work.workCount, work.riskScore, `${work.progress}%`]));
  return <main className="map-page"><header className="map-top"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search high-risk locations, districts, or states..." aria-label="Search high-risk locations" /><span>{matchingZones.length} zones found</span></header><section className="map-workspace"><section className="map-canvas"><div className="map-filters"><button>High-Risk Zones</button><select value={state} onChange={(event) => { setState(event.target.value); setDistrict(''); }}><option value="">India (All States)</option>{options.states.map((item) => <option key={item}>{item}</option>)}</select><select value={district} onChange={(event) => setDistrict(event.target.value)}><option value="">All Districts</option>{districts.map((item) => <option key={item}>{item}</option>)}</select></div><MapContainer center={[22.5, 79]} zoom={5} className="intelligence-map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapFocus zone={selected} />{matchingZones.map((work) => <CircleMarker key={`${work.state}-${work.district}`} center={[work.coordinates.latitude, work.coordinates.longitude]} radius={Math.min(16, 7 + Math.sqrt(work.workCount || 1))} pathOptions={{ color: '#fff', fillColor: colors.high, fillOpacity: .95, weight: 2 }} eventHandlers={{ click: () => setSelected(work) }}><Tooltip>{work.district}: {work.workCount} high-risk works</Tooltip></CircleMarker>)}</MapContainer>{!matchingZones.length && <p className="map-no-results">No high-risk zones match this location.</p>}{selected && matchingZones.some((zone) => zone.state === selected.state && zone.district === selected.district) && <article className="map-work-card"><header><span>{selected.riskLevel} risk</span><small>{selected.workCount} works</small></header><h2>{selected.title}</h2><p>{selected.district}, {selected.state}</p><div><p>Sanctioned<b>INR {selected.sanctionedAmount} L</b></p><p>Expenditure<b>INR {selected.expenditureAmount} L</b></p><p>Avg. Progress<b>{selected.progress}%</b></p><p>Risk Score<b>{selected.riskScore}/100</b></p></div><footer>{selected.alert || 'Risk pattern detected'}<button onClick={() => onOpenWork(selected.topWorkId)}>Open Top Investigation →</button></footer></article>}</section><aside className="map-sidebar"><header><p>Selected Region</p><h1>{state || 'India'}</h1><small>{state ? 'State-level aggregation' : 'National aggregation across all states'}</small></header><section className="map-metrics">{[['Total Works', metrics.totalWorks], ['Total Expenditure', `INR ${metrics.totalExpenditure} Cr`], ['High-Risk Works', metrics.highRiskWorks], ['Delayed Works', metrics.delayedWorks]].map(([label, value]) => <article key={label}><p>{label}</p><strong>{value}</strong></article>)}</section><article className="average-risk"><p>Average Risk Score</p><span>{state || 'All works nationwide'}</span><strong>{metrics.averageRiskScore}</strong></article><section className="hotspots"><h2>Risk Hotspots</h2>{hotspots.map((spot, index) => <article key={`${spot.district}-${index}`}><b>{index + 1}</b><p>{spot.district}<small>{spot.state}</small></p><strong>{spot.score}</strong><i><span style={{ width: `${spot.score}%` }} /></i></article>)}</section><button className="map-export" onClick={downloadData}>Download High-Risk Data</button></aside></section></main>;
}
