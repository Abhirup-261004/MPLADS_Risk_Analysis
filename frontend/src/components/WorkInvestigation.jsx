import React, { useEffect, useState, useCallback } from 'react';
import Logo from './Logo.jsx';
import {
  getWork,
  markWorkUnderReview,
  categorizeWork,
  getReviewById,
  holdWork,
  releaseWorkHold,
  clearWorkReview,
  escalateWorkReview,
  submitWorkAppeal,
  getWorkAuditTrail,
} from '../services/api.js';

function Icon({ name }) {
  const paths = {
    back: <path d="m14 5-7 7 7 7M8 12h10" />,
    shield: (
      <>
        <path d="M12 3.5c-2.2 1.7-4.7 2.5-7 2.8v5.1c0 4.1 2.6 7.6 7 9.1 4.4-1.5 7-5 7-9.1V6.3c-2.3-.3-4.8-1.1-7-2.8Z" />
        <path d="m9.1 12 2 2 3.8-4" />
      </>
    ),
    robot: (
      <>
        <rect x="5" y="7" width="14" height="12" rx="2" />
        <path d="M12 4v3M8.5 12h.1M15.4 12h.1M9 16h6" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V4M4 20h17M8 16v-4M13 16V7M18 16v-7" />
      </>
    ),
    scale: (
      <>
        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const tone = { danger: '#c51d25', warning: '#352500', neutral: '#0b1d3a' };

export default function WorkInvestigation({ workId, user, onNavigate, onSignOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ML real model states
  const [mlResult, setMlResult] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState('');

  // Fraud Response Workflow & Audit Trail states
  const [workflowInfo, setWorkflowInfo] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // 'HOLD', 'RELEASE', 'CLEAR', 'ESCALATE', 'APPEAL', 'AUDIT'
  const [modalInputs, setModalInputs] = useState({
    reason: '',
    rationale: '',
    targetAuthority: 'Ministry of Statistics & Programme Implementation',
    evidenceDetails: '',
    contactEmail: user?.email || '',
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadWorkflowData = useCallback(async () => {
    try {
      const res = await getReviewById(workId);
      setWorkflowInfo(res);
      if (res.auditTrail) setAuditTrail(res.auditTrail);
      if (res.work) {
        setData((current) => (current ? { ...current, work: { ...current.work, ...res.work } } : current));
      }
    } catch (err) {
      console.warn('Workflow fetch notice:', err.message);
    }
  }, [workId]);

  useEffect(() => {
    let active = true;
    getWork(workId)
      .then((result) => {
        if (active) {
          setData(result);
          loadWorkflowData();
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [workId, loadWorkflowData]);

  const fetchMlAnalysis = useCallback((workObj) => {
    const targetWork = workObj || data?.work;
    if (!targetWork) return;

    if (!targetWork.title || !targetWork.title.trim()) {
      setMlResult(null);
      setMlLoading(false);
      setMlError('');
      return;
    }

    setMlLoading(true);
    setMlError('');

    categorizeWork({
      description: targetWork.title,
      declared_category: targetWork.sector || 'Normal/Others',
    })
      .then((res) => {
        setMlResult(res);
        setMlLoading(false);
      })
      .catch((err) => {
        setMlError(err.message || 'Unable to connect to ML analytics service.');
        setMlLoading(false);
      });
  }, [data]);

  useEffect(() => {
    if (data?.work) {
      fetchMlAnalysis(data.work);
    }
  }, [data?.work, fetchMlAnalysis]);

  if (error) {
    return (
      <main className="investigation-error">
        <h1>{error}</h1>
        <button onClick={() => onNavigate('works')}>Back to Works</button>
      </main>
    );
  }

  if (!data) return <main className="investigation-loading">Loading work investigation...</main>;

  const { work, assessment } = data;
  const isReviewer = ['admin', 'ministry', 'district_authority', 'analyst'].includes(user?.role);
  const currentRiskStatus = work.riskStatus || (work.underReview ? 'UNDER_REVIEW' : work.riskLevel === 'high' ? 'FLAGGED' : 'ACTIVE');
  const sla = workflowInfo?.sla || { daysRemaining: null, isOverdue: false, label: 'Standard 15-day SLA' };

  const review = async () => {
    setSaving(true);
    try {
      const result = await markWorkUnderReview(work.workId);
      setData((current) => ({ ...current, work: result.work }));
      await loadWorkflowData();
    } finally {
      setSaving(false);
    }
  };

  const openModal = (modalType) => {
    setActionError('');
    setActionSuccess('');
    setModalInputs({
      reason: '',
      rationale: '',
      targetAuthority: 'Ministry of Statistics & Programme Implementation',
      evidenceDetails: '',
      contactEmail: user?.email || '',
    });
    setActiveModal(modalType);
  };

  const closeModal = () => {
    setActiveModal(null);
    setActionError('');
  };

  // Workflow Actions
  const handleHold = async (e) => {
    e.preventDefault();
    if (!modalInputs.reason.trim()) {
      setActionError('Specific reason for disbursement hold is required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await holdWork(work.workId, {
        reason: modalInputs.reason.trim(),
        evidenceSnapshot: {
          riskScore: work.riskScore,
          costDeviation: assessment?.costDeviation,
          mlMismatch: mlResult?.category_mismatch_flag,
        },
      });
      setData((curr) => ({ ...curr, work: res.work }));
      setActionSuccess('Disbursement hold applied. 15-day review SLA initiated.');
      await loadWorkflowData();
      setTimeout(() => closeModal(), 1400);
    } catch (err) {
      setActionError(err.message || 'Failed to place disbursement hold.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRelease = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');
    try {
      const res = await releaseWorkHold(work.workId, { reason: modalInputs.reason.trim() });
      setData((curr) => ({ ...curr, work: res.work }));
      setActionSuccess('Disbursement hold released.');
      await loadWorkflowData();
      setTimeout(() => closeModal(), 1400);
    } catch (err) {
      setActionError(err.message || 'Failed to release hold.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClear = async (e) => {
    e.preventDefault();
    const rationale = modalInputs.rationale.trim() || modalInputs.reason.trim();
    if (!rationale) {
      setActionError('Review notes and clearance rationale are required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await clearWorkReview(work.workId, {
        rationale,
        notes: modalInputs.reason.trim(),
      });
      setData((curr) => ({ ...curr, work: res.work }));
      setActionSuccess('Work cleared upon human review. Hold lifted.');
      await loadWorkflowData();
      setTimeout(() => closeModal(), 1400);
    } catch (err) {
      setActionError(err.message || 'Failed to clear work review.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (e) => {
    e.preventDefault();
    if (!modalInputs.reason.trim()) {
      setActionError('Escalation justification is required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await escalateWorkReview(work.workId, {
        reason: modalInputs.reason.trim(),
        targetAuthority: modalInputs.targetAuthority,
      });
      setData((curr) => ({ ...curr, work: res.work }));
      setActionSuccess('Work successfully escalated to central authority.');
      await loadWorkflowData();
      setTimeout(() => closeModal(), 1400);
    } catch (err) {
      setActionError(err.message || 'Failed to escalate work.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAppeal = async (e) => {
    e.preventDefault();
    if (!modalInputs.reason.trim()) {
      setActionError('Appeal justification and explanation are required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const res = await submitWorkAppeal(work.workId, {
        reason: modalInputs.reason.trim(),
        evidenceDetails: modalInputs.evidenceDetails.trim(),
        contactEmail: modalInputs.contactEmail.trim(),
      });
      setData((curr) => ({ ...curr, work: res.work }));
      setActionSuccess('Appeal submitted. Assigned to reviewer for verification.');
      await loadWorkflowData();
      setTimeout(() => closeModal(), 1400);
    } catch (err) {
      setActionError(err.message || 'Failed to submit appeal.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main className="investigation-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Logo />
          <div>
            <strong>PRAHARI</strong>
            <span>Institutional Oversight &amp; Risk Action</span>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => onNavigate('review-queue')}>Review Queue</button>
          <button type="button" onClick={() => onNavigate('works')}>Works Explorer</button>
          <span className="avatar">{user.name.charAt(0)}</span>
        </div>
      </header>

      <div className="command-search">
        <span>⌕</span>
        <input placeholder="Search work ID, district, agency..." />
      </div>

      <section className="investigation-content">
        <div className="breadcrumbs">
          Dashboard › Works Explorer › <strong style={{ cursor: 'pointer' }} onClick={() => onNavigate('review-queue')}>Review Queue</strong> › <strong>Work Investigation</strong>
        </div>

        <section className="investigation-head">
          <div>
            <h1>{work.title}</h1>
            <p>
              <span className="investigation-id">{work.workId}</span>
              <span className="status ongoing">{work.status}</span>
              {currentRiskStatus === 'ON_HOLD' && (
                <span className="queue-status-pill queue-status-hold" style={{ marginLeft: '6px' }}>
                  DISBURSEMENT HOLD
                </span>
              )}
              {currentRiskStatus === 'ESCALATED' && (
                <span className="queue-status-pill queue-status-escalated" style={{ marginLeft: '6px' }}>
                  ESCALATED TO MINISTRY
                </span>
              )}
              {currentRiskStatus === 'CLEARED' && (
                <span className="queue-status-pill queue-status-cleared" style={{ marginLeft: '6px' }}>
                  CLEARED
                </span>
              )}
            </p>
            <small>
              {work.district}, {work.state} | Executing Agency: <strong>{work.agency}</strong> | Constituency: {work.constituency || 'General'}
            </small>
          </div>

          <aside className="score-card">
            <div>
              <p>AI Risk Score</p>
              <strong>{assessment.score}</strong>
              <b>/100</b>
            </div>
            <div>
              <span className={`score-dot ${assessment.level}`} /> <strong>{assessment.level} risk</strong>
              <p>{currentRiskStatus === 'CLEARED' ? 'Cleared by Review' : currentRiskStatus === 'ON_HOLD' ? 'Hold Pending Verification' : 'Requires human review'}</p>
            </div>
            <footer>
              <button type="button" onClick={() => openModal('AUDIT')}>
                Audit Trail ({auditTrail.length})
              </button>
              <button
                type="button"
                className="review-button"
                onClick={review}
                disabled={saving || work.underReview}
              >
                {work.underReview ? 'In Review' : saving ? 'Saving...' : 'Mark Under Review'}
              </button>
            </footer>
          </aside>
        </section>

        {/* PROMINENT RISK RESPONSE & ADMINISTRATIVE ACTION PANEL */}
        <section className="risk-response-panel">
          <div className="risk-response-header">
            <div className="resp-title">
              <span className="shield-badge">&#x2696;</span>
              <div>
                <h2>Risk Action &amp; Administrative Oversight</h2>
                <p>Governing protocol: AI flags trigger evidence gathering and human review before administrative holds.</p>
              </div>
            </div>

            <div className="resp-sla-box">
              <span className="sla-title">Review SLA</span>
              <span className={`queue-sla-pill ${sla.isOverdue ? 'overdue' : sla.daysRemaining <= 3 ? 'warning' : 'ontrack'}`}>
                {sla.label}
              </span>
            </div>
          </div>

          {/* Dynamic Status Banner */}
          {currentRiskStatus === 'ON_HOLD' && (
            <div className="workflow-alert-banner hold">
              <div className="banner-icon">&#x26D4;</div>
              <div className="banner-body">
                <strong>DISBURSEMENT HOLD ACTIVE</strong>
                <p>
                  Further disbursement should remain paused pending review. Hold applies strictly to this work record ({work.workId}).
                </p>
                <div className="banner-meta">
                  <span><strong>Reason:</strong> {work.holdReason || 'Disbursement paused pending detailed verification.'}</span>
                  {work.holdActorName && <span><strong>Applied By:</strong> {work.holdActorName}</span>}
                  {work.holdAt && <span><strong>Date:</strong> {new Date(work.holdAt).toLocaleDateString()}</span>}
                </div>
              </div>
            </div>
          )}

          {currentRiskStatus === 'ESCALATED' && (
            <div className="workflow-alert-banner escalated">
              <div className="banner-icon">&#x21E7;</div>
              <div className="banner-body">
                <strong>ESCALATED TO CENTRAL MINISTRY / STATE NODAL DEPARTMENT</strong>
                <p>
                  This work has been escalated for high-level compliance inquiry. Disbursement hold remains active.
                </p>
                <div className="banner-meta">
                  <span><strong>Authority:</strong> {work.escalationStatus || 'Ministry of Statistics & Programme Implementation'}</span>
                  <span><strong>Justification:</strong> {work.escalationReason || 'Detailed anomaly confirmation.'}</span>
                </div>
              </div>
            </div>
          )}

          {currentRiskStatus === 'CLEARED' && (
            <div className="workflow-alert-banner cleared">
              <div className="banner-icon">&#x2713;</div>
              <div className="banner-body">
                <strong>WORK CLEARED UPON HUMAN REVIEW</strong>
                <p>
                  An authorized reviewer investigated the flagged anomaly and confirmed legitimate implementation parameters. Disbursement hold lifted.
                </p>
                <div className="banner-meta">
                  {work.reviewerName && <span><strong>Reviewed By:</strong> {work.reviewerName}</span>}
                  {work.reviewedAt && <span><strong>Date:</strong> {new Date(work.reviewedAt).toLocaleDateString()}</span>}
                  {work.reviewNotes && <span><strong>Review Notes:</strong> {work.reviewNotes}</span>}
                </div>
              </div>
            </div>
          )}

          {work.appealStatus === 'SUBMITTED' && (
            <div className="workflow-alert-banner appeal">
              <div className="banner-icon">&#x2709;</div>
              <div className="banner-body">
                <strong>OFFICIAL AGENCY APPEAL SUBMITTED</strong>
                <p>
                  The executing agency or stakeholder has filed an explanation/counter-evidence for administrative review.
                </p>
                <div className="banner-meta">
                  <span><strong>Submitter:</strong> {work.appealSubmittedBy}</span>
                  <span><strong>Appeal Statement:</strong> {work.appealReason}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Control Buttons */}
          <div className="risk-response-actions">
            <span className="actions-label">Available Official Actions:</span>

            {isReviewer ? (
              <>
                {currentRiskStatus === 'ON_HOLD' ? (
                  <button
                    type="button"
                    className="action-btn release-btn"
                    onClick={() => openModal('RELEASE')}
                  >
                    &#x2713; Release Disbursement Hold
                  </button>
                ) : (
                  <button
                    type="button"
                    className="action-btn hold-btn"
                    onClick={() => openModal('HOLD')}
                    disabled={currentRiskStatus === 'CLEARED'}
                  >
                    &#x26D4; Place Disbursement Hold
                  </button>
                )}

                <button
                  type="button"
                  className="action-btn clear-btn"
                  onClick={() => openModal('CLEAR')}
                  disabled={currentRiskStatus === 'CLEARED'}
                >
                  &#x2713; Clear Work (Lift Hold)
                </button>

                <button
                  type="button"
                  className="action-btn escalate-btn"
                  onClick={() => openModal('ESCALATE')}
                  disabled={currentRiskStatus === 'ESCALATED'}
                >
                  &#x21E7; Escalate to Ministry
                </button>
              </>
            ) : (
              <span style={{ fontSize: '0.66rem', color: '#64748b' }}>
                Reviewer actions restricted to authorized officers. (Your role: <em>{user?.role || 'viewer'}</em>)
              </span>
            )}

            <button
              type="button"
              className="action-btn appeal-btn"
              onClick={() => openModal('APPEAL')}
            >
              &#x2709; Submit Appeal / Counter-Evidence
            </button>

            <button
              type="button"
              className="action-btn audit-btn"
              onClick={() => openModal('AUDIT')}
            >
              &#x2315; View Full Audit History ({auditTrail.length})
            </button>
          </div>
        </section>

        {/* Metrics Grid */}
        <div className="investigation-grid">
          <section>
            <div className="investigation-metrics">
              <article>
                <p>Est. Cost</p>
                <strong>INR {assessment.estimatedCost} L</strong>
              </article>
              <article>
                <p>Sanctioned</p>
                <strong>INR {work.sanctionedAmount} L</strong>
              </article>
              <article className="overrun">
                <p>Expenditure</p>
                <strong>INR {work.expenditureAmount} L</strong>
                <small>{assessment.expenditureRatio}%</small>
              </article>
              <article>
                <p>Physical Progress</p>
                <strong>{work.progress}%</strong>
                <i>
                  <b style={{ width: `${work.progress}%` }} />
                </i>
              </article>
            </div>

            <article className="assessment-card">
              <header>
                <span>
                  <Icon name="robot" /> AI Risk Assessment &amp; Model Diagnostics
                </span>
                <b>Why was this work flagged?</b>
              </header>

              {/* REAL ML INTEGRATION: Loading State */}
              {mlLoading && (
                <div className="anomaly" style={{ background: '#f8fafc' }}>
                  <span>
                    <Icon name="robot" />
                  </span>
                  <section>
                    <h2>
                      Live ML NLP Verification <b>Scoring...</b>
                    </h2>
                    <p>Executing TF-IDF + LightGBM NLP model inference via Express &amp; FastAPI proxy...</p>
                    <small>Model: feature3_tfidf_lightgbm_classifier.joblib | Status: In progress</small>
                  </section>
                </div>
              )}

              {/* REAL ML INTEGRATION: Error State */}
              {!mlLoading && mlError && (
                <div className="anomaly" style={{ background: '#fff5f5' }}>
                  <span>
                    <Icon name="shield" />
                  </span>
                  <section>
                    <h2>
                      ML Inference Diagnostics <b style={{ background: '#b81821' }}>Service Offline</b>
                    </h2>
                    <p style={{ color: '#b81821' }}>{mlError}</p>
                    <small>
                      Ensure FastAPI is running on port 8000 and Express is proxying /api/ml endpoints.
                    </small>
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => fetchMlAnalysis(work)}
                        style={{
                          background: '#0b1d3a',
                          color: '#fff',
                          border: 0,
                          padding: '6px 14px',
                          fontSize: '0.65rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Retry ML Analysis
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {/* REAL ML INTEGRATION: Empty / No Description State */}
              {!mlLoading && !mlError && !work.title && (
                <div className="anomaly" style={{ background: '#f8fafc' }}>
                  <span>
                    <Icon name="robot" />
                  </span>
                  <section>
                    <h2>
                      NLP Work Categorization <b>No Data</b>
                    </h2>
                    <p>No description text provided for this work record to execute ML classification.</p>
                  </section>
                </div>
              )}

              {/* REAL ML INTEGRATION: Successful State */}
              {!mlLoading && !mlError && mlResult && (
                <div
                  className="anomaly"
                  style={{ background: mlResult.category_mismatch_flag ? '#fffafa' : '#f4fbf7' }}
                >
                  <span>
                    <Icon name="robot" />
                  </span>
                  <section>
                    <h2>
                      NLP Category &amp; Discrepancy Analysis{' '}
                      <b style={{ background: mlResult.category_mismatch_flag ? '#b81821' : '#16804e' }}>
                        {mlResult.category_mismatch_flag ? 'Mismatch Flagged' : 'Category Verified'}
                      </b>
                    </h2>
                    <p>
                      <strong>Predicted Category:</strong> {mlResult.category_nlp} (Confidence:{' '}
                      {(mlResult.confidence * 100).toFixed(1)}%)
                      <br />
                      <strong>Declared Category:</strong> {mlResult.declared_category}
                      {mlResult.category_mismatch_flag ? (
                        <span style={{ display: 'block', color: '#c51d25', marginTop: '6px', fontWeight: 600 }}>
                          Discrepancy detected between work description and declared category.
                        </span>
                      ) : (
                        <span style={{ display: 'block', color: '#16804e', marginTop: '6px', fontWeight: 600 }}>
                          Work description aligns with declared sector taxonomy.
                        </span>
                      )}
                    </p>
                    <small>
                      Model: LightGBM NLP Classifier | Source: FastAPI /nlp/categorize-work
                      {mlResult.top_alternatives?.length > 0 &&
                        ` | Alternatives: ${mlResult.top_alternatives
                          .map((a) => `${a.label} (${(a.score * 100).toFixed(0)}%)`)
                          .join(', ')}`}
                    </small>
                  </section>
                </div>
              )}

              <div className="anomaly">
                <span>
                  <Icon name="chart" />
                </span>
                <section>
                  <h2>
                    Cost Anomaly Assessment <b>High Risk</b>
                  </h2>
                  <p>
                    Significant cost deviation compared to peer benchmark. Model indicates a variance from
                    expected norm.
                  </p>
                  <small>
                    Isolation Forest Peer Avg: INR {assessment.estimatedCost} L | Actual: INR{' '}
                    {work.expenditureAmount} L
                  </small>
                </section>
              </div>

              <div className="anomaly">
                <span>
                  <Icon name="chart" />
                </span>
                <section>
                  <h2>
                    Payment-Progress Mismatch <b>High Risk</b>
                  </h2>
                  <p>
                    Expenditure booking ({assessment.expenditureRatio}% of sanctioned amount) is
                    disproportionate to recorded physical progress ({work.progress}%).
                  </p>
                  <div className="comparison">
                    <i style={{ width: `${work.progress}%` }}>Progress {work.progress}%</i>
                    <i style={{ width: `${Math.min(assessment.expenditureRatio, 100)}%` }}>
                      Payments {assessment.expenditureRatio}%
                    </i>
                  </div>
                </section>
              </div>

              <div className="assessment-bottom">
                <article>
                  <h2>Execution Delay</h2>
                  <p>
                    Work is currently lagging against scheduled timeline. Expected completion requires field
                    verification.
                  </p>
                </article>
                <article>
                  <h2>Similarity Warning</h2>
                  <p>NLP model found similarity with other works executed by the same agency in adjacent blocks.</p>
                </article>
              </div>
            </article>
          </section>

          <aside className="investigation-side">
            <article className="vectors">
              <h2>
                <Icon name="chart" /> Risk Vectors
              </h2>
              {assessment.vectors.map((vector) => (
                <div key={vector.label}>
                  <p>
                    {vector.label}
                    <b style={{ color: tone[vector.tone] }}>{vector.score}/100</b>
                  </p>
                  <i>
                    <b style={{ width: `${vector.score}%`, background: tone[vector.tone] }} />
                  </i>
                </div>
              ))}
            </article>

            <article className="executive">
              <h2>Responsible Oversight Summary</h2>
              <p>{assessment.summary}</p>
              <hr />
              <small>Recommended actions</small>
              <ul>
                <li>Initiate physical inspection to verify progress claim.</li>
                <li>Audit payment tranches and supporting documents.</li>
                <li>Maintain disbursement hold until vouchers are confirmed.</li>
              </ul>
            </article>

            <dl>
              <div>
                <dt>NLP Model</dt>
                <dd>LightGBM_NLP_v1.0</dd>
              </div>
              <div>
                <dt>NLP Confidence</dt>
                <dd>{mlResult ? `${(mlResult.confidence * 100).toFixed(1)}%` : mlLoading ? 'Calculating...' : 'Pending'}</dd>
              </div>
              <div>
                <dt>Category Match</dt>
                <dd>{mlResult ? (mlResult.category_mismatch_flag ? 'Mismatch' : 'Aligned') : mlLoading ? 'Checking...' : 'Unrated'}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {/* ACTION MODALS */}
      {activeModal && (
        <div className="workflow-modal-overlay" onClick={closeModal}>
          <div className="workflow-modal-card" onClick={(e) => e.stopPropagation()}>
            {activeModal === 'HOLD' && (
              <form onSubmit={handleHold}>
                <h3>Place Disbursement Hold</h3>
                <p className="modal-desc">
                  Pauses further financial disbursement for <strong>{work.workId}</strong> pending physical inspection and verification.
                  Initiates a strict 15-day review SLA.
                </p>
                {actionError && <div className="modal-error">{actionError}</div>}
                {actionSuccess && <div className="modal-success">{actionSuccess}</div>}

                <label>
                  Specific Hold Justification (Required):
                  <textarea
                    rows="3"
                    placeholder="e.g. Physical progress is recorded at 15% while 90% of funds were disbursed. Awaiting site engineer verification."
                    value={modalInputs.reason}
                    onChange={(e) => setModalInputs({ ...modalInputs, reason: e.target.value })}
                    required
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-confirm-danger" disabled={actionLoading}>
                    {actionLoading ? 'Applying Hold...' : 'Confirm Disbursement Hold'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'RELEASE' && (
              <form onSubmit={handleRelease}>
                <h3>Release Disbursement Hold</h3>
                <p className="modal-desc">
                  Releases the pause on payments for <strong>{work.workId}</strong>. Work will transition to Active / Under Review.
                </p>
                {actionError && <div className="modal-error">{actionError}</div>}
                {actionSuccess && <div className="modal-success">{actionSuccess}</div>}

                <label>
                  Release Justification:
                  <textarea
                    rows="3"
                    placeholder="e.g. Field inspection report #IR-2024 received and verified satisfactory."
                    value={modalInputs.reason}
                    onChange={(e) => setModalInputs({ ...modalInputs, reason: e.target.value })}
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-confirm-primary" disabled={actionLoading}>
                    {actionLoading ? 'Releasing...' : 'Release Hold'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'CLEAR' && (
              <form onSubmit={handleClear}>
                <h3>Clear Flagged Work</h3>
                <p className="modal-desc">
                  Certifies that human review of <strong>{work.workId}</strong> resolved all flagged anomalies.
                  Any active disbursement hold is automatically lifted.
                </p>
                {actionError && <div className="modal-error">{actionError}</div>}
                {actionSuccess && <div className="modal-success">{actionSuccess}</div>}

                <label>
                  Clearance Rationale &amp; Findings (Required):
                  <textarea
                    rows="3"
                    placeholder="e.g. Vouchers, MB records, and geotechnical soil testing verified. Cost overrun corresponds to sanctioned revised estimate."
                    value={modalInputs.rationale}
                    onChange={(e) => setModalInputs({ ...modalInputs, rationale: e.target.value })}
                    required
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-confirm-success" disabled={actionLoading}>
                    {actionLoading ? 'Clearing Work...' : 'Certify & Clear Work'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'ESCALATE' && (
              <form onSubmit={handleEscalate}>
                <h3>Escalate to Central Authority</h3>
                <p className="modal-desc">
                  Escalates confirmed severe anomalies in <strong>{work.workId}</strong> to the Ministry or State Vigilance Department.
                  Disbursement hold remains active.
                </p>
                {actionError && <div className="modal-error">{actionError}</div>}
                {actionSuccess && <div className="modal-success">{actionSuccess}</div>}

                <label>
                  Target Authority:
                  <select
                    value={modalInputs.targetAuthority}
                    onChange={(e) => setModalInputs({ ...modalInputs, targetAuthority: e.target.value })}
                  >
                    <option value="Ministry of Statistics & Programme Implementation">Ministry of Statistics &amp; Programme Implementation (MoSPI)</option>
                    <option value="State Nodal Department">State Nodal Department (SND)</option>
                    <option value="District Magistrate Vigilance Cell">District Magistrate Vigilance Cell</option>
                  </select>
                </label>

                <label>
                  Escalation Justification &amp; Findings (Required):
                  <textarea
                    rows="3"
                    placeholder="e.g. High-confidence duplicate invoice signature detected. Executing agency failed to provide physical verification proof within 15-day SLA."
                    value={modalInputs.reason}
                    onChange={(e) => setModalInputs({ ...modalInputs, reason: e.target.value })}
                    required
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-confirm-purple" disabled={actionLoading}>
                    {actionLoading ? 'Escalating...' : 'Confirm Escalation'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'APPEAL' && (
              <form onSubmit={handleAppeal}>
                <h3>Submit Official Appeal / Response</h3>
                <p className="modal-desc">
                  Allows the executing agency or field officer to provide formal documentation, clarification, and counter-evidence for <strong>{work.workId}</strong>.
                </p>
                {actionError && <div className="modal-error">{actionError}</div>}
                {actionSuccess && <div className="modal-success">{actionSuccess}</div>}

                <label>
                  Explanation &amp; Justification (Required):
                  <textarea
                    rows="3"
                    placeholder="Detail the reasons for delay, milestone completion proofs, or revised sanction references..."
                    value={modalInputs.reason}
                    onChange={(e) => setModalInputs({ ...modalInputs, reason: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Reference Details / Evidence Notes:
                  <input
                    type="text"
                    placeholder="e.g. MB Book #442, Page 29; Site Engineer Report dated 12-Aug"
                    value={modalInputs.evidenceDetails}
                    onChange={(e) => setModalInputs({ ...modalInputs, evidenceDetails: e.target.value })}
                  />
                </label>

                <label>
                  Contact Email:
                  <input
                    type="email"
                    placeholder="agency.officer@gov.in"
                    value={modalInputs.contactEmail}
                    onChange={(e) => setModalInputs({ ...modalInputs, contactEmail: e.target.value })}
                  />
                </label>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn-confirm-primary" disabled={actionLoading}>
                    {actionLoading ? 'Submitting Appeal...' : 'Submit Official Appeal'}
                  </button>
                </div>
              </form>
            )}

            {activeModal === 'AUDIT' && (
              <div className="audit-drawer">
                <div className="audit-head">
                  <h3>Immutable Audit History &mdash; {work.workId}</h3>
                  <button type="button" className="close-x" onClick={closeModal}>&times;</button>
                </div>
                <p className="modal-desc">
                  Append-only, cryptographically trackable transaction log for all workflow transitions, holds, reviews, and appeals.
                </p>

                {auditTrail.length === 0 ? (
                  <p style={{ fontSize: '0.72rem', color: '#64748b', padding: '20px 0' }}>
                    No prior administrative actions recorded for this work. It remains in its initial algorithmic detection state.
                  </p>
                ) : (
                  <div className="audit-timeline">
                    {auditTrail.map((entry, idx) => (
                      <div key={entry._id || idx} className="audit-timeline-item">
                        <div className="audit-badge-col">
                          <span className={`audit-event-badge ${entry.eventType}`}>
                            {entry.eventType}
                          </span>
                        </div>
                        <div className="audit-details-col">
                          <div className="audit-actor-line">
                            <strong>{entry.actorName}</strong>
                            <small>({entry.actorRole})</small>
                            <time>{new Date(entry.timestamp).toLocaleString()}</time>
                          </div>
                          <div className="audit-transition">
                            <span>State: <em>{entry.previousState}</em> &rarr; <strong>{entry.newState}</strong></span>
                          </div>
                          {entry.reason && (
                            <div className="audit-reason-text">
                              &ldquo;{entry.reason}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Close History</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
