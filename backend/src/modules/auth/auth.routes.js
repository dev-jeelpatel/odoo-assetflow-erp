import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool.js';
import { ApiError, catchAsync } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, signToken, setAuthCookie } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const router = Router();

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long');

const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    email: emailSchema,
    password: passwordSchema,
    department_id: z.coerce.number().int().positive().optional().nullable(),
  })
  // SECURITY: any `role` key in the payload is stripped — signup can only
  // ever create an EMPLOYEE. Roles are granted by Admin in the directory.
  .strip();

router.post(
  '/signup',
  validate({ body: signupSchema }),
  catchAsync(async (req, res) => {
    const { name, email, password, department_id } = req.body;

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists. Try logging in.');
    }
    if (department_id) {
      const [dept] = await pool.query(`SELECT id FROM departments WHERE id = ? AND status = 'ACTIVE'`, [department_id]);
      if (!dept.length) throw ApiError.badRequest('Selected department does not exist or is inactive.');
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?, ?, ?, 'EMPLOYEE', ?)`,
      [name, email, hash, department_id ?? null]
    );

    await logActivity({
      actorId: result.insertId,
      action: 'USER_SIGNUP',
      entityType: 'user',
      entityId: result.insertId,
      summary: `${name} signed up as Employee`,
    });

    const user = { id: result.insertId, role: 'EMPLOYEE' };
    setAuthCookie(res, signToken(user));
    res.status(201).json({ data: { id: result.insertId, name, email, role: 'EMPLOYEE' } });
  })
);

router.post(
  '/login',
  validate({ body: z.object({ email: emailSchema, password: z.string().min(1, 'Password is required') }) }),
  catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw ApiError.unauthorized('Incorrect email or password.');
    if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account has been deactivated. Contact your admin.');

    setAuthCookie(res, signToken(user));
    await logActivity({
      actorId: user.id, action: 'USER_LOGIN', entityType: 'user', entityId: user.id,
      summary: `${user.name} logged in`,
    });
    res.json({
      data: { id: user.id, name: user.name, email: user.email, role: user.role, department_id: user.department_id },
    });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie('af_token');
  res.json({ data: { ok: true } });
});

router.get(
  '/me',
  requireAuth,
  catchAsync(async (req, res) => {
    const [[counts]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ data: { ...req.user, unread_notifications: counts.unread } });
  })
);

router.post(
  '/forgot-password',
  validate({ body: z.object({ email: emailSchema }) }),
  catchAsync(async (req, res) => {
    const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [req.body.email]);
    // Always respond success so the endpoint can't be used to probe accounts.
    if (rows.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [rows[0].id, tokenHash]
      );
      // Local-only project: the reset link is printed to the server console
      // (a real deployment would email it).
      console.log(`\n[password-reset] Link for ${req.body.email}:`);
      console.log(`  http://localhost:3000/reset-password?token=${token}\n`);
    }
    res.json({ data: { message: 'If that email exists, a reset link has been generated (check the API console in this local setup).' } });
  })
);

router.post(
  '/reset-password',
  validate({ body: z.object({ token: z.string().min(10), password: passwordSchema }) }),
  catchAsync(async (req, res) => {
    const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const [rows] = await pool.query(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const reset = rows[0];
    if (!reset) throw ApiError.badRequest('This reset link is invalid or has expired. Request a new one.');

    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [reset.id]);
    await logActivity({
      actorId: reset.user_id, action: 'PASSWORD_RESET', entityType: 'user', entityId: reset.user_id,
      summary: 'Password was reset via email link',
    });
    res.json({ data: { message: 'Password updated. You can log in now.' } });
  })
);

export default router;
