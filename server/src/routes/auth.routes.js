const express = require('express');
const crypto = require('crypto');
const AssessmentStudent = require('../models/AssessmentStudent');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate } = require('../middleware/auth');
const { signAuthToken } = require('../utils/tokens');

const router = express.Router();

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

    const token = signAuthToken(authenticatedUser);

    return res.json({
      token,
      user: {
        id: authenticatedUser._id,
        name: authenticatedUser.name,
        email: authenticatedUser.email,
        loginId: authenticatedUser.loginId,
        role: authenticatedUser.role,
        permissions: authenticatedUser.permissions,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      loginId: req.user.loginId,
      role: req.user.role,
      permissions: req.user.permissions,
    },
  });
});

module.exports = router;
