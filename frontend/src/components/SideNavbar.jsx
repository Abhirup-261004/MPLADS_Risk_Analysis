import React from 'react';

const items = [
  ['home', 'National Overview', '\u25a6'],
  ['risk', 'Risk Center', '\u25b3'],
  ['works', 'Works Explorer', '\u2315'],
  ['agency', 'Agency Risk', '\u2302'],
  ['ai', 'AI Analyst', '\u25c9'],
  ['notifications', 'Notifications', '!'],
  ['reports', 'Reports & Export', '\u25a4'],
  ['map', 'Map Intelligence', '\u2316'],
  ['analytics', 'Analytics', '\u25a4'],
];

export default function SideNavbar({ page, onNavigate, onSignOut }) {
  return <aside className="app-sidebar"><div className="sidebar-logo"><span>{'\u25c8'}</span><strong>PRAHARI</strong></div><nav>{items.map(([id, label, icon]) => <button className={page === id ? 'active' : ''} key={id} onClick={() => onNavigate(id)}><i>{icon}</i><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button className={page === 'settings' ? 'active' : ''} onClick={() => onNavigate('settings')}><i>{'\u2699'}</i><span>Settings</span></button><button className="sidebar-signout" onClick={onSignOut}>Sign out</button></div></aside>;
}
