# JOODFrontend

Next.js App Router + TypeScript storefront.

## Quick Start

```bash
cp .env.example .env.local   # fill in API URL + Stripe key
npm install
npm run dev                   # http://localhost:3000
```

The placeholder home page calls `GET /api/health` on the backend and displays the result.
