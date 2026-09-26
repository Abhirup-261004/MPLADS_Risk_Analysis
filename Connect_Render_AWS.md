# Connect Render Express Backend to AWS ML Service

**Project:** MPLADS Risk Analytics --- Problem Statement 26102\
**Purpose:** Handoff guide for integrating the existing Render Express
backend with the deployed AWS FastAPI ML service\
**ML deployment status:** Production service deployed and reachable over
HTTPS\
**Last verified:** 2026-09-26

------------------------------------------------------------------------

## 1. Production Integration Contract

The browser/frontend should continue to call the Render Express backend.
Express is the application-facing proxy and calls the AWS ML service
server-to-server.

``` text
React/Vite Frontend
        |
        v
Render Express Backend
        |
        | HTTPS
        | X-API-Key: <production MPLADS_API_KEY>
        v
https://mplads-ml.duckdns.org
        |
        v
Caddy -> FastAPI Docker container (127.0.0.1:8000)
```

Use this FastAPI base URL:

``` text
https://mplads-ml.duckdns.org
```

Do not append `/api`, `/api/analytics`, `/health`, or a trailing slash
to `FASTAPI_URL`.

The public health endpoint is:

``` text
GET https://mplads-ml.duckdns.org/health
```

The deployed service has been verified healthy with:

``` json
{
  "status": "healthy",
  "works_indexed": 86300,
  "mps_indexed": 774,
  "vendors_indexed": 9170,
  "classifier_loaded": true
}
```

FastAPI itself is not exposed on public port 8000. Public traffic
terminates at Caddy over HTTPS and is reverse-proxied internally to
`127.0.0.1:8000`.

------------------------------------------------------------------------

## 2. Required Render Environment Variables

Set these on the existing **Express backend service**:

  -----------------------------------------------------------------------
  Variable                            Value
  ----------------------------------- -----------------------------------
  `FASTAPI_ENABLED`                   `true`

  `FASTAPI_URL`                       `https://mplads-ml.duckdns.org`

  `MPLADS_API_KEY`                    Production key supplied securely by
                                      the ML/MLOps owner
  -----------------------------------------------------------------------

The `MPLADS_API_KEY` on Render must **exactly match** the production key
configured on AWS.

After changing the variables, save them and allow the Express service to
restart/redeploy as required by Render.

### Secret handling

-   Never commit `MPLADS_API_KEY` to Git.
-   Never expose it in React/Vite or other browser-side code.
-   Never return it in API responses.
-   Never log the complete key.
-   Do not use the old development/default key `mpladsAPI123`.
-   Obtain the production key from the ML/MLOps owner through the team's
    approved secure channel.

------------------------------------------------------------------------

## 3. Authentication Between Express and FastAPI

Protected FastAPI requests require:

``` http
X-API-Key: <production MPLADS_API_KEY>
```

Example:

``` javascript
const response = await fetch(
  `${process.env.FASTAPI_URL}/dashboard/summary`,
  {
    method: "GET",
    headers: {
      "X-API-Key": process.env.MPLADS_API_KEY,
      "Accept": "application/json"
    }
  }
);
```

The existing deployment plan states that `mlController.js` already
forwards `X-API-Key`, so this is primarily a verification point rather
than a required rewrite.

Expected behavior:

  -----------------------------------------------------------------------
  Request                             Expected
  ----------------------------------- -----------------------------------
  `GET /health` without API key       `200`

  Protected endpoint without key      `401`

  Protected endpoint with wrong key   `401`

  Protected endpoint with correct     `200`
  production key and valid request    
  -----------------------------------------------------------------------

The API key is service-to-service authentication. It does **not**
replace the Express application's existing JWT and role authorization
for client requests.

------------------------------------------------------------------------

## 4. Existing Express Proxy Contract

The deployment plan states that Express already mounts the ML analytics
proxy under:

``` text
/api/analytics
```

The intended flow is:

``` text
Frontend
   |
   | application JWT
   v
Express /api/analytics/*
   |
   | X-API-Key added server-side
   v
AWS FastAPI
```

The deployment plan specifically documents:

``` text
Express: GET /api/analytics/dashboard-summary
FastAPI: GET /dashboard/summary
```

Do not assume every Express route name is identical to its FastAPI path.
Preserve the mappings already implemented in `mlRoutes.js` /
`mlController.js`.

The plan also states that `/api/analytics/*` uses the existing JWT
authentication plus `INTERNAL_ROLES` authorization. Keep that
application-level security unchanged.

------------------------------------------------------------------------

## 5. FastAPI Capabilities Available to Express

  -----------------------------------------------------------------------------
  Method                  FastAPI path                  Purpose
  ----------------------- ----------------------------- -----------------------
  `GET`                   `/health`                     Service health/status

  `GET`                   `/dashboard/summary`          Dashboard summary and
                                                        top-risk data

  `POST`                  `/nlp/categorize-work`        Live work-description
                                                        categorization

  `POST`                  `/score/disbursement-risk`    Work-level disbursement
                                                        risk lookup

  `POST`                  `/score/cost-anomaly`         Work-level cost anomaly
                                                        lookup

  `GET`                   `/score/vendor-risk/{id}`     Vendor risk lookup

  `GET`                   `/score/mp-risk/{id}`         MP composite risk
                                                        scorecard

  `GET`                   `/score/state-risk/{state}`   State-level aggregated
                                                        risk
  -----------------------------------------------------------------------------

Except for `/health`, protected requests should carry `X-API-Key`.

URL-encode path parameters such as MP identifiers before forwarding
them. The deployment plan notes that ambiguous MP names may return HTTP
`400` with candidate matches.

------------------------------------------------------------------------

## 6. Forwarding Examples

Protected GET:

``` javascript
const response = await fetch(
  `${process.env.FASTAPI_URL}/dashboard/summary`,
  {
    headers: {
      "X-API-Key": process.env.MPLADS_API_KEY,
      "Accept": "application/json"
    }
  }
);

const body = await response.json();

if (!response.ok) {
  // Preserve or translate the upstream error using the existing
  // Express controller's error-handling convention.
}

return body;
```

JSON POST:

``` javascript
const response = await fetch(
  `${process.env.FASTAPI_URL}/nlp/categorize-work`,
  {
    method: "POST",
    headers: {
      "X-API-Key": process.env.MPLADS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(req.body)
  }
);
```

These snippets describe the connection contract. If the existing
controller already implements equivalent behavior, keep the existing
implementation.

------------------------------------------------------------------------

## 7. Validation

### Check AWS ML availability

``` bash
curl -i https://mplads-ml.duckdns.org/health
```

Expected: HTTP `200` and JSON containing `"status":"healthy"` and
`"classifier_loaded":true`.

### Check protected FastAPI authentication

``` bash
API_KEY="<production key>"

curl -i   -H "X-API-Key: $API_KEY"   https://mplads-ml.duckdns.org/dashboard/summary
```

Expected: HTTP `200`.

Without a key:

``` bash
curl -i https://mplads-ml.duckdns.org/dashboard/summary
```

Expected: HTTP `401`.

### Check Render Express -\> AWS ML

After setting the Render environment variables and
redeploying/restarting Express, test with a valid application JWT:

``` bash
curl -i   -H "Authorization: Bearer <VALID_JWT>"   https://<RENDER-EXPRESS-URL>/api/analytics/dashboard-summary
```

Expected: HTTP `200` with dashboard JSON relayed from AWS FastAPI.

The deployment plan also documents an Express health relay:

``` text
GET /api/analytics/health
```

If that route remains present in the current Express code, it can be
used to test Express -\> AWS connectivity while still going through the
Express authentication layer.

------------------------------------------------------------------------

## 8. Troubleshooting

  ------------------------------------------------------------------------------
  Symptom                 Likely cause                   Check
  ----------------------- ------------------------------ -----------------------
  ML-disabled / `503`     `FASTAPI_ENABLED` is not       Render environment
  behavior                `true`                         

  Express cannot reach ML Wrong `FASTAPI_URL`,           Call `/health` directly
                          DNS/network issue, or ML       
                          service unavailable            

  FastAPI returns `401`   Missing/mismatched             Confirm exact key match
                          `MPLADS_API_KEY`               and `X-API-Key`
                                                         forwarding

  FastAPI returns `400`   Invalid or ambiguous           URL-encode identifier
  for MP lookup           identifier                     and inspect candidate
                                                         response

  `/health` works but     Service is online;             Check key, path,
  protected routes fail   auth/request contract is       method, and body
                          failing                        

  Express rejects before  Existing JWT/role              Check JWT and
  ML is called            authorization failed           `INTERNAL_ROLES`

  TLS/SSL error           DNS/certificate/connectivity   Test the HTTPS
                          issue                          `/health` URL
                                                         externally
  ------------------------------------------------------------------------------

------------------------------------------------------------------------

## 9. Responsibility Boundary

### ML/MLOps side provides

-   AWS EC2-hosted FastAPI service
-   Dockerized production runtime
-   HTTPS endpoint through Caddy
-   TLS certificate management
-   Production API-key enforcement
-   ML artifacts/models loaded at startup
-   Public `/health` endpoint

### Express/Render side owns

-   Setting the three Render environment variables
-   Keeping the production API key secret
-   Verifying the existing proxy forwards `X-API-Key`
-   Preserving existing JWT + `INTERNAL_ROLES` authorization
-   Correctly forwarding methods, bodies, path/query parameters, and
    relevant content headers
-   Testing the complete Render Express -\> AWS ML path

------------------------------------------------------------------------

## 10. Copy/Paste Handoff Values

``` text
FASTAPI_ENABLED=true
FASTAPI_URL=https://mplads-ml.duckdns.org
MPLADS_API_KEY=<OBTAIN SECURELY FROM ML/MLOPS OWNER>
```

Do not use the EC2 IP address or public port `8000`. The Render backend
should use the HTTPS DuckDNS hostname only.

------------------------------------------------------------------------

## 11. Acceptance Checklist

-   [ ] `FASTAPI_ENABLED=true` is set on Render Express.
-   [ ] `FASTAPI_URL=https://mplads-ml.duckdns.org` is set.
-   [ ] Production `MPLADS_API_KEY` is configured securely.
-   [ ] The key is absent from frontend code and source control.
-   [ ] Direct `/health` returns HTTP `200`.
-   [ ] Protected FastAPI request with production key returns HTTP
    `200`.
-   [ ] Same protected request without key returns HTTP `401`.
-   [ ] Express forwards `X-API-Key` server-side.
-   [ ] Existing JWT + `INTERNAL_ROLES` authorization remains enabled.
-   [ ] `/api/analytics/dashboard-summary` works through Render with a
    valid application JWT.
-   [ ] At least one additional ML route is tested end-to-end.

------------------------------------------------------------------------

## Final Contract

``` text
Render Express
    FASTAPI_ENABLED=true
    FASTAPI_URL=https://mplads-ml.duckdns.org
    MPLADS_API_KEY=<production secret>
            |
            | HTTPS
            | X-API-Key: <production secret>
            v
AWS ML API
    https://mplads-ml.duckdns.org
```
