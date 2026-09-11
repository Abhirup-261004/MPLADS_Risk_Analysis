import React, { useState, useEffect } from 'react';

const items = [
  ['home', 'National Overview', '\u25a6'],
  ['review-queue', 'Review Queue', '\u2691'],
  ['risk', 'Risk Center', '\u25b3'],
  ['works', 'Works Explorer', '\u2315'],
  ['agency', 'Agency Risk', '\u2302'],
  ['ai', 'AI Analyst', '\u25c9'],
  ['notifications', 'Notifications', '!'],
  ['data-refresh', 'Data Refresh', '↻'],
  ['reports', 'Reports & Export', '\u25a4'],
  ['map', 'Map Intelligence', '\u2316'],
  ['analytics', 'Analytics', '\u25a4'],
];

export default function SideNavbar({ user, page, onNavigate, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = (destination) => {
    setIsOpen(false);
    onNavigate(destination);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const initials = (user?.name || 'User').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <>
      {isOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`app-sidebar ${isOpen ? 'mobile-menu-open' : ''}`}>
        <div className="sidebar-logo"><span>{'\u25c8'}</span><strong>PRAHARI</strong></div>
        <div className="mobile-user-actions">
          <button className="profile-avatar-button" type="button" aria-label="Open profile" title="Open profile" onClick={() => navigate('settings')}>{initials}</button>
          <button className="mobile-signout" type="button" onClick={() => { setIsOpen(false); onSignOut(); }}>Sign out</button>
          <button className="mobile-nav-toggle" type="button" aria-label="Toggle navigation menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}><i /><i /><i /></button>
        </div>
        <nav aria-label="Primary navigation">
          {items.map(([id, label, icon]) => (
            <button className={page === id ? 'active' : ''} key={id} onClick={() => navigate(id)}>
              <i>{icon}</i><span>{label}</span>
            </button>
          ))}
          <div className="mobile-drawer-bottom">
            <button className="mobile-drawer-profile" type="button" onClick={() => navigate('settings')}>
              <b>{initials}</b>
              <span><strong>{user?.name || 'Profile'}</strong><small>Profile &amp; preferences</small></span>
            </button>
            <button className="mobile-drawer-signout-btn" type="button" onClick={() => { setIsOpen(false); onSignOut(); }}>
              Sign out
            </button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <button className={`sidebar-profile ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}>
            <b>{initials}</b>
            <span><strong>{user?.name || 'Profile'}</strong><small>Profile &amp; preferences</small></span>
          </button>
          <button className="sidebar-signout" type="button" onClick={() => { setIsOpen(false); onSignOut(); }}>Sign out</button>
        </div>
      </aside>
    </>
  );
}
