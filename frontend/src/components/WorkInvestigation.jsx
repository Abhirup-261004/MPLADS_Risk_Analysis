import React, { useEffect, useState, useCallback } from 'react';
import Logo from './Logo.jsx';
import { getWork, markWorkUnderReview, categorizeWork } from '../services/api.js';
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

  useEffect(() => {
    let active = true;
    getWork(workId)
      .then((result) => active && setData(result))
      .catch((requestError) => active && setError(requestError.message));
    return () => {
      active = false;
    };
  }, [workId]);

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

  const review = async () => {
    setSaving(true);
    try {
      const result = await markWorkUnderReview(work.workId);
      setData((current) => ({ ...current, work: result.work }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="investigation-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Logo />
          <div>
            <strong>PRAHARI</strong>
            <span>Institutional Oversight</span>
          </div>
        </div>
        <div className="header-actions">
          <button>FY 24-25</button>
          <span className="avatar">{user.name.charAt(0)}</span>
        </div>
      </header>
      <div className="command-search">
        <span>⌕</span>
        <input placeholder="Search work ID, district, agency..." />
      </div>
      <section className="investigation-content">
        <div className="breadcrumbs">
          Dashboard › Works Explorer › <strong>Work Investigation</strong>
        </div>
        <section className="investigation-head">
          <div>
            <h1>{work.title}</h1>
            <p>
              <span className="investigation-id">{work.workId}</span>
              <span className="status ongoing">{work.status}</span>
            </p>
            <small>
              {work.district}, {work.state} | Executing Agency: {work.agency}
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
              <p>Requires immediate review</p>
            </div>
            <footer>
              <button>Generate Report</button>
              <button className="review-button" onClick={review} disabled={saving || work.underReview}>
                {work.underReview ? 'Under Review' : saving ? 'Saving...' : 'Mark Under Review'}
              </button>
            </footer>
          </aside>
        </section>
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
                  <Icon name="robot" /> AI Risk Assessment
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
                    Cost Anomaly Detected <b>High Risk</b>
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
              <h2>Executive Summary</h2>
              <p>{assessment.summary}</p>
              <hr />
              <small>Recommended actions</small>
              <ul>
                <li>Initiate physical inspection to verify progress claim.</li>
                <li>Audit payment tranches and supporting documents.</li>
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
    </main>
  );
}
