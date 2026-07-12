-- Dedup flag for the scheduler's audit-cycle-ending-soon reminder, mirroring
-- the reminder_sent / is_overdue_flagged pattern already used on bookings
-- and allocations.
ALTER TABLE audit_cycles ADD COLUMN reminder_sent TINYINT(1) NOT NULL DEFAULT 0;
