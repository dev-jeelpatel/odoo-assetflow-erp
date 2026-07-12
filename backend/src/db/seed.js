/**
 * Demo seed. All dates are computed relative to *now* so the app always shows
 * live overdue returns, an ongoing booking, and upcoming reminders.
 * Wipes existing data first (dev-only tool).
 *
 * Every seeded account uses the password documented in the README:
 *   admin@assetflow.local / Admin@1234   (and Password@123 for the rest)
 */
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { toSqlDateTime, toLocalDateStr } from '../utils/dates.js';

const day = 24 * 60 * 60 * 1000;
const now = new Date();
const at = (offsetDays, hour = 9, minute = 0) => {
  const d = new Date(now.getTime() + offsetDays * day);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const sql = toSqlDateTime;
const dateOnly = toLocalDateStr;

async function main() {
  console.log('Seeding AssetFlow demo data (relative to', now.toISOString(), ')');
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
      'activity_logs', 'notifications', 'audit_items', 'audit_assignments', 'audit_cycles',
      'maintenance_requests', 'bookings', 'transfer_requests', 'allocations', 'asset_files',
      'assets', 'asset_categories', 'password_resets', 'users', 'departments',
    ]) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query(`UPDATE tag_counters SET next_value = 1 WHERE name = 'asset_tag'`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ---------- departments ----------
    const deptNames = ['Engineering', 'Facilities', 'Human Resources', 'Field Ops', 'Field Ops (East)'];
    const deptIds = {};
    for (const name of deptNames) {
      const [r] = await conn.query('INSERT INTO departments (name) VALUES (?)', [name]);
      deptIds[name] = r.insertId;
    }
    await conn.query('UPDATE departments SET parent_department_id = ? WHERE id = ?', [
      deptIds['Field Ops'], deptIds['Field Ops (East)'],
    ]);

    // ---------- users ----------
    const adminHash = await bcrypt.hash('Admin@1234', 10);
    const userHash = await bcrypt.hash('Password@123', 10);
    const users = [
      ['Anaya Deshmukh', 'admin@assetflow.local', adminHash, 'ADMIN', null],
      ['Rohan Mehta', 'rohan@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['Facilities']],
      ['Sara Iqbal', 'sara@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['Field Ops']],
      ['Aditi Rao', 'aditi@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Engineering']],
      ['Vikram Nair', 'vikram@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Facilities']],
      ['Meera Pillai', 'meera@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Human Resources']],
      ['Priya Shah', 'priya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Raj Malhotra', 'raj@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Arjun Nair', 'arjun@assetflow.local', userHash, 'EMPLOYEE', deptIds['Facilities']],
      ['Divya Krishnan', 'divya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Human Resources']],
      ['Kabir Bose', 'kabir@assetflow.local', userHash, 'EMPLOYEE', deptIds['Field Ops']],
      ['Nisha Verma', 'nisha@assetflow.local', userHash, 'EMPLOYEE', deptIds['Field Ops (East)']],
      ['Ishaan Gupta', 'ishaan@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
    ];
    const uid = {};
    for (const [name, email, hash, role, dept] of users) {
      const [r] = await conn.query(
        'INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)',
        [name, email, hash, role, dept]
      );
      uid[name.split(' ')[0]] = r.insertId;
    }
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Aditi, deptIds['Engineering']]);
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Vikram, deptIds['Facilities']]);
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Meera, deptIds['Human Resources']]);

    // ---------- categories ----------
    const cats = [
      ['Electronics', 'Laptops, monitors, projectors, cameras', [{ key: 'warranty_months', label: 'Warranty (months)', type: 'number' }]],
      ['Furniture', 'Chairs, desks, storage', null],
      ['Vehicles', 'Vans, forklifts', [{ key: 'registration_no', label: 'Registration No.', type: 'text' }]],
      ['Meeting Rooms', 'Bookable shared rooms', null],
      ['Appliances', 'AC units, printers, water dispensers', null],
      ['AV Equipment', 'Speakers, mics, conferencing gear', null],
    ];
    const cid = {};
    for (const [name, desc, fields] of cats) {
      const [r] = await conn.query(
        'INSERT INTO asset_categories (name, description, custom_fields) VALUES (?, ?, ?)',
        [name, desc, fields ? JSON.stringify(fields) : null]
      );
      cid[name] = r.insertId;
    }

    // ---------- assets ----------
    let tagNo = 0;
    const nextTag = () => `AF-${String(++tagNo).padStart(4, '0')}`;
    const aid = {};
    async function addAsset(key, { name, cat, serial = null, acqYearsAgo = 1, cost = null, cond = 'GOOD', location, dept = null, status = 'AVAILABLE', bookable = false, cfv = null }) {
      const tag = nextTag();
      const [r] = await conn.query(
        `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
                             cond, location, department_id, status, is_bookable, custom_field_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tag, name, cid[cat], serial, dateOnly(at(-Math.round(acqYearsAgo * 365))), cost, cond, location,
         dept ? deptIds[dept] : null, status, bookable ? 1 : 0, cfv ? JSON.stringify(cfv) : null]
      );
      aid[key] = { id: r.insertId, tag, name };
      return r.insertId;
    }

    // Laptops & electronics (some allocated below)
    await addAsset('lap1', { name: 'Dell Latitude 5440', cat: 'Electronics', serial: 'DL5440-8821', acqYearsAgo: 1.2, cost: 78000, location: 'HQ Floor 1', dept: 'Engineering', status: 'ALLOCATED', cfv: { warranty_months: 36 } });
    await addAsset('lap2', { name: 'Dell Latitude 5440', cat: 'Electronics', serial: 'DL5440-8822', acqYearsAgo: 1.2, cost: 78000, location: 'HQ Floor 1', dept: 'Engineering', status: 'ALLOCATED', cfv: { warranty_months: 36 } });
    await addAsset('lap3', { name: 'MacBook Air M2', cat: 'Electronics', serial: 'MBA-M2-1103', acqYearsAgo: 0.8, cost: 114000, location: 'HQ Floor 2', dept: 'Engineering', cfv: { warranty_months: 12 } });
    await addAsset('lap4', { name: 'Lenovo ThinkPad T14', cat: 'Electronics', serial: 'LT14-5520', acqYearsAgo: 2.1, cost: 92000, location: 'HQ Floor 2', dept: 'Human Resources', status: 'ALLOCATED' });
    await addAsset('lap5', { name: 'HP EliteBook 840', cat: 'Electronics', serial: 'HP840-3311', acqYearsAgo: 4.5, cost: 85000, cond: 'FAIR', location: 'Warehouse', dept: 'Engineering' });
    await addAsset('proj1', { name: 'Epson Projector EB-X51', cat: 'Electronics', serial: 'EP-X51-901', acqYearsAgo: 2.3, cost: 42000, location: 'HQ Floor 2', status: 'UNDER_MAINTENANCE' });
    await addAsset('proj2', { name: 'BenQ Projector MW560', cat: 'Electronics', serial: 'BQ-560-112', acqYearsAgo: 1.5, cost: 46000, location: 'HQ Floor 3', bookable: true });
    await addAsset('cam1', { name: 'Canon EOS R50 Camera', cat: 'Electronics', serial: 'CN-R50-778', acqYearsAgo: 1.0, cost: 65000, location: 'Media Room', bookable: true });
    await addAsset('mon1', { name: 'LG 27" Monitor', cat: 'Electronics', serial: 'LG27-4432', acqYearsAgo: 3.2, cost: 18500, location: 'HQ Floor 1', dept: 'Engineering' });
    await addAsset('mon2', { name: 'LG 27" Monitor', cat: 'Electronics', serial: 'LG27-4433', acqYearsAgo: 3.2, cost: 18500, location: 'HQ Floor 1', dept: 'Engineering' });

    // Furniture
    await addAsset('chair1', { name: 'Ergonomic Office Chair', cat: 'Furniture', acqYearsAgo: 2.0, cost: 12500, location: 'HQ Floor 1', dept: 'Engineering' });
    await addAsset('chair2', { name: 'Ergonomic Office Chair', cat: 'Furniture', acqYearsAgo: 2.0, cost: 12500, cond: 'FAIR', location: 'HQ Floor 2', dept: 'Human Resources' });
    await addAsset('desk1', { name: 'Standing Desk', cat: 'Furniture', acqYearsAgo: 1.4, cost: 24000, location: 'HQ Floor 1', dept: 'Engineering', status: 'ALLOCATED' });
    await addAsset('cab1', { name: 'Steel Storage Cabinet', cat: 'Furniture', acqYearsAgo: 5.1, cost: 9000, cond: 'POOR', location: 'Warehouse' });

    // Vehicles
    await addAsset('van1', { name: 'Delivery Van (Tata Ace)', cat: 'Vehicles', serial: 'GJ-05-AB-3343', acqYearsAgo: 3.8, cost: 520000, location: 'Parking Bay 1', dept: 'Field Ops', bookable: true, cfv: { registration_no: 'GJ-05-AB-3343' } });
    await addAsset('fork1', { name: 'Forklift FLT-2T', cat: 'Vehicles', serial: 'FLT-0087', acqYearsAgo: 4.6, cost: 780000, cond: 'FAIR', location: 'Warehouse', dept: 'Field Ops' });

    // Meeting rooms (bookable)
    await addAsset('roomB2', { name: 'Conference Room B2', cat: 'Meeting Rooms', location: 'HQ Floor 2', bookable: true, acqYearsAgo: 6 });
    await addAsset('roomA1', { name: 'Meeting Room A1', cat: 'Meeting Rooms', location: 'HQ Floor 1', bookable: true, acqYearsAgo: 6 });
    await addAsset('huddle', { name: 'Huddle Space H3', cat: 'Meeting Rooms', location: 'HQ Floor 3', bookable: true, acqYearsAgo: 3 });

    // Appliances & AV
    await addAsset('ac1', { name: 'Split AC Unit 1.5T', cat: 'Appliances', serial: 'AC-1552', acqYearsAgo: 4.2, cost: 38000, cond: 'FAIR', location: 'HQ Floor 2' });
    await addAsset('printer1', { name: 'HP LaserJet Pro Printer', cat: 'Appliances', serial: 'HPLJ-897', acqYearsAgo: 2.7, cost: 27000, location: 'HQ Floor 1' });
    await addAsset('mic1', { name: 'Wireless Conference Mic Set', cat: 'AV Equipment', serial: 'MIC-2210', acqYearsAgo: 1.1, cost: 15500, location: 'Media Room', bookable: true });
    await addAsset('spk1', { name: 'Portable PA Speaker', cat: 'AV Equipment', serial: 'SPK-1174', acqYearsAgo: 2.9, cost: 22000, location: 'Media Room' });
    await addAsset('old1', { name: 'Legacy Tower PC', cat: 'Electronics', serial: 'PC-0091', acqYearsAgo: 7.5, cost: 45000, cond: 'POOR', location: 'Warehouse', status: 'RETIRED' });
    await addAsset('lost1', { name: 'GoPro Hero 9', cat: 'Electronics', serial: 'GP9-3341', acqYearsAgo: 3.4, cost: 32000, location: 'Media Room', status: 'LOST' });

    // Seeded assets were tagged directly (AF-0001..AF-00xx) without going through
    // the shared tag_counters row, so the real "register asset" endpoint would
    // immediately collide on AF-0001. Sync the counter to the last tag used here.
    await conn.query(`UPDATE tag_counters SET next_value = ? WHERE name = 'asset_tag'`, [tagNo + 1]);

    // ---------- allocations ----------
    async function allocate({ assetKey, toUser = null, toDept = null, by, daysAgo, dueInDays = null, returned = null }) {
      const [r] = await conn.query(
        `INSERT INTO allocations (asset_id, allocated_to_user_id, allocated_to_department_id, allocated_by,
                                  allocated_at, expected_return_date, returned_at, return_condition, return_condition_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aid[assetKey].id, toUser ? uid[toUser] : null, toDept ? deptIds[toDept] : null, uid[by],
         sql(at(-daysAgo, 10)), dueInDays === null ? null : dateOnly(at(dueInDays)),
         returned ? sql(at(-returned.daysAgo, 16)) : null,
         returned?.condition ?? null, returned?.notes ?? null]
      );
      return r.insertId;
    }

    // The star of the demo: Priya holds AF-0001 (Dell laptop).
    await allocate({ assetKey: 'lap1', toUser: 'Priya', by: 'Rohan', daysAgo: 45, dueInDays: 30 });
    await allocate({ assetKey: 'lap2', toUser: 'Ishaan', by: 'Rohan', daysAgo: 30, dueInDays: 14 });
    await allocate({ assetKey: 'lap4', toUser: 'Divya', by: 'Sara', daysAgo: 60, dueInDays: -3 });   // OVERDUE
    await allocate({ assetKey: 'desk1', toUser: 'Raj', by: 'Rohan', daysAgo: 90, dueInDays: null });
    // Historical (returned) allocations for the history timeline.
    await allocate({ assetKey: 'lap5', toUser: 'Arjun', by: 'Rohan', daysAgo: 200, dueInDays: null, returned: { daysAgo: 120, condition: 'GOOD', notes: 'Returned in good shape' } });
    await allocate({ assetKey: 'cam1', toUser: 'Kabir', by: 'Sara', daysAgo: 75, dueInDays: null, returned: { daysAgo: 70, condition: 'GOOD', notes: 'Lens cap missing' } });
    // Second overdue one (department allocation).
    await allocate({ assetKey: 'fork1', toDept: 'Field Ops', by: 'Sara', daysAgo: 40, dueInDays: -6 }); // OVERDUE
    await conn.query(`UPDATE assets SET status='ALLOCATED' WHERE id = ?`, [aid.fork1.id]);

    // ---------- transfer request (pending, for the approval queue) ----------
    await conn.query(
      `INSERT INTO transfer_requests (asset_id, from_user_id, to_user_id, reason, status, requested_by, created_at)
       VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?)`,
      [aid.lap2.id, uid.Ishaan, uid.Raj, 'Ishaan is moving to the Pune office; Raj takes over the project rig.', uid.Raj, sql(at(-1, 11))]
    );

    // ---------- bookings ----------
    async function book({ assetKey, by, dayOffset, fromH, toH, status = null, purpose = null, dept = null }) {
      const starts = at(dayOffset, fromH, 0);
      const ends = at(dayOffset, toH, 0);
      const computed = status ?? (ends <= now ? 'COMPLETED' : starts <= now ? 'ONGOING' : 'UPCOMING');
      await conn.query(
        `INSERT INTO bookings (asset_id, booked_by, on_behalf_of_department_id, purpose, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [aid[assetKey].id, uid[by], dept ? deptIds[dept] : null, purpose, sql(starts), sql(ends), computed]
      );
    }

    const h = now.getHours();
    // An ONGOING booking right now (current hour → +2h).
    await book({ assetKey: 'roomB2', by: 'Priya', dayOffset: 0, fromH: h, toH: Math.min(h + 2, 23), purpose: 'Sprint planning' });
    // Back-to-back demo slot later today or tomorrow.
    await book({ assetKey: 'roomB2', by: 'Divya', dayOffset: h >= 20 ? 1 : 0, fromH: h >= 20 ? 9 : Math.min(h + 3, 22), toH: h >= 20 ? 10 : Math.min(h + 4, 23), purpose: 'HR onboarding' });
    await book({ assetKey: 'roomA1', by: 'Raj', dayOffset: 1, fromH: 9, toH: 10, purpose: 'Client call' });
    await book({ assetKey: 'roomA1', by: 'Meera', dayOffset: 1, fromH: 14, toH: 16, purpose: 'Interviews', dept: 'Human Resources' });
    await book({ assetKey: 'van1', by: 'Kabir', dayOffset: 2, fromH: 8, toH: 18, purpose: 'Site equipment delivery', dept: 'Field Ops' });
    await book({ assetKey: 'proj2', by: 'Aditi', dayOffset: 3, fromH: 11, toH: 13, purpose: 'All-hands demo' });
    // History for the heatmap (past 3 weeks, spread across weekdays).
    for (let i = 1; i <= 18; i++) {
      const offset = -Math.ceil(i / 2);
      const start = 9 + (i % 6);
      await book({
        assetKey: ['roomB2', 'roomA1', 'huddle', 'van1', 'cam1', 'mic1'][i % 6],
        by: ['Priya', 'Raj', 'Divya', 'Kabir', 'Arjun', 'Nisha'][i % 6],
        dayOffset: offset, fromH: start, toH: start + 1 + (i % 2),
        purpose: 'Team session',
      });
    }

    // ---------- maintenance requests (one per kanban column) ----------
    async function maint({ assetKey, by, status, priority, issue, tech = null, daysAgo, prevStatus = 'AVAILABLE', decidedBy = null }) {
      const [r] = await conn.query(
        `INSERT INTO maintenance_requests (asset_id, raised_by, issue_description, priority, status, technician_name,
                                           decided_by, decided_at, previous_asset_status, resolution_notes, resolved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aid[assetKey].id, uid[by], issue, priority, status, tech,
         decidedBy ? uid[decidedBy] : null, decidedBy ? sql(at(-daysAgo + 0.2, 15)) : null,
         ['APPROVED', 'TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(status) ? prevStatus : null,
         status === 'RESOLVED' ? 'Replaced faulty part; tested OK.' : null,
         status === 'RESOLVED' ? sql(at(-daysAgo + 2, 17)) : null,
         sql(at(-daysAgo, 10))]
      );
      return r.insertId;
    }
    await maint({ assetKey: 'printer1', by: 'Divya', status: 'PENDING', priority: 'MEDIUM', issue: 'Paper jam recurring on tray 2; prints have grey streaks.', daysAgo: 0.5 });
    await maint({ assetKey: 'ac1', by: 'Arjun', status: 'APPROVED', priority: 'HIGH', issue: 'Compressor making loud rattling noise; cooling weak.', daysAgo: 2, decidedBy: 'Rohan' });
    await maint({ assetKey: 'proj1', by: 'Priya', status: 'IN_PROGRESS', priority: 'HIGH', issue: 'Projector bulb not turning on; likely lamp failure.', tech: 'R. Varma', daysAgo: 4, decidedBy: 'Rohan' });
    await maint({ assetKey: 'spk1', by: 'Nisha', status: 'TECHNICIAN_ASSIGNED', priority: 'LOW', issue: 'Crackling sound at high volume.', tech: 'S. Kulkarni', daysAgo: 3, decidedBy: 'Sara' });
    await maint({ assetKey: 'chair2', by: 'Divya', status: 'RESOLVED', priority: 'LOW', issue: 'Hydraulic lift sinking slowly.', tech: 'FixIt Services', daysAgo: 12, decidedBy: 'Rohan' });
    await maint({ assetKey: 'cab1', by: 'Arjun', status: 'REJECTED', priority: 'LOW', issue: 'Door hinge squeaks.', daysAgo: 8, decidedBy: 'Rohan' });

    // ---------- audit cycle (open, mixed marks) ----------
    const [auditR] = await conn.query(
      `INSERT INTO audit_cycles (name, scope_department_id, starts_on, ends_on, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
      [`Q3 Audit — Engineering`, deptIds['Engineering'], dateOnly(at(-5)), dateOnly(at(9)), uid.Rohan, sql(at(-5, 9))]
    );
    const cycleId = auditR.insertId;
    for (const auditor of ['Aditi', 'Arjun']) {
      await conn.query('INSERT INTO audit_assignments (cycle_id, auditor_user_id) VALUES (?, ?)', [cycleId, uid[auditor]]);
    }
    const [engAssets] = await conn.query('SELECT id, location FROM assets WHERE department_id = ?', [deptIds['Engineering']]);
    for (const [i, a] of engAssets.entries()) {
      const mark = i === 1 ? 'MISSING' : i === 3 ? 'DAMAGED' : i < 5 ? 'VERIFIED' : 'PENDING';
      await conn.query(
        `INSERT INTO audit_items (cycle_id, asset_id, expected_location, verification, notes, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cycleId, a.id, a.location, mark,
         mark === 'MISSING' ? 'Not at expected desk; last seen two weeks ago' : mark === 'DAMAGED' ? 'Screen cracked in corner' : null,
         mark === 'PENDING' ? null : uid.Aditi, mark === 'PENDING' ? null : sql(at(-1, 14))]
      );
    }

    // ---------- notifications & activity ----------
    const notif = (user, type, title, body, minsAgo) =>
      conn.query(
        `INSERT INTO notifications (user_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)`,
        [uid[user], type, title, body, sql(new Date(now.getTime() - minsAgo * 60000))]
      );
    await notif('Priya', 'ASSET_ASSIGNED', `${aid.lap1.tag} Dell Latitude 5440 assigned to you`, 'Expected return in 30 days', 2);
    await notif('Divya', 'MAINTENANCE_APPROVED', 'Maintenance request approved', 'AC unit repair approved by Rohan Mehta', 18);
    await notif('Priya', 'BOOKING_CONFIRMED', 'Booking confirmed: Conference Room B2', 'Sprint planning session', 60);
    await notif('Raj', 'TRANSFER_REQUESTED', `Transfer request raised for ${aid.lap2.tag}`, 'Awaiting Asset Manager approval', 180);
    await notif('Divya', 'OVERDUE_RETURN', `Overdue: ${aid.lap4.tag} Lenovo ThinkPad T14`, 'Was due back 3 days ago', 1440);

    const log = (actor, action, type, summary, minsAgo) =>
      conn.query(
        `INSERT INTO activity_logs (actor_user_id, action, entity_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
        [actor ? uid[actor] : null, action, type, summary, sql(new Date(now.getTime() - minsAgo * 60000))]
      );
    await log('Rohan', 'ASSET_ALLOCATED', 'asset', `${aid.lap1.tag} Dell Latitude 5440 allocated to Priya Shah (Engineering)`, 2);
    await log('Priya', 'BOOKING_CREATED', 'booking', 'Conference Room B2 booked for sprint planning', 60);
    await log('Rohan', 'MAINTENANCE_APPROVED', 'maintenance', 'AC unit repair approved — asset now Under Maintenance', 18);
    await log('Aditi', 'AUDIT_ITEM_MARKED', 'audit', 'Asset marked missing in "Q3 Audit — Engineering"', 300);
    await log('Anaya', 'ROLE_CHANGED', 'user', 'Rohan Mehta: EMPLOYEE → ASSET_MANAGER', 10000);

    console.log('Seed complete.');
    console.log('  Admin:          admin@assetflow.local / Admin@1234');
    console.log('  Asset Manager:  rohan@assetflow.local / Password@123');
    console.log('  Dept Head:      aditi@assetflow.local / Password@123');
    console.log('  Employee:       priya@assetflow.local / Password@123');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
