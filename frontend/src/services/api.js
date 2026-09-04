const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function login(credentials) {
  return sendAuthRequest('/auth/login', credentials);
}

export async function register(credentials) {
  return sendAuthRequest('/auth/register', credentials);
}

async function sendAuthRequest(path, credentials) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to sign in.');
  return payload;
}

async function getProtected(path) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to load dashboard data.');
  return payload;
}

export const getDashboardOverview = () => getProtected('/dashboard/overview');
export const getWorks = (search = '') => getProtected(`/works?limit=25&search=${encodeURIComponent(search)}`);
export const getRiskCenter = () => getProtected('/risk/center');
export const getAnalytics = () => getProtected('/risk/analytics');
export const getAgencyRisk = () => getProtected('/risk/agencies');
export const getMapIntelligence = () => getProtected('/risk/map-intelligence');
export const getWork = (workId) => getProtected(`/works/${encodeURIComponent(workId)}`);

export async function runAiAnalysis(question) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}/risk/ai-analyst`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to run the AI analysis.');
  return payload;
}

export const getReports = () => getProtected('/reports');

export async function generateReport(configuration) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}/reports/generate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(configuration) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to generate report.');
  return payload;
}

export async function markWorkUnderReview(workId) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}/works/${encodeURIComponent(workId)}/review`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to update work.');
  return payload;
}
