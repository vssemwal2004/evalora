const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { proctorActionLimiter, proctorVerifyLimiter } = require('../middleware/rateLimit');
const { validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');
const User = require('../models/User');

const router = express.Router();
const proctorVerifyBodySchema = z.object({
  password: z.string().min(1, 'Assessment password is required.').max(200),
});
const ufmBodySchema = z.object({
  reason: z.string().trim().min(1, 'UFM reason is required.').max(2000),
});

router.use(authenticate, requireRole(ROLES.PROCTOR));
router.use('/assignments/:assignmentId', validateObjectIdParams('assignmentId'));
router.use('/assignments/:assignmentId/students/:studentId', validateObjectIdParams('studentId'));

function serializeWindow(assessment) {
  return {
    startAt: assessment.startAt,
    endAt: assessment.endAt,
    durationMinutes: assessment.globalDurationMinutes || 0,
  };
}

function operationalStatus(assessment) {
  if (!assessment) return 'unknown';
  if (['draft', 'review', 'completed'].includes(assessment.status)) return assessment.status;

  const now = Date.now();
  const start = assessment.startAt ? new Date(assessment.startAt).getTime() : null;
  const end = assessment.endAt ? new Date(assessment.endAt).getTime() : null;

  if (!start || !end) return 'pending';
  if (now < start) return 'upcoming';
  if (now <= end) return 'active';
  return 'completed';
}

function assignmentStudentIds(assignment) {
  return (assignment.assignedStudents || [])
    .map((student) => student.assessmentStudentId)
    .filter(Boolean);
}

async function buildCardSummary(assignment, assessment) {
  const studentIds = assignmentStudentIds(assignment);
  const [statusCounts, alertCount] = await Promise.all([
    studentIds.length
      ? AssessmentStudent.aggregate([
          { $match: { _id: { $in: studentIds } } },
          { $group: { _id: '$examStatus', count: { $sum: 1 } } },
        ])
      : [],
    studentIds.length
      ? AssessmentSecurityEvent.countDocuments({
          assessmentId: assessment._id,
          assessmentStudentId: { $in: studentIds },
          severity: { $in: ['warning', 'critical'] },
        })
      : 0,
  ]);

  const byStatus = statusCounts.reduce((acc, item) => {
    acc[item._id || 'unknown'] = item.count;
    return acc;
  }, {});

  return {
    assignedStudents: studentIds.length,
    activeStudents: byStatus.in_progress || 0,
    submittedStudents: (byStatus.submitted || 0) + (byStatus.ufm || 0),
    notStartedStudents: byStatus.not_started || 0,
    flaggedStudents: byStatus.ufm || 0,
    alertCount,
  };
}

async function findProctorAssignment(req, assignmentId) {
  return AssessmentProctor.findOne({
    _id: assignmentId,
    email: req.user.email,
  }).select('+passwordHash +passwordPreview');
}

router.get('/assignments', async (req, res, next) => {
  try {
    const assignments = await AssessmentProctor.find({ email: req.user.email })
      .sort({ updatedAt: -1 })
      .select('+passwordPreview')
      .lean();

    const assessmentIds = assignments.map((assignment) => assignment.assessmentId).filter(Boolean);
    const assessments = await Assessment.find({ _id: { $in: assessmentIds } }).lean();
    const assessmentById = new Map(assessments.map((assessment) => [String(assessment._id), assessment]));

    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const assessment = assessmentById.get(String(assignment.assessmentId));
        const summary = assessment ? await buildCardSummary(assignment, assessment) : {};

        return {
          assignmentId: assignment._id,
          assessmentId: assignment.assessmentId,
          title: assessment?.title || 'Assessment removed',
          assessmentCode: assessment?.assessmentCode || '',
          status: assessment ? operationalStatus(assessment) : 'missing',
          mailStatus: assignment.mailStatus,
          activeStatus: assignment.activeStatus,
          window: assessment ? serializeWindow(assessment) : {},
          settings: assessment?.settings || {},
          summary,
        };
      })
    );

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/assignments/:assignmentId/verify', proctorVerifyLimiter, validateBody(proctorVerifyBodySchema), async (req, res, next) => {
  try {
    const assignment = await findProctorAssignment(req, req.params.assignmentId);

    if (!assignment) {
      return res.status(404).json({ message: 'Assigned assessment was not found for this proctor.' });
    }

    const password = String(req.body.password || '');
    if (!password) {
      return res.status(400).json({ message: 'Assessment password is required.' });
    }

    const isValid = await User.schema.methods.comparePassword.call(assignment, password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid assessment password.' });
    }

    const assessment = await Assessment.findById(assignment.assessmentId).lean();
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment was not found.' });
    }

    const studentIds = assignmentStudentIds(assignment);
    const [students, attempts, recentAlerts] = await Promise.all([
      studentIds.length
        ? AssessmentStudent.find({ _id: { $in: studentIds } })
            .sort({ courseName: 1, name: 1 })
            .lean()
        : [],
      studentIds.length
        ? AssessmentAttempt.find({ assessmentId: assessment._id, assessmentStudentId: { $in: studentIds } }).lean()
        : [],
      studentIds.length
        ? AssessmentSecurityEvent.find({
            assessmentId: assessment._id,
            assessmentStudentId: { $in: studentIds },
            severity: { $in: ['warning', 'critical'] },
          })
            .sort({ occurredAt: -1 })
            .limit(25)
            .lean()
        : [],
    ]);

    const attemptByStudentId = new Map(attempts.map((attempt) => [String(attempt.assessmentStudentId), attempt]));
    const alertCountsByStudentId = recentAlerts.reduce((acc, event) => {
      const key = String(event.assessmentStudentId);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    assignment.activeStatus = 'online';
    await assignment.save();

    await writeAuditLog(req, {
      action: 'proctor.assessment.open',
      targetType: 'AssessmentProctor',
      targetId: assignment._id,
      newValue: {
        assessmentId: assessment._id,
        assignedStudents: students.length,
      },
    });

    return res.json({
      assignment: {
        assignmentId: assignment._id,
        assessmentId: assessment._id,
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
        status: operationalStatus(assessment),
        window: serializeWindow(assessment),
        settings: assessment.settings || {},
      },
      students: students.map((student) => {
        const attempt = attemptByStudentId.get(String(student._id));
        return {
          id: student._id,
          name: student.name,
          email: student.email,
          applicationNumber: student.applicationNumber,
          courseName: student.courseName,
          courseId: student.courseId,
          examId: student.generatedExamId,
          examStatus: student.examStatus,
          mailStatus: student.mailStatus,
          attemptStatus: attempt?.status || 'not_started',
          lastHeartbeatAt: attempt?.lastHeartbeatAt,
          securityScore: attempt?.securityScore || 0,
          alertCount: alertCountsByStudentId[String(student._id)] || 0,
        };
      }),
      alerts: recentAlerts.map((event) => ({
        id: event._id,
        studentId: event.assessmentStudentId,
        type: event.type,
        severity: event.severity,
        message: event.message,
        metadata: event.metadata || {},
        occurredAt: event.occurredAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/assignments/:assignmentId/students/:studentId/ufm', proctorActionLimiter, validateBody(ufmBodySchema), async (req, res, next) => {
  try {
    const assignment = await AssessmentProctor.findOne({
      _id: req.params.assignmentId,
      email: req.user.email,
      'assignedStudents.assessmentStudentId': req.params.studentId,
    }).lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Student was not found in this proctor assignment.' });
    }

    const [assessment, student, attempt] = await Promise.all([
      Assessment.findById(assignment.assessmentId).lean(),
      AssessmentStudent.findById(req.params.studentId),
      AssessmentAttempt.findOne({
        assessmentId: assignment.assessmentId,
        assessmentStudentId: req.params.studentId,
      }),
    ]);

    if (!assessment || !student) {
      return res.status(404).json({ message: 'Assigned student or assessment was not found.' });
    }

    if (!attempt) {
      return res.status(400).json({ message: 'UFM can be marked after the student starts the exam.' });
    }

    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'UFM reason is required.' });
    }

    const event = await AssessmentSecurityEvent.create({
      assessmentId: assessment._id,
      attemptId: attempt._id,
      assessmentStudentId: student._id,
      ownerAdminId: assessment.ownerAdminId,
      type: 'ufm_pending',
      severity: 'critical',
      score: 0,
      message: reason,
      metadata: {
        proctorId: req.user._id,
        proctorName: req.user.name,
        proctorEmail: req.user.email,
        reviewStatus: 'pending',
      },
      occurredAt: new Date(),
    });

    const alertCount = await AssessmentSecurityEvent.countDocuments({
      assessmentId: assessment._id,
      assessmentStudentId: student._id,
      severity: { $in: ['warning', 'critical'] },
    });

    const payload = {
      assessmentId: assessment._id,
      proctorAssignmentId: assignment._id,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        applicationNumber: student.applicationNumber,
        courseName: student.courseName,
        courseId: student.courseId,
        examId: student.generatedExamId,
        examStatus: student.examStatus,
        mailStatus: student.mailStatus,
        attemptStatus: attempt.status,
        lastHeartbeatAt: attempt.lastHeartbeatAt,
        securityScore: attempt.securityScore || 0,
        alertCount,
      },
      event: {
        id: event._id,
        studentId: event.assessmentStudentId,
        type: event.type,
        severity: event.severity,
        message: event.message,
        occurredAt: event.occurredAt,
      },
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`proctor:${assignment._id}`).emit('proctor:security-event', payload);
    }

    await writeAuditLog(req, {
      action: 'proctor.ufm.mark_pending',
      targetType: 'AssessmentStudent',
      targetId: student._id,
      newValue: {
        assessmentId: assessment._id,
        reason,
      },
    });

    return res.status(201).json({
      message: 'UFM marked for admin review.',
      event: payload.event,
      student: payload.student,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
