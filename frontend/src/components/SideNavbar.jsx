import React from 'react';

const items = [
  ['home', 'National Overview', '▦'],
  ['risk', 'Risk Center', '△'],
  ['works', 'Works Explorer', '⌕'],
  ['agency', 'Agency Risk', '⌂'],
  ['ai', 'AI Analyst', '◉'],
  ['reports', 'Reports & Export', '▤'],
  ['map', 'Map Intelligence', '⌖'],
  ['analytics', 'Analytics', '▤'],
];

export default function SideNavbar({ page, onNavigate, onSignOut }) {
  return <aside className="app-sidebar"><div className="sidebar-logo"><span>◈</span><strong>PRAHARI</strong></div><nav>{items.map(([id, label, icon]) => <button className={page === id ? 'active' : ''} key={id} onClick={() => onNavigate(id)}><i>{icon}</i><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button onClick={() => onNavigate('settings')}><i>⚙</i><span>Settings</span></button><button className="sidebar-signout" onClick={onSignOut}>Sign out</button></div></aside>;
}
