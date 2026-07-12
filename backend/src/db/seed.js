/**
 * Demo seed for a large-scale IT company (~80 employees, ~200 assets across
 * 12 departments). All dates are computed relative to *now* so the app
 * always shows live overdue returns, an ongoing booking, and upcoming
 * reminders. Wipes existing data first (dev-only tool).
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

// Deterministic pseudo-random pick so re-seeding always produces the same
// dataset (useful for repeatable manual testing / screenshots).
function pick(arr, seed) {
  return arr[seed % arr.length];
}

async function main() {
  console.log('Seeding AssetFlow demo data for a large-scale IT company (relative to', now.toISOString(), ')');
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
    // A realistic mid-large product company org chart. QA and DevOps/SRE
    // roll up under Engineering, as is typical in software orgs.
    const deptNames = [
      'Engineering', 'QA & Testing', 'DevOps & SRE', 'Product & Design',
      'Data & Analytics', 'IT Support', 'Human Resources', 'Sales & Marketing',
      'Customer Success', 'Finance & Admin', 'Legal & Compliance', 'Executive Leadership',
    ];
    const deptIds = {};
    for (const name of deptNames) {
      const [r] = await conn.query('INSERT INTO departments (name) VALUES (?)', [name]);
      deptIds[name] = r.insertId;
    }
    await conn.query('UPDATE departments SET parent_department_id = ? WHERE id = ?', [
      deptIds['Engineering'], deptIds['QA & Testing'],
    ]);
    await conn.query('UPDATE departments SET parent_department_id = ? WHERE id = ?', [
      deptIds['Engineering'], deptIds['DevOps & SRE'],
    ]);

    // ---------- users ----------
    const adminHash = await bcrypt.hash('Admin@1234', 10);
    const userHash = await bcrypt.hash('Password@123', 10);

    // Named "story" accounts — referenced by key later for specific demo
    // scenarios (overdue returns, pending approvals, audit discrepancies).
    const namedUsers = [
      ['Anaya Deshmukh', 'admin@assetflow.local', adminHash, 'ADMIN', null],
      ['Rohan Mehta', 'rohan@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['IT Support']],
      ['Sara Iqbal', 'sara@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['DevOps & SRE']],
      ['Vikram Nair', 'vikram@assetflow.local', userHash, 'ASSET_MANAGER', deptIds['Finance & Admin']],
      ['Aditi Rao', 'aditi@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Engineering']],
      ['Meera Pillai', 'meera@assetflow.local', userHash, 'DEPT_HEAD', deptIds['Human Resources']],
      ['Priya Shah', 'priya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Raj Malhotra', 'raj@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Ishaan Gupta', 'ishaan@assetflow.local', userHash, 'EMPLOYEE', deptIds['Engineering']],
      ['Arjun Nair', 'arjun@assetflow.local', userHash, 'EMPLOYEE', deptIds['QA & Testing']],
      ['Ananya Iyer', 'ananya@assetflow.local', userHash, 'EMPLOYEE', deptIds['DevOps & SRE']],
      ['Nisha Verma', 'nisha@assetflow.local', userHash, 'EMPLOYEE', deptIds['Product & Design']],
      ['Divya Krishnan', 'divya@assetflow.local', userHash, 'EMPLOYEE', deptIds['Human Resources']],
      ['Kabir Bose', 'kabir@assetflow.local', userHash, 'EMPLOYEE', deptIds['Sales & Marketing']],
      ['Karan Desai', 'karan@assetflow.local', userHash, 'EMPLOYEE', deptIds['Finance & Admin']],
    ];

    // One department head per remaining department, generated from a name
    // pool so the full org chart is populated without a wall of literals.
    // Needs to comfortably exceed the total headcount (~80): every generated
    // employee must get a first name unique across the whole roster, since
    // uid[] below is keyed by first name only.
    const firstNames = [
      'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arnav', 'Kabir', 'Reyansh', 'Ayaan',
      'Sai', 'Krishna', 'Ishaan', 'Rudra', 'Advait', 'Dhruv', 'Kian', 'Rian',
      'Saanvi', 'Ananya', 'Diya', 'Myra', 'Aadhya', 'Pari', 'Riya', 'Ira',
      'Anika', 'Navya', 'Meera', 'Isha', 'Tara', 'Zara', 'Kavya', 'Aarohi',
      'Neha', 'Pooja', 'Sneha', 'Rhea', 'Simran', 'Tanya', 'Vidya', 'Yamini',
      'Rohan', 'Aman', 'Nikhil', 'Varun', 'Siddharth', 'Karthik', 'Manish', 'Gaurav',
      'Suresh', 'Rakesh', 'Deepak', 'Sanjay', 'Vikas', 'Ashok', 'Ramesh', 'Anil',
      'Rajesh', 'Mahesh', 'Naveen', 'Pranav', 'Yash', 'Harsh', 'Rohit', 'Mohit',
      'Abhishek', 'Ankit', 'Vishal', 'Amit', 'Sumit', 'Ravi', 'Sunil', 'Ajay',
      'Vijay', 'Sandeep', 'Pradeep', 'Alok', 'Kunal', 'Rahul', 'Sameer', 'Tarun',
      'Kritika', 'Shreya', 'Priyanka', 'Swati', 'Deepika', 'Nidhi', 'Ritu', 'Preeti',
      'Anjali', 'Bhavna', 'Chitra', 'Esha', 'Falguni', 'Gauri', 'Hema', 'Indira',
      'Jyoti', 'Komal', 'Lata', 'Madhavi', 'Nikita', 'Ojasvi', 'Poorvi', 'Radhika',
    ];
    const lastNames = [
      'Sharma', 'Verma', 'Gupta', 'Malhotra', 'Kapoor', 'Chopra', 'Mehta', 'Shah',
      'Iyer', 'Nair', 'Menon', 'Pillai', 'Reddy', 'Rao', 'Naidu', 'Krishnan',
      'Bose', 'Sen', 'Chatterjee', 'Banerjee', 'Mukherjee', 'Desai', 'Patel', 'Trivedi',
      'Joshi', 'Kulkarni', 'Deshmukh', 'Bhat', 'Hegde', 'Pai', 'Rana', 'Chauhan',
      'Sethi', 'Khanna', 'Bhatia', 'Arora', 'Anand', 'Saxena', 'Mathur', 'Agarwal',
    ];
    function generatedName(seed) {
      return `${pick(firstNames, seed)} ${pick(lastNames, seed * 7 + 3)}`;
    }

    const deptHeadDepts = deptNames.filter((d) => !['Engineering', 'Human Resources'].includes(d));
    const generatedUsers = [];
    let nameSeed = 0;
    // uid[] below is keyed by first name only, so first names — not just full
    // names — must be unique across the whole roster (named + generated), or
    // a later insert silently overwrites an earlier user's id in that map.
    const usedFirstNames = new Set(namedUsers.map((u) => u[0].split(' ')[0]));
    function uniqueGeneratedName() {
      let name, first;
      let attempts = 0;
      do {
        name = generatedName(nameSeed++);
        first = name.split(' ')[0];
        // Hard fallback so this can never spin forever even if the name pool
        // turns out smaller than the requested headcount — guaranteed unique
        // via a numeric suffix, just less pretty.
        if (++attempts > firstNames.length * 2) {
          first = `${first}${attempts}`;
          name = `${first} ${pick(lastNames, nameSeed)}`;
        }
      } while (usedFirstNames.has(first));
      usedFirstNames.add(first);
      return name;
    }
    function slugEmail(name, suffix) {
      return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${suffix}@assetflow.local`;
    }

    for (const dept of deptHeadDepts) {
      const name = uniqueGeneratedName();
      generatedUsers.push([name, slugEmail(name, ''), userHash, 'DEPT_HEAD', deptIds[dept]]);
    }

    // ~5-6 rank-and-file employees per department for a realistic headcount.
    const employeesPerDept = {
      'Engineering': 8, 'QA & Testing': 5, 'DevOps & SRE': 5, 'Product & Design': 5,
      'Data & Analytics': 4, 'IT Support': 4, 'Human Resources': 3, 'Sales & Marketing': 6,
      'Customer Success': 5, 'Finance & Admin': 3, 'Legal & Compliance': 2, 'Executive Leadership': 2,
    };
    let emailDupeGuard = {};
    for (const [dept, count] of Object.entries(employeesPerDept)) {
      for (let i = 0; i < count; i++) {
        const name = uniqueGeneratedName();
        const base = slugEmail(name, '');
        const email = emailDupeGuard[base] ? slugEmail(name, ++emailDupeGuard[base]) : (emailDupeGuard[base] = 0, base);
        generatedUsers.push([name, email, userHash, 'EMPLOYEE', deptIds[dept]]);
      }
    }

    const allUsers = [...namedUsers, ...generatedUsers];
    const uid = {};
    for (const [name, email, hash, role, dept] of allUsers) {
      const [r] = await conn.query(
        'INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)',
        [name, email, hash, role, dept]
      );
      uid[name.split(' ')[0]] = r.insertId;
    }
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Aditi, deptIds['Engineering']]);
    await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [uid.Meera, deptIds['Human Resources']]);
    for (let i = 0; i < deptHeadDepts.length; i++) {
      const [headName] = generatedUsers[i];
      await conn.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [
        uid[headName.split(' ')[0]], deptIds[deptHeadDepts[i]],
      ]);
    }
    console.log(`  Seeded ${allUsers.length} users across ${deptNames.length} departments.`);

    // ---------- categories ----------
    const cats = [
      ['Laptops & Workstations', 'Developer laptops, engineering workstations', [{ key: 'warranty_months', label: 'Warranty (months)', type: 'number' }]],
      ['Desktops & Towers', 'Desktop PCs and tower workstations', [{ key: 'warranty_months', label: 'Warranty (months)', type: 'number' }]],
      ['Monitors & Displays', 'External monitors and displays', null],
      ['Servers & Networking', 'Rack servers, switches, routers, UPS, NAS, firewalls', [{ key: 'ip_address', label: 'IP Address', type: 'text' }]],
      ['Peripherals & Accessories', 'Keyboards, mice, webcams, docking stations, headsets', null],
      ['Furniture', 'Chairs, desks, storage cabinets', null],
      ['Meeting Rooms', 'Bookable shared conference rooms', null],
      ['AV & Conference Equipment', 'Conference cams, speakerphones, projectors, room TVs', null],
      ['Mobile Devices', 'Phones and tablets used for QA, design, and sales', [{ key: 'imei', label: 'IMEI', type: 'text' }]],
      ['Appliances', 'AC units, printers, pantry appliances', null],
      ['Security & Access Control', 'CCTV cameras, badge readers, biometric scanners', null],
      ['Vehicles', 'Company shuttle and pool cars', [{ key: 'registration_no', label: 'Registration No.', type: 'text' }]],
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
    const assetsByCat = {};
    async function addAsset(key, { name, cat, serial = null, acqYearsAgo = 1, cost = null, cond = 'GOOD', location, dept = null, status = 'AVAILABLE', bookable = false, cfv = null, lifeYears = null }) {
      const tag = nextTag();
      const [r] = await conn.query(
        `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
                             cond, location, department_id, status, is_bookable, custom_field_values, useful_life_years)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tag, name, cid[cat], serial, dateOnly(at(-Math.round(acqYearsAgo * 365))), cost, cond, location,
         dept ? deptIds[dept] : null, status, bookable ? 1 : 0, cfv ? JSON.stringify(cfv) : null, lifeYears]
      );
      const record = { id: r.insertId, tag, name, dept, deptId: dept ? deptIds[dept] : null, status };
      if (key) aid[key] = record;
      (assetsByCat[cat] ??= []).push(record);
      return record;
    }

    const FLOORS = ['HQ Floor 1', 'HQ Floor 2', 'HQ Floor 3', 'HQ Floor 4'];

    // -- Named "story" assets (referenced later for specific demo scenarios) --
    await addAsset('lap1', { name: 'MacBook Pro 16" M3', cat: 'Laptops & Workstations', serial: 'MBP16-M3-2201', acqYearsAgo: 0.6, cost: 245000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 12 } });
    await addAsset('lap2', { name: 'MacBook Pro 14" M3', cat: 'Laptops & Workstations', serial: 'MBP14-M3-2202', acqYearsAgo: 0.6, cost: 205000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 12 } });
    await addAsset('lap4', { name: 'Lenovo ThinkPad X1 Carbon Gen 11', cat: 'Laptops & Workstations', serial: 'TPX1C-4471', acqYearsAgo: 1.0, cost: 178000, location: 'HQ Floor 3', dept: 'DevOps & SRE', status: 'ALLOCATED', lifeYears: 4, cfv: { warranty_months: 36 } });
    await addAsset('lap5', { name: 'Dell Latitude 5440', cat: 'Laptops & Workstations', serial: 'DL5440-8821', acqYearsAgo: 2.1, cost: 78000, location: 'HQ Floor 1', dept: 'Human Resources', status: 'ALLOCATED', lifeYears: 4 });
    await addAsset('lap6', { name: 'HP EliteBook 840 G9', cat: 'Laptops & Workstations', serial: 'HP840-3311', acqYearsAgo: 4.5, cost: 85000, cond: 'FAIR', location: 'Warehouse', dept: 'Sales & Marketing', lifeYears: 4 });
    await addAsset('desk1', { name: 'Standing Desk', cat: 'Furniture', acqYearsAgo: 1.4, cost: 24000, location: 'HQ Floor 2', dept: 'Engineering', status: 'ALLOCATED', lifeYears: 8 });
    await addAsset('webcam1', { name: 'Logitech Brio Webcam', cat: 'Peripherals & Accessories', serial: 'LG-BRIO-771', acqYearsAgo: 1.4, cost: 12000, location: 'HQ Floor 1', dept: 'Sales & Marketing', bookable: true, lifeYears: 3 });
    await addAsset('sw1', { name: 'Cisco Catalyst 9300 Switch', cat: 'Servers & Networking', serial: 'CC9300-5541', acqYearsAgo: 1.8, cost: 120000, location: 'Server Room', dept: 'DevOps & SRE', lifeYears: 7, cfv: { ip_address: '10.20.4.1' } });
    await addAsset('nas1', { name: 'Synology NAS DS1821+', cat: 'Servers & Networking', serial: 'SYN-1821-771', acqYearsAgo: 1.6, cost: 65000, location: 'Server Room', dept: 'DevOps & SRE', status: 'UNDER_MAINTENANCE', lifeYears: 6, cfv: { ip_address: '10.20.4.20' } });
    await addAsset('proj1', { name: 'Epson Projector EB-X51', cat: 'AV & Conference Equipment', serial: 'EP-X51-901', acqYearsAgo: 2.3, cost: 42000, location: 'HQ Floor 2', status: 'UNDER_MAINTENANCE', lifeYears: 5 });
    await addAsset('printer1', { name: 'HP LaserJet Pro Printer', cat: 'Appliances', serial: 'HPLJ-897', acqYearsAgo: 2.7, cost: 27000, location: 'HQ Floor 1', lifeYears: 6 });
    await addAsset('nas_missing', { name: 'Old Backup NAS (Legacy)', cat: 'Servers & Networking', serial: 'SYN-DS918-002', acqYearsAgo: 6.5, cost: 38000, cond: 'POOR', location: 'Server Room', dept: 'Engineering', lifeYears: 6 });
    await addAsset('chair_damaged', { name: 'Ergonomic Office Chair', cat: 'Furniture', acqYearsAgo: 3.5, cost: 18500, location: 'HQ Floor 2', dept: 'Engineering', lifeYears: 8 });
    await addAsset('oldphone', { name: 'iPhone 11 (Legacy QA Device)', cat: 'Mobile Devices', serial: 'IMEI-355390', acqYearsAgo: 4.5, cost: 42000, cond: 'POOR', location: 'QA Lab', dept: 'QA & Testing', status: 'LOST', lifeYears: 3, cfv: { imei: '355390009876590' } });
    await addAsset('oldpc', { name: 'Legacy Tower PC', cat: 'Desktops & Towers', serial: 'PC-0091', acqYearsAgo: 7.5, cost: 45000, cond: 'POOR', location: 'Warehouse', status: 'RETIRED', lifeYears: 5 });

    // -- Bulk laptops for engineering-heavy departments --
    const laptopModels = [
      { name: 'MacBook Pro 14" M3', cost: 205000, warranty: 12 },
      { name: 'MacBook Air M2', cost: 114000, warranty: 12 },
      { name: 'Dell XPS 15', cost: 152000, warranty: 36 },
      { name: 'Dell Precision 5570 Workstation', cost: 220000, warranty: 36 },
      { name: 'Lenovo ThinkPad X1 Carbon Gen 11', cost: 178000, warranty: 36 },
      { name: 'HP EliteBook 840 G9', cost: 85000, warranty: 24 },
      { name: 'Dell Latitude 5440', cost: 78000, warranty: 24 },
    ];
    const laptopDepts = ['Engineering', 'QA & Testing', 'DevOps & SRE', 'Product & Design', 'Data & Analytics', 'Customer Success'];
    let laptopSerial = 5000;
    for (const dept of laptopDepts) {
      const count = dept === 'Engineering' ? 12 : 6;
      for (let i = 0; i < count; i++) {
        const model = pick(laptopModels, laptopSerial);
        await addAsset(null, {
          name: model.name, cat: 'Laptops & Workstations', serial: `SN-${model.name.slice(0, 3).toUpperCase()}-${laptopSerial++}`,
          acqYearsAgo: 0.3 + (i % 5) * 0.7, cost: model.cost, location: pick(FLOORS, i + laptopSerial),
          dept, cond: i % 11 === 0 ? 'FAIR' : 'GOOD', lifeYears: 4, cfv: { warranty_months: model.warranty },
        });
      }
    }

    // -- Desktop towers for DevOps/IT Support --
    for (let i = 0; i < 8; i++) {
      await addAsset(null, {
        name: 'Dell OptiPlex Tower', cat: 'Desktops & Towers', serial: `SN-OPT-${6000 + i}`,
        acqYearsAgo: 1 + i * 0.4, cost: 62000, location: 'Server Room', dept: pick(['IT Support', 'DevOps & SRE'], i),
        lifeYears: 5,
      });
    }

    // -- Monitors, roughly one per two laptops --
    const monitorModels = [
      { name: 'Dell UltraSharp 27" U2723QE', cost: 46000 },
      { name: 'LG 27" 4K UltraFine', cost: 38500 },
      { name: 'Samsung 32" Curved Monitor', cost: 28000 },
      { name: 'BenQ 24" Designer Monitor', cost: 19500 },
    ];
    for (let i = 0; i < 40; i++) {
      const model = pick(monitorModels, i);
      await addAsset(null, {
        name: model.name, cat: 'Monitors & Displays', serial: `SN-MON-${7000 + i}`,
        acqYearsAgo: 0.5 + (i % 6) * 0.6, cost: model.cost, location: pick(FLOORS, i),
        dept: pick(laptopDepts, i), cond: i % 13 === 0 ? 'FAIR' : 'GOOD', lifeYears: 5,
      });
    }

    // -- Servers & networking (fixed, high-value infra) --
    const serverGear = [
      { name: 'Dell PowerEdge R750 Rack Server', cost: 850000, life: 6, ip: '10.20.4.11' },
      { name: 'Dell PowerEdge R650 Rack Server', cost: 620000, life: 6, ip: '10.20.4.12' },
      { name: 'HPE ProLiant DL380 Server', cost: 710000, life: 6, ip: '10.20.4.13' },
      { name: 'Cisco Catalyst 9300 Switch', cost: 120000, life: 7, ip: '10.20.4.2' },
      { name: 'Cisco Catalyst 9200 Switch', cost: 88000, life: 7, ip: '10.20.4.3' },
      { name: 'Fortinet FortiGate 100F Firewall', cost: 195000, life: 5, ip: '10.20.4.5' },
      { name: 'Ubiquiti Dream Machine Pro', cost: 35000, life: 5, ip: '10.20.4.254' },
      { name: 'APC Smart-UPS 3000VA', cost: 78000, life: 6, ip: null },
      { name: 'APC Smart-UPS 1500VA', cost: 45000, life: 6, ip: null },
      { name: 'Synology NAS RS1221+', cost: 95000, life: 6, ip: '10.20.4.21' },
      { name: 'TP-Link Managed PoE Switch', cost: 22000, life: 6, ip: '10.20.4.4' },
    ];
    for (let i = 0; i < serverGear.length; i++) {
      const g = serverGear[i];
      await addAsset(null, {
        name: g.name, cat: 'Servers & Networking', serial: `SN-INFRA-${8000 + i}`,
        acqYearsAgo: 1 + i * 0.3, cost: g.cost, location: 'Server Room', dept: 'DevOps & SRE',
        lifeYears: g.life, cfv: g.ip ? { ip_address: g.ip } : null,
      });
    }

    // -- Peripherals & accessories, spread widely --
    const peripheralModels = [
      { name: 'Keychron K8 Mechanical Keyboard', cost: 7500 },
      { name: 'Logitech MX Master 3 Mouse', cost: 8500 },
      { name: 'Dell Docking Station WD19', cost: 15000 },
      { name: 'Jabra Evolve2 65 Headset', cost: 18500 },
      { name: 'Logitech C920 Webcam', cost: 6500 },
    ];
    for (let i = 0; i < 35; i++) {
      const model = pick(peripheralModels, i);
      await addAsset(null, {
        name: model.name, cat: 'Peripherals & Accessories', serial: `SN-PER-${9000 + i}`,
        acqYearsAgo: 0.3 + (i % 4) * 0.5, cost: model.cost, location: pick(FLOORS, i),
        dept: pick(deptNames, i), lifeYears: 3,
      });
    }

    // -- Furniture --
    const furnitureModels = [
      { name: 'Ergonomic Office Chair', cost: 18500, life: 8 },
      { name: 'Standing Desk', cost: 24000, life: 8 },
      { name: 'Steel Storage Cabinet', cost: 9000, life: 10 },
      { name: '4-Seater Workstation Pod', cost: 65000, life: 10 },
    ];
    for (let i = 0; i < 32; i++) {
      const model = pick(furnitureModels, i);
      await addAsset(null, {
        name: model.name, cat: 'Furniture', acqYearsAgo: 1 + (i % 6) * 0.8, cost: model.cost,
        location: pick(FLOORS, i), dept: pick(deptNames, i + 3),
        cond: i % 9 === 0 ? 'FAIR' : 'GOOD', lifeYears: model.life,
      });
    }

    // -- Meeting rooms (bookable) --
    const rooms = [
      ['Conference Room Alpha', 'HQ Floor 2'], ['Conference Room Beta', 'HQ Floor 3'],
      ['Conference Room Gamma', 'HQ Floor 1'], ['Boardroom', 'HQ Floor 4'],
      ['Huddle Pod H1', 'HQ Floor 1'], ['Huddle Pod H2', 'HQ Floor 2'],
      ['Huddle Pod H3', 'HQ Floor 3'], ['Client Meeting Suite', 'HQ Floor 4'],
    ];
    const roomKeys = ['roomAlpha', 'roomBeta', 'roomGamma', 'boardroom', 'huddle1', 'huddle2', 'huddle3', 'clientSuite'];
    for (let i = 0; i < rooms.length; i++) {
      await addAsset(roomKeys[i], { name: rooms[i][0], cat: 'Meeting Rooms', location: rooms[i][1], bookable: true, acqYearsAgo: 3 + i * 0.5 });
    }

    // -- AV & conference equipment --
    const avGear = [
      ['Poly Studio X30 Conference Cam', 185000], ['Jabra Speak 750 Speakerphone', 22000],
      ['Samsung 65" Conference TV', 95000], ['LG 55" Conference TV', 68000],
      ['Logitech Rally Bar', 210000], ['Bose Portable PA Speaker', 32000],
    ];
    const avKeys = ['avcam1', 'spk1', 'tv1', 'tv2', 'rallybar1', 'pa1'];
    for (let i = 0; i < avGear.length; i++) {
      await addAsset(avKeys[i], {
        name: avGear[i][0], cat: 'AV & Conference Equipment', serial: `SN-AV-${1000 + i}`,
        acqYearsAgo: 0.8 + i * 0.4, cost: avGear[i][1], location: pick(FLOORS, i), bookable: true, lifeYears: 5,
      });
    }

    // -- Mobile devices (QA rigs, sales/exec phones) --
    const mobileModels = [
      ['iPhone 15 Pro', 135000], ['iPhone 14', 65000], ['Samsung Galaxy S23', 58000],
      ['iPad Pro 11"', 95000], ['Samsung Galaxy Tab S9', 62000], ['Google Pixel 8', 55000],
    ];
    for (let i = 0; i < 16; i++) {
      const model = pick(mobileModels, i);
      await addAsset(null, {
        name: model[0], cat: 'Mobile Devices', serial: `IMEI-3559${String(i).padStart(2, '0')}`,
        acqYearsAgo: 0.3 + (i % 4) * 0.5, cost: model[1],
        location: pick(['QA Lab', 'HQ Floor 2', 'HQ Floor 4'], i),
        dept: pick(['QA & Testing', 'Sales & Marketing', 'Executive Leadership', 'Product & Design'], i),
        lifeYears: 3, cfv: { imei: `3559${String(i).padStart(2, '0')}009876${500 + i}` },
      });
    }

    // -- Appliances --
    const applianceModels = [
      ['Split AC Unit 1.5T', 38000, 6], ['Water Dispenser', 12000, 6],
      ['Coffee Machine', 35000, 6], ['Microwave Oven', 9000, 5],
      ['Refrigerator (Pantry)', 42000, 8],
    ];
    for (let i = 0; i < 14; i++) {
      const model = pick(applianceModels, i);
      await addAsset(null, {
        name: model[0], cat: 'Appliances', acqYearsAgo: 1 + (i % 5) * 0.7, cost: model[1],
        location: pick(FLOORS, i), cond: i % 7 === 0 ? 'FAIR' : 'GOOD', lifeYears: model[2],
      });
    }

    // -- Security & access control --
    const securityGear = [
      ['CCTV Dome Camera', 8500], ['Biometric Access Reader', 22000], ['Badge Printer', 45000],
    ];
    for (let i = 0; i < 7; i++) {
      const model = pick(securityGear, i);
      await addAsset(null, {
        name: model[0], cat: 'Security & Access Control', serial: `SN-SEC-${2000 + i}`,
        acqYearsAgo: 1 + i * 0.4, cost: model[1], location: pick(FLOORS, i), lifeYears: 6,
      });
    }

    // -- Vehicles --
    await addAsset('van1', { name: 'Employee Shuttle Van', cat: 'Vehicles', serial: 'MH-04-BX-9021', acqYearsAgo: 3.2, cost: 1450000, location: 'Parking Bay 1', bookable: true, lifeYears: 8, cfv: { registration_no: 'MH-04-BX-9021' } });
    await addAsset('car1', { name: 'Pool Car — Toyota Innova', cat: 'Vehicles', serial: 'MH-04-CY-1187', acqYearsAgo: 1.8, cost: 1850000, location: 'Parking Bay 1', bookable: true, lifeYears: 8, cfv: { registration_no: 'MH-04-CY-1187' } });
    await addAsset('car2', { name: 'Pool Car — Honda City', cat: 'Vehicles', serial: 'MH-04-DZ-4456', acqYearsAgo: 0.9, cost: 1350000, location: 'Parking Bay 1', bookable: true, lifeYears: 8, cfv: { registration_no: 'MH-04-DZ-4456' } });

    // Seeded assets were tagged directly (AF-0001..AF-0xxx) without going
    // through the shared tag_counters row, so the real "register asset"
    // endpoint would immediately collide on AF-0001. Sync the counter.
    await conn.query(`UPDATE tag_counters SET next_value = ? WHERE name = 'asset_tag'`, [tagNo + 1]);
    console.log(`  Seeded ${tagNo} assets across ${cats.length} categories.`);

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
    await allocate({ assetKey: 'sw1', toDept: 'DevOps & SRE', by: 'Sara', daysAgo: 40, dueInDays: -6 }); // OVERDUE
    await conn.query(`UPDATE assets SET status='ALLOCATED' WHERE id = ?`, [aid.sw1.id]);

    // Bulk allocations across the generated laptop/desktop/mobile/furniture
    // pool, so the Allocation & Transfer page has real volume to page through.
    const allocatableCats = ['Laptops & Workstations', 'Desktops & Towers', 'Mobile Devices', 'Peripherals & Accessories'];
    const employeePool = generatedUsers.filter((u) => u[3] === 'EMPLOYEE');
    let allocCount = 0;
    let bulkAssetIdx = 0;
    async function allocateAsset(asset, { toUser, by, daysAgo, dueInDays = null, returned = null }) {
      const [r] = await conn.query(
        `INSERT INTO allocations (asset_id, allocated_to_user_id, allocated_by, allocated_at, expected_return_date, returned_at, return_condition, return_condition_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [asset.id, toUser, by, sql(at(-daysAgo, 10)), dueInDays === null ? null : dateOnly(at(dueInDays)),
         returned ? sql(at(-returned.daysAgo, 16)) : null, returned?.condition ?? null, returned?.notes ?? null]
      );
      if (!returned) await conn.query(`UPDATE assets SET status = 'ALLOCATED' WHERE id = ?`, [asset.id]);
      return r.insertId;
    }
    for (const cat of allocatableCats) {
      const pool = assetsByCat[cat] || [];
      for (let i = 0; i < pool.length; i++) {
        if (i % 5 === 4) continue; // ~20% stay available/unassigned
        const asset = pool[i];
        if (['ALLOCATED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'].includes(asset.status)) continue;
        const deptMatch = employeePool.filter((u) => u[4] === asset.deptId);
        const chosenUser = (deptMatch.length ? deptMatch : employeePool)[bulkAssetIdx % (deptMatch.length || employeePool.length)];
        const overdue = bulkAssetIdx % 17 === 0;
        const returnedHistorical = bulkAssetIdx % 9 === 0;
        await allocateAsset(asset, {
          toUser: chosenUser[1] ? uid[chosenUser[0].split(' ')[0]] : null,
          by: uid.Rohan,
          daysAgo: returnedHistorical ? 150 + (bulkAssetIdx % 100) : 5 + (bulkAssetIdx % 150),
          dueInDays: returnedHistorical ? null : overdue ? -(1 + (bulkAssetIdx % 10)) : (bulkAssetIdx % 4 === 0 ? null : 15 + (bulkAssetIdx % 60)),
          returned: returnedHistorical ? { daysAgo: 30 + (bulkAssetIdx % 60), condition: pick(['GOOD', 'FAIR', 'GOOD', 'GOOD'], bulkAssetIdx), notes: 'Returned during offboarding/refresh cycle.' } : null,
        });
        allocCount++;
        bulkAssetIdx++;
      }
    }
    console.log(`  Seeded ${allocCount} bulk allocations (plus 8 named scenarios).`);

    // ---------- transfer requests (mixed states, for the approval queue) ----------
    async function transfer({ assetKey, fromUser, toUser, reason, status, daysAgo, decidedBy = null }) {
      await conn.query(
        `INSERT INTO transfer_requests (asset_id, from_user_id, to_user_id, reason, status, requested_by, decided_by, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aid[assetKey].id, uid[fromUser], uid[toUser], reason, status, uid[toUser],
         decidedBy ? uid[decidedBy] : null, decidedBy ? sql(at(-daysAgo + 0.5, 15)) : null, sql(at(-daysAgo, 11))]
      );
    }
    await transfer({ assetKey: 'lap2', fromUser: 'Ishaan', toUser: 'Raj', reason: 'Ishaan is moving to the DevOps pod for Q4; Raj takes over this MacBook.', status: 'REQUESTED', daysAgo: 1 });
    await transfer({ assetKey: 'lap5', fromUser: 'Divya', toUser: 'Karan', reason: 'Divya switching to a desktop; reassigning laptop to Finance.', status: 'REQUESTED', daysAgo: 0.5 });

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
    await book({ assetKey: 'roomGamma', by: 'Meera', dayOffset: 1, fromH: 14, toH: 16, purpose: 'Interviews', dept: 'Human Resources' });
    await book({ assetKey: 'boardroom', by: 'Sara', dayOffset: 2, fromH: 9, toH: 11, purpose: 'Board review prep' });
    await book({ assetKey: 'avcam1', by: 'Sara', dayOffset: 2, fromH: 11, toH: 12, purpose: 'Remote client onboarding session' });
    await book({ assetKey: 'clientSuite', by: 'Kabir', dayOffset: 3, fromH: 10, toH: 12, purpose: 'Enterprise client demo' });
    await book({ assetKey: 'van1', by: 'Meera', dayOffset: 4, fromH: 8, toH: 12, purpose: 'Airport pickup — new hire batch' });
    await book({ assetKey: 'car1', by: 'Karan', dayOffset: 2, fromH: 13, toH: 17, purpose: 'Bank site visit' });
    // Cancelled bookings.
    await book({ assetKey: 'huddle1', by: 'Nisha', dayOffset: 2, fromH: 15, toH: 16, purpose: 'Design crit (cancelled)', status: 'CANCELLED' });
    await book({ assetKey: 'roomBeta', by: 'Arjun', dayOffset: 3, fromH: 9, toH: 10, purpose: 'Test plan review (cancelled)', status: 'CANCELLED' });

    // History for the heatmap and "Active Bookings" volume (past 4 weeks).
    const bookableKeys = ['roomAlpha', 'roomBeta', 'roomGamma', 'boardroom', 'huddle1', 'huddle2', 'huddle3', 'clientSuite', 'avcam1', 'spk1', 'rallybar1', 'car2'];
    const bookers = employeePool.slice(0, 20).map((u) => u[0].split(' ')[0]);
    for (let i = 1; i <= 45; i++) {
      const offset = -Math.ceil(i / 1.5);
      const start = 9 + (i % 8);
      await book({
        assetKey: pick(bookableKeys, i),
        by: pick(bookers, i * 3 + 1),
        dayOffset: offset, fromH: start, toH: start + 1 + (i % 2),
        purpose: pick(['Team sync', 'Client call', 'Design review', 'Sprint retro', 'Interview panel', '1:1s', 'War room'], i),
      });
    }
    console.log('  Seeded 56 bookings across meeting rooms, AV gear, and vehicles.');

    // ---------- maintenance requests (every kanban column, spread across categories) ----------
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
    await maint({ assetKey: 'chair_damaged', by: 'Divya', status: 'TECHNICIAN_ASSIGNED', priority: 'LOW', issue: 'Hydraulic lift sinking slowly.', tech: 'FixIt Services', daysAgo: 3, decidedBy: 'Rohan' });
    await maint({ assetKey: 'oldpc', by: 'Arjun', status: 'REJECTED', priority: 'LOW', issue: 'Requesting repair on a unit already scheduled for retirement.', daysAgo: 8, decidedBy: 'Rohan' });
    await maint({ assetKey: 'van1', by: 'Meera', status: 'RESOLVED', priority: 'MEDIUM', issue: 'AC not cooling; likely gas leak.', tech: 'AutoCare Garage', daysAgo: 15, decidedBy: 'Vikram' });
    await maint({ assetKey: 'sw1', by: 'Ananya', status: 'PENDING', priority: 'CRITICAL', issue: 'Switch dropping packets intermittently on ports 12-18; affecting DevOps floor connectivity.', daysAgo: 0.2 });
    await maint({ assetKey: 'desk1', by: 'Raj', status: 'RESOLVED', priority: 'LOW', issue: 'Motor for height adjustment stuck.', tech: 'FixIt Services', daysAgo: 25, decidedBy: 'Rohan' });
    console.log('  Seeded 8 maintenance requests across all workflow states.');

    // ---------- audit cycles ----------
    // 1) Historical, already CLOSED cycle — one confirmed-missing item was
    //    already converted to LOST as a real close would do.
    const [closedAuditR] = await conn.query(
      `INSERT INTO audit_cycles (name, scope_department_id, starts_on, ends_on, status, created_by, closed_by, closed_at, created_at)
       VALUES (?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?)`,
      ['Q1 Asset Audit — Company-wide', null, dateOnly(at(-95)), dateOnly(at(-80)), uid.Anaya, uid.Rohan, sql(at(-79, 17)), sql(at(-95, 9))]
    );
    const closedCycleId = closedAuditR.insertId;
    for (const auditor of ['Rohan', 'Sara']) {
      await conn.query('INSERT INTO audit_assignments (cycle_id, auditor_user_id) VALUES (?, ?)', [closedCycleId, uid[auditor]]);
    }
    await conn.query(
      `INSERT INTO audit_items (cycle_id, asset_id, expected_location, verification, notes, verified_by, verified_at)
       VALUES (?, ?, ?, 'MISSING', ?, ?, ?)`,
      [closedCycleId, aid.oldphone.id, 'QA Lab', 'Not found after two follow-up checks; confirmed missing.', uid.Rohan, sql(at(-81, 14))]
    );
    await conn.query(`UPDATE assets SET status = 'LOST' WHERE id = ?`, [aid.oldphone.id]);
    await conn.query(
      `INSERT INTO audit_items (cycle_id, asset_id, expected_location, verification, verified_by, verified_at)
       VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
      [closedCycleId, aid.nas_missing.id, 'Server Room', uid.Sara, sql(at(-82, 11))]
    );

    // 2) Open, department-scoped cycle with a mix of verified/flagged/pending.
    const [engAuditR] = await conn.query(
      `INSERT INTO audit_cycles (name, scope_department_id, starts_on, ends_on, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
      ['Q3 Asset Audit — Engineering', deptIds['Engineering'], dateOnly(at(-5)), dateOnly(at(9)), uid.Rohan, sql(at(-5, 9))]
    );
    const engCycleId = engAuditR.insertId;
    for (const auditor of ['Aditi', 'Raj']) {
      await conn.query('INSERT INTO audit_assignments (cycle_id, auditor_user_id) VALUES (?, ?)', [engCycleId, uid[auditor]]);
    }
    const [engAssets] = await conn.query('SELECT id, location FROM assets WHERE department_id = ?', [deptIds['Engineering']]);
    for (const [i, a] of engAssets.entries()) {
      const mark = i === 1 ? 'MISSING' : i === 3 ? 'DAMAGED' : i < 8 ? 'VERIFIED' : 'PENDING';
      await conn.query(
        `INSERT INTO audit_items (cycle_id, asset_id, expected_location, verification, notes, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [engCycleId, a.id, a.location, mark,
         mark === 'MISSING' ? 'Not at expected desk; last seen two weeks ago' : mark === 'DAMAGED' ? 'Screen cracked in corner' : null,
         mark === 'PENDING' ? null : uid.Aditi, mark === 'PENDING' ? null : sql(at(-1, 14))]
      );
    }

    // 3) Open, location-scoped cycle covering the server room.
    const [srvAuditR] = await conn.query(
      `INSERT INTO audit_cycles (name, scope_location, starts_on, ends_on, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
      ['Server Room Infrastructure Audit', 'Server Room', dateOnly(at(-2)), dateOnly(at(12)), uid.Sara, sql(at(-2, 9))]
    );
    const srvCycleId = srvAuditR.insertId;
    for (const auditor of ['Sara', 'Ananya']) {
      await conn.query('INSERT INTO audit_assignments (cycle_id, auditor_user_id) VALUES (?, ?)', [srvCycleId, uid[auditor]]);
    }
    const [srvAssets] = await conn.query(`SELECT id, location FROM assets WHERE location = 'Server Room'`);
    for (const [i, a] of srvAssets.entries()) {
      const mark = i < 4 ? 'VERIFIED' : 'PENDING';
      await conn.query(
        `INSERT INTO audit_items (cycle_id, asset_id, expected_location, verification, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [srvCycleId, a.id, a.location, mark, mark === 'PENDING' ? null : uid.Sara, mark === 'PENDING' ? null : sql(at(-1, 10))]
      );
    }
    console.log('  Seeded 3 audit cycles (1 closed, 2 open) with full item checklists.');

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
    await notif('Rohan', 'AUDIT_ASSIGNED', 'Server Room Infrastructure Audit', 'You have been assigned as auditor', 2880);

    const log = (actor, action, type, summary, minsAgo) =>
      conn.query(
        `INSERT INTO activity_logs (actor_user_id, action, entity_type, summary, created_at) VALUES (?, ?, ?, ?, ?)`,
        [actor ? uid[actor] : null, action, type, summary, sql(new Date(now.getTime() - minsAgo * 60000))]
      );
    await log('Rohan', 'ASSET_ALLOCATED', 'asset', `${aid.lap1.tag} MacBook Pro 16" M3 allocated to Priya Shah (Engineering)`, 2);
    await log('Priya', 'BOOKING_CREATED', 'booking', 'Conference Room Alpha booked for sprint planning', 60);
    await log('Sara', 'MAINTENANCE_APPROVED', 'maintenance', 'NAS RAID repair approved — asset now Under Maintenance', 18);
    await log('Aditi', 'AUDIT_ITEM_MARKED', 'audit', 'Asset marked missing in "Q3 Asset Audit — Engineering"', 300);
    await log('Rohan', 'AUDIT_CLOSED', 'audit', 'Audit "Q1 Asset Audit — Company-wide" closed — 1 asset marked Lost', 79 * 1440);
    await log('Anaya', 'ROLE_CHANGED', 'user', 'Rohan Mehta: EMPLOYEE → ASSET_MANAGER', 10000);

    console.log('Seed complete.');
    console.log('  Admin:          admin@assetflow.local / Admin@1234');
    console.log('  Asset Manager:  rohan@assetflow.local / Password@123');
    console.log('  Dept Head:      aditi@assetflow.local / Password@123');
    console.log('  Employee:       priya@assetflow.local / Password@123');
    console.log('  (All generated employees use Password@123 — see the Employee Directory for their emails.)');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
