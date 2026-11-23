# LABLINK — REST API Reference (Phase 1)

All endpoints are mounted under `/api`. Every response includes an `X-Request-Id` header.

## Authentication Headers

- **Demo Mode (`AUTH_MODE=demo`)**: Pass `X-Demo-User-Id: <userId>` (e.g., `stu-arjun`, `stu-meera`, `stu-kabir`, `fac-sharma`, `fac-iyer`, `adm-rao`).
- **Firebase Mode (`AUTH_MODE=firebase`)**: Pass `Authorization: Bearer <firebase-id-token>`.

## Standard Error Format

```json
{
  "error": {
    "code": "SCHEDULING_CONFLICT",
    "message": "Human-readable explanation",
    "requestId": "uuid",
    "details": {},
    "alternatives": {
      "timeSlots": [],
      "equivalentEquipment": []
    }
  }
}
```

---

## 1. System & Auth Endpoints

### `GET /api/health`
- **Auth**: Public
- **Response (`200`)**: `{ status: "ok", service: "lablink-api", version, storageMode, authMode, demoMode, timezone, uptimeSeconds, timestamp, firebaseConfigured, geminiConfigured }`

### `GET /api/public-config`
- **Auth**: Public (never exposes Admin credentials or API secrets)
- **Response (`200`)**: `{ appName: "LABLINK", version, storageMode, authMode, demoMode, timezone, firebaseConfigured, geminiConfigured, firebaseWebConfig }`

### `GET /api/me` (alias: `GET /api/auth/me`)
- **Auth**: Required (any authenticated role)
- **Response (`200`)**: `{ user: User }`

### `GET /api/demo/users`
- **Auth**: Public in `demo` mode; returns `403` in `firebase` mode.
- **Response (`200`)**: `{ users: User[] }`

### `POST /api/demo/restore`
- **Auth**: Required (`Admin` only, `demo` mode only)
- **Response (`200`)**: `{ restored: true, message: string }`

---

## 2. Equipment Endpoints

### `GET /api/equipment`
- **Auth**: Required (any role)
- **Query**: `{ page?: number, limit?: number, department?: string, category?: string, search?: string, includeArchived?: "true" | "false" }` (strict)
- **Response (`200`)**: `{ items: Equipment[], pagination }`

### `GET /api/equipment/:id`
- **Auth**: Required (any role)
- **Params**: `{ id: safeId }`
- **Response (`200`)**: `{ equipment: Equipment }` | `404`

### `POST /api/equipment`
- **Auth**: Required (`Admin` only)
- **Body** (strict): `{ name, description, category, department, location, capacity, operatingHours: { startTime, endTime, daysOfWeek }, maxBookingDurationMinutes, requiredTrainings?, safetyRequirements?, tags? }`
- **Response (`201`)**: `{ equipment: Equipment }`

### `PATCH /api/equipment/:id`
- **Auth**: Required (`Faculty` or `Admin`)
- **Body** (strict, >=1 field): Partial subset of equipment mutable fields
- **Response (`200`)**: `{ equipment: Equipment }`

### `POST /api/equipment/:id/archive`
- **Auth**: Required (`Admin` only)
- **Body** (strict): `{ archived?: boolean, reason?: string }`
- **Response (`200`)**: `{ equipment: Equipment }`

### `GET /api/equipment/:id/availability`
- **Auth**: Required (any role)
- **Query** (strict): `{ startTime: ISO8601, endTime: ISO8601 }` (`startTime < endTime`)
- **Response (`200`)**: `{ availability: AvailabilitySummary }` (includes `evaluation`, `overlappingBookings`, `overlappingMaintenance`, and `alternatives` when infeasible)

---

## 3. Booking Endpoints

### `GET /api/bookings`
- **Auth**: Required (`Student` sees only own bookings; `Faculty`/`Admin` see all)
- **Query** (strict): `{ page?, limit?, equipmentId?, status?, startTime?, endTime? }`
- **Response (`200`)**: `{ items: Booking[], pagination }`

### `GET /api/bookings/:id`
- **Auth**: Required (Owner, `Faculty`, or `Admin`; `403` for other students)
- **Response (`200`)**: `{ booking: Booking }`

### `POST /api/bookings`
- **Auth**: Required (any role, booking rate-limited)
- **Body** (strict): `{ equipmentId, startTime, endTime, purpose }`
- **Response**:
  - `201`: `{ booking: Booking }`
  - `409`: Scheduling conflict with `error.alternatives`

### `POST /api/bookings/:id/cancel`
- **Auth**: Required (Booking owner, `Faculty`, or `Admin`)
- **Body** (strict): `{ reason?: string }`
- **Response**: `200 { booking }` | `403` | `409` (already cancelled/completed)

---

## 4. Access Request Endpoints

### `GET /api/requests`
- **Auth**: Required (`Student` sees own requests; `Faculty`/`Admin` see all)
- **Query** (strict): `{ page?, limit?, equipmentId?, status?, sortBy?: "fairness" | "createdAt" }`
- **Response (`200`)**: `{ items: AccessRequest[], pagination }`

### `GET /api/requests/:id`
- **Auth**: Required (Requester, `Faculty`, or `Admin`)
- **Response (`200`)**: `{ request: AccessRequest }`

### `GET /api/requests/:id/ranking`
- **Auth**: Required (`Faculty` or `Admin`)
- **Response (`200`)**: `{ targetRequest: AccessRequest, competingRequests: AccessRequest[], topRankedRequestId: string | null, isTopRanked: boolean, requiresOverrideReason: boolean, schedulingEvaluation: SchedulingEvaluation }`

### `POST /api/requests`
- **Auth**: Required (any role, booking rate-limited)
- **Body** (strict): `{ equipmentId, startTime, endTime, purpose, projectType?: "CAPSTONE" | "RESEARCH" | "COURSEWORK" | "CLUB" | "PERSONAL", deadline?: ISO8601 | null }`
- **Response**: `201 { request }` (status `PENDING`, includes `priorityScore` and `fairnessBreakdown`) | `409` with `alternatives`

### `POST /api/requests/:id/approve`
- **Auth**: Required (`Faculty` or `Admin`, booking rate-limited)
- **Body** (strict): `{ decisionReason?: string, overrideReason?: string }`
- **Response**:
  - `200`: `{ request: AccessRequest, booking: Booking }` (atomic transaction)
  - `409`: Conflict or non-PENDING state (request stays `PENDING`, returns `alternatives`)

### `POST /api/requests/:id/reject`
- **Auth**: Required (`Faculty` or `Admin`)
- **Body** (strict): `{ decisionReason: string }`
- **Response**: `200 { request }` | `409`

### `POST /api/requests/:id/cancel`
- **Auth**: Required (Requester or `Admin`)
- **Body** (strict): `{ reason?: string }`
- **Response**: `200 { request }` | `403` | `409`

---

## 5. Maintenance, Analytics & Audit Endpoints

### `GET /api/maintenance`
- **Auth**: Required (any role)
- **Query** (strict): `{ page?, limit?, equipmentId?, activeOnly?: "true" | "false" }`
- **Response (`200`)**: `{ items: MaintenanceWindow[], pagination }`

### `POST /api/maintenance`
- **Auth**: Required (`Faculty` or `Admin`)
- **Body** (strict): `{ equipmentId, title, reason, startTime, endTime }`
- **Response (`201`)**: `{ maintenanceWindow: MaintenanceWindow }`

### `PATCH /api/maintenance/:id`
- **Auth**: Required (`Faculty` or `Admin`)
- **Body** (strict): `{ title?, reason?, startTime?, endTime?, active? }`
- **Response (`200`)**: `{ maintenanceWindow: MaintenanceWindow }`

### `GET /api/analytics/overview`
### `GET /api/analytics/utilization`
### `GET /api/analytics/departments`
- **Auth**: Required (`Faculty` or `Admin`)
- **Query** (strict): `{ startTime?: ISO8601, endTime?: ISO8601, department?: string }`

### `GET /api/audit-logs`
- **Auth**: Required (`Faculty` or `Admin`)
- **Query** (strict): `{ page?, limit?, actorId?, targetId?, action? }`
- **Response (`200`)**: `{ items: AuditLog[], pagination }`

---

## 6. Advisory AI Endpoints (Server-Side Gemini + Deterministic Fallback)

All `/api/ai/*` endpoints are authenticated, per-user rate-limited (`AI_RATE_LIMIT_MAX` per window), and bounded to 2,000 characters on user-entered text. Every response includes `disclaimer: "AI SUGGESTION — NOT OFFICIAL RANKING"`, `source: "ai" | "rule-based"`, and `fallbackReason` when deterministic fallback is active.

### `POST /api/ai/recommendations`
- **Auth**: Required (any role, per-user AI rate-limited)
- **Body** (strict): `{ equipmentId?: safeId, projectDescription: string (5..2000), preferredStartTime?: ISO8601, preferredEndTime?: ISO8601 }`
- **Behavior**: Pre-evaluates feasible slots & equivalent equipment using `evaluateSchedulingConstraints` and `findAlternativeSuggestions`; validates every model pick against verified feasible candidates before returning.
- **Response (`200`)**: `{ source, model, cached, fallbackReason?, disclaimer, authorityNote, targetWindow, recommendations[], blockerSummary? }`

### `POST /api/ai/project-matching`
- **Auth**: Required (any role, per-user AI rate-limited)
- **Body** (strict): `{ projectDescription: string (5..2000), department?: string, category?: string }`
- **Behavior**: Matches project needs strictly against active (non-archived) equipment records and annotates user-specific `eligibleForUser` and `missingTrainings`.
- **Response (`200`)**: `{ source, model, cached, fallbackReason?, disclaimer, authorityNote, matches[] }`

### `POST /api/ai/explain-scheduling`
- **Auth**: Required (`Student` limited to own requests — `403` otherwise; `Faculty`/`Admin` can explain any request)
- **Body** (strict): `{ requestId: safeId }`
- **Behavior**: Recomputes official deterministic rank, fairness breakdown, and constraint evaluation on the server; passes anonymized scheduling facts (zero PII) to Gemini for plain-language explanation without altering scores or status.
- **Response (`200`)**: `{ source, model, cached, fallbackReason?, disclaimer, authorityNote, officialContext, explanation }`

