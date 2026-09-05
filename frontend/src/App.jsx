import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import WorksExplorer from './components/WorksExplorer.jsx';
import WorkInvestigation from './components/WorkInvestigation.jsx';
import RiskCenter from './components/RiskCenter.jsx';
import AgencyRisk from './components/AgencyRisk.jsx';
import MapIntelligence from './components/MapIntelligence.jsx';
import AiAnalyst from './components/AiAnalyst.jsx';
import ReportsExport from './components/ReportsExport.jsx';
import Notifications from './components/Notifications.jsx';
import SettingsProfile from './components/SettingsProfile.jsx';
import SideNavbar from './components/SideNavbar.jsx';
import Logo from './components/Logo.jsx';
import { getDashboardOverview, getWorks, login, register } from './services/api.js';

function MailIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1" /><path d="m4.5 7 7.5 5.5L19.5 7" /></svg>; }
function LockIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="10" rx="1" /><path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3M12 14.5v2" /></svg>; }
function UserIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.5-3.3 2.6-5 6.5-5s6 1.7 6.5 5" /></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c-2.2 1.7-4.7 2.5-7 2.8v5.1c0 4.1 2.6 7.6 7 9.1 4.4-1.5 7-5 7-9.1V6.3c-2.3-.3-4.8-1.1-7-2.8Z" /><path d="m9.1 12 2 2 3.8-4" /></svg>; }

function getStoredUser() {
  try {
    const storedUser = JSON.parse(localStorage.getItem('prahari_user') || 'null');
    if (storedUser && typeof storedUser.name === 'string' && typeof storedUser.role === 'string') {
      return storedUser;
    }
    if (storedUser) {
      localStorage.removeItem('prahari_user');
      localStorage.removeItem('prahari_token');
    }
    return null;
  } catch {
    localStorage.removeItem('prahari_user');
    localStorage.removeItem('prahari_token');
    return null;
  }
}

function routeFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { page: 'home', agencyKey: null };
  const [path, ...rest] = hash.split('/');
  if (path === 'agency-risk' && rest.length) return { page: 'agency', agencyKey: rest.join('/') };
  if (path === 'agency-risk') return { page: 'agency', agencyKey: null };
  const validPages = new Set(['home', 'risk', 'works', 'agency', 'ai', 'notifications', 'reports', 'map', 'analytics', 'settings']);
  return { page: validPages.has(path) ? path : 'home', agencyKey: null };
}

function hashForPage(nextPage, agencyKey = null) {
  if (nextPage === 'agency' && agencyKey) return `#/agency-risk/${agencyKey}`;
  if (nextPage === 'agency') return '#/agency-risk';
  return `#/${nextPage}`;
}

export default function App() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(getStoredUser);
  const initialRoute = routeFromHash();
  const [page, setPage] = useState(initialRoute.page);
  const [overview, setOverview] = useState(null);
  const [works, setWorks] = useState(null);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [selectedAgencyKey, setSelectedAgencyKey] = useState(initialRoute.agencyKey);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    Promise.all([getDashboardOverview(), getWorks()])
      .then(([overviewData, worksData]) => {
        if (active) { setOverview(overviewData); setWorks(worksData.works); }
      })
      .catch(() => { if (active) { setOverview(null); setWorks(null); } });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    function syncRoute() {
      const route = routeFromHash();
      setPage(route.page);
      setSelectedAgencyKey(route.agencyKey);
    }
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (isSignUp && password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      const data = isSignUp
        ? await register({ name, email, password })
        : await login({ email, password });
      localStorage.setItem('prahari_token', data.token);
      localStorage.setItem('prahari_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }

  function switchMode() {
    setIsSignUp((currentMode) => !currentMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  }

  function navigate(nextPage) {
    window.location.hash = hashForPage(nextPage);
  }

  function openAgency(agencyKey) {
    window.location.hash = hashForPage('agency', agencyKey);
  }

  function closeAgency() {
    window.location.hash = hashForPage('agency');
  }

  function signOut() { localStorage.removeItem('prahari_token'); localStorage.removeItem('prahari_user'); setUser(null); setPage('home'); setSelectedAgencyKey(null); setPassword(''); window.location.hash = ''; }
  function updateStoredUser(nextUser) { localStorage.setItem('prahari_user', JSON.stringify(nextUser)); setUser(nextUser); }

  if (user) {
    let content;
    if (page === 'investigation' && selectedWorkId) content = <WorkInvestigation workId={selectedWorkId} user={user} onSignOut={signOut} onNavigate={navigate} />;
    else if (page === 'risk') content = <RiskCenter />;
    else if (page === 'ai') content = <AiAnalyst onOpenWork={(workId) => { setSelectedWorkId(workId); setPage('investigation'); }} />;
    else if (page === 'reports') content = <ReportsExport />;
    else if (page === 'notifications') content = <Notifications user={user} onOpenWork={(workId) => { setSelectedWorkId(workId); setPage('investigation'); }} />;
    else if (page === 'settings') content = <SettingsProfile user={user} onUserUpdate={updateStoredUser} />;
    else if (page === 'analytics') content = <RiskCenter analyticsOnly />;
    else if (page === 'agency') content = <AgencyRisk agencyKey={selectedAgencyKey} onOpenAgency={openAgency} onBack={closeAgency} />;
    else if (page === 'map') content = <MapIntelligence onOpenWork={(workId) => { setSelectedWorkId(workId); setPage('investigation'); }} />;
    else content = page === 'works' ? <WorksExplorer user={user} works={works} onSignOut={signOut} onNavigate={navigate} onOpenWork={(workId) => { setSelectedWorkId(workId); setPage('investigation'); }} /> : <Dashboard user={user} overview={overview} onSignOut={signOut} onNavigate={navigate} />;
    return <div className="authenticated-shell"><SideNavbar page={page === 'investigation' ? 'works' : page} onNavigate={navigate} onSignOut={signOut} />{content}</div>;
  }

  return <main className="portal-page">
    <section className="intelligence-panel">
      <div className="panel-brand"><Logo /><div className="brand-wording"><strong>PRAHARI</strong><span>INTELLIGENCE NETWORK</span></div></div>
      <div className="mission-copy"><h1>AI-Powered MPLADS Monitoring,<br /><strong>Anomaly &amp; Risk Intelligence</strong></h1><p>Monitor public development works. Detect anomalies early. Enable evidence-based action through rigorous data verification and geographic oversight.</p><span className="system-state"><i /> System operational</span></div>
      <div className="build-meta"><span>v 2.4.1 (beta)</span><span>node: central_op_1</span></div>
    </section>
    <section className="access-panel">
      <div className="access-card">
        <header><span className="access-icon"><ShieldIcon /></span><h2>{isSignUp ? 'Create Secure Account' : 'Secure Access Portal'}</h2><p>{isSignUp ? 'Create your official Prahari AI workspace account.' : 'Enter your official credentials to proceed.'}</p></header>
        <form onSubmit={handleSubmit} noValidate>
          {isSignUp && <label>Full Name<span className="input-shell"><UserIcon /><input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required /></span></label>}
          <label>Official Email<span className="input-shell"><MailIcon /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="officer@nic.in" required /></span></label>
          <label className="password-label"><span>Password {!isSignUp && <button type="button" className="forgot-button">Forgot?</button>}</span><span className="input-shell"><LockIcon /><input type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignUp ? 'At least 8 characters' : 'Enter your password'} minLength="8" required /><button type="button" className="visibility-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
          {isSignUp && <label>Confirm Password<span className="input-shell"><LockIcon /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your password" minLength="8" required /></span></label>}
          <div className="security-strip"><ShieldIcon /><span>Security protocol enforced</span><i /></div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="submit-button" disabled={loading}>{loading ? 'Verifying access...' : isSignUp ? 'Create Account' : 'Sign In'}</button>
        </form>
        <p className="form-switch">{isSignUp ? 'Already have an account?' : 'New to Prahari AI?'} <button type="button" onClick={switchMode}>{isSignUp ? 'Sign In' : 'Create an account'}</button></p>
      </div>
      <footer className="access-footer"><span><ShieldIcon /> Authorized access only</span><nav><a href="#help">Help / Support</a><a href="#terms">Terms of Use</a></nav></footer>
    </section>
  </main>;
}
