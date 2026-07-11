const express = require('express');
const crypto = require('crypto');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const env = require('../config/env');
const { authenticate } = require('../middleware/auth');
const { clearCsrfCookie, setCsrfCookie } = require('../middleware/csrf');
const { authLoginLimiter, passwordChangeLimiter } = require('../middleware/rateLimit');
const { validateBody, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');
const { buildLoginUserQuery } = require('../services/auth.service');
const { signAuthToken } = require('../utils/tokens');

const router = express.Router();
const SENSITIVE_USER_FIELDS = '+passwordHash +activeSessionId +tokenInvalidBefore +failedLoginAttempts +lastFailedLoginAt +loginLockedUntil';
const loginBodySchema = z.object({
  identifier: z.string().trim().min(1, 'Login ID/email is required.').max(320),
  password: z.string().min(1, 'Password is required.').max(200),
});
const passwordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(200),
  newPassword: z.string().min(1, 'New password is required.').max(200),
  confirmPassword: z.string().min(1, 'Confirm password is required.').max(200),
});

function isStrongPassword(password) {
  const value = String(password || '');
  return value.length > 8 && /[A-Z]/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function serializeAuthUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    loginId: user.loginId,
    role: user.role,
    permissions: user.permissions,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.nodeEnv === 'production' ? 'strict' : 'lax',
    secure: env.auth.cookieSecure,
    maxAge: env.auth.cookieMaxAgeMs,
    path: '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie(env.auth.cookieName, token, authCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(env.auth.cookieName, {
    httpOnly: true,
    sameSite: env.nodeEnv === 'production' ? 'strict' : 'lax',
    secure: env.auth.cookieSecure,
    path: '/',
  });
  res.clearCookie('token', { path: '/' });
  clearCsrfCookie(res);
}

function getLockSeconds(user) {
  if (!user?.loginLockedUntil) return 0;
  return Math.max(Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 1000), 0);
}

function lockedResponse(res, user) {
  const retryAfterSeconds = getLockSeconds(user);
  if (retryAfterSeconds > 0) res.set('Retry-After', String(retryAfterSeconds));
  return res.status(423).json({
    code: 'ACCOUNT_LOCKED',
    message: `Too many failed login attempts. Try again in ${Math.max(Math.ceil(retryAfterSeconds / 60), 1)} minute(s).`,
    retryAfterSeconds,
  });
}

async function recordLoginFailure(req, user, metadata = {}) {
  if (!user) return null;

  await user.recordFailedLogin({
    maxAttempts: env.auth.loginMaxFailedAttempts,
    windowMs: env.auth.loginFailureWindowMs,
    lockMs: env.auth.loginLockMs,
  });

  await writeAuditLog(req, {
    action: user.isLoginLocked() ? 'auth.login_locked' : 'auth.login_failed',
    targetType: 'User',
    targetId: user._id,
    metadata: {
      role: user.role,
      loginId: user.loginId,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.loginLockedUntil,
      ...metadata,
    },
  });

  return user;
}

router.post('/login', authLoginLimiter, validateBody(loginBodySchema), async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Login ID/email and password are required.' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const user = await User.findOne(buildLoginUserQuery(identifier)).select(SENSITIVE_USER_FIELDS);

    let authenticatedUser = user;
    let isValid = false;

    if (authenticatedUser?.isLoginLocked()) {
      await writeAuditLog(req, {
        action: 'auth.login_blocked_locked',
        targetType: 'User',
        targetId: authenticatedUser._id,
        metadata: { role: authenticatedUser.role, loginId: authenticatedUser.loginId },
      });
      return lockedResponse(res, authenticatedUser);
    }

    if (authenticatedUser?.status === 'active') {
      isValid = await authenticatedUser.comparePassword(password);
    }

    if (!isValid) {
      const assignment = await AssessmentStudent.findOne({
        $or: [
          { email: normalizedIdentifier },
          { generatedExamId: String(identifier).trim().toUpperCase() },
        ],
      }).select('+passwordHash');

      if (assignment) {
        const isStudentCredentialValid = await User.schema.methods.comparePassword.call(assignment, password);

        if (isStudentCredentialValid) {
          authenticatedUser = await User.findOneAndUpdate(
            { email: assignment.email, role: ROLES.STUDENT },
            {
              $set: {
                name: assignment.name,
                email: assignment.email,
                loginId: assignment.generatedExamId,
                uniqueUsername: assignment.generatedExamId,
                passwordHash: assignment.passwordHash,
                role: ROLES.STUDENT,
                status: assignment.examStatus === 'blocked' ? 'blocked' : 'active',
                ownerAdminId: assignment.ownerAdminId,
              },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          ).select(SENSITIVE_USER_FIELDS);
          isValid = authenticatedUser.status === 'active';
        }
      }
    }

    if (!isValid) {
      const proctorAssignments = await AssessmentProctor.find({
        $or: [
          { email: normalizedIdentifier },
          { generatedProctorId: String(identifier).trim().toUpperCase() },
        ],
      }).select('+passwordHash');

      for (const assignment of proctorAssignments) {
        const proctorUser = await User.findOne({ email: assignment.email, role: ROLES.PROCTOR }).select(SENSITIVE_USER_FIELDS);
        if (proctorUser?.isLoginLocked()) {
          continue;
        }

        const isUserCredentialValid = proctorUser?.status === 'active' && await proctorUser.comparePassword(password);
        const isLegacyAssignmentCredentialValid = await User.schema.methods.comparePassword.call(assignment, password);

        if (!isUserCredentialValid && !isLegacyAssignmentCredentialValid) {
          continue;
        }

        authenticatedUser = await User.findOneAndUpdate(
          { email: assignment.email, role: ROLES.PROCTOR },
          {
            $set: {
              name: assignment.name,
              email: assignment.email,
              loginId: assignment.generatedProctorId,
              uniqueUsername: assignment.generatedProctorId,
              passwordHash: isUserCredentialValid ? proctorUser.passwordHash : assignment.passwordHash,
              role: ROLES.PROCTOR,
              status: 'active',
              ownerAdminId: assignment.ownerAdminId,
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        ).select(SENSITIVE_USER_FIELDS);
        isValid = true;
        break;
      }
    }

    if (!authenticatedUser || authenticatedUser.status !== 'active' || !isValid) {
      const failedUser = user?.status === 'active' ? await recordLoginFailure(req, user, { identifier: normalizedIdentifier }) : null;
      if (failedUser?.isLoginLocked()) {
        return lockedResponse(res, failedUser);
      }

      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    authenticatedUser.lastLoginAt = new Date();
    if (authenticatedUser.role === ROLES.STUDENT) {
      authenticatedUser.activeSessionId = crypto.randomBytes(32).toString('hex');
    }
    if (typeof authenticatedUser.clearLoginFailures === 'function') {
      authenticatedUser.failedLoginAttempts = 0;
      authenticatedUser.lastFailedLoginAt = undefined;
      authenticatedUser.loginLockedUntil = undefined;
    }
    await authenticatedUser.save();
    req.user = authenticatedUser;

    await writeAuditLog(req, {
      action: 'auth.login',
      targetType: 'User',
      targetId: authenticatedUser._id,
      metadata: { loginId: authenticatedUser.loginId, role: authenticatedUser.role },
    });

    const token = signAuthToken(authenticatedUser);
    setAuthCookie(res, token);
    const csrfToken = setCsrfCookie(res);

    return res.json({
      csrfToken,
      token,
      user: serializeAuthUser(authenticatedUser),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    user: serializeAuthUser(req.user),
  });
});

router.get('/csrf', authenticate, (_req, res) => {
  const csrfToken = setCsrfCookie(res);
  return res.json({ csrfToken });
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === ROLES.STUDENT) {
      req.user.activeSessionId = undefined;
      await req.user.save();
    }

    clearAuthCookie(res);

    await writeAuditLog(req, {
      action: 'auth.logout',
      targetType: 'User',
      targetId: req.user._id,
      metadata: { role: req.user.role },
    });

    return res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/password', authenticate, passwordChangeLimiter, validateBody(passwordBodySchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Current password, new password, and confirm password are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password do not match.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'Use a strong password with more than 8 characters, 1 capital letter, and 1 special character.',
      });
    }

    const user = await User.findById(req.user._id).select('+passwordHash +passwordPreview +activeSessionId +tokenInvalidBefore');
    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.passwordPreview = undefined;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    user.tokenInvalidBefore = user.passwordChangedAt;
    await user.save();

    await writeAuditLog(req, {
      action: 'password.change',
      targetType: 'User',
      targetId: user._id,
      metadata: { forcedChangeCompleted: Boolean(req.user.mustChangePassword) },
    });

    const token = signAuthToken(user);
    setAuthCookie(res, token);
    const csrfToken = setCsrfCookie(res);

    return res.json({
      csrfToken,
      message: 'Password changed successfully.',
      token,
      user: serializeAuthUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
