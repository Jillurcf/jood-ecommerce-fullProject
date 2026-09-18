# Jood Backend

Express + Prisma + MySQL REST API.

## Quick Start

```bash
cp .env.example .env        # fill in MySQL + secrets
npm install
npx prisma migrate dev       # create tables
npm run seed                 # seed sample data
npm run dev                  # start dev server
```

## Verify

- `GET http://localhost:4001/api/health` → `{ success: true, data: { status: "ok", db: "up", ... } }`

## Tests

```bash
npm test            # run unit + integration tests (Vitest + supertest)
npm run test:watch
npm run test:coverage
```

## Logging / observability

- `LOG_LEVEL` = `debug|info|warn|error` (default `debug` in dev, `info` in prod).
- `LOG_JSON=1` emits one JSON line per event for log aggregators.
- A request logger middleware records method/path/status/duration/RSS per request.
- `GET /api/health` reports DB connectivity + process memory/env.

## Staging

See `../docker-compose.staging.yml` + `../.env.staging.example` at the repo root.
Build the backend image with `./Dockerfile`.

## Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Master Admin | admin@jood.com | Admin@12345 |
| Customer | customer@jood.com | Customer@12345 |
