import React, { useEffect, useState, useCallback } from 'react';
import Logo from './Logo.jsx';
import { getReviewQueue } from '../services/api.js';

export default function ReviewQueue({ user, onOpenWork, onNavigate }) {
  const [works, setWorks] = useState([]);
  const [counts, setCounts] = useState({
    totalInFilter: 0,
    onHold: 0,
    underReview: 0,
    escalated: 0,
    cleared: 0,
    pendingAppeal: 0,
    overdue: 0,
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState('');
  const [slaFilter, setSlaFilter] = useState('all');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: 15,
        status: statusFilter,
        riskLevel: riskLevelFilter,
        slaStatus: slaFilter,
        search: search.trim(),
      };
      const response = await getReviewQueue(params);
      setWorks(response.data || []);
      setTotalPages(response.totalPages || 1);
      if (response.counts) setCounts(response.counts);
    } catch (err) {
      setError(err.message || 'Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, riskLevelFilter, slaFilter, search]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadQueue();
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ON_HOLD':
        return 'queue-status-hold';
      case 'ESCALATED':
        return 'queue-status-escalated';
      case 'UNDER_REVIEW':
        return 'queue-status-review';
      case 'CLEARED':
        return 'queue-status-cleared';
      case 'FLAGGED':
      default:
        return 'queue-status-flagged';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'ON_HOLD':
        return 'DISBURSEMENT HOLD';
      case 'ESCALATED':
        return 'Escalated to Ministry';
      case 'UNDER_REVIEW':
        return 'Under Review';
      case 'CLEARED':
        return 'Cleared';
      case 'FLAGGED':
      default:
        return 'Flagged for Review';
    }
  };

  return (
    <main className="review-queue-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Logo />
          <div>
            <strong>PRAHARI</strong>
            <span>Fraud Response &amp; Review Workflow</span>
          </div>
        </div>
        <div className="header-actions">
          <span style={{ fontSize: '0.62rem', color: '#c3d3e8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Official Role: <strong>{user?.role || 'Analyst'}</strong>
          </span>
          <button type="button" onClick={() => onNavigate('home')}>Dashboard</button>
        </div>
      </header>

      <section className="review-queue-content">
        <div className="queue-header-strip">
          <div>
            <div className="breadcrumbs">Oversight › Workflow Management › <strong>Review Queue</strong></div>
            <h1>Fraud Response Review Queue</h1>
            <p>
              Administrative oversight queue for flagged works. Enforces the strict governance rule:
              <em> AI Flags &rarr; Evidence &rarr; Human Review &rarr; Decision &rarr; Immutable Audit Log.</em>
            </p>
          </div>
          <div className="queue-governance-note">
            <span className="gov-icon">&#x2696;</span>
            <div>
              <strong>Responsible Governance Protocol</strong>
              <small>No automated fraud declarations. Holds apply only to specific works pending verification.</small>
            </div>
          </div>
        </div>

        {/* Metrics Overview Bar */}
        <div className="queue-stats-grid">
          <div
            className={`queue-stat-card ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('all'); setPage(1); }}
          >
            <span className="stat-label">In Review Queue</span>
            <strong className="stat-value">{counts.totalInFilter}</strong>
            <small>Active candidate works</small>
          </div>

          <div
            className={`queue-stat-card hold ${statusFilter === 'ON_HOLD' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('ON_HOLD'); setPage(1); }}
          >
            <span className="stat-label">Disbursement Holds</span>
            <strong className="stat-value" style={{ color: '#b91c1c' }}>{counts.onHold}</strong>
            <small>Payments paused pending review</small>
          </div>

          <div
            className={`queue-stat-card ${statusFilter === 'UNDER_REVIEW' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('UNDER_REVIEW'); setPage(1); }}
          >
            <span className="stat-label">Under Active Review</span>
            <strong className="stat-value" style={{ color: '#1d4ed8' }}>{counts.underReview}</strong>
            <small>Assigned to officers</small>
          </div>

          <div
            className={`queue-stat-card ${slaFilter === 'overdue' ? 'active' : ''}`}
            onClick={() => { setSlaFilter(slaFilter === 'overdue' ? 'all' : 'overdue'); setPage(1); }}
          >
            <span className="stat-label">SLA Overdue</span>
            <strong className="stat-value" style={{ color: '#dc2626' }}>{counts.overdue}</strong>
            <small>&gt;15 days without decision</small>
          </div>

          <div
            className={`queue-stat-card ${statusFilter === 'ESCALATED' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('ESCALATED'); setPage(1); }}
          >
            <span className="stat-label">Ministry Escalated</span>
            <strong className="stat-value" style={{ color: '#6b21a8' }}>{counts.escalated}</strong>
            <small>Awaiting central action</small>
          </div>

          <div
            className={`queue-stat-card ${statusFilter === 'CLEARED' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('CLEARED'); setPage(1); }}
          >
            <span className="stat-label">Cleared Works</span>
            <strong className="stat-value" style={{ color: '#15803d' }}>{counts.cleared}</strong>
            <small>Verified legitimate</small>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="queue-filter-panel">
          <form className="queue-search-form" onSubmit={handleSearchSubmit}>
            <span className="search-icon">&#x2315;</span>
            <input
              type="text"
              placeholder="Search by Work ID, Title, District, or Executing Agency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="queue-search-btn">Search</button>
            {search && (
              <button
                type="button"
                className="queue-clear-btn"
                onClick={() => { setSearch(''); setPage(1); }}
              >
                Clear
              </button>
            )}
          </form>

          <div className="queue-dropdowns">
            <label>
              <span>Workflow State:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All Active Reviews</option>
                <option value="ON_HOLD">Disbursement Hold</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="FLAGGED">Flagged (AI Anomaly)</option>
                <option value="ESCALATED">Escalated to Ministry</option>
                <option value="CLEARED">Cleared</option>
              </select>
            </label>

            <label>
              <span>Risk Level:</span>
              <select
                value={riskLevelFilter}
                onChange={(e) => { setRiskLevelFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Risk Levels</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="low">Low Risk</option>
              </select>
            </label>

            <label>
              <span>Review SLA:</span>
              <select
                value={slaFilter}
                onChange={(e) => { setSlaFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All Timeframes</option>
                <option value="overdue">Overdue SLA (&gt;15 days)</option>
                <option value="due_soon">Due Within 3 Days</option>
              </select>
            </label>

            <button
              type="button"
              className="queue-refresh-btn"
              onClick={loadQueue}
              title="Refresh Review Queue"
            >
              &#x21bb; Refresh
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="queue-table-card">
          {error && <div className="queue-error-banner">&#x26A0; {error}</div>}

          {loading ? (
            <div className="queue-loading-state">
              <div className="queue-spinner" />
              <p>Fetching review queue and verification data from institutional database...</p>
            </div>
          ) : works.length === 0 ? (
            <div className="queue-empty-state">
              <h3>No Works Found in This Queue View</h3>
              <p>No works currently match the selected state, risk level, or search parameters.</p>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setRiskLevelFilter('');
                  setSlaFilter('all');
                  setSearch('');
                  setPage(1);
                }}
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Work ID</th>
                    <th>Work Title &amp; Sector</th>
                    <th>Location</th>
                    <th>Executing Agency</th>
                    <th>Risk Score</th>
                    <th>Primary Anomaly</th>
                    <th>Workflow State</th>
                    <th>Review SLA</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map((w) => (
                    <tr key={w.workId || w._id}>
                      <td>
                        <span className="queue-work-id">{w.workId}</span>
                        {w.appealStatus === 'SUBMITTED' && (
                          <span className="queue-appeal-tag" title="Appeal submitted by agency">Appeal Pending</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="work-link"
                          onClick={() => onOpenWork(w.workId)}
                          style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                        >
                          <strong style={{ fontSize: '0.74rem', color: '#152b4b', display: 'block', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {w.title}
                          </strong>
                        </button>
                        <small style={{ color: '#64748b', fontSize: '0.58rem' }}>{w.sector}</small>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.67rem', fontWeight: 600, display: 'block' }}>{w.district}</span>
                        <small style={{ color: '#74747c', fontSize: '0.57rem' }}>{w.state}</small>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.65rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                          {w.agency}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`risk-dot ${w.riskLevel}`} />
                          <strong className={`score ${w.riskLevel}`} style={{ fontSize: '0.85rem' }}>
                            {w.riskScore}
                          </strong>
                          <span style={{ fontSize: '0.54rem', textTransform: 'uppercase', color: '#64748b' }}>
                            {w.riskLevel}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="queue-anomaly-text" title={w.primaryAnomaly}>
                          {w.primaryAnomaly}
                        </span>
                      </td>
                      <td>
                        <span className={`queue-status-pill ${getStatusBadgeClass(w.riskStatus)}`}>
                          {getStatusLabel(w.riskStatus)}
                        </span>
                        {w.riskStatus === 'ON_HOLD' && (
                          <small style={{ display: 'block', color: '#991b1b', fontSize: '0.53rem', marginTop: '2px' }}>
                            Disbursement paused
                          </small>
                        )}
                      </td>
                      <td>
                        <span className={`queue-sla-pill ${w.sla?.isOverdue ? 'overdue' : w.sla?.daysRemaining <= 3 ? 'warning' : 'ontrack'}`}>
                          {w.sla?.label || 'No SLA'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="queue-investigate-btn"
                          onClick={() => onOpenWork(w.workId)}
                        >
                          Investigate &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination footer */}
              <footer>
                <span style={{ fontSize: '0.64rem', color: '#555' }}>
                  Showing page {page} of {totalPages} ({counts.totalInFilter} works)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    &larr; Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next &rarr;
                  </button>
                </div>
              </footer>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

