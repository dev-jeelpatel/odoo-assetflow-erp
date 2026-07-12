// Shared utility helpers

/** Format a date string as "Jul 12, 2026" */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a datetime string as "Jul 12, 10:30 AM" */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Relative time: "2m ago", "3d ago", etc. */
export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(d);
}

/** Map asset/booking/etc status to its CSS pill class. */
export function statusPill(status: string): string {
  return `pill pill-${status.toLowerCase().replace('_', '-').replace('under-', '')}`;
}

/** Map a status enum value to a display label. */
export function prettyStatus(s: string): string {
  const map: Record<string, string> = {
    AVAILABLE: 'Available', ALLOCATED: 'Allocated', RESERVED: 'Reserved',
    UNDER_MAINTENANCE: 'Maintenance', LOST: 'Lost', RETIRED: 'Retired',
    DISPOSED: 'Disposed', UPCOMING: 'Upcoming', ONGOING: 'Ongoing',
    COMPLETED: 'Completed', CANCELLED: 'Cancelled', PENDING: 'Pending',
    APPROVED: 'Approved', REJECTED: 'Rejected', REQUESTED: 'Requested',
    TECHNICIAN_ASSIGNED: 'Tech Assigned', IN_PROGRESS: 'In Progress',
    RESOLVED: 'Resolved', OPEN: 'Open', CLOSED: 'Closed',
    VERIFIED: 'Verified', MISSING: 'Missing', DAMAGED: 'Damaged',
    ADMIN: 'Admin', ASSET_MANAGER: 'Asset Manager', DEPT_HEAD: 'Dept Head', EMPLOYEE: 'Employee',
    LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
    ACTIVE: 'Active', INACTIVE: 'Inactive',
    NEW: 'New', GOOD: 'Good', FAIR: 'Fair', POOR: 'Poor',
  };
  return map[s] ?? s;
}

export function rolePill(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'pill pill-admin',
    ASSET_MANAGER: 'pill pill-manager',
    DEPT_HEAD: 'pill pill-depthead',
    EMPLOYEE: 'pill pill-employee',
  };
  return map[role] ?? 'pill pill-employee';
}

/** Format currency */
export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

/** Build a query string from an object, omitting undefined/null values */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Debounce a callback */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

/** Clamp number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

/** Get initials from a name */
export function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Pill CSS for maintenance status (same as general status but mapped) */
export function maintenancePill(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'pill pill-pending',
    APPROVED: 'pill pill-approved',
    REJECTED: 'pill pill-rejected',
    TECHNICIAN_ASSIGNED: 'pill pill-reserved',
    IN_PROGRESS: 'pill pill-maintenance',
    RESOLVED: 'pill pill-available',
  };
  return map[status] ?? 'pill';
}
