# Manual Test Data — AssetFlow (IT Company)

Copy/paste values for manually exercising every page after running `npm run db:seed`.
Everything here is IT-company themed to match the seeded dataset (12 departments,
~77 employees, ~237 assets). Login credentials for every seeded account:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@assetflow.local` | `Admin@1234` |
| Asset Manager | `rohan@assetflow.local` | `Password@123` |
| Asset Manager | `sara@assetflow.local` | `Password@123` |
| Dept Head (Engineering) | `aditi@assetflow.local` | `Password@123` |
| Dept Head (Human Resources) | `meera@assetflow.local` | `Password@123` |
| Employee | `priya@assetflow.local` | `Password@123` |

Every generated employee also uses `Password@123` — find their exact email in the
Employee Directory (Organization → Employees) if you need a specific department.

---

## 1. Organization Setup (Admin only)

### Departments tab — create a new department
```
Name:              Security Engineering
Parent department: Engineering
```
Then edit it: change status to Inactive, then back to Active, to test the toggle.

### Categories tab — create a new category
```
Name:        Software Licenses
Description: Per-seat SaaS and desktop software licenses
```
Add a custom field: `license_key` (text) — used later when registering an asset in this category.

### Employees tab — promote a role
Pick any `EMPLOYEE` from the directory (e.g. search "Karthik") and promote to
`DEPARTMENT_HEAD` or `ASSET_MANAGER`. Confirm the role pill updates and the
Employee Directory list re-sorts.

Also test: create a brand-new employee account directly from the directory (if
your build has this — it shipped recently):
```
Name:  Test Onboarding User
Email: test.onboarding@assetflow.local
Department: IT Support
Role:  EMPLOYEE
```

---

## 2. Asset Registration & Directory

### Register a new asset
```
Name:              MacBook Pro 16" M4
Category:          Laptops & Workstations
Serial Number:     MBP16-M4-9001
Acquisition Date:  (today's date)
Acquisition Cost:  265000
Condition:         NEW
Location:          HQ Floor 2
Department:        Engineering
Shared/Bookable:   No
Warranty (months): 12   (the category's custom field)
```
After saving, note the auto-generated tag (e.g. `AF-0238`) — use it below.

### Register a bookable resource
```
Name:      Executive Boardroom — Floor 5
Category:  Meeting Rooms
Location:  HQ Floor 5
Shared/Bookable: Yes
```

### Search/filter to test
- Search box: `MacBook` — should match every MacBook model across departments.
- Filter by category: `Servers & Networking`.
- Filter by status: `UNDER_MAINTENANCE` — should show the NAS and the projector.
- Filter by department: `DevOps & SRE`.
- Lookup by exact tag: `AF-0001` (Priya's MacBook — has full allocation history).

### Upload a file
Open any asset detail page → Files tab → upload any PNG/JPG under 5MB.

---

## 3. Asset Allocation & Transfer

### Allocate an available asset
Pick an `AVAILABLE` asset (e.g. **AF-0005 — HP EliteBook 840 G9**) and allocate:
```
Asset:                AF-0005
Employee:             any EMPLOYEE in the same department shown on the asset
Expected Return Date: 30 days from today
```

### Trigger the double-allocation block
Try allocating **AF-0001** (Dell/MacBook already held by Priya Shah) to anyone
else — should be blocked with "currently held by Priya Shah" and a **Transfer
Request** button.

### Transfer workflow
1. Request a transfer on an already-allocated asset (e.g. **AF-0003**, held by
   Ananya Iyer) to another employee, reason: `Ananya is offboarding; reassigning to team lead.`
2. As `rohan@assetflow.local` (Asset Manager) or the relevant Dept Head, approve
   or reject it from the Transfers tab.

### Return flow
Return **AF-0002** (Ishaan Gupta's MacBook Pro 14"):
```
Condition on return: FAIR
Notes: Minor scuff on lid corner, otherwise fully functional.
```

### Overdue returns
Filter Allocations by "Overdue" — should show at least 6 items (2 named + several
bulk-generated). Click through to confirm the days-overdue count matches.

---

## 4. Resource Booking

### Book a room
```
Resource:    Conference Room Alpha (AF-0184)
Date:        tomorrow
Time:        14:00 – 15:00
Purpose:     Quarterly roadmap review
```

### Trigger the overlap rejection
Book **Conference Room Alpha** for the *same day the seed already booked it*
(check today's date — there's an ONGOING booking right now) at an overlapping
time — should be rejected with the exact conflicting slot shown.

### Book a vehicle
```
Resource: Pool Car — Toyota Innova (or Honda City)
Date:     2 days from now
Time:     09:00 – 13:00
Purpose:  Vendor site visit — Andheri office
```

### Reschedule / cancel
Reschedule any `UPCOMING` booking you just created to a different hour; then
cancel a different one and confirm it disappears from "My Bookings" active list.

---

## 5. Maintenance Management

### Raise a request (with a photo)
```
Asset:      AF-0011 — HP LaserJet Pro Printer
Issue:      Toner low warning showing constantly, but toner was just replaced.
Priority:   MEDIUM
Photo:      any PNG/JPG
```

### Raise a critical request
```
Asset:      AF-0192 — Poly Studio X30 Conference Cam
Issue:      Camera feed freezes randomly during client calls; rebooted twice, issue persists.
Priority:   CRITICAL
```

### Walk the full Kanban workflow
As `rohan@assetflow.local`:
1. Approve the printer request → asset flips to `UNDER_MAINTENANCE`.
2. Assign technician: `V. Kulkarni — Office Support`.
3. Move to In Progress.
4. Resolve: `Reseated toner cartridge and cleaned sensor contacts.` → asset flips back to `AVAILABLE`.

### Reject a request
Raise a low-priority one on any asset and reject it as Asset Manager with reason
`Duplicate of an already-open ticket.`

---

## 6. Asset Audit

### Create a new audit cycle
```
Name:            Annual Physical Verification — Sales & Marketing
Scope:           Department = Sales & Marketing
Start date:      today
End date:        14 days from today
Auditors:        pick 2 employees from Sales & Marketing or IT Support
```

### Verify items
Open the cycle and mark a handful of items:
- Mark 1–2 as `MISSING` (note: `"Not at assigned desk; employee on WFH, checking with them."`)
- Mark 1 as `DAMAGED` (note: `"Keyboard has 3 non-responsive keys."`)
- Leave the rest `VERIFIED` or `PENDING`.

### Close the cycle
Close it and confirm:
- Missing items → asset status flips to `LOST`.
- Discrepancy report shows the correct missing/damaged counts.

### Inspect the pre-seeded audits
- **Q3 Asset Audit — Engineering** (OPEN, ~29 items) — has a mix of Verified/Missing/Damaged/Pending already; good for testing the discrepancy report and closing flow without registering new data.
- **Server Room Infrastructure Audit** (OPEN, location-scoped) — tests location-based scoping instead of department-based.
- **Q1 Asset Audit — Company-wide** (CLOSED) — read-only view; confirms locked cycles can't be edited.

---

## 7. Reports & Analytics

No input needed — just page through each tab and confirm real numbers render:
- **Utilization** — bar chart + department summary table (12 departments).
- **Maintenance Frequency** — line chart across the last 6 months.
- **Due Soon** — returns due + nearing-retirement assets (several 5+ year old items exist, e.g. the Legacy Tower PC).
- **Booking Heatmap** — should show real clustering around 9am–6pm on weekdays from the 56 seeded bookings.
- Export each as CSV and confirm the file downloads with real rows.

---

## 8. Notifications & Activity Log

- Log in as `priya@assetflow.local` — check the notification bell for the
  "asset assigned" notification from seeding.
- Perform any action above (allocate, approve maintenance, close an audit) as
  Admin/Asset Manager, then check the Activity Log page — the new entry should
  appear at the top with correct actor, timestamp, and summary.

---

## 9. Profile / Account Settings

- Log in as any seeded user, open Profile, and change the password to something
  new — then log out and log back in with the new password to confirm it took.
- Toggle notification preferences (if present) and confirm the change persists
  after a page refresh.

---

## Quick reference — useful seeded IDs

| What | Value |
|---|---|
| Asset with full history (allocated → transferred → returned) | `AF-0001`, `AF-0002` |
| Asset already `UNDER_MAINTENANCE` | `AF-0009` (NAS), or check Maintenance page |
| Asset already `LOST` | search status filter `LOST` |
| Asset already `RETIRED` | Legacy Tower PC |
| Bookable meeting rooms | `AF-0184`–`AF-0191` |
| Bookable vehicles | search "Pool Car" or "Shuttle Van" |
| Department with the most employees | Engineering (12) |
| Department with fewest employees | Legal & Compliance / Executive Leadership (3 each) |
