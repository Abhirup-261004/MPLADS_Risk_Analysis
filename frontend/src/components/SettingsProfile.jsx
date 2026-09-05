import React, { useEffect, useMemo, useState } from 'react';
import Logo from './Logo.jsx';
import { changePassword, getCurrentUser, updateProfile, updateSettings } from '../services/api.js';

const roleLabels = { admin: 'Administrator', analyst: 'Analyst', viewer: 'Viewer' };
const accessByRole = {
  admin: ['Dashboard', 'Risk Intelligence', 'Works Explorer', 'Analytics', 'Reports', 'Notifications', 'Settings'],
  analyst: ['Dashboard', 'Risk Intelligence', 'Works Explorer', 'Analytics', 'Reports', 'Notifications', 'Settings'],
  viewer: ['Dashboard', 'Works Explorer', 'Reports', 'Notifications', 'Settings'],
};
const defaultPreferences = { defaultFinancialYear: 'FY 2024-2025', defaultState: '', defaultNotificationView: 'all', itemsPerPage: 25 };
const defaultNotificationPreferences = { riskAlerts: true, anomalyAlerts: true, delayAlerts: true, costAnomalies: true, paymentMismatch: true, duplicateWorkAlerts: true, complianceAlerts: true, systemNotifications: true, reportNotifications: true };
const financialYears = ['FY 2024-2025', 'FY 2025-2026', 'FY 2026-2027'];
const notificationLabels = {
  riskAlerts: 'Risk Alerts',
  anomalyAlerts: 'Anomaly Detection',
  delayAlerts: 'Delayed Works',
  costAnomalies: 'Cost Anomalies',
  paymentMismatch: 'Payment / Progress Mismatch',
  duplicateWorkAlerts: 'Duplicate Work Alerts',
  complianceAlerts: 'Compliance Alerts',
  systemNotifications: 'System Notifications',
  reportNotifications: 'Report Notifications',
};

function Icon({ name }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.5-3.3 2.6-5 6.5-5s6 1.7 6.5 5" /></>,
    shield: <><path d="M12 3.5c-2.2 1.7-4.7 2.5-7 2.8v5.1c0 4.1 2.6 7.6 7 9.1 4.4-1.5 7-5 7-9.1V6.3c-2.3-.3-4.8-1.1-7-2.8Z" /><path d="m9.1 12 2 2 3.8-4" /></>,
    lock: <><rect x="5.5" y="10.5" width="13" height="10" rx="1" /><path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3M12 14.5v2" /></>,
    close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function normalizeUser(user) {
  return {
    ...user,
    preferences: { ...defaultPreferences, ...(user?.preferences || {}) },
    notificationPreferences: { ...defaultNotificationPreferences, ...(user?.notificationPreferences || {}) },
  };
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SettingsSkeleton() {
  return <section className="settings-skeleton" aria-hidden="true"><article /><article /><article /></section>;
}

export default function SettingsProfile({ user, onUserUpdate }) {
  const [profile, setProfile] = useState(() => normalizeUser(user));
  const [profileForm, setProfileForm] = useState({ name: user.name || '', email: user.email || '' });
  const [preferences, setPreferences] = useState(() => normalizeUser(user).preferences);
  const [notificationPreferences, setNotificationPreferences] = useState(() => normalizeUser(user).notificationPreferences);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  async function loadProfile(active = () => true) {
    setLoading(true);
    setError('');
    getCurrentUser()
      .then((data) => {
        if (!active()) return;
        const safeUser = normalizeUser(data.user);
        setProfile(safeUser);
        setProfileForm({ name: safeUser.name || '', email: safeUser.email || '' });
        setPreferences(safeUser.preferences);
        setNotificationPreferences(safeUser.notificationPreferences);
        onUserUpdate(safeUser);
      })
      .catch(() => { if (active()) setError('Unable to load profile. Please try again.'); })
      .finally(() => { if (active()) setLoading(false); });
  }

  useEffect(() => {
    let active = true;
    loadProfile(() => active);
    return () => { active = false; };
  }, []);

  const profileChanged = profileForm.name.trim() !== profile.name || profileForm.email.trim().toLowerCase() !== profile.email;
  const settingsChanged = useMemo(() => JSON.stringify(preferences) !== JSON.stringify(profile.preferences) || JSON.stringify(notificationPreferences) !== JSON.stringify(profile.notificationPreferences), [notificationPreferences, preferences, profile]);
  const access = accessByRole[profile.role] || accessByRole.viewer;

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setMessage('');
    try {
      const data = await updateProfile({ name: profileForm.name.trim(), email: profileForm.email.trim().toLowerCase() });
      const safeUser = normalizeUser(data.user);
      setProfile(safeUser);
      setProfileForm({ name: safeUser.name, email: safeUser.email });
      onUserUpdate(safeUser);
      setMessage('Changes saved successfully.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    setError('');
    setMessage('');
    try {
      const data = await updateSettings({ preferences, notificationPreferences });
      const safeUser = normalizeUser(data.user);
      setProfile(safeUser);
      setPreferences(safeUser.preferences);
      setNotificationPreferences(safeUser.notificationPreferences);
      onUserUpdate(safeUser);
      setMessage('Changes saved successfully.');
    } catch {
      setError('Unable to save settings. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    setPasswordError('');
    setMessage('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation must match.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordOpen(false);
      setMessage('Password updated successfully.');
    } catch {
      setPasswordError('Unable to update password. Please check your current password and try again.');
    } finally {
      setPasswordSaving(false);
    }
  }

  return <main className="settings-page">
    <header className="dashboard-header"><div className="dashboard-brand"><Logo /><div><strong>PRAHARI</strong><span>Institutional Oversight</span></div></div><div className="header-actions"><button>FY 24-25</button><span className="avatar">{profile.name?.charAt(0) || 'P'}</span></div></header>
    <div className="command-search"><Icon name="search" /><input placeholder="Search settings, profile, security..." aria-label="Search settings" readOnly /></div>
    <section className="settings-content">
      <header className="settings-heading"><div><h1>Settings &amp; Profile</h1><p>Manage your profile, account preferences, notifications, and security settings.</p></div>{settingsChanged && <span>Unsaved changes</span>}</header>
      {loading && <SettingsSkeleton />}
      {error && !loading && <section className="settings-state"><Icon name="shield" /><h2>Unable to load profile</h2><p>Please try again.</p><button onClick={() => loadProfile()}>Retry</button></section>}
      {!loading && !error && <div className="settings-grid">
        <aside className="profile-card"><span className="profile-avatar">{profile.name?.charAt(0) || 'P'}</span><h2>{profile.name}</h2><p>{profile.email}</p><b>{roleLabels[profile.role] || profile.role}</b><small><i /> {profile.isActive ? 'Account Active' : 'Account Inactive'}</small><dl><div><dt>Organization</dt><dd>Not configured</dd></div><div><dt>State</dt><dd>{profile.preferences.defaultState || 'All states'}</dd></div></dl><button onClick={() => document.querySelector('#profile-information')?.scrollIntoView({ behavior: 'smooth' })}>Edit Profile</button></aside>
        <section className="settings-main">
          {message && <p className="settings-success" role="status">{message}</p>}
          <form className="settings-section" id="profile-information" onSubmit={saveProfile}>
            <header><Icon name="user" /><div><h2>Profile Information</h2><p>Official identity details used across PRAHARI AI.</p></div></header>
            <div className="settings-fields"><label>Full Name<input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>Email<input type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} required /></label><label>Role<input value={roleLabels[profile.role] || profile.role} readOnly /></label><label>Account Status<input value={profile.isActive ? 'Active' : 'Inactive'} readOnly /></label></div>
            <footer><button type="button" disabled={!profileChanged || savingProfile} onClick={() => setProfileForm({ name: profile.name, email: profile.email })}>Cancel</button><button className="primary" disabled={!profileChanged || savingProfile}>{savingProfile ? 'Saving...' : 'Save Changes'}</button></footer>
          </form>
          <section className="settings-section">
            <header><Icon name="shield" /><div><h2>Role &amp; Access</h2><p>Your current role is managed by an administrator.</p></div></header>
            <div className="access-panel-settings"><article><span>Current Role</span><strong>{roleLabels[profile.role] || profile.role}</strong></article><ul>{access.map((item) => <li key={item}>{'\u2713'} {item}</li>)}</ul></div>
          </section>
          <form className="settings-section" onSubmit={saveSettings}>
            <header><Icon name="shield" /><div><h2>Application Preferences</h2><p>Defaults used for monitoring views and notification lists.</p></div></header>
            <div className="settings-fields"><label>Default Financial Year<select value={preferences.defaultFinancialYear} onChange={(event) => setPreferences((current) => ({ ...current, defaultFinancialYear: event.target.value }))}>{financialYears.map((year) => <option key={year}>{year}</option>)}</select></label><label>Default State<input value={preferences.defaultState} onChange={(event) => setPreferences((current) => ({ ...current, defaultState: event.target.value }))} placeholder="All states" /></label><label>Default Notification View<select value={preferences.defaultNotificationView} onChange={(event) => setPreferences((current) => ({ ...current, defaultNotificationView: event.target.value }))}><option value="all">All</option><option value="unread">Unread</option><option value="critical">Critical</option><option value="warnings">Warnings</option><option value="system">System</option></select></label><label>Items Per Page<input type="number" min="10" max="100" value={preferences.itemsPerPage} onChange={(event) => setPreferences((current) => ({ ...current, itemsPerPage: Number(event.target.value) }))} /></label></div>
            <section className="settings-toggles"><h3>Notification Preferences</h3><p>These controls affect in-app notification visibility preferences only. Email delivery is not configured in this repository.</p>{Object.entries(notificationLabels).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={Boolean(notificationPreferences[key])} onChange={(event) => setNotificationPreferences((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</section>
            <footer><button type="button" disabled={!settingsChanged || savingSettings} onClick={() => { setPreferences(profile.preferences); setNotificationPreferences(profile.notificationPreferences); }}>Cancel</button><button className="primary" disabled={!settingsChanged || savingSettings}>{savingSettings ? 'Saving...' : 'Save Changes'}</button></footer>
          </form>
          <section className="settings-section security-section">
            <header><Icon name="lock" /><div><h2>Security</h2><p>Password and account security details.</p></div></header>
            <dl><div><dt>Password</dt><dd>Protected credential</dd></div><div><dt>Last login</dt><dd>{formatDate(profile.lastLoginAt)}</dd></div><div><dt>Security status</dt><dd>{profile.isActive ? 'Account active' : 'Account inactive'}</dd></div></dl>
            <footer><button className="primary" onClick={() => setPasswordOpen(true)}>Change Password</button></footer>
          </section>
        </section>
      </div>}
    </section>
    {passwordOpen && <aside className="settings-password-drawer" role="dialog" aria-modal="true" aria-labelledby="password-title"><form onSubmit={submitPassword}><header><span>Security</span><button type="button" aria-label="Close password dialog" onClick={() => setPasswordOpen(false)}><Icon name="close" /></button></header><h2 id="password-title">Change Password</h2><label>Current Password<input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label><label>New Password<input type="password" minLength="8" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required /></label><label>Confirm New Password<input type="password" minLength="8" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} required /></label>{passwordError && <p role="alert">{passwordError}</p>}<footer><button type="button" onClick={() => setPasswordOpen(false)}>Cancel</button><button className="primary" disabled={passwordSaving}>{passwordSaving ? 'Updating...' : 'Update Password'}</button></footer></form></aside>}
  </main>;
}
