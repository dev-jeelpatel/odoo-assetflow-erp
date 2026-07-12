# AssetFlow API (backend)

Express + Prisma + MySQL implementation of the AssetFlow ERP backend.

## Modules

| Module | Path |
| --- | --- |
| Auth (signup/login/refresh/forgot-password) | `src/auth` |
| Organization Setup (departments, categories, employee directory + role promotion) | `src/organizations` |
| Asset Registration & Directory | `src/assets` |
| Asset Allocation & Transfer | `src/allocations` |
| Resource Booking | `src/bookings` |
| Maintenance Management | `src/maintenance` |
| Asset Audit | `src/audits` |
| Reports & Analytics + Dashboard KPIs | `src/reports` |
| Notifications | `src/notifications` |
| Activity Logs | `src/logs` |
| Background jobs (booking status sync, reminders, overdue returns, audit reminders) | `src/workers` |

## Setup

```bash
# from the repo root
docker compose up -d mysql redis

cd backend
cp .env.example .env   # adjust secrets if needed
npm install
npm run prisma:migrate   # applies migrations + generates the Prisma client
npm run prisma:seed      # creates the initial ADMIN account (see .env for credentials)
npm run dev               # starts the API on http://localhost:4000
```

The MySQL container is mapped to host port `33061` (not `3306`) to avoid clashing with
any locally installed MySQL service. Adjust `DATABASE_URL` in `.env` if you change this.

On first boot, `docker/mysql-init/01-grant.sql` (mounted into the container) grants the
`assetflow` user broader privileges — Prisma Migrate needs to create/drop a temporary
shadow database to compute migration diffs, which requires more than single-schema access.
This only runs once, against an empty data volume; if you've already started the container,
run `docker compose down -v` first so the init script re-runs on the next `up`.

## Auth model

- `POST /api/v1/auth/signup` always creates an `EMPLOYEE` account — there is no self-service
  role selection.
- The seeded Admin (`npm run prisma:seed`) is the only account that starts with elevated
  privileges. From there, an Admin promotes employees to `ASSET_MANAGER` / `DEPARTMENT_HEAD`
  via `PATCH /api/v1/organization/employees/:id/role`.

## Health check

`GET /health` — liveness probe, no auth required.
