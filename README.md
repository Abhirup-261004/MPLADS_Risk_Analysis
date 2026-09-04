# Prahari AI

MERN authentication starter for Prahari AI Monitoring & Risk Intelligence.

## Structure

```text
frontend/              React + Vite login interface
backend/               Express + MongoDB JWT API
  src/config/          Environment and database configuration
  src/controllers/     Request handlers
  src/middleware/      Authentication and error handling
  src/models/          Mongoose schemas
  src/routes/          API route definitions
  src/utils/           JWT and async helpers
```

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and fill in the values.
2. Copy `frontend/.env.example` to `frontend/.env` if the API is not at the default URL.
3. Install dependencies in both applications.
4. Start MongoDB, then run `npm run dev` in `backend/` and `frontend/` in separate terminals.

For a local MongoDB installation use `mongodb://127.0.0.1:27017/prahari-ai` for `MONGODB_URI`.

The seeded development account is controlled by `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. It is created automatically only when `SEED_ADMIN_ON_START=true`.

## Authentication API

- `POST /api/auth/register` creates a user and returns a JWT.
- `POST /api/auth/login` accepts `{ "email", "password" }` and returns a JWT and safe user object.
- `GET /api/auth/me` requires `Authorization: Bearer <token>`.
