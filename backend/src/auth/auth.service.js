const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendMail } = require('../utils/mailer');
const { recordActivity } = require('../utils/activityLog');

const SALT_ROUNDS = 12;
const OTP_TTL_MINUTES = 15;
const REFRESH_TTL_DAYS = 7;

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

async function signup({ name, email, password }, req) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, password: passwordHash, role: 'EMPLOYEE', status: 'ACTIVE' },
  });

  await recordActivity({
    req,
    userId: user.id,
    action: 'SIGNUP',
    entity: 'User',
    entityId: user.id,
    newData: { email: user.email, role: user.role },
  });

  return sanitizeUser(user);
}

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return { accessToken, refreshToken };
}

async function login({ email, password }, req) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Account is inactive. Contact your administrator.');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const tokens = await issueTokens(user);

  await recordActivity({ req, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

  return { user: sanitizeUser(user), ...tokens };
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    throw ApiError.unauthorized('Missing refresh token');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token is no longer valid');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('Account is inactive or no longer exists');
  }

  // rotate refresh token
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const tokens = await issueTokens(user);

  return { user: sanitizeUser(user), ...tokens };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken },
    data: { revoked: true },
  });
}

async function forgotPassword({ email }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Do not reveal whether the account exists.
  if (!user) return;

  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { otp: await bcrypt.hash(otp, SALT_ROUNDS), userId: user.id, expiresAt },
  });

  await sendMail({
    to: user.email,
    subject: 'AssetFlow password reset code',
    text: `Your password reset code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
}

async function resetPassword({ email, otp, newPassword }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw ApiError.badRequest('Invalid reset code');
  }

  const tokens = await prisma.passwordResetToken.findMany({
    where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  let matched = null;
  for (const t of tokens) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(otp, t.otp)) {
      matched = t;
      break;
    }
  }

  if (!matched) {
    throw ApiError.badRequest('Invalid or expired reset code');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: matched.id }, data: { used: true } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);
}

module.exports = {
  signup,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  sanitizeUser,
};
