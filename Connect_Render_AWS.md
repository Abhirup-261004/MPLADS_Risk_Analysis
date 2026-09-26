# Connect Render Express to the AWS ML API


The frontend must call the Render Express backend. Express proxies analytics
requests to the AWS-hosted FastAPI service over HTTPS and adds the ML API key
server-side. Keep the existing frontend JWT authentication and Express role
authorization in place.

```text
Frontend -> Render Express -> AWS FastAPI
                         X-API-Key: MPLADS_API_KEY
```

## Render Environment Variables

Configure these on the **Express Render service**:

```text
FASTAPI_ENABLED=true
FASTAPI_URL=https://mplads-ml.duckdns.org
MPLADS_API_KEY=<production key supplied securely by ML/MLOps>
```

`FASTAPI_URL` must be the base URL exactly as shown: no `/api`, route path, or
trailing slash. Restart or redeploy Express after changing the variables.

## Proxy Requirements

- Express routes are mounted under `/api/analytics`.
- Preserve the existing mappings in `mlRoutes.js` and `mlController.js`; the
  Express route name is not necessarily the same as the FastAPI path.
- Forward protected requests with:

```http
X-API-Key: <process.env.MPLADS_API_KEY>
Accept: application/json
```

- For JSON `POST` requests, also forward `Content-Type: application/json` and
  the request body.
- URL-encode path parameters before forwarding them.
- Preserve the existing upstream status/error handling convention.

### Known route mapping

```text
Express: GET /api/analytics/dashboard-summary
FastAPI: GET /dashboard/summary
```

Available FastAPI paths include:

```text
GET  /health
GET  /dashboard/summary
POST /nlp/categorize-work
POST /score/disbursement-risk
POST /score/cost-anomaly
GET  /score/vendor-risk/{id}
GET  /score/mp-risk/{id}
GET  /score/state-risk/{state}
```

All paths except `/health` require `X-API-Key`.

## Security Rules

- Never commit, log, return, or expose `MPLADS_API_KEY` to browser code.
- The ML API key is only for Express-to-FastAPI authentication. It does not
  replace Express JWT or `INTERNAL_ROLES` authorization.

## Validation

1. Check the public ML service:

   ```bash
   curl -i https://mplads-ml.duckdns.org/health
   ```

   Expected: `200` with `"status":"healthy"`.

2. Check the Express proxy with a valid application JWT:

   ```bash
   curl -i \
     -H "Authorization: Bearer <VALID_JWT>" \
     https://<RENDER-EXPRESS-URL>/api/analytics/dashboard-summary
   ```

   Expected: `200` with dashboard JSON.

3. Test at least one additional analytics route end-to-end.

If protected requests return `401`, verify that the Render key exactly matches
the production key configured on the AWS service. If Express returns `503`,
verify `FASTAPI_ENABLED`, `FASTAPI_URL`, and that the ML service is reachable.
