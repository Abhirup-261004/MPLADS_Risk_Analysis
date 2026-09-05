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

async function sendProtected(path, options = {}) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to complete request.');
  return payload;
}

export const getDashboardOverview = () => getProtected('/dashboard/overview');
export const getWorks = (search = '') => getProtected(`/works?limit=25&search=${encodeURIComponent(search)}`);
export const getRiskCenter = () => getProtected('/risk/center');
export const getAnalytics = () => getProtected('/risk/analytics');
export const getAgencyRisk = () => getProtected('/risk/agencies');
export const getAgencyRiskProfile = (agencyKey) => getProtected(`/risk/agencies/${agencyKey}`);
export const getMapIntelligence = () => getProtected('/risk/map-intelligence');
export const getWork = (workId) => getProtected(`/works/${encodeURIComponent(workId)}`);
export const getCurrentUser = () => getProtected('/auth/me');
export const updateProfile = (profile) => sendProtected('/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
export const updateSettings = (settings) => sendProtected('/auth/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
export const changePassword = (passwords) => sendProtected('/auth/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) });

export async function runAiAnalysis(question) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}/risk/ai-analyst`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Unable to run the AI analysis.');
  return payload;
}

export const getReports = () => getProtected('/reports');
export const getNotifications = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries({ page: 1, limit: 20, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') searchParams.set(key, value);
  });
  return getProtected(`/notifications?${searchParams.toString()}`);
};
export const getNotification = (id) => getProtected(`/notifications/${encodeURIComponent(id)}`);
export const markNotificationRead = (id) => sendProtected(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
export const markNotificationUnread = (id) => sendProtected(`/notifications/${encodeURIComponent(id)}/unread`, { method: 'PATCH' });
export const markAllNotificationsRead = () => sendProtected('/notifications/read-all', { method: 'PATCH' });
export const deleteNotification = (id) => sendProtected(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });

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
