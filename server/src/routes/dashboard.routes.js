const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const AuditLog = require('../models/AuditLog');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

router.get('/summary', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    const assessmentScope = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    const userScope = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    const activityScope = {
      action: { $not: { $regex: '^request\\.' } },
      ...(req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id }),
    };
    const [admins, faculty, moderators, students, proctors, assessments, reviewAssessments, publishedAssessments, pendingStudentMails, pendingProctorMails, emailTemplates, recentActivity] = await Promise.all([
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ ...userScope, role: ROLES.FACULTY }),
      User.countDocuments({ ...userScope, role: ROLES.MODERATOR }),
      AssessmentStudent.countDocuments(assessmentScope),
      AssessmentProctor.countDocuments(assessmentScope),
      Assessment.countDocuments(assessmentScope),
      Assessment.countDocuments({ ...assessmentScope, status: 'review' }),
      Assessment.countDocuments({ ...assessmentScope, status: { $nin: ['draft', 'review'] }, visibility: 'visible' }),
      AssessmentStudent.countDocuments({ ...assessmentScope, mailStatus: { $nin: ['sent', 'resent'] } }),
      AssessmentProctor.countDocuments({ ...assessmentScope, mailStatus: { $nin: ['sent', 'resent'] } }),
      EmailTemplate.countDocuments({ status: 'active' }),
      AuditLog.find(activityScope)
        .sort({ createdAt: -1 })
        .limit(8)
        .select('action targetType reason actorRole actorName createdAt newValue'),
    ]);

    res.json({
      role: req.user.role,
      counts: {
        admins: req.user.role === ROLES.SUPER_ADMIN ? admins : undefined,
        faculty,
        moderators,
        students,
        proctors,
        assessments,
        reviewAssessments,
        publishedAssessments,
        activeAssessments: publishedAssessments,
        pendingMails: pendingStudentMails + pendingProctorMails,
        emailTemplates,
        ufmCases: 0,
      },
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
