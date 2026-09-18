# Jood Backend — Express + Prisma + MySQL
# Plain JS (no build step): deps -> runtime
# Staging go-live image. DB connection and all secrets come from env.

# ── Stage 1: install deps + generate prisma client ────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
# Separate lockfile first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci
# Generate Prisma client from schema (required before runtime)
COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Non-root user for production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Uploads dir (bind-mounted in compose)
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app
EXPOSE 4001
CMD ["node", "src/server.js"]
