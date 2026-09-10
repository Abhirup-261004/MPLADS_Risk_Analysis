const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

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
  if (response.status === 401) clearExpiredSession();
  if (!response.ok) throw new Error(payload.message || payload.detail || 'Unable to load dashboard data.');
  return payload;
}

async function sendProtected(path, options = {}) {
  const token = localStorage.getItem('prahari_token');
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json();
  if (response.status === 401) clearExpiredSession();
  if (!response.ok) throw new Error(payload.message || payload.detail || 'Unable to complete request.');
  return payload;
}

function clearExpiredSession() {
  localStorage.removeItem('prahari_token');
  localStorage.removeItem('prahari_user');
  window.dispatchEvent(new Event('prahari:unauthorized'));
}

export const getDashboardOverview = () => getProtected('/dashboard/overview');
export const getWorks = (params = {}) => {
  const options = typeof params === 'string' ? { search: params } : params;
  const query = new URLSearchParams({ limit: '25', ...Object.fromEntries(Object.entries(options).filter(([, value]) => value)) });
  return getProtected(`/works?${query.toString()}`);
};
export const getFilterOptions = () => getProtected('/works/filters');
export const getRiskCenter = () => getProtected('/risk/center');
export const getAnalytics = (params = {}) => getProtected(`/risk/analytics?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, value]) => value))).toString()}`);
export const getAgencyRisk = () => getProtected('/risk/agencies');
export const getAgencyRiskProfile = (agencyKey) => getProtected(`/risk/agencies/${agencyKey}`);
export const getMapIntelligence = (state = '') => getProtected(`/risk/map-intelligence${state ? `?state=${encodeURIComponent(state)}` : ''}`);
export const getWork = (workId) => getProtected(`/works/${encodeURIComponent(workId)}`);
export const getCurrentUser = () => getProtected('/auth/me');
export const updateProfile = (profile) => sendProtected('/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
export const updateSettings = (settings) => sendProtected('/auth/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
export const changePassword = (passwords) => sendProtected('/auth/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) });

export const runAiAnalysis = (question) => sendProtected('/risk/ai-analyst', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question }),
});

export const getReports = () => getProtected('/reports');
export const getDataRefreshOverview = () => getProtected('/data-refresh/overview');
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

export const generateReport = (configuration) => sendProtected('/reports/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(configuration),
});

export const markWorkUnderReview = (workId) => sendProtected(`/works/${encodeURIComponent(workId)}/review`, { method: 'PATCH' });

export const categorizeWork = (payload) =>
  sendProtected('/ml/categorize-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getDisbursementRisk = (payload) =>
  sendProtected('/ml/disbursement-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getCostAnomaly = (payload) =>
  sendProtected('/ml/cost-anomaly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getVendorRisk = (vendorId) =>
  getProtected(`/ml/vendor-risk/${encodeURIComponent(vendorId)}`);

export const getMpRisk = (mpIdentifier, params = {}) => {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  ).toString();
  return getProtected(`/ml/mp-risk/${encodeURIComponent(mpIdentifier)}${query ? `?${query}` : ''}`);
};

export const getStateRisk = (state) =>
  getProtected(`/ml/state-risk/${encodeURIComponent(state)}`);

export const getMlDashboardSummary = (params = {}) => {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  ).toString();
  return getProtected(`/ml/dashboard-summary${query ? `?${query}` : ''}`);
};
