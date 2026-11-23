# LABLINK — Architecture & Engineering Decisions (Phase 1)

## 1. High-Level Architecture

LABLINK is structured as a modular full-stack TypeScript application sharing domain contracts and Zod schemas across client and server:

- `shared/`: Canonical TypeScript domain types (`User`, `Equipment`, `AccessRequest`, `Booking`, `MaintenanceWindow`, `AuditLog`), constants (`FAIRNESS_WEIGHTS`, state transitions), and strict Zod schemas (`.strict()`).
- `server/src/config/`: Startup Zod environment validation (`env.ts`) and Firebase Admin SDK initialization (`firebase.ts`).
- `server/src/scheduler/`: Pure, framework-agnostic scheduling engine (`constraints.ts`, `fairness.ts`, `alternatives.ts`) independent of Express and storage.
- `server/src/repositories/`: Storage abstraction (`IRepository`), deterministic in-memory store (`DemoRepository`), and transactional Firestore adapter (`FirestoreRepository`).
- `server/src/services/`: Business logic orchestration, state-machine enforcement, and resource-level authorization.
- `server/src/middleware/`: Request IDs, authentication/RBAC, strict Zod validation, rate limiters, and centralized error handling.
- `server/src/controllers/` & `server/src/routes/`: Thin HTTP transport handlers delegating to services.
- `server/src/analytics/` & `server/src/audit/`: Pure utilization calculators and sanitized, idempotent audit recording.
- `client/`: Minimal Phase 1 React 18+/19 + Vite + Tailwind + React Router 6 + TanStack Query 5 scaffold wired to `/api/health` and `/api/public-config`.

---

## 2. Runtime Modes & Environment Variables

`STORAGE_MODE` (`demo | firestore`) and `AUTH_MODE` (`demo | firebase`) are validated at startup by `validateEnvironment()` in `server/src/config/env.ts`.

### Allowed Mode Combinations
Only two combinations are permitted:
1. **`demo + demo`**: Deterministic seeded in-memory storage + `x-demo-user-id` demo user authentication. Intended for local evaluation, CI testing, and non-persistent previews. Requires `ALLOW_DEMO_IN_PRODUCTION=true` if `NODE_ENV=production`.
2. **`firestore + firebase`**: Persistent Cloud Firestore storage (via `firebase-admin`) + verified Firebase Authentication ID tokens. Requires `FIREBASE_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT`). Fails loudly at startup if missing — never silently falls back to in-memory storage.

Any mixed pair (`demo + firebase` or `firestore + demo`) throws a `ConfigurationError` and aborts startup immediately.

### Environment Variables
| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `APP_URL` | — | Optional origin allowed in CORS |
| `APP_TIMEZONE` | `Asia/Kolkata` | Default campus timezone for operating hours & analytics |
| `APP_VERSION` | `1.0.0` | Reported in `/api/health` and `/api/public-config` |
| `STORAGE_MODE` | `demo` | `demo` or `firestore` |
| `AUTH_MODE` | `demo` | `demo` or `firebase` |
| `ALLOW_DEMO_IN_PRODUCTION` | `false` | Must be `true` to run `demo` mode in `NODE_ENV=production` |
| `CORS_ORIGINS` | — | Comma-separated allowlisted browser origins |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limiter window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `120` | General API requests per window per IP |
| `BOOKING_RATE_LIMIT_MAX` | `30` | Booking/request/approval mutations per window per IP |
| `FIREBASE_PROJECT_ID` | — | Required in `firestore` mode (uses ADC) |
| `FIREBASE_DATABASE_ID` | `(default)` | Optional named Firestore database ID |
| `FIRESTORE_EMULATOR_HOST` | — | Optional local Firestore emulator address |
| `FIREBASE_AUTH_EMULATOR_HOST` | — | Optional local Auth emulator address |
| `FIREBASE_WEB_*` | — | Optional public Firebase Web SDK config returned by `/api/public-config` |

---

## 3. Storage Design & Firestore Efficiency

### Dynamic Derived Availability
Availability is **never** stored as a mutable counter or field on `Equipment`. It is always calculated dynamically from:
- Active `CONFIRMED` bookings overlapping `[startTime, endTime)`
- Active `MaintenanceWindow` blocks overlapping `[startTime, endTime)`
- Equipment `capacity`, `operatingHours` (evaluated in `Asia/Kolkata`), `maxBookingDurationMinutes`, and `archived` status
- User `completedTrainings` and `safetyCleared`

### DemoRepository
- Seeds 22 equipment items across CSE, ECE, Mechanical, and EEE, 6 users (3 Students, 2 Faculty, 1 Admin), sample bookings, access requests, maintenance windows, and audit logs.
- Uses per-equipment asynchronous mutex locks (`withEquipmentLock`) so concurrent bookings or approvals on the same `equipmentId` execute strictly serially without race conditions.
- Supports deterministic `restoreDemoData`.

### FirestoreRepository
- Initializes `firebase-admin` via Application Default Credentials (`applicationDefault()`) or local emulator environment variables — never commits or requires service-account JSON files.
- **Bounded, Indexed Queries**: Inside `runTransaction`, queries filter strictly by `equipmentId`, `status == 'CONFIRMED'` (or `active == true`), and `startTime < requestEndTime` ordered by `startTime ASC` with `.limit(200)` (composite indexes defined in `firestore.indexes.json`). The full `bookings` or `accessRequests` collection is never scanned in a transaction.
- **Contention Handling**: `runTransactionWithRetry` retries gRPC `ABORTED` (code `10`) contention errors up to 5 times with exponential backoff.

---

## 4. Authentication & Authorization Design

- **Demo Mode (`AUTH_MODE=demo`)**: Resolves authenticated user solely from `x-demo-user-id` against seeded repository users. Client-supplied role headers (`x-user-role`) are ignored.
- **Firebase Mode (`AUTH_MODE=firebase`)**: Verifies `Authorization: Bearer <idToken>` using `firebaseAuth.verifyIdToken()`. Demo headers are rejected (`401`). First-time Firebase users are provisioned with `role: 'Student'`, `safetyCleared: false`, `completedTrainings: []` — never elevated from client payloads.
- **Authorization**:
  - `Student`: Browse equipment & availability, create direct bookings (if feasible) or access requests, cancel own pending requests and own bookings. Cannot approve/reject requests, manage equipment/maintenance, view analytics, or read audit logs.
  - `Faculty`: All student capabilities plus equipment updates, maintenance management, request approval/rejection, analytics, and audit logs.
  - `Admin`: Full capabilities including equipment creation, archiving/restoring, and demo reset.

---

## 5. Scheduling Rules & Half-Open Intervals

All reservations and maintenance windows use **half-open intervals** `[startTime, endTime)`.
Two intervals `[aStart, aEnd)` and `[bStart, bEnd)` overlap iff:

```text
aStart < bEnd && bStart < aEnd
```

Therefore, one booking ending at `10:00:00` and another starting at `10:00:00` do **not** conflict.

### Peak Concurrent Occupancy (Sweep-Line)
For equipment with `capacity > 1`, overlapping `CONFIRMED` bookings are evaluated using an $O(k \log k)$ sweep-line over boundary timestamps (processing `-1` end events before `+1` start events at identical timestamps). A slot is feasible iff `peakOccupancy < equipment.capacity`.

### Hard Constraints
1. Valid ISO-8601 range with `startTime < endTime` (`INVALID_TIME_RANGE`)
2. `startTime >= now` (`PAST_DATE`)
3. `!equipment.archived` (`EQUIPMENT_ARCHIVED`)
4. Duration `<= equipment.maxBookingDurationMinutes` (`EXCEEDS_MAX_DURATION`)
5. Contained within single-day `operatingHours` in `Asia/Kolkata` (`OUTSIDE_OPERATING_HOURS`)
6. User has all `equipment.requiredTrainings` (`MISSING_TRAINING`)
7. If `equipment.safetyRequirements.length > 0`, `user.safetyCleared === true` (`SAFETY_CLEARANCE_REQUIRED`)
8. Zero overlapping active maintenance windows (`MAINTENANCE_CONFLICT`)
9. Peak concurrent bookings `< equipment.capacity` (`CAPACITY_EXCEEDED`)

### Alternative Suggestions
Whenever a booking or approval conflicts, `findAlternativeSuggestions` searches:
- Up to 4 other 30-minute-step time slots on the same equipment over the next 72 hours.
- Up to 4 non-archived equivalent/same-category equipment items with compatible tags at the exact requested time.
Every candidate suggestion is validated through `evaluateSchedulingConstraints` before inclusion.

---

## 6. Deterministic Fairness Formula

Weighted total (`0–100`):

$$\text{Score} = \frac{25 F_{\text{wait}} + 20 F_{\text{usage}} + 15 F_{\text{deadline}} + 10 F_{\text{training}} + 10 F_{\text{academic}} + 10 F_{\text{duration}} + 10 F_{\text{dept}}}{100}$$

| Factor | Weight | Formula & Missing Data Handling |
| --- | --- | --- |
| `waitTime` | `25` | $\min(100, \text{round}(\frac{\text{waitHours}}{72} \times 100))$. Clamped to `0` if timestamps missing/negative. |
| `historicalUsage` | `20` | $\max(0, 100 - \min(10, \text{previousConfirmedOrCompletedBookings}) \times 10)$. |
| `deadlineUrgency` | `15` | `25` if `deadline` is `null`; `100` if $\le 24\text{h}$; linear decay `100 → 20` over `24h–168h`; `20` if $\ge 168\text{h}$. |
| `trainingCompliance` | `10` | `0` if safety clearance required & missing; `100` if no required trainings; else $\lfloor \frac{\text{matched}}{\text{required}} \times 100 \rfloor$. |
| `academicPriority` | `10` | `CAPSTONE: 100`, `RESEARCH: 90`, `COURSEWORK: 75`, `CLUB: 50`, `PERSONAL: 30`. |
| `durationEfficiency` | `10` | `100` if $\text{duration} \le 0.5 \times \text{maxDuration}$; linear `100 → 40` from `0.5x` to `1.0x`; `0` if exceeds max. |
| `departmentAlignment` | `10` | `100` if requester department matches equipment department; `60` for cross-department sharing. |

### Deterministic Tie-Breakers
1. Higher `priorityScore`
2. Earlier `deadline` (explicit deadlines sort ahead of `null`)
3. Fewer previous bookings for requester
4. Lexicographical `request.id` ordering

---

## 7. State Machine & Atomic Approval

Allowed `AccessRequest` transitions:
- `PENDING → APPROVED` (Faculty/Admin only, atomic transaction)
- `PENDING → REJECTED` (Faculty/Admin only, requires reason)
- `PENDING → CANCELLED` (Requester/Admin only)

Terminal states (`APPROVED`, `REJECTED`, `CANCELLED`) reject any further transitions with `409 Conflict`.

### Atomic Approval Transaction
Within one transaction/equipment lock:
1. Verify request is `PENDING`.
2. Revalidate equipment, requester, time range, operating hours, trainings, safety, maintenance, and capacity.
3. If infeasible: abort without modifying request or creating a booking, and return `409` with violation details and validated alternatives.
4. Create `Booking` (`CONFIRMED`), transition `AccessRequest` to `APPROVED`, and write `AuditLog` atomically.

---

## 8. Utilization Formula

$$\text{Utilization \%} = \begin{cases} 0 & \text{if } \text{availableOperatingCapacityMinutes} \le 0 \\ \min\left(100, \frac{\text{bookedCapacityMinutes}}{\text{availableOperatingCapacityMinutes}} \times 100\right) & \text{otherwise} \end{cases}$$

Where:
- `availableOperatingCapacityMinutes` = operating minutes inside `[windowStart, windowEnd)` in `Asia/Kolkata` multiplied by `equipment.capacity`.
- `bookedCapacityMinutes` = sum of overlap minutes of `CONFIRMED` and `COMPLETED` bookings with `[windowStart, windowEnd)`.
- Zero operating hours, empty windows, or missing data always return `0` (never `NaN` or `Infinity`).

---

## 9. Standard Error Codes

| HTTP Status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR`, `INVALID_JSON` | Zod schema or unknown-field rejection, or malformed JSON |
| `401` | `UNAUTHORIZED` | Missing/invalid auth token or unknown demo user |
| `403` | `FORBIDDEN` | Role restriction or resource ownership violation |
| `404` | `NOT_FOUND` | Resource or endpoint does not exist |
| `409` | `SCHEDULING_CONFLICT`, `APPROVAL_CONFLICT`, `INVALID_STATE_TRANSITION`, `CONFLICT` | Capacity/maintenance/constraint conflict (includes `alternatives`) or invalid transition |
| `429` | `RATE_LIMIT_EXCEEDED`, `BOOKING_RATE_LIMIT_EXCEEDED` | Rate limit triggered |
| `500` | `INTERNAL_SERVER_ERROR`, `CONFIGURATION_ERROR` | Safe generic error (no stack traces leaked) |

---

## 10. Phase 3: Advisory AI Architecture & Security Hardening

- **Deterministic Authority Boundary**: Gemini (`@google/genai`, default `gemini-4-hydrogen`) runs strictly server-side with an 8-second timeout, at most 1 transient retry, and a bounded TTL LRU cache. Every AI output is validated against deterministic backend state (`evaluateSchedulingConstraints`, active catalog IDs, official rank) and falls back cleanly to rule-based generation (`source: "rule-based"`) on missing keys, timeouts, quota limits, or invalid outputs.
- **Prompt Defense & Zero-PII Prompts**: User project descriptions (`max 2000 chars`) are stripped of control characters and wrapped in boundary delimiters (`<<<UNTRUSTED_USER_..._START>>>`). Student names, emails, and user IDs are never sent to Gemini.
- **Security Headers & Auth Parity**: Production Helmet configures explicit CSP directives (allowing self, Google Fonts, and Firebase Auth origins) alongside `Cross-Origin-Opener-Policy: same-origin-allow-popups` for Google OAuth popups and `Strict-Origin-When-Cross-Origin` referrer policy. Firebase ID-token authentication verifies `email_verified === true` consistently with `firestore.rules`.
- **Rate Limiting Store**: Uses in-memory `express-rate-limit` store (general, booking mutation, and per-user AI limiters); multi-instance horizontal scaling in production should plug in a shared Redis store.

