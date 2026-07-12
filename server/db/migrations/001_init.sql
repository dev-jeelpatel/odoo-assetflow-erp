-- AssetFlow initial schema
-- All money fields are for reporting only (no accounting integration).

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('ADMIN','ASSET_MANAGER','DEPT_HEAD','EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  department_id INT UNSIGNED NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_department (department_id),
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash VARCHAR(100) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token_hash)
) ENGINE=InnoDB;

CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  head_user_id INT UNSIGNED NULL,
  parent_department_id INT UNSIGNED NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dept_head FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_dept_parent FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE users
  ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE asset_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  custom_fields JSON NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Sequential AF-0001 tags: counter row is locked and incremented inside the
-- asset-insert transaction, so tags are gap-safe under concurrency.
CREATE TABLE tag_counters (
  name VARCHAR(30) PRIMARY KEY,
  next_value INT UNSIGNED NOT NULL
) ENGINE=InnoDB;
INSERT INTO tag_counters (name, next_value) VALUES ('asset_tag', 1);

CREATE TABLE assets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_tag VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  serial_number VARCHAR(120) NULL,
  acquisition_date DATE NULL,
  acquisition_cost DECIMAL(12,2) NULL,
  cond ENUM('NEW','GOOD','FAIR','POOR') NOT NULL DEFAULT 'GOOD',
  location VARCHAR(160) NULL,
  department_id INT UNSIGNED NULL,
  status ENUM('AVAILABLE','ALLOCATED','RESERVED','UNDER_MAINTENANCE','LOST','RETIRED','DISPOSED') NOT NULL DEFAULT 'AVAILABLE',
  is_bookable TINYINT(1) NOT NULL DEFAULT 0,
  custom_field_values JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assets_category FOREIGN KEY (category_id) REFERENCES asset_categories(id),
  CONSTRAINT fk_assets_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_assets_status (status),
  INDEX idx_assets_serial (serial_number),
  INDEX idx_assets_location (location),
  INDEX idx_assets_bookable (is_bookable)
) ENGINE=InnoDB;

CREATE TABLE asset_files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_af_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_af_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Active allocation = returned_at IS NULL. At most one active row per asset,
-- enforced in a transaction with SELECT ... FOR UPDATE on the asset row.
CREATE TABLE allocations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  allocated_to_user_id INT UNSIGNED NULL,
  allocated_to_department_id INT UNSIGNED NULL,
  allocated_by INT UNSIGNED NOT NULL,
  allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_return_date DATE NULL,
  returned_at DATETIME NULL,
  return_condition ENUM('NEW','GOOD','FAIR','POOR') NULL,
  return_condition_notes VARCHAR(500) NULL,
  returned_to INT UNSIGNED NULL,
  is_overdue_flagged TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alloc_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_user FOREIGN KEY (allocated_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_alloc_dept FOREIGN KEY (allocated_to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_alloc_by FOREIGN KEY (allocated_by) REFERENCES users(id),
  INDEX idx_alloc_active (asset_id, returned_at),
  INDEX idx_alloc_holder (allocated_to_user_id, returned_at),
  INDEX idx_alloc_due (expected_return_date, returned_at)
) ENGINE=InnoDB;

CREATE TABLE transfer_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  from_user_id INT UNSIGNED NULL,
  to_user_id INT UNSIGNED NULL,
  to_department_id INT UNSIGNED NULL,
  reason VARCHAR(500) NULL,
  status ENUM('REQUESTED','APPROVED','REJECTED','COMPLETED') NOT NULL DEFAULT 'REQUESTED',
  requested_by INT UNSIGNED NOT NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tr_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tr_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tr_todept FOREIGN KEY (to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_tr_reqby FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_tr_decby FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tr_status (status)
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  booked_by INT UNSIGNED NOT NULL,
  on_behalf_of_department_id INT UNSIGNED NULL,
  purpose VARCHAR(300) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('UPCOMING','ONGOING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'UPCOMING',
  reminder_sent TINYINT(1) NOT NULL DEFAULT 0,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bk_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_bk_user FOREIGN KEY (booked_by) REFERENCES users(id),
  CONSTRAINT fk_bk_dept FOREIGN KEY (on_behalf_of_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_bk_slot (asset_id, starts_at, ends_at),
  INDEX idx_bk_status (status)
) ENGINE=InnoDB;

CREATE TABLE maintenance_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id INT UNSIGNED NOT NULL,
  raised_by INT UNSIGNED NOT NULL,
  issue_description VARCHAR(1000) NOT NULL,
  priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  photo_path VARCHAR(255) NULL,
  status ENUM('PENDING','APPROVED','REJECTED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'PENDING',
  technician_name VARCHAR(120) NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_notes VARCHAR(500) NULL,
  resolution_notes VARCHAR(1000) NULL,
  resolved_at DATETIME NULL,
  -- status the asset held before maintenance, so resolution can restore it
  previous_asset_status ENUM('AVAILABLE','ALLOCATED') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mr_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_raised FOREIGN KEY (raised_by) REFERENCES users(id),
  CONSTRAINT fk_mr_decided FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_mr_status (status),
  INDEX idx_mr_asset (asset_id)
) ENGINE=InnoDB;

CREATE TABLE audit_cycles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  scope_department_id INT UNSIGNED NULL,
  scope_location VARCHAR(160) NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_by INT UNSIGNED NOT NULL,
  closed_by INT UNSIGNED NULL,
  closed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ac_dept FOREIGN KEY (scope_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_ac_created FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_ac_closed FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT UNSIGNED NOT NULL,
  auditor_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cycle_auditor (cycle_id, auditor_user_id),
  CONSTRAINT fk_aa_cycle FOREIGN KEY (cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_user FOREIGN KEY (auditor_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  expected_location VARCHAR(160) NULL,
  verification ENUM('PENDING','VERIFIED','MISSING','DAMAGED') NOT NULL DEFAULT 'PENDING',
  notes VARCHAR(500) NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  UNIQUE KEY uq_cycle_asset (cycle_id, asset_id),
  CONSTRAINT fk_ai_cycle FOREIGN KEY (cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ai_verification (verification)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  entity_type VARCHAR(40) NULL,
  entity_id INT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, read_at, created_at)
) ENGINE=InnoDB;

-- Append-only audit trail of every state-changing action.
CREATE TABLE activity_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  summary VARCHAR(400) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_log_entity (entity_type, entity_id),
  INDEX idx_log_created (created_at)
) ENGINE=InnoDB;
