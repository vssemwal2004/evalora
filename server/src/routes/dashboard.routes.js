const express = require('express');
const Assessment = require('../models/Assessment');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/summary', async (req, res, next) => {
  try {
    const assessmentScope = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    const [admins, students, proctors, assessments, activeAssessments, recentActivity] = await Promise.all([
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ role: ROLES.STUDENT }),
      User.countDocuments({ role: ROLES.PROCTOR }),
      Assessment.countDocuments(assessmentScope),
      Assessment.countDocuments({ ...assessmentScope, status: 'active' }),
      AuditLog.find({ action: { $not: { $regex: '^request\\.' } } })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('action targetType reason actorRole createdAt'),
    ]);

    res.json({
      role: req.user.role,
      counts: {
        admins: req.user.role === ROLES.SUPER_ADMIN ? admins : undefined,
        students,
        proctors,
        assessments,
        activeAssessments,
        pendingMails: 0,
        ufmCases: 0,
      },
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
