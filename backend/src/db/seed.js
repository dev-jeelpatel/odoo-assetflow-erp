/**
 * Demo seed for a mid-size IT company. All dates are computed relative to
 * *now* so the app always shows live overdue returns, an ongoing booking,
 * and upcoming reminders. Wipes existing data first (dev-only tool).
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
  console.log('Seeding AssetFlow demo data for an IT company (relative to', now.toISOString(), ')');
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
    const deptNames = [
      'Engineering', 'QA & Testing', 'DevOps & Infrastructure', 'Product & Design',
      'IT Support', 'Human Resources', 'Sales & Marketing', 'Finance & Admin',
    ];
    const deptIds = {};
    for (const name of deptNames) {
      const [r] = await conn.query('INSERT INTO departments (name) VALUES (?)', [name]);
      deptIds[name] = r.insertId;
    }
    // QA reports up through Engineering, as is typical in a software org.
    await conn.query('UPDATE departments SET parent_department_id = ? WHERE id = ?', [
      deptIds['Engineering'], deptIds['QA & Testing'],
    ]);

    // ---------- users ----------
    const adminHash = await bcrypt.hash('Admin@1234', 10);
    const userHash = await bcrypt.hash('Password@123', 10);
    const users = [
      ['Anaya Deshmukh', 'admin@assetflow.local', adminHash, 'ADMIN', null],
      ['Rohan Mehta', 'rohan@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['IT Support']],
      ['Sara Iqbal', 'sara@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['DevOps & Infrastructure']],
      ['Aditi Rao', 'aditi@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Engineering']],
      ['Vikram Nair', 'vikram@assetflow.local', userHash, 'DEPT_HEAD', deptIds['QA & Testing']],
      ['Meera Pillai', 'meera@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Human Resources']],
      ['Priya Shah', 'priya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Raj Malhotra', 'raj@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Ishaan Gupta', 'ishaan@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Arjun Nair', 'arjun@assetflow.local', userHash, 'EMPLOYEE', deptIds['QA & Testing']],
      ['Ananya Iyer', 'ananya@assetflow.local', userHash, 'EMPLOYEE', deptIds['DevOps & Infrastructure']],
      ['Nisha Verma', 'nisha@assetflow.local', userHash, 'EMPLOYEE', deptIds['Product & Design']],
      ['Divya Krishnan', 'divya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Human Resources']],
      ['Kabir Bose', 'kabir@assetflow.local', userHash, 'EMPLOYEE', deptIds['Sales & Marketing']],
      ['Karan Desai', 'karan@assetflow.local', userHash, 'EMPLOYEE', deptIds['Finance & Admin']],
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
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Vikram, deptIds['QA & Testing']]);
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Meera, deptIds['Human Resources']]);

    // ---------- categories ----------
    const cats = [
      ['Laptops & Workstations', 'Developer laptops, engineering workstations', [{ key: 'warranty_months', label: 'Warranty (months)', type: 'number' }]],
      ['Monitors & Displays', 'External monitors and displays', null],
      ['Servers & Networking', 'Rack servers, switches, routers, UPS, NAS', [{ key: 'ip_address', label: 'IP Address', type: 'text' }]],
      ['Peripherals & Accessories', 'Keyboards, mice, webcams, docking stations', null],
      ['Furniture', 'Chairs, desks, storage', null],
      ['Meeting Rooms', 'Bookable shared conference rooms', null],
      ['AV & Conference Equipment', 'Conference cams, speakerphones, projectors, room TVs', null],
      ['Mobile Devices', 'Phones and tablets used for QA and design testing', [{ key: 'imei', label: 'IMEI', type: 'text' }]],
      ['Appliances', 'AC units, printers, pantry appliances', null],
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
    async function addAsset(key, { name, cat, serial = null, acqYearsAgo = 1, cost = null, cond = 'GOOD', location, dept = null, status = 'AVAILABLE', bookable = false, cfv = null, lifeYears = null }) {
      const tag = nextTag();
      const [r] = await conn.query(
        `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
                             cond, location, department_id, status, is_bookable, custom_field_values, useful_life_years)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tag, name, cid[cat], serial, dateOnly(at(-Math.round(acqYearsAgo * 365))), cost, cond, location,
         dept ? deptIds[dept] : null, status, bookable ? 1 : 0, cfv ? JSON.stringify(cfv) : null, lifeYears]
      );
      aid[key] = { id: r.insertId, tag, name };
      return r.insertId;
    }

    // Laptops & workstations
    await addAsset('lap1', { name: 'MacBook Pro 16" M3', cat: 'Laptops & Workstations', serial: 'MBP16-M3-2201', acqYearsAgo: 0.6, cost: 245000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 12 } });
    await addAsset('lap2', { name: 'MacBook Pro 14" M3', cat: 'Laptops & Workstations', serial: 'MBP14-M3-2202', acqYearsAgo: 0.6, cost: 205000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 12 } });
    await addAsset('lap3', { name: 'Dell XPS 15', cat: 'Laptops & Workstations', serial: 'DXPS15-3310', acqYearsAgo: 1.3, cost: 152000, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 4, cfv: { warranty_months: 36 } });
    await addAsset('lap4', { name: 'Lenovo ThinkPad X1 Carbon Gen 11', cat: 'Laptops & Workstations', serial: 'TPX1C-4471', acqYearsAgo: 1.0, cost: 178000, location: 'HQ Floor 3', dept: 'DevOps & Infrastructure', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 36 } });
    await addAsset('lap5', { name: 'Dell Latitude 5440', cat: 'Laptops & Workstations', serial: 'DL5440-8821', acqYearsAgo: 2.1, cost: 78000, location: 'HQ Floor 1', dept: 'Human Resources', status: 'ALLOCATED', lifeYears: 4 });
    await addAsset('lap6', { name: 'HP EliteBook 840 G9', cat: 'Laptops & Workstations', serial: 'HP840-3311', acqYearsAgo: 4.5, cost: 85000, cond: 'FAIR', location: 'Warehouse', dept: 'Sales & Marketing', lifeYears: 4 });
    await addAsset('lap7', { name: 'MacBook Air M2', cat: 'Laptops & Workstations', serial: 'MBA-M2-1103', acqYearsAgo: 2.8, cost: 114000, location: 'HQ Floor 2', dept: 'Product & Design', lifeYears: 4 });
    await addAsset('lap8', { name: 'Dell Precision 5570 Workstation', cat: 'Laptops & Workstations', serial: 'DP5570-990', acqYearsAgo: 1.5, cost: 220000, location: 'HQ Floor 3', dept: 'DevOps & Infrastructure', lifeYears: 5 });
    await addAsset('oldpc', { name: 'Legacy Tower PC', cat: 'Laptops & Workstations', serial: 'PC-0091', acqYearsAgo: 7.5, cost: 45000, cond: 'POOR', location: 'Warehouse', status: 'RETIRED', lifeYears: 5 });

    // Monitors & displays
    await addAsset('mon1', { name: 'Dell UltraSharp 27" U2723QE', cat: 'Monitors & Displays', serial: 'DU27-4432', acqYearsAgo: 1.2, cost: 46000, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 5 });
    await addAsset('mon2', { name: 'Dell UltraSharp 27" U2723QE', cat: 'Monitors & Displays', serial: 'DU27-4433', acqYearsAgo: 1.2, cost: 46000, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 5 });
    await addAsset('mon3', { name: 'LG 27" 4K UltraFine', cat: 'Monitors & Displays', serial: 'LG27-7781', acqYearsAgo: 2.2, cost: 38500, location: 'HQ Floor 2', dept: 'Product & Design', lifeYears: 5 });
    await addAsset('mon4', { name: 'Samsung 32" Curved Monitor', cat: 'Monitors & Displays', serial: 'SM32-2290', acqYearsAgo: 3.0, cost: 28000, cond: 'FAIR', location: 'HQ Floor 3', dept: 'DevOps & Infrastructure', lifeYears: 5 });

    // Servers & networking
    await addAsset('srv1', { name: 'Dell PowerEdge R750 Rack Server', cat: 'Servers & Networking', serial: 'PE-R750-0091', acqYearsAgo: 2.0, cost: 850000, location: 'Server Room', dept: 'DevOps & Infrastructure', lifeYears: 6, cfv: { ip_address: '10.20.4.11' } });
    await addAsset('sw1', { name: 'Cisco Catalyst 9300 Switch', cat: 'Servers & Networking', serial: 'CC9300-5541', acqYearsAgo: 1.8, cost: 120000, location: 'Server Room', dept: 'DevOps & Infrastructure', lifeYears: 7, cfv: { ip_address: '10.20.4.1' } });
    await addAsset('rtr1', { name: 'Ubiquiti Dream Machine Pro', cat: 'Servers & Networking', serial: 'UDM-P-8823', acqYearsAgo: 1.1, cost: 35000, location: 'Server Room', dept: 'IT Support', lifeYears: 5, cfv: { ip_address: '10.20.4.254' } });
    await addAsset('ups1', { name: 'APC Smart-UPS 1500VA', cat: 'Servers & Networking', serial: 'APC-1500-4471', acqYearsAgo: 2.5, cost: 45000, location: 'Server Room', dept: 'IT Support', lifeYears: 6 });
    await addAsset('nas1', { name: 'Synology NAS DS1821+', cat: 'Servers & Networking', serial: 'SYN-1821-771', acqYearsAgo: 1.6, cost: 65000, location: 'Server Room', dept: 'DevOps & Infrastructure', status: 'UNDER_MAINTENANCE', lifeYears: 6, cfv: { ip_address: '10.20.4.20' } });

    // Peripherals & accessories
    await addAsset('kb1', { name: 'Keychron K8 Mechanical Keyboard', cat: 'Peripherals & Accessories', serial: 'KC-K8-1120', acqYearsAgo: 0.8, cost: 7500, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 3 });
    await addAsset('ms1', { name: 'Logitech MX Master 3 Mouse', cat: 'Peripherals & Accessories', serial: 'LG-MX3-2291', acqYearsAgo: 0.8, cost: 8500, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 3 });
    await addAsset('webcam1', { name: 'Logitech Brio Webcam', cat: 'Peripherals & Accessories', serial: 'LG-BRIO-771', acqYearsAgo: 1.4, cost: 12000, location: 'HQ Floor 1', dept: 'Sales & Marketing', bookable: true, lifeYears: 3 });
    await addAsset('dock1', { name: 'Dell Docking Station WD19', cat: 'Peripherals & Accessories', serial: 'DELL-WD19-330', acqYearsAgo: 1.7, cost: 15000, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 4 });
    await addAsset('dock2', { name: 'Dell Docking Station WD19', cat: 'Peripherals & Accessories', serial: 'DELL-WD19-331', acqYearsAgo: 1.7, cost: 15000, location: 'HQ Floor 2', dept: 'Product & Design', lifeYears: 4 });

    // Furniture
    await addAsset('chair1', { name: 'Ergonomic Office Chair', cat: 'Furniture', acqYearsAgo: 2.0, cost: 18500, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 8 });
    await addAsset('chair2', { name: 'Ergonomic Office Chair', cat: 'Furniture', acqYearsAgo: 2.0, cost: 18500, cond: 'FAIR', location: 'HQ Floor 1', dept: 'Human Resources', lifeYears: 8 });
    await addAsset('desk1', { name: 'Standing Desk', cat: 'Furniture', acqYearsAgo: 1.4, cost: 24000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 8 });
    await addAsset('cab1', { name: 'Steel Storage Cabinet', cat: 'Furniture', acqYearsAgo: 5.1, cost: 9000, cond: 'POOR', location: 'Warehouse', lifeYears: 10 });

    // Meeting rooms (bookable)
    await addAsset('roomAlpha', { name: 'Conference Room Alpha', cat: 'Meeting Rooms', location: 'HQ Floor 2', bookable: true, acqYearsAgo: 6 });
    await addAsset('roomBeta', { name: 'Conference Room Beta', cat: 'Meeting Rooms', location: 'HQ Floor 3', bookable: true, acqYearsAgo: 6 });
    await addAsset('huddle', { name: 'Huddle Pod H1', cat: 'Meeting Rooms', location: 'HQ Floor 1', bookable: true, acqYearsAgo: 3 });

    // AV & conference equipment
    await addAsset('avcam1', { name: 'Poly Studio X30 Conference Cam', cat: 'AV & Conference Equipment', serial: 'POLY-X30-118', acqYearsAgo: 1.0, cost: 185000, location: 'HQ Floor 2', bookable: true, lifeYears: 5 });
    await addAsset('spk1', { name: 'Jabra Speak 750 Speakerphone', cat: 'AV & Conference Equipment', serial: 'JB-750-664', acqYearsAgo: 1.5, cost: 22000, location: 'HQ Floor 3', bookable: true, lifeYears: 4 });
    await addAsset('proj1', { name: 'Epson Projector EB-X51', cat: 'AV & Conference Equipment', serial: 'EP-X51-901', acqYearsAgo: 2.3, cost: 42000, location: 'HQ Floor 2', status: 'UNDER_MAINTENANCE', lifeYears: 5 });
    await addAsset('tv1', { name: 'Samsung 65" Conference TV', cat: 'AV & Conference Equipment', serial: 'SM65-2201', acqYearsAgo: 1.1, cost: 95000, location: 'HQ Floor 2', lifeYears: 6 });

    // Mobile devices (QA / design test rigs)
    await addAsset('iph1', { name: 'iPhone 14 (QA Device)', cat: 'Mobile Devices', serial: 'IMEI-355401', acqYearsAgo: 1.2, cost: 65000, location: 'QA Lab', dept: 'QA & Testing', lifeYears: 3, cfv: { imei: '355401009876541' } });
    await addAsset('ipad1', { name: 'iPad Pro 11" (Design)', cat: 'Mobile Devices', serial: 'IMEI-355402', acqYearsAgo: 1.0, cost: 95000, location: 'HQ Floor 2', dept: 'Product & Design', lifeYears: 3, cfv: { imei: '355402009876542' } });
    await addAsset('sgs1', { name: 'Samsung Galaxy S23 (QA Device)', cat: 'Mobile Devices', serial: 'IMEI-355403', acqYearsAgo: 1.2, cost: 58000, location: 'QA Lab', dept: 'QA & Testing', lifeYears: 3, cfv: { imei: '355403009876543' } });
    await addAsset('oldphone', { name: 'iPhone 11 (Legacy QA Device)', cat: 'Mobile Devices', serial: 'IMEI-355390', acqYearsAgo: 4.5, cost: 42000, cond: 'POOR', location: 'QA Lab', dept: 'QA & Testing', status: 'LOST', lifeYears: 3, cfv: { imei: '355390009876590' } });

    // Appliances
    await addAsset('ac1', { name: 'Split AC Unit 1.5T', cat: 'Appliances', serial: 'AC-1552', acqYearsAgo: 4.2, cost: 38000, cond: 'FAIR', location: 'Server Room', lifeYears: 6 });
    await addAsset('printer1', { name: 'HP LaserJet Pro Printer', cat: 'Appliances', serial: 'HPLJ-897', acqYearsAgo: 2.7, cost: 27000, location: 'HQ Floor 1', lifeYears: 6 });
    await addAsset('water1', { name: 'Water Dispenser', cat: 'Appliances', acqYearsAgo: 3.0, cost: 12000, location: 'HQ Floor 1', lifeYears: 6 });
    await addAsset('coffee1', { name: 'Coffee Machine', cat: 'Appliances', acqYearsAgo: 1.8, cost: 35000, location: 'HQ Floor 2', lifeYears: 6 });

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

    // The star of the demo: Priya holds AF-0001 (MacBook Pro 16").
    await allocate({ assetKey: 'lap1', toUser: 'Priya', by: 'Rohan', daysAgo: 45, dueInDays: 30 });
    await allocate({ assetKey: 'lap2', toUser: 'Ishaan', by: 'Rohan', daysAgo: 30, dueInDays: 14 });
    await allocate({ assetKey: 'lap4', toUser: 'Ananya', by: 'Sara', daysAgo: 60, dueInDays: -3 });   // OVERDUE
    await allocate({ assetKey: 'lap5', toUser: 'Divya', by: 'Sara', daysAgo: 20, dueInDays: 40 });
    await allocate({ assetKey: 'desk1', toUser: 'Raj', by: 'Rohan', daysAgo: 90, dueInDays: null });
    // Historical (returned) allocations for the history timeline.
    await allocate({ assetKey: 'lap6', toUser: 'Arjun', by: 'Rohan', daysAgo: 200, dueInDays: null, returned: { daysAgo: 120, condition: 'GOOD', notes: 'Returned in good shape' } });
    await allocate({ assetKey: 'webcam1', toUser: 'Kabir', by: 'Sara', daysAgo: 75, dueInDays: null, returned: { daysAgo: 70, condition: 'GOOD', notes: 'Cable slightly frayed' } });
    // Second overdue one (department allocation).
    await allocate({ assetKey: 'sw1', toDept: 'DevOps & Infrastructure', by: 'Sara', daysAgo: 40, dueInDays: -6 }); // OVERDUE
    await conn.query(`UPDATE assets SET status='ALLOCATED' WHERE id = ?`, [aid.sw1.id]);

    // ---------- transfer request (pending, for the approval queue) ----------
    await conn.query(
      `INSERT INTO transfer_requests (asset_id, from_user_id, to_user_id, reason, status, requested_by, created_at)
       VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?)`,
      [aid.lap2.id, uid.Ishaan, uid.Raj, 'Ishaan is moving to the DevOps pod for Q4; Raj takes over this MacBook.', uid.Raj, sql(at(-1, 11))]
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
    await book({ assetKey: 'roomAlpha', by: 'Priya', dayOffset: 0, fromH: h, toH: Math.min(h + 2, 23), purpose: 'Sprint planning' });
    // Back-to-back demo slot later today or tomorrow.
    await book({ assetKey: 'roomAlpha', by: 'Divya', dayOffset: h >= 20 ? 1 : 0, fromH: h >= 20 ? 9 : Math.min(h + 3, 22), toH: h >= 20 ? 10 : Math.min(h + 4, 23), purpose: 'HR onboarding' });
    await book({ assetKey: 'roomBeta', by: 'Raj', dayOffset: 1, fromH: 9, toH: 10, purpose: 'Client call' });
    await book({ assetKey: 'roomBeta', by: 'Meera', dayOffset: 1, fromH: 14, toH: 16, purpose: 'Interviews', dept: 'Human Resources' });
    await book({ assetKey: 'avcam1', by: 'Sara', dayOffset: 2, fromH: 9, toH: 11, purpose: 'Remote client onboarding session' });
    await book({ assetKey: 'spk1', by: 'Aditi', dayOffset: 3, fromH: 11, toH: 13, purpose: 'All-hands demo' });
    // History for the heatmap (past 3 weeks, spread across weekdays).
    for (let i = 1; i <= 18; i++) {
      const offset = -Math.ceil(i / 2);
      const start = 9 + (i % 6);
      await book({
        assetKey: ['roomAlpha', 'roomBeta', 'huddle', 'avcam1', 'webcam1', 'spk1'][i % 6],
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
    await maint({ assetKey: 'nas1', by: 'Ananya', status: 'APPROVED', priority: 'HIGH', issue: 'NAS reporting a degraded RAID array; one disk light is red.', daysAgo: 2, decidedBy: 'Sara' });
    await maint({ assetKey: 'proj1', by: 'Priya', status: 'IN_PROGRESS', priority: 'HIGH', issue: 'Projector bulb not turning on; likely lamp failure.', tech: 'R. Varma', daysAgo: 4, decidedBy: 'Rohan' });
    await maint({ assetKey: 'spk1', by: 'Nisha', status: 'TECHNICIAN_ASSIGNED', priority: 'LOW', issue: 'Crackling sound at high volume.', tech: 'S. Kulkarni', daysAgo: 3, decidedBy: 'Sara' });
    await maint({ assetKey: 'chair2', by: 'Divya', status: 'RESOLVED', priority: 'LOW', issue: 'Hydraulic lift sinking slowly.', tech: 'FixIt Services', daysAgo: 12, decidedBy: 'Rohan' });
    await maint({ assetKey: 'cab1', by: 'Arjun', status: 'REJECTED', priority: 'LOW', issue: 'Door hinge squeaks.', daysAgo: 8, decidedBy: 'Rohan' });

    // ---------- audit cycle (open, mixed marks) ----------
    const [auditR] = await conn.query(
      `INSERT INTO audit_cycles (name, scope_department_id, starts_on, ends_on, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
      [`Q3 Asset Audit — Engineering`, deptIds['Engineering'], dateOnly(at(-5)), dateOnly(at(9)), uid.Rohan, sql(at(-5, 9))]
    );
    const cycleId = auditR.insertId;
    for (const auditor of ['Aditi', 'Raj']) {
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
    await notif('Priya', 'ASSET_ASSIGNED', `${aid.lap1.tag} MacBook Pro 16" M3 assigned to you`, 'Expected return in 30 days', 2);
    await notif('Divya', 'MAINTENANCE_APPROVED', 'Maintenance request approved', 'NAS RAID repair approved by Sara Iqbal', 18);
    await notif('Priya', 'BOOKING_CONFIRMED', 'Booking confirmed: Conference Room Alpha', 'Sprint planning session', 60);
    await notif('Raj', 'TRANSFER_REQUESTED', `Transfer request raised for ${aid.lap2.tag}`, 'Awaiting Asset Manager approval', 180);
    await notif('Ananya', 'OVERDUE_RETURN', `Overdue: ${aid.lap4.tag} Lenovo ThinkPad X1 Carbon`, 'Was due back 3 days ago', 1440);

    const log = (actor, action, type, summary, minsAgo) =>
      conn.query(
        `INSERT INTO activity_logs (actor_user_id, action, entity_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
        [actor ? uid[actor] : null, action, type, summary, sql(new Date(now.getTime() - minsAgo * 60000))]
      );
    await log('Rohan', 'ASSET_ALLOCATED', 'asset', `${aid.lap1.tag} MacBook Pro 16" M3 allocated to Priya Shah (Engineering)`, 2);
    await log('Priya', 'BOOKING_CREATED', 'booking', 'Conference Room Alpha booked for sprint planning', 60);
    await log('Sara', 'MAINTENANCE_APPROVED', 'maintenance', 'NAS RAID repair approved — asset now Under Maintenance', 18);
    await log('Aditi', 'AUDIT_ITEM_MARKED', 'audit', 'Asset marked missing in "Q3 Asset Audit — Engineering"', 300);
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
