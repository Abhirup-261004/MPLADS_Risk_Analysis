import asyncHandler from 'express-async-handler';
import { env } from '../config/env.js';

const getBaseUrl = () => (env.mlApiUrl || 'http://localhost:8000').replace(/\/+$/, '');

async function forwardToFastApi(targetUrl, options, res) {
  let response;
  try {
    response = await fetch(targetUrl, options);
  } catch (err) {
    return res.status(503).json({
      message: 'ML analytics service is currently unavailable. Please ensure the ML service is running.',
      detail: 'Failed to connect to ML analytics service.',
    });
  }

  const contentType = response.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      return res.status(502).json({
        message: 'Invalid JSON response received from ML analytics service.',
        detail: 'Invalid response format from ML service.',
      });
    }
  } else {
    try {
      const text = await response.text();
      payload = { message: text || 'Non-JSON response from ML service.' };
    } catch {
      payload = { message: 'Unexpected response from ML service.' };
    }
  }

  if (!response.ok) {
    const errorDetail =
      payload && typeof payload === 'object' && (payload.detail || payload.message)
        ? payload.detail || payload.message
        : 'ML service error.';
    return res.status(response.status).json({
      ...(typeof payload === 'object' && payload !== null ? payload : {}),
      message: typeof errorDetail === 'string' ? errorDetail : 'ML service request error.',
      detail: payload?.detail || errorDetail,
    });
  }

  return res.status(response.status).json(payload);
}

export const categorizeWork = asyncHandler(async (req, res) => {
  const targetUrl = `${getBaseUrl()}/nlp/categorize-work`;
  await forwardToFastApi(
    targetUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    },
    res
  );
});

export const getDisbursementRisk = asyncHandler(async (req, res) => {
  const targetUrl = `${getBaseUrl()}/score/disbursement-risk`;
  await forwardToFastApi(
    targetUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    },
    res
  );
});

export const getCostAnomaly = asyncHandler(async (req, res) => {
  const targetUrl = `${getBaseUrl()}/score/cost-anomaly`;
  await forwardToFastApi(
    targetUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    },
    res
  );
});

export const getVendorRisk = asyncHandler(async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${getBaseUrl()}/score/vendor-risk/${encodeURIComponent(req.params.vendorId)}${
    query ? `?${query}` : ''
  }`;
  await forwardToFastApi(targetUrl, { method: 'GET' }, res);
});

export const getMpRisk = asyncHandler(async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${getBaseUrl()}/score/mp-risk/${encodeURIComponent(req.params.mpIdentifier)}${
    query ? `?${query}` : ''
  }`;
  await forwardToFastApi(targetUrl, { method: 'GET' }, res);
});

export const getStateRisk = asyncHandler(async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${getBaseUrl()}/score/state-risk/${encodeURIComponent(req.params.state)}${
    query ? `?${query}` : ''
  }`;
  await forwardToFastApi(targetUrl, { method: 'GET' }, res);
});

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${getBaseUrl()}/dashboard/summary${query ? `?${query}` : ''}`;
  await forwardToFastApi(targetUrl, { method: 'GET' }, res);
});

