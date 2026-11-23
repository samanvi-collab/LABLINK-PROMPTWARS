# LABLINK — Intelligent Campus Resource Sharing Platform

LABLINK is a production-grade laboratory equipment scheduling, deterministic fairness ranking, faculty review, utilization analytics, and advisory AI platform built with TypeScript, React, Express, Cloud Firestore, Firebase Authentication, and server-side `@google/genai`.

## Architecture Overview

- **Shared Contracts (`shared/`)**: Strict Zod schemas (`.strict()`), domain types, and canonical fairness weights/constants shared between client and server.
- **Deterministic Scheduling Engine (`server/src/scheduler/`)**: Sole authority for feasibility checks (half-open `[startTime, endTime)` intervals in `Asia/Kolkata`, operating hours, max session duration, required trainings, safety clearance, maintenance windows, and $O(k \log k)$ sweep-line peak occupancy), 7-factor fairness scoring (`0–100`), deterministic tie-breaking, and validated conflict alternatives.
- **Storage & Concurrency (`server/src/repositories/`)**:
  - `DemoRepository`: Seeded in-memory dataset (22 instruments, 6 demo accounts) with per-equipment async locks (`withEquipmentLock`) preventing concurrent over-booking.
  - `FirestoreRepository`: Transactional Cloud Firestore implementation using Application Default Credentials (ADC), bounded indexed queries (`firestore.indexes.json`), and exponential-backoff contention retries (`ABORTED`).
- **Advisory AI Layer (`server/src/ai/`)**: Server-only `@google/genai` integration (`gemini-4-hydrogen` default) with 8-second timeouts, max 1 transient retry, bounded TTL LRU caching, per-user rate limiting, prompt-injection delimiters, zero-PII prompt payloads, output verification against deterministic backend data, and automatic `rule-based` fallback (`source: "ai" | "rule-based"`).
- **Accessible Frontend (`client/src/`)**: React + Vite + Tailwind CSS + React Router + TanStack Query + React Hook Form + Zod resolver, fetching runtime auth/public config from `/api/public-config` (never `VITE_` Firebase or Gemini keys) and clearly separating advisory AI panels (`AI SUGGESTION — NOT OFFICIAL RANKING`) from official scheduling truth.

## Runtime Modes & Environment Variables

Only two runtime pairs are permitted (`STORAGE_MODE` + `AUTH_MODE`):
1. **`demo` + `demo`**: In-memory seeded store and demo persona switcher. Blocked in `NODE_ENV=production` unless `ALLOW_DEMO_IN_PRODUCTION=true` is explicitly set.
2. **`firestore` + `firebase`**: Persistent Cloud Firestore and verified Firebase ID tokens (`Authorization: Bearer <token>` with `email_verified === true`). Requires `FIREBASE_PROJECT_ID`.

See `.env.example` for all supported variables:
- Server: `PORT` (`3000`), `NODE_ENV`, `APP_URL`, `APP_TIMEZONE` (`Asia/Kolkata`), `APP_VERSION`, `CORS_ORIGINS`
- Rate Limiting & Cache: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `BOOKING_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_MAX`, `AI_CACHE_TTL_MS`, `AI_CACHE_MAX_ENTRIES`
- Firebase Admin / Web Runtime Config: `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_APP_ID`, `FIREBASE_WEB_STORAGE_BUCKET`, `FIREBASE_WEB_MESSAGING_SENDER_ID`
- Server-Side Gemini AI: `GEMINI_API_KEY` (Secret Manager in production), `GEMINI_MODEL` (`gemini-4-hydrogen`), `GEMINI_TIMEOUT_MS` (`8000`)

## Local Development & Verification Commands

```bash
# Install dependencies
npm install

# Run development server (Express + Vite middleware on port 3000)
npm run dev

# Lint (ESLint + jsx-a11y) & strict TypeScript checks (client + server)
npm run lint

# Run all backend, AI, security, concurrency, and frontend vitest-axe suites
npm test

# Production build (client + server)
npm run build

# Scan repository and dist/ bundles for leaked keys/secrets
npm run scan:secrets
```

## Production Deployment (Cloud Run + Firebase)

### 1. Security Rules & Indexes
Deploy `firestore.rules` and `firestore.indexes.json` before serving traffic:
```bash
firebase deploy --only firestore:rules,firestore:indexes --project "$FIREBASE_PROJECT_ID"
```

### 2. Firebase Authentication Setup
In the Firebase Console for your project:
1. Enable **Google** and **Email/Password** sign-in providers.
2. Add your Cloud Run service domain (e.g., `lablink-xxxxx.run.app`) and `localhost` under **Authentication → Settings → Authorized domains**.
3. Copy public Firebase Web App config (`apiKey`, `authDomain`, `projectId`, `appId`) into `FIREBASE_WEB_*` environment variables (served dynamically via `/api/public-config` — never baked at build time).

### 3. Dedicated Service Account, Minimum IAM & Secret Manager
Create a dedicated Cloud Run runtime service account using Application Default Credentials (no static JSON keys):
```bash
# Firestore data access (minimum role for Cloud Run backend)
gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT_ID" \
  --member="serviceAccount:lablink-runner@${FIREBASE_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Secret Manager access for GEMINI_API_KEY
gcloud secrets create gemini-api-key --replication-policy="automatic"
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:lablink-runner@${FIREBASE_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 4. Build & Deploy Container to Cloud Run
The included multi-stage `Dockerfile` builds client and server assets, installs production-only dependencies, runs as non-root `USER node`, listens on `PORT=3000`, and handles `SIGTERM` directly as PID 1:
```bash
gcloud builds submit --tag "gcr.io/${FIREBASE_PROJECT_ID}/lablink:latest"

gcloud run deploy lablink \
  --image "gcr.io/${FIREBASE_PROJECT_ID}/lablink:latest" \
  --service-account "lablink-runner@${FIREBASE_PROJECT_ID}.iam.gserviceaccount.com" \
  --region asia-south1 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,STORAGE_MODE=firestore,AUTH_MODE=firebase,APP_TIMEZONE=Asia/Kolkata,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY},FIREBASE_WEB_AUTH_DOMAIN=${FIREBASE_WEB_AUTH_DOMAIN},FIREBASE_WEB_APP_ID=${FIREBASE_WEB_APP_ID},GEMINI_MODEL=gemini-4-hydrogen" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest"
```

> **Demo Deployment Warning**: Never set `STORAGE_MODE=demo` in production unless demonstrating an ephemeral preview with `ALLOW_DEMO_IN_PRODUCTION=true`, as data resets on container restart and demo personas are publicly selectable.

## Judge & Evaluator Provisioning

1. Copy `users.example.json` to `users.local.json` (git-ignored) and replace `CHANGE_ME_BEFORE_PROVISIONING` with strong temporary passwords.
2. Run the idempotent provisioning script using ADC (`GOOGLE_APPLICATION_CREDENTIALS` or `gcloud auth application-default login`):
   ```bash
   FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" npm run provision:users -- --file users.local.json --seed-equipment
   ```
3. Distribute provisioned Student, Faculty, and Admin credentials out-of-band (never commit `users.local.json`).

## Documentation Index

- `docs/API.md` — Complete REST & Advisory AI endpoint contract
- `docs/DECISIONS.md` — Scheduling math, fairness formula, AI boundary, and security architecture
- `docs/ACCESSIBILITY.md` — WCAG 2.2 AA compliance and keyboard navigation notes

## Verification Checklist

- [x] `npm run lint` (ESLint + `eslint-plugin-jsx-a11y` + `tsc --noEmit` + `tsc -p tsconfig.server.json --noEmit`)
- [x] `npm test` (10 test files / 41 tests passed: scheduler, fairness, state machine, concurrency, analytics, security regressions, mocked AI boundary/fallbacks, and `vitest-axe` frontend accessibility)
- [x] `npm run build` (`vite build` + server TypeScript compilation)
- [x] `npm run scan:secrets` (0 secret/key patterns in source or built `dist/` bundles)
- [x] Production Node startup & graceful `SIGTERM` check (`NODE_ENV=production ALLOW_DEMO_IN_PRODUCTION=true node dist/server/server/src/index.js`)
- [ ] `docker build` / Cloud Run live deploy (Docker CLI/daemon unavailable in sandbox environment; `Dockerfile` and `.dockerignore` verified statically)
