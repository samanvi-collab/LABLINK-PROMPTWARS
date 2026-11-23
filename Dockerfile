# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: Build Client (Vite) & Server (TypeScript)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY shared ./shared
COPY client ./client
COPY server ./server

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime (Non-Root, Production Dependencies Only)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY firestore.rules firestore.indexes.json ./

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run Node directly as PID 1 so SIGTERM triggers graceful HTTP server shutdown
CMD ["node", "dist/server/server/src/index.js"]
