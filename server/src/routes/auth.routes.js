const express = require('express');
const crypto = require('crypto');
const AssessmentStudent = require('../models/AssessmentStudent');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');
const { signAuthToken } = require('../utils/tokens');

const router = express.Router();

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

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Login ID/email and password are required.' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { loginId: identifier.trim() },
        { loginId: normalizedIdentifier },
        { uniqueUsername: identifier.trim() },
        { uniqueUsername: normalizedIdentifier },
      ],
    }).select('+passwordHash');

    let authenticatedUser = user;
    let isValid = false;

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
              },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          ).select('+passwordHash');
          isValid = authenticatedUser.status === 'active';
        }
      }
    }

    if (!authenticatedUser || authenticatedUser.status !== 'active' || !isValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    authenticatedUser.lastLoginAt = new Date();
    if (authenticatedUser.role === ROLES.STUDENT) {
      authenticatedUser.activeSessionId = crypto.randomBytes(32).toString('hex');
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

    return res.json({
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

router.patch('/password', authenticate, async (req, res, next) => {
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

    const user = await User.findById(req.user._id).select('+passwordHash +passwordPreview');
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
    await user.save();

    await writeAuditLog(req, {
      action: 'password.change',
      targetType: 'User',
      targetId: user._id,
      metadata: { forcedChangeCompleted: Boolean(req.user.mustChangePassword) },
    });

    return res.json({
      message: 'Password changed successfully.',
      user: serializeAuthUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
