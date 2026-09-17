import React, { useEffect, useState } from 'react';
import {
  approveGovernanceChange,
  createGovernanceKey,
  getGovernance,
  saveGovernanceConfig,
  submitUserGovernanceChange,
} from '../services/api.js';

export default function GovernanceConsole() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('users');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => getGovernance()
    .then(setData)
    .catch((requestError) => setError(requestError.message));

  useEffect(() => { load(); }, []);

  async function act(call, needsReason = true) {
    try {
      setError('');
      if (needsReason && !reason.trim()) throw new Error('Reason is required.');
      const result = await call();
      setMessage(result.message || 'Governance action completed.');
      if (needsReason) setReason('');
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!data) return <main className="governance-page">{error || 'Loading governance console...'}</main>;

  return <main className="governance-page">
    <header>
      <p>System Administration</p>
      <h1>Governance Console</h1>
      <span>High-impact actions require a reason and approval by a second System Admin.</span>
    </header>

    <nav>
      {[
        ['users', 'Users & scopes'],
        ['config', 'Policy & configuration'],
        ['approvals', 'Dual approval queue'],
        ['audit', 'Audit logs'],
        ['keys', 'API keys & integrations'],
        ['data', 'Data operations'],
      ].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    <label className="gov-reason">Reason for governance action
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for every requested change" />
    </label>
    {error && <p className="gov-error">{error}</p>}
    {message && <p className="gov-success">{message}</p>}

    {tab === 'users' && <section>
      <h2>User governance</h2>
      <table>
        <thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.users.map((user) => <tr key={user.id}>
          <td>{user.name}<small>{user.email}</small></td>
          <td><select value={user.role} onChange={(event) => act(() => submitUserGovernanceChange({ userId: user.id, role: event.target.value, profileType: event.target.value, reason }))}>
            {data.profileTypes.map((role) => <option key={role} value={role}>{role}</option>)}
          </select></td>
          <td>{user.state || 'India'} / {user.district || 'All districts'}</td>
          <td>{user.isActive ? 'Active' : 'Inactive'}</td>
          <td><button onClick={() => act(() => submitUserGovernanceChange({ userId: user.id, isActive: !user.isActive, reason }))}>
            {user.isActive ? 'Request deactivation' : 'Activate'}
          </button></td>
        </tr>)}</tbody>
      </table>
    </section>}

    {tab === 'config' && <section>
      <h2>Policy, redaction and retention</h2>
      <p>Configure sectors, notifications, tender workflow, export permissions, public-data redaction, retention, backups, and maintenance. Redaction and retention changes require dual approval.</p>
      <ConfigForm onSave={(key, value) => act(() => saveGovernanceConfig({ key, value, reason }))} />
      <pre>{JSON.stringify(data.configs, null, 2)}</pre>
    </section>}

    {tab === 'approvals' && <section>
      <h2>Pending high-impact changes</h2>
      {data.changes.length ? data.changes.map((change) => <article className="gov-change" key={change._id}>
        <b>{change.action}</b><span>{change.target}</span><p>{change.reason}</p>
        <button onClick={() => act(() => approveGovernanceChange(change._id), false)}>Approve as second admin</button>
      </article>) : <p>No pending changes.</p>}
    </section>}

    {tab === 'audit' && <section>
      <h2>Immutable governance audit trail</h2>
      {data.audits.map((audit) => <article className="gov-audit" key={audit._id}>
        <b>{audit.action}</b><span>{audit.target}</span><p>{audit.actorName}: {audit.reason}</p>
        <small>{new Date(audit.timestamp).toLocaleString('en-IN')}</small>
      </article>)}
    </section>}

    {tab === 'keys' && <section>
      <h2>API keys and integrations</h2>
      <KeyForm onCreate={(name, permissions) => act(() => createGovernanceKey({ name, permissions, reason }).then((result) => {
        window.alert(`Copy this key now: ${result.key}`);
        return result;
      }))} />
      {data.keys.map((key) => <p key={key._id}>{key.name} · {key.active ? 'Active' : 'Inactive'} · {key.permissions.join(', ')}</p>)}
    </section>}

    {tab === 'data' && <section>
      <h2>Data operations</h2>
      <p>Use the Data Refresh page for source health, import counts, failed rows, and dataset monitoring. Import execution, backup restoration, and source mapping changes should be requested through governed configuration until a dedicated job runner is connected.</p>
    </section>}
  </main>;
}

function ConfigForm({ onSave }) {
  const [key, setKey] = useState('public.redaction');
  const [value, setValue] = useState('{}');
  return <form onSubmit={(event) => { event.preventDefault(); onSave(key, JSON.parse(value)); }}>
    <input value={key} onChange={(event) => setKey(event.target.value)} />
    <textarea value={value} onChange={(event) => setValue(event.target.value)} />
    <button>Submit configuration</button>
  </form>;
}

function KeyForm({ onCreate }) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState('read:public');
  return <form onSubmit={(event) => { event.preventDefault(); onCreate(name, permissions.split(',').map((item) => item.trim())); }}>
    <input required placeholder="Integration name" value={name} onChange={(event) => setName(event.target.value)} />
    <input value={permissions} onChange={(event) => setPermissions(event.target.value)} />
    <button>Request API key</button>
  </form>;
}
