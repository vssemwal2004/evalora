const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentStudent = require('../models/AssessmentStudent');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentAnswer = require('../models/AssessmentAnswer');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');
const { syncAssessmentAssignments } = require('../services/assignment.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function deriveOperationalStatus(assessment) {
  if (assessment.status === 'draft' || assessment.status === 'review' || assessment.status === 'completed') {
    return assessment.status;
  }

  const now = Date.now();
  const start = assessment.startAt ? new Date(assessment.startAt).getTime() : null;
  const end = assessment.endAt ? new Date(assessment.endAt).getTime() : null;

  if (!start || !end) {
    return 'pending';
  }

  if (now < start) {
    return 'upcoming';
  }

  if (now >= start && now <= end) {
    return 'active';
  }

  return 'completed';
}

function serializeAssessment(assessment) {
  const data = assessment.toObject();
  delete data.commonAssessmentPasswordHash;
  return {
    ...data,
    operationalStatus: deriveOperationalStatus(assessment),
  };
}

function createDuplicateCode(code) {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${String(code || 'EVL').slice(0, 28)}-CP-${random}`.toUpperCase();
}

function normalizeDateValue(value) {
  return value ? new Date(value) : undefined;
}

function normalizeCourses(courses) {
  return (Array.isArray(courses) ? courses : [])
    .filter((course) => course.courseName || course.courseId)
    .map((course) => ({
      courseName: String(course.courseName || '').trim(),
      courseId: String(course.courseId || '').trim().toUpperCase(),
      questionCount: Number(course.questionCount || 0),
      studentCount: Number(course.studentCount || 0),
      eligibleStudentCount: Number(course.eligibleStudentCount || 0),
      facultyId: course.facultyId || undefined,
      facultyName: String(course.facultyName || '').trim(),
      facultyEmail: String(course.facultyEmail || '').trim().toLowerCase(),
      moderatorId: course.moderatorId || undefined,
      moderatorName: String(course.moderatorName || '').trim(),
      moderatorEmail: String(course.moderatorEmail || '').trim().toLowerCase(),
    }));
}

async function findScopedAssessment(req) {
  const query = { _id: req.params.id, ...getScopedQuery(req) };
  return Assessment.findOne(query);
}

router.get('/', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const course = String(req.query.course || '').trim();

    const query = getScopedQuery(req);

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { assessmentCode: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
      ];
    }

    if (course) {
      query.$or = [
        ...(query.$or || []),
        { 'courses.courseName': { $regex: course, $options: 'i' } },
        { 'courses.courseId': { $regex: course, $options: 'i' } },
      ];
    }

    const [items, total, statusCounts] = await Promise.all([
      Assessment.find(query)
        .populate('ownerAdminId', 'name email')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Assessment.countDocuments(query),
      Assessment.aggregate([
        { $match: getScopedQuery(req) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const assessmentIds = items.map((assessment) => assessment._id);
    const [studentMailCounts, proctorMailCounts] = assessmentIds.length > 0
      ? await Promise.all([
        AssessmentStudent.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          { $group: { _id: { assessmentId: '$assessmentId', mailStatus: '$mailStatus' }, count: { $sum: 1 } } },
        ]),
        AssessmentProctor.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          { $group: { _id: { assessmentId: '$assessmentId', mailStatus: '$mailStatus' }, count: { $sum: 1 } } },
        ]),
      ])
      : [[], []];

    const makeMailSummary = (counts, assessmentId) =>
      counts
        .filter((item) => String(item._id.assessmentId) === String(assessmentId))
        .reduce(
          (acc, item) => {
            acc.total += item.count;
            acc[item._id.mailStatus] = item.count;
            if (['sent', 'resent'].includes(item._id.mailStatus)) acc.sent += item.count;
            return acc;
          },
          { total: 0, sent: 0, not_sent: 0, queued: 0, failed: 0, resent: 0 }
        );

    res.json({
      items: items.map((assessment) => ({
        ...assessment.toObject(),
        operationalStatus: deriveOperationalStatus(assessment),
        mailSummary: {
          students: makeMailSummary(studentMailCounts, assessment._id),
          proctors: makeMailSummary(proctorMailCounts, assessment._id),
        },
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      statusCounts: statusCounts.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          acc.all += item.count;
          return acc;
        },
        { all: 0, draft: 0, review: 0, upcoming: 0, active: 0, pending: 0, completed: 0 }
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('assessment.create'), async (req, res, next) => {
  try {
    const {
      title,
      assessmentCode,
      type,
      description,
      instructions,
      internalNote,
      visibility = 'hidden',
      startAt,
      endAt,
      globalDurationMinutes,
      courses = [],
      settings = {},
      status = 'draft',
    } = req.body;

    if (!title || !assessmentCode) {
      return res.status(400).json({ message: 'Assessment title and code are required.' });
    }

    const normalizedCourses = normalizeCourses(courses);

    if (normalizedCourses.some((course) => !course.courseName)) {
      return res.status(400).json({ message: 'Every course must include a course name.' });
    }

    const assessment = await Assessment.create({
      title,
      assessmentCode: String(assessmentCode).trim().toUpperCase(),
      type,
      description,
      instructions,
      internalNote,
      ownerAdminId: req.user._id,
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      createdByRole: req.user.role,
      updatedBy: req.user._id,
      status,
      visibility,
      startAt: normalizeDateValue(startAt),
      endAt: normalizeDateValue(endAt),
      globalDurationMinutes: globalDurationMinutes ? Number(globalDurationMinutes) : undefined,
      courses: normalizedCourses,
      settings: { ...settings, passwordRequired: false },
    });

    await writeAuditLog(req, {
      action: 'assessment.create',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
        status: assessment.status,
        courseCount: assessment.counts.courses,
      },
    });

    return res.status(201).json({ assessment: serializeAssessment(assessment) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Assessment code already exists for this owner.' });
    }

    return next(error);
  }
});

router.patch('/:id', requirePermission('assessment.edit'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const {
      title,
      assessmentCode,
      type,
      description,
      instructions,
      internalNote,
      visibility,
      startAt,
      endAt,
      globalDurationMinutes,
      courses,
      settings,
      status,
    } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, 'title') && !String(title || '').trim()) {
      return res.status(400).json({ message: 'Assessment title is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'assessmentCode') && !String(assessmentCode || '').trim()) {
      return res.status(400).json({ message: 'Assessment code is required.' });
    }

    if (visibility && !['visible', 'hidden'].includes(visibility)) {
      return res.status(400).json({ message: 'Visibility must be visible or hidden.' });
    }

    if (status && !['draft', 'review', 'upcoming', 'active', 'pending', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid assessment status.' });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'globalDurationMinutes') &&
      Number(globalDurationMinutes) < 1
    ) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'courses')) {
      const normalizedCourses = normalizeCourses(courses);

      if (normalizedCourses.some((course) => !course.courseName)) {
        return res.status(400).json({ message: 'Every course must include a course name.' });
      }

      assessment.courses = normalizedCourses;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) assessment.title = String(title).trim();
    if (Object.prototype.hasOwnProperty.call(req.body, 'assessmentCode')) {
      assessment.assessmentCode = String(assessmentCode).trim().toUpperCase();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'type')) assessment.type = type;
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) assessment.description = description;
    if (Object.prototype.hasOwnProperty.call(req.body, 'instructions')) assessment.instructions = instructions;
    if (Object.prototype.hasOwnProperty.call(req.body, 'internalNote')) assessment.internalNote = internalNote;
    if (Object.prototype.hasOwnProperty.call(req.body, 'visibility')) assessment.visibility = visibility;
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) assessment.status = status;
    if (Object.prototype.hasOwnProperty.call(req.body, 'startAt')) assessment.startAt = normalizeDateValue(startAt);
    if (Object.prototype.hasOwnProperty.call(req.body, 'endAt')) assessment.endAt = normalizeDateValue(endAt);
    if (Object.prototype.hasOwnProperty.call(req.body, 'globalDurationMinutes')) {
      assessment.globalDurationMinutes = Number(globalDurationMinutes);
    }

    if (settings && typeof settings === 'object') {
      assessment.settings = {
        ...(assessment.settings || {}),
        ...settings,
        passwordRequired: false,
      };
    }

    assessment.updatedBy = req.user._id;
    await assessment.save();

    if (assessment.status === 'review' || (assessment.status === 'pending' && assessment.visibility === 'visible')) {
      await syncAssessmentAssignments(assessment, req.user);
    }

    await writeAuditLog(req, {
      action: 'assessment.update',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
        status: assessment.status,
      },
    });

    return res.json({ assessment: serializeAssessment(assessment) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Assessment code already exists for this owner.' });
    }

    return next(error);
  }
});

router.patch('/:id/visibility', requirePermission('assessment.hide'), async (req, res, next) => {
  try {
    const visibility = String(req.body.visibility || '').trim();

    if (!['visible', 'hidden'].includes(visibility)) {
      return res.status(400).json({ message: 'Visibility must be visible or hidden.' });
    }

    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const previousVisibility = assessment.visibility;
    assessment.visibility = visibility;
    assessment.updatedBy = req.user._id;
    await assessment.save();

    await writeAuditLog(req, {
      action: 'assessment.visibility.update',
      targetType: 'Assessment',
      targetId: assessment._id,
      oldValue: { visibility: previousVisibility },
      newValue: { visibility },
    });

    return res.json({
      assessment: {
        ...assessment.toObject(),
        operationalStatus: deriveOperationalStatus(assessment),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', requirePermission('assessment.complete'), async (req, res, next) => {
  try {
    const status = String(req.body.status || '').trim();

    if (!['draft', 'review', 'upcoming', 'active', 'pending', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid assessment status.' });
    }

    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const previousStatus = assessment.status;
    assessment.status = status;
    assessment.updatedBy = req.user._id;
    await assessment.save();

    if (assessment.status === 'review') {
      await syncAssessmentAssignments(assessment, req.user);
    }

    await writeAuditLog(req, {
      action: 'assessment.status.update',
      targetType: 'Assessment',
      targetId: assessment._id,
      oldValue: { status: previousStatus },
      newValue: { status },
    });

    return res.json({
      assessment: {
        ...assessment.toObject(),
        operationalStatus: deriveOperationalStatus(assessment),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/password', requirePermission('assessment.edit'), (_req, res) => {
  return res.status(410).json({ message: 'Common assessment passwords are no longer used. Each user receives a unique password.' });
});

router.post('/:id/duplicate', requirePermission('assessment.duplicate'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const source = assessment.toObject();
    const duplicate = await Assessment.create({
      title: `${source.title} Copy`,
      assessmentCode: createDuplicateCode(source.assessmentCode),
      type: source.type,
      description: source.description,
      instructions: source.instructions,
      internalNote: source.internalNote,
      ownerAdminId: req.user.role === ROLES.SUPER_ADMIN ? source.ownerAdminId : req.user._id,
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      createdByRole: req.user.role,
      updatedBy: req.user._id,
      status: 'draft',
      visibility: 'hidden',
      startAt: source.startAt,
      endAt: source.endAt,
      globalDurationMinutes: source.globalDurationMinutes,
      courses: (source.courses || []).map((course) => ({
        courseName: course.courseName,
        courseId: course.courseId,
        facultyId: course.facultyId,
        facultyName: course.facultyName,
        facultyEmail: course.facultyEmail,
        moderatorId: course.moderatorId,
        moderatorName: course.moderatorName,
        moderatorEmail: course.moderatorEmail,
      })),
      settings: source.settings,
    });

    const questions = await AssessmentQuestion.find({ assessmentId: assessment._id });

    if (questions.length > 0) {
      await AssessmentQuestion.insertMany(
        questions.map((question) => {
          const item = question.toObject();
          delete item._id;
          delete item.createdAt;
          delete item.updatedAt;
          return {
            ...item,
            assessmentId: duplicate._id,
            ownerAdminId: duplicate.ownerAdminId,
            createdBy: req.user._id,
          };
        })
      );

      const questionCountsByCourse = questions.reduce((acc, question) => {
        const key = `${question.courseName}|${question.courseId || ''}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      duplicate.courses = duplicate.courses.map((course) => ({
        ...course.toObject(),
        questionCount: questionCountsByCourse[`${course.courseName}|${course.courseId || ''}`] || 0,
      }));
      await duplicate.save();
    }

    await writeAuditLog(req, {
      action: 'assessment.duplicate',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        duplicateId: duplicate._id,
        duplicateCode: duplicate.assessmentCode,
      },
    });

    return res.status(201).json({ assessment: serializeAssessment(duplicate) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Unable to generate a unique duplicate code. Try again.' });
    }

    return next(error);
  }
});

router.post('/:id/reset-attempts', requirePermission('assessment.edit'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const [answerResult, securityResult, attemptResult, studentResult] = await Promise.all([
      AssessmentAnswer.deleteMany({ assessmentId: assessment._id }),
      AssessmentSecurityEvent.deleteMany({ assessmentId: assessment._id }),
      AssessmentAttempt.deleteMany({ assessmentId: assessment._id }),
      AssessmentStudent.updateMany(
        { assessmentId: assessment._id },
        { $set: { examStatus: 'not_started' } }
      ),
    ]);

    await writeAuditLog(req, {
      action: 'assessment.attempts.reset',
      targetType: 'Assessment',
      targetId: assessment._id,
      oldValue: {
        attemptsRemoved: attemptResult.deletedCount || 0,
        answersRemoved: answerResult.deletedCount || 0,
        securityEventsRemoved: securityResult.deletedCount || 0,
      },
      newValue: {
        studentsReset: studentResult.modifiedCount || 0,
        examStatus: 'not_started',
      },
    });

    return res.json({
      message: 'All student exam attempts were reset successfully.',
      summary: {
        studentsReset: studentResult.modifiedCount || 0,
        attemptsRemoved: attemptResult.deletedCount || 0,
        answersRemoved: answerResult.deletedCount || 0,
        securityEventsRemoved: securityResult.deletedCount || 0,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requirePermission('assessment.delete'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    await Promise.all([
      AssessmentQuestion.deleteMany({ assessmentId: assessment._id }),
      AssessmentStudent.deleteMany({ assessmentId: assessment._id }),
      AssessmentProctor.deleteMany({ assessmentId: assessment._id }),
    ]);

    await Assessment.deleteOne({ _id: assessment._id });

    await writeAuditLog(req, {
      action: 'assessment.delete',
      targetType: 'Assessment',
      targetId: assessment._id,
      oldValue: {
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
      },
    });

    return res.json({ message: 'Assessment deleted.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.id, ...getScopedQuery(req) })
      .populate('ownerAdminId', 'name email')
      .populate('createdBy', 'name email role');

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    return res.json({
      assessment: {
        ...assessment.toObject(),
        operationalStatus: deriveOperationalStatus(assessment),
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
