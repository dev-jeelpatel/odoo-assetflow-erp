# AssetFlow — Enterprise Asset & Resource Management System

## Project Description

**AssetFlow** is a lightweight, industry-agnostic ERP module that digitizes how any organization — an office, school, hospital, or factory — tracks, allocates, maintains, and audits its physical assets and shared resources. It replaces spreadsheets and paper logs with structured asset lifecycles, conflict-free allocation, zero-overlap resource booking, approval-gated maintenance, and scheduled audit cycles — all surfaced through real-time notifications, activity logs, and a KPI dashboard.

AssetFlow deliberately excludes purchasing, invoicing, and accounting. Acquisition cost exists purely as a reporting field. The focus is pure operational asset truth: **who holds what, where it is, and what condition it's in — right now.**

### Core capabilities
1. **Organization setup** — departments (with hierarchy), asset categories (with category-specific fields like warranty period), and an employee directory where roles are assigned.
2. **Asset registration & lifecycle** — auto-generated tags (`AF-0001`), full lifecycle: `Available → Allocated → Reserved → Under Maintenance → Lost → Retired → Disposed`, per-asset allocation + maintenance history.
3. **Allocation & transfer** — double-allocation is blocked and redirected to a Transfer Request workflow (`Requested → Approved → Re-allocated`); returns capture condition notes; overdue allocations auto-flag.
4. **Resource booking** — per-resource calendar, hard overlap rejection, statuses `Upcoming / Ongoing / Completed / Cancelled`, cancel/reschedule, pre-slot reminders.
5. **Maintenance workflow** — `Pending → Approved/Rejected → Technician Assigned → In Progress → Resolved`; asset auto-flips to Under Maintenance only after Asset Manager approval, back to Available on resolution.
6. **Audit cycles** — scoped cycles with assigned auditors, per-asset `Verified / Missing / Damaged` marks, auto-generated discrepancy reports, closing locks the cycle and updates statuses (confirmed-missing → Lost).
7. **Visibility layer** — event-driven notifications, full who-did-what-when activity log, KPI dashboard with overdue items separated from upcoming, and exportable analytics (utilization trends, booking heatmap, department summaries).

### Security model
Signup only ever creates an **Employee** account — there is no role picker. Only an **Admin** can promote users to **Department Head** or **Asset Manager**, and only from the Employee Directory. Four roles with strict separation:

| Role | Scope |
|---|---|
| Admin | Org setup, role promotion, org-wide analytics — no day-to-day asset ops |
| Asset Manager | Registers/allocates assets; approves transfers, maintenance, returns, audit discrepancies |
| Department Head | Department-scoped visibility and approvals; books on the department's behalf |
| Employee | Own assets, bookings, maintenance requests, return/transfer initiation |

### Tech stack
- **Frontend:** Next.js (React) — responsive, consistent design system
- **Backend:** Node.js + Express — versioned REST API
- **Database:** MySQL (local) — normalized relational schema, transactions for conflict rules
- Built from scratch, minimal third-party APIs, real-time updates via Server-Sent Events

---

# Master Development Prompt

> Feed everything below this line to your developer / AI agent as the build specification.

---

Build **AssetFlow**, an Enterprise Asset & Resource Management System — a full-stack web application built **from scratch**. No SaaS backends, no third-party APIs beyond essential open-source npm libraries. Everything (auth, validation, scheduling, notifications, file storage) is implemented locally.

## 1. Mandatory tech stack

- **Frontend:** Next.js 14+ (App Router) with React. Plain CSS Modules or Tailwind CSS (Tailwind is justified: consistent design tokens, responsive utilities, fast iteration).
- **Backend:** Node.js + Express, structured as a standalone API server (`/server`), separate from the Next.js app (`/client`).
- **Database:** MySQL 8 running locally. Use `mysql2` with a connection pool. Write the schema by hand in versioned SQL migration files (`/server/db/migrations/001_*.sql` …) executed by a small custom migration runner — no ORM required; if one is used, only a thin query builder. Provide `npm run db:migrate` and `npm run db:seed`.
- **Auth:** email + password with `bcrypt` hashing, JWT access token (15 min) + httpOnly refresh-token cookie. Forgot-password issues a single-use, expiring token (log the reset link to console/dev-mailbox — no external email API).
- **Real-time:** Server-Sent Events (`GET /api/v1/events`) pushing notifications and dashboard-KPI invalidations. Justified trendy tech: SSE is native, zero-dependency, and fits one-way server→client alerts better than websockets.
- **Files:** asset photos/documents stored on local disk (`/server/uploads`) via `multer`, served through an authenticated route.
- **Background jobs:** a lightweight in-process scheduler (`setInterval`-based tick, every 60s) that: flags overdue allocations, transitions booking statuses (Upcoming→Ongoing→Completed), and emits booking reminders. No external cron/queue services.

## 2. Repository & git discipline

Monorepo:

```
/client        Next.js app
/server        Express API
  /src
    /config /db /middleware /modules /jobs /utils
  /db/migrations  /db/seeds
/docs          this brief, ERD, API reference
```

Each backend domain is a self-contained module (`/modules/assets`, `/modules/bookings`, …) with its own `routes`, `controller`, `service`, `repository` files — controllers never touch SQL; services own business rules; repositories own queries. This is the scalability story: new modules bolt on without touching existing ones.

Git: `main` protected; feature branches (`feat/booking-overlap`, `fix/transfer-approval`); **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`); small, atomic commits per feature; meaningful messages. Commit early and continuously — the history itself is a deliverable.

## 3. Database design (MySQL, local)

Design a normalized schema with these tables (all with `created_at`/`updated_at`, FKs with correct `ON DELETE` behavior, and indexes on every FK + search column):

- `users` — id, name, email (unique), password_hash, role ENUM('ADMIN','ASSET_MANAGER','DEPT_HEAD','EMPLOYEE') **default 'EMPLOYEE'**, department_id FK, status ENUM('ACTIVE','INACTIVE')
- `password_resets` — user_id, token_hash, expires_at, used_at
- `departments` — id, name, head_user_id FK, parent_department_id FK (self-referencing, nullable → hierarchy), status
- `asset_categories` — id, name, description, custom_fields JSON (e.g. `[{"key":"warranty_months","label":"Warranty (months)","type":"number"}]`)
- `assets` — id, asset_tag (unique, auto `AF-0001` via a `tag_counters` table incremented **inside the insert transaction** — never MAX()+1), name, category_id, serial_number, acquisition_date, acquisition_cost DECIMAL (reporting only), condition ENUM('NEW','GOOD','FAIR','POOR'), location, department_id, status ENUM('AVAILABLE','ALLOCATED','RESERVED','UNDER_MAINTENANCE','LOST','RETIRED','DISPOSED'), is_bookable BOOL, custom_field_values JSON
- `asset_files` — asset_id, file_path, original_name, mime_type
- `allocations` — asset_id, allocated_to_user_id (nullable), allocated_to_department_id (nullable), allocated_by, allocated_at, expected_return_date, returned_at, return_condition_notes, is_overdue_flagged BOOL. **Active allocation = `returned_at IS NULL`.**
- `transfer_requests` — asset_id, from_user_id, to_user_id/to_department_id, reason, status ENUM('REQUESTED','APPROVED','REJECTED','COMPLETED'), requested_by, decided_by, decided_at
- `bookings` — asset_id (bookable resource), booked_by, on_behalf_of_department_id (nullable), starts_at, ends_at, status ENUM('UPCOMING','ONGOING','COMPLETED','CANCELLED'), reminder_sent BOOL. Index `(asset_id, starts_at, ends_at)`.
- `maintenance_requests` — asset_id, raised_by, issue_description, priority ENUM('LOW','MEDIUM','HIGH','CRITICAL'), photo_path, status ENUM('PENDING','APPROVED','REJECTED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED'), technician_name, decided_by, resolution_notes, resolved_at
- `audit_cycles` — name, scope_department_id / scope_location, starts_on, ends_on, status ENUM('OPEN','CLOSED'), created_by, closed_at
- `audit_assignments` — cycle_id, auditor_user_id
- `audit_items` — cycle_id, asset_id, expected_location, verification ENUM('PENDING','VERIFIED','MISSING','DAMAGED'), notes, verified_by, verified_at
- `notifications` — user_id, type, title, body, entity_type, entity_id, read_at
- `activity_logs` — actor_user_id, action, entity_type, entity_id, metadata JSON, created_at — **append-only; write one row from every state-changing service method.**

Deliver an ERD in `/docs`.

## 4. Asset lifecycle — the complete legal transition map

The spec gives only examples; implement THIS full state machine as a single server-side guard (`assertTransition(from, to, context)`), and reject everything else with a clear error:

| From | Allowed to | Trigger |
|---|---|---|
| AVAILABLE | ALLOCATED | allocation created |
| AVAILABLE | RESERVED | approved transfer/allocation awaiting handover |
| AVAILABLE | UNDER_MAINTENANCE | maintenance request approved |
| AVAILABLE | RETIRED | manager retires end-of-life asset |
| AVAILABLE | LOST | audit close confirms missing |
| RESERVED | ALLOCATED | handover confirmed |
| RESERVED | AVAILABLE | reservation cancelled/expired |
| ALLOCATED | AVAILABLE | return completed (condition notes captured) |
| ALLOCATED | UNDER_MAINTENANCE | maintenance approved while held (remember holder) |
| ALLOCATED | LOST | audit close confirms missing |
| UNDER_MAINTENANCE | AVAILABLE | resolved (or back to ALLOCATED if it had a holder) |
| UNDER_MAINTENANCE | ALLOCATED | resolved and returned to prior holder |
| UNDER_MAINTENANCE | RETIRED | beyond economical repair |
| LOST | AVAILABLE | found in a later audit |
| RETIRED | DISPOSED | disposal recorded |
| DISPOSED | — | terminal |

Rules: LOST/RETIRED assets cannot be allocated or booked. Every transition writes an `activity_logs` row.

## 5. Business rules (the graded scenarios — get these perfect)

1. **No double-allocation.** Allocating an asset with an active allocation must fail with HTTP 409 and a payload naming the current holder (e.g. *"Already allocated to Priya Shah (Engineering)"*) plus a `suggest_transfer: true` hint. The UI shows the block inline and offers a **Transfer Request** button pre-filled with the asset and current holder. Enforce in a **DB transaction with `SELECT … FOR UPDATE`** on the asset row — not just an application check.
2. **No overlapping bookings.** Overlap iff `new.starts_at < existing.ends_at AND new.ends_at > existing.starts_at` against non-cancelled bookings. Back-to-back is legal: Room B2 booked 9:00–10:00 → 9:30–10:30 is **rejected (409, with the conflicting slot in the error)**, 10:00–11:00 is **accepted**. Same transaction+lock pattern. Reschedule = same validation excluding the booking's own id.
3. **Maintenance cannot skip approval.** Raising a request never changes asset status. Only Asset Manager approval flips it to UNDER_MAINTENANCE; rejection leaves the asset untouched; resolution flips it back (to ALLOCATED if it had a holder, else AVAILABLE).
4. **Audits auto-generate discrepancies.** Creating a cycle snapshots in-scope assets into `audit_items`. The discrepancy report is **computed, never hand-written**: every MISSING/DAMAGED (and never-verified) item, grouped, with auditor + timestamp. Closing locks the cycle (further edits → 409) and applies status updates (confirmed MISSING → LOST).
5. **No self-elevated roles.** The signup endpoint hard-codes `role = 'EMPLOYEE'` — it must ignore any role field in the request body. Role change is a dedicated Admin-only endpoint that refuses to demote the last Admin.
6. **Overdue auto-flagging.** The scheduler flags allocations past `expected_return_date`, notifies holder + Asset Manager, and the dashboard shows overdue **separately** from upcoming returns.

## 6. API design (modern REST)

Base: `/api/v1`. JSON only. Consistent envelope:

```json
// success            // error
{ "data": …,          { "error": {
  "meta": {…} }           "code": "BOOKING_OVERLAP",
                          "message": "Room B2 is already booked 09:00–10:00 on 12 Jul.",
                          "details": [{ "field": "starts_at", "message": "…" }] } }
```

Correct status codes: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 business-rule conflict, 422 semantic errors. Central Express error middleware — **no raw stack traces to clients, ever**; log them server-side.

Endpoint groups (all list endpoints support pagination `?page=&limit=`, sorting, and filters):

- `POST /auth/signup | /auth/login | /auth/refresh | /auth/logout | /auth/forgot-password | /auth/reset-password`, `GET /auth/me`
- `GET|POST|PATCH /departments`, `/categories`, `/users` (+ `PATCH /users/:id/role` — Admin only)
- `GET|POST|PATCH /assets`, `GET /assets/:id` (with full history), `POST /assets/:id/files`, `PATCH /assets/:id/status`, `GET /assets?search=` (tag | serial | QR payload | name), filters: category/status/department/location/bookable
- `POST /allocations`, `POST /allocations/:id/return`, `GET /allocations?overdue=true`
- `GET|POST /transfers`, `POST /transfers/:id/approve | /reject`
- `GET|POST /bookings`, `POST /bookings/:id/cancel | /reschedule`, `GET /assets/:id/bookings?from=&to=` (calendar feed)
- `GET|POST /maintenance`, `POST /maintenance/:id/approve | /reject | /assign-technician | /start | /resolve`
- `GET|POST /audits`, `POST /audits/:id/assign-auditors`, `PATCH /audits/:id/items/:itemId`, `GET /audits/:id/discrepancy-report`, `POST /audits/:id/close`
- `GET /dashboard/kpis`, `GET /reports/utilization | /maintenance-frequency | /department-summary | /booking-heatmap | /due-soon`, `GET /reports/:name/export?format=csv` (CSV generated in code — no libraries needed)
- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `GET /activity-logs` (filterable), `GET /events` (SSE)

**RBAC middleware matrix** (route × role) enforced server-side; Department Heads additionally get row-level scoping (their department's assets/requests only). The frontend hides what the backend forbids, but the backend is the source of truth.

## 7. Validation & error handling (a grading focus)

- **Backend:** validate every request body/query/param with `zod` schemas per endpoint (types, required, email format, date sanity `ends_at > starts_at`, no bookings in the past, enum membership, string lengths). Reject unknown fields.
- **Frontend:** mirror validation for instant feedback — inline field errors on blur/submit, top-of-form summary for API errors, buttons disabled + spinner while pending, no double submits.
- **Graceful user errors:** every 409 renders as a friendly inline explanation with a next step (blocked allocation → "Request Transfer" button; overlapping booking → show the conflicting slot and nearest free slots). Toasts for success, persistent inline alerts for errors. Global error boundary + a designed 404/500 page. Empty states with guidance ("No assets yet — register your first asset"). Skeleton loaders, never blank screens.

## 8. UI/UX requirements

Build a small **design system first**: color tokens (one primary — e.g. deep teal/indigo — plus semantic green/amber/red/blue for statuses), 4/8px spacing scale, two font sizes hierarchy, and a shared component library: `Button, Input, Select, DatePicker, Modal, Drawer, Table (sortable+paginated), Tabs, Badge/StatusPill, Toast, EmptyState, Skeleton, ConfirmDialog`. Every asset/booking/maintenance status is a consistent color-coded pill used identically on every screen.

Layout: persistent sidebar (Dashboard, Organization Setup*, Assets, Allocation & Transfer, Resource Booking, Maintenance, Audit*, Reports, Notifications — items filtered by role), topbar with global search, notification bell (live unread count via SSE), user menu. Fully responsive: sidebar collapses to a drawer/bottom-nav on mobile, tables become cards.

The 10 screens (match the provided wireframes):
1. **Login/Signup** — signup states "creates an Employee account; admin assigns roles later"; forgot-password flow; session persistence.
2. **Dashboard** — 6 KPI cards (Available, Allocated, Maintenance Today, Active Bookings, Pending Transfers, Upcoming Returns), a red overdue banner separate from upcoming, quick actions, recent activity feed. Live-updates via SSE.
3. **Organization Setup** (Admin, 3 tabs) — Departments (head, optional parent, active toggle), Categories (with custom-field builder), Employee Directory (**the only place roles change**, with confirm dialog).
4. **Asset Registration & Directory** — register form (auto-tag preview), searchable/filterable table, asset detail page with photo gallery, QR code (render the tag as a QR client-side), allocation + maintenance history timeline.
5. **Allocation & Transfer** — allocate form; on conflict show the red "Already allocated to …" panel that morphs into a transfer request (exactly like the wireframe); pending-transfer approval queue; return flow modal with condition notes; overdue rows highlighted.
6. **Resource Booking** — per-resource week/day calendar grid built from scratch (no calendar library), existing bookings as blocks, drag-or-click slot creation, rejected overlaps shown on the grid with the conflicting block highlighted, my-bookings list with cancel/reschedule.
7. **Maintenance** — kanban board with columns Pending / Approved / Technician Assigned / In Progress / Resolved (per wireframe); raise-request modal with priority + photo; role-gated card actions.
8. **Audit** — cycle creation wizard (scope → dates → auditors), auditor checklist view with per-asset Verified/Missing/Damaged marks, auto discrepancy banner ("2 assets flagged — report generated"), close-cycle confirm explaining consequences, locked read-only view after close.
9. **Reports & Analytics** — utilization by department (bar), maintenance frequency (line), most-used vs idle lists, due-soon panel, booking heatmap (7×24 grid); charts hand-rolled as SVG or with one tiny chart lib; CSV export buttons.
10. **Activity Logs & Notifications** — filter chips (All / Alerts / Approvals / Bookings), relative timestamps ("2m ago"), mark-read, infinite scroll; separate admin-visible full activity log table.

**Real-time & dynamic dates everywhere:** all timestamps rendered relative + absolute on hover; KPI cards, notification bell, kanban, and booking statuses update without refresh (SSE-triggered refetch); seed data is generated **relative to the current date** so the demo always shows live overdue/upcoming/ongoing items.

## 9. Seed data (`npm run db:seed`)

1 Admin (`admin@assetflow.local` / documented password), 2 Asset Managers, 3 Department Heads, ~10 Employees; 5 departments (one nested); 6 categories (Electronics with warranty custom field); ~40 assets across all lifecycle states including AF-0114 allocated to a "Priya Shah"; bookable resources (Room B2, projector, van) with bookings placed relative to *now* (some ongoing, one ending at the top of the hour to demo back-to-back legality); maintenance requests in every kanban column; one open audit cycle with mixed marks; 2 overdue allocations; notification history.

## 10. Definition of done — demo script that must pass

1. Sign up → account is Employee; no role field exists anywhere in signup.
2. Admin promotes an Employee to Asset Manager from the directory; that user's sidebar gains manager screens after re-login/refresh.
3. Asset Manager registers an asset → tag auto-generates sequentially → status AVAILABLE.
4. Allocate AF-0114 to Priya → second allocation attempt for Raj is blocked with the holder named → transfer request → approval → history shows re-allocation.
5. Book Room B2 9:00–10:00 → 9:30–10:30 rejected with the conflict shown → 10:00–11:00 accepted.
6. Raise maintenance (asset unchanged) → approve (asset flips UNDER_MAINTENANCE) → resolve (flips back) — every step visible on the kanban and in notifications.
7. Create audit → mark one asset MISSING, one DAMAGED → discrepancy report auto-appears → close cycle → missing asset becomes LOST, cycle locks.
8. Dashboard shows overdue returns separately; scheduler flags a seeded overdue allocation; notification arrives without a page refresh.
9. Kill the API mid-use → frontend shows a graceful error state, not a crash.
10. `git log` shows clean conventional-commit history on feature branches.
