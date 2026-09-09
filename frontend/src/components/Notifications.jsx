import React, { useEffect, useMemo, useState } from 'react';
import Logo from './Logo.jsx';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '../services/api.js';

export const NOTIFICATION_TYPES = {
  RISK_ALERT: 'Risk alert',
  ANOMALY: 'Anomaly',
  DELAY: 'Delay',
  COST_ANOMALY: 'Cost anomaly',
  PAYMENT_MISMATCH: 'Payment mismatch',
  DUPLICATE_WORK: 'Duplicate work',
  COMPLIANCE: 'Compliance',
  AGENCY_RISK: 'Agency risk',
  SYSTEM: 'System',
  DATA_SYNC: 'Data sync',
  REPORT_READY: 'Report ready',
};

export const NOTIFICATION_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

function Icon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
    alert: <><path d="M12 3 21 20H3L12 3Z" /><path d="M12 9v4M12 16v.2" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 7h16s-2 0-2-7" /><path d="M10 20h4" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mapTabToParams(tab) {
  if (tab === 'unread') return { read: 'false' };
  if (tab === 'critical') return { severity: 'CRITICAL' };
  if (tab === 'warnings') return { severityGroup: 'warnings' };
  if (tab === 'system') return { typeGroup: 'system' };
  return {};
}

function NotificationSkeleton() {
  return <div className="notification-skeleton" aria-hidden="true">{Array.from({ length: 5 }).map((_, index) => <article key={index}><i /><section><b /><span /><span /></section><em /></article>)}</div>;
}

export default function Notifications({ user, onOpenWork }) {
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ all: 0, unread: 0, critical: 0, warnings: 0, system: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ type: '', severity: '', read: '', date: '', state: '', district: '', workId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const requestParams = useMemo(() => ({
    search: query.trim(),
    page: pagination.page,
    limit: pagination.limit,
    ...filters,
    ...mapTabToParams(activeTab),
  }), [activeTab, filters, pagination.limit, pagination.page, query]);

  async function loadNotifications(params = requestParams) {
    setLoading(true);
    setError('');
    try {
      const data = await getNotifications(params);
      setNotifications(data.notifications || []);
      setSummary(data.summary || { all: 0, unread: 0, critical: 0, warnings: 0, system: 0 });
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch {
      setError('Unable to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadNotifications(requestParams), 250);
    return () => clearTimeout(timer);
  }, [requestParams]);

  function updateFilter(key, value) {
    setPagination((current) => ({ ...current, page: 1 }));
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function openNotification(notification) {
    setSelected(notification);
    if (!notification.read) {
      const data = await markNotificationRead(notification._id);
      setSelected(data.notification);
      await loadNotifications();
    }
  }

  async function toggleRead(notification, event) {
    event.stopPropagation();
    const action = notification.read ? markNotificationUnread : markNotificationRead;
    const data = await action(notification._id);
    if (selected?._id === notification._id) setSelected(data.notification);
    await loadNotifications();
  }

  async function dismissNotification(notification, event) {
    event.stopPropagation();
    await deleteNotification(notification._id);
    if (selected?._id === notification._id) setSelected(null);
    await loadNotifications();
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    if (selected) setSelected({ ...selected, read: true });
    await loadNotifications();
  }

  const tabs = [
    ['all', 'All', summary.all],
    ['unread', 'Unread', summary.unread],
    ['critical', 'Critical', summary.critical],
    ['warnings', 'Warnings', summary.warnings],
    ['system', 'System', summary.system],
  ];

  return <main className="notifications-page">
    <header className="dashboard-header"><div className="dashboard-brand"><Logo /><div><strong>PRAHARI</strong><span>Institutional Oversight</span></div></div><div className="header-actions"><button>FY 24-25</button><span className="avatar">{user.name.charAt(0)}</span></div></header>
    <div className="command-search"><Icon name="search" /><input placeholder="Search notifications, work ID, district..." value={query} onChange={(event) => { setPagination((current) => ({ ...current, page: 1 })); setQuery(event.target.value); }} aria-label="Search notifications" /></div>
    <section className="notifications-content">
      <header className="notifications-heading"><div><h1>Notifications</h1><p>Stay informed about risk alerts, anomalies, compliance events, and system activity across MPLADS.</p></div><div><button onClick={markAllRead} disabled={!summary.unread}>Mark all as read</button></div></header>
      <section className="notification-tabs" aria-label="Notification summary filters">{tabs.map(([id, label, count]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => { setActiveTab(id); setPagination((current) => ({ ...current, page: 1 })); }}><span>{label}</span><strong>{count || 0}</strong></button>)}</section>
      <section className="notification-filter-bar">
        <label>Type<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option>{Object.entries(NOTIFICATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Severity<select value={filters.severity} onChange={(event) => updateFilter('severity', event.target.value)}><option value="">All severities</option>{NOTIFICATION_SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}</select></label>
        <label>Read<select value={filters.read} onChange={(event) => updateFilter('read', event.target.value)}><option value="">Any state</option><option value="false">Unread</option><option value="true">Read</option></select></label>
        <label>Date<input type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} /></label>
        <label>State<input value={filters.state} onChange={(event) => updateFilter('state', event.target.value)} placeholder="All states" /></label>
        <label>District<input value={filters.district} onChange={(event) => updateFilter('district', event.target.value)} placeholder="All districts" /></label>
        <label>Work<input value={filters.workId} onChange={(event) => updateFilter('workId', event.target.value)} placeholder="Work ID" /></label>
        <label>Status<input value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} placeholder="Any status" /></label>
      </section>
      {loading && <NotificationSkeleton />}
      {error && !loading && <section className="notifications-state error"><Icon name="alert" /><h2>Unable to load notifications</h2><p>Please try again.</p><button onClick={() => loadNotifications()}>Retry</button></section>}
      {!loading && !error && !notifications.length && <section className="notifications-state"><Icon name="check" /><h2>No notifications</h2><p>You're all caught up. New risk alerts, anomalies, and system events will appear here.</p></section>}
      {!loading && !error && notifications.length > 0 && <section className="notification-list">{notifications.map((notification) => <article key={notification._id} className={`notification-row ${notification.read ? 'read' : 'unread'} ${notification.severity.toLowerCase()}`} onClick={() => openNotification(notification)} tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter') openNotification(notification); }}>
        <span className="notification-icon"><Icon name={notification.severity === 'INFO' ? 'bell' : 'alert'} /></span>
        <section><header><h2>{notification.title}</h2><span className={`severity-badge ${notification.severity.toLowerCase()}`}>{notification.severity}</span></header><p>{notification.message}</p><footer>{notification.workId && <b>{notification.workId}</b>}{notification.district && <span>{notification.district}, {notification.state}</span>}<time>{formatTime(notification.createdAt)}</time></footer></section>
        <div className="notification-actions"><button onClick={(event) => toggleRead(notification, event)}>{notification.read ? 'Mark unread' : 'Mark read'}</button>{notification.workId && <button onClick={(event) => { event.stopPropagation(); onOpenWork(notification.workId); }}>View Work</button>}<button aria-label="Dismiss notification" onClick={(event) => dismissNotification(notification, event)}>Dismiss</button></div>
      </article>)}</section>}
      {!loading && !error && pagination.totalPages > 1 && <footer className="notification-pagination"><span>{pagination.total} notifications</span><div><button disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><b>{pagination.page} / {pagination.totalPages}</b><button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div></footer>}
    </section>
    {selected && <aside className="notification-detail" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
      <section><header><span className={`severity-badge ${selected.severity.toLowerCase()}`}>{selected.severity}</span><button aria-label="Close notification detail" onClick={() => setSelected(null)}><Icon name="close" /></button></header><h2 id="notification-detail-title">{selected.title}</h2><p>{selected.message}</p>
        <dl>
          <div><dt>Notification type</dt><dd>{NOTIFICATION_TYPES[selected.type] || selected.type}</dd></div>
          <div><dt>Detected</dt><dd>{new Date(selected.createdAt).toLocaleString('en-IN')}</dd></div>
          {selected.workId && <div><dt>Work ID</dt><dd>{selected.workId}</dd></div>}
          {selected.riskScore !== undefined && <div><dt>Risk score</dt><dd>{selected.riskScore} / 100</dd></div>}
          {selected.district && <div><dt>Location</dt><dd>{selected.district}, {selected.state}</dd></div>}
          {selected.detectionSource && <div><dt>Detection</dt><dd>{selected.detectionSource}</dd></div>}
        </dl>
        <article><small>Evidence / reason</small><p>{selected.evidence || 'Current monitoring indicators require review.'}</p></article>
        <article><small>Recommended action</small><p>{selected.recommendedAction || 'Review the related records before taking action.'}</p></article>
        <footer>{selected.workId && <button className="primary" onClick={() => onOpenWork(selected.workId)}>View Work</button>}<button onClick={(event) => toggleRead(selected, event)}>{selected.read ? 'Mark unread' : 'Mark read'}</button></footer>
      </section>
    </aside>}
  </main>;
}
