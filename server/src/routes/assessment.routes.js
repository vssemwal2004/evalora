const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentStudent = require('../models/AssessmentStudent');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentAnswer = require('../models/AssessmentAnswer');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { adminWriteLimiter } = require('../middleware/rateLimit');
const { objectIdString, validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');
const { getCourseKey, pickPrimaryAssignment, syncAssessmentAssignments } = require('../services/assignment.service');

const router = express.Router();
const optionalObjectIdString = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  objectIdString.optional()
);
const optionalDateString = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.union([
    z.date(),
    z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid date.'),
  ]).optional()
);
const optionalPositiveInteger = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(1440).optional()
);
const assessmentCourseBodySchema = z.object({
  courseName: z.string().trim().max(200).optional(),
  courseId: z.string().trim().max(80).optional(),
  courseCode: z.string().trim().max(80).optional(),
  questionCount: z.coerce.number().int().min(0).max(100000).optional(),
  studentCount: z.coerce.number().int().min(0).max(100000).optional(),
  eligibleStudentCount: z.coerce.number().int().min(0).max(100000).optional(),
  facultyId: optionalObjectIdString,
  facultyName: z.string().trim().max(160).optional(),
  facultyEmail: z.string().trim().toLowerCase().max(320).optional(),
  moderatorId: optionalObjectIdString,
  moderatorName: z.string().trim().max(160).optional(),
  moderatorEmail: z.string().trim().toLowerCase().max(320).optional(),
}).passthrough();
const assessmentCreateBodySchema = z.object({
  title: z.string().trim().min(1, 'Assessment title is required.').max(200),
  assessmentCode: z.string().trim().min(1, 'Assessment code is required.').max(80),
  type: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  instructions: z.string().trim().max(10000).optional(),
  internalNote: z.string().trim().max(5000).optional(),
  visibility: z.enum(['visible', 'hidden']).optional().default('hidden'),
  questionSource: z.enum(['faculty', 'both', 'admin']).optional().default('both'),
  startAt: optionalDateString,
  endAt: optionalDateString,
  globalDurationMinutes: optionalPositiveInteger,
  courses: z.array(assessmentCourseBodySchema).max(500).optional().default([]),
  settings: z.record(z.unknown()).optional().default({}),
  status: z.enum(['draft', 'review', 'upcoming', 'active', 'pending', 'completed']).optional().default('draft'),
}).passthrough();
const assessmentPatchBodySchema = assessmentCreateBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.'
);
const visibilityBodySchema = z.object({
  visibility: z.enum(['visible', 'hidden']),
});
const assessmentStatusBodySchema = z.object({
  status: z.enum(['draft', 'review', 'upcoming', 'active', 'pending', 'completed']),
});
const restartCourseBodySchema = z.object({
  courseSubdocumentId: optionalObjectIdString,
  course: assessmentCourseBodySchema.optional(),
  message: z.string().trim().max(2000).optional().default(''),
}).passthrough();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));
router.use('/:id', validateObjectIdParams('id'));

function getScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function getAssessmentListBaseQuery(req) {
  const query = getScopedQuery(req);
  const mine = String(req.query.mine || '').trim() === 'true';

  if (mine) {
    query.createdBy = req.user._id;
  }

  return query;
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

function emptyReviewSummary() {
  return {
    total: 0,
    completed: 0,
    progressPercent: 0,
    assigned: 0,
    in_progress: 0,
    submitted: 0,
    rejected: 0,
    approved: 0,
    readyToPublish: false,
  };
}

function buildReviewSummary(counts, assessmentId, assessment, assignments = [], questionMappings = []) {
  const summary = emptyReviewSummary();
  const courses = assessment?.courses || [];
  const assignmentGroups = new Map();
  assignments
    .filter((item) => String(item.assessmentId) === String(assessmentId))
    .forEach((item) => {
      const courseKey = item.courseKey || getCourseKey(item);
      if (!assignmentGroups.has(courseKey)) assignmentGroups.set(courseKey, []);
      assignmentGroups.get(courseKey).push(item);
      const subdocumentKey = `subdocument:${String(item.courseSubdocumentId)}`;
      if (!assignmentGroups.has(subdocumentKey)) assignmentGroups.set(subdocumentKey, []);
      assignmentGroups.get(subdocumentKey).push(item);
    });
  const questionsByCourseKey = new Map(
    questionMappings
      .filter((item) => String(item._id.assessmentId) === String(assessmentId))
      .map((item) => [`${String(item._id.courseName || '').toLowerCase()}|${String(item._id.courseId || '')}`, item])
  );

  summary.total = courses.length;
  summary.courses = courses.map((course) => {
    const assignment = pickPrimaryAssignment([
      ...(assignmentGroups.get(`subdocument:${String(course._id)}`) || []),
      ...(assignmentGroups.get(getCourseKey(course)) || []),
    ]);
    const questionMapping = questionsByCourseKey.get(`${String(course.courseName || '').toLowerCase()}|${String(course.courseId || '')}`);
    const hasQuestions = Number(course.questionCount || 0) > 0 || Number(questionMapping?.count || 0) > 0;
    const directlyMapped = hasQuestions && (!assignment || assignment.status === 'assigned');
    const completed = assignment ? assignment.status === 'approved' || directlyMapped : hasQuestions;
    const status = completed && directlyMapped ? 'mapped' : assignment?.status || (hasQuestions ? 'mapped' : 'pending');
    const paperHeading = questionMapping?.paperHeadings?.filter(Boolean)?.[0] || '';

    if (completed) summary.completed += 1;
    if (Object.prototype.hasOwnProperty.call(summary, status)) summary[status] += 1;

    return {
      courseSubdocumentId: course._id,
      courseName: course.courseName,
      courseId: course.courseId,
      questionCount: course.questionCount || 0,
      facultyName: course.facultyName,
      facultyEmail: course.facultyEmail,
      moderatorName: course.moderatorName,
      moderatorEmail: course.moderatorEmail,
      status,
      completed,
      paperHeading,
    };
  });

  summary.progressPercent = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;
  summary.readyToPublish = summary.total > 0 && summary.completed === summary.total;
  return summary;
}

async function getReviewSummary(assessmentId) {
  const [assessment, assignments, counts, questionMappings] = await Promise.all([
    Assessment.findById(assessmentId),
    AssessmentAssignment.find({ assessmentId }),
    AssessmentAssignment.aggregate([
      { $match: { assessmentId } },
      { $group: { _id: { assessmentId: '$assessmentId', status: '$status' }, count: { $sum: 1 } } },
    ]),
    AssessmentQuestion.aggregate([
      { $match: { assessmentId } },
      {
        $group: {
          _id: { assessmentId: '$assessmentId', courseName: '$courseName', courseId: '$courseId' },
          count: { $sum: 1 },
          paperHeadings: { $addToSet: '$sourcePaperHeading' },
        },
      },
    ]),
  ]);
  return buildReviewSummary(counts, assessmentId, assessment, assignments, questionMappings);
}

function createDuplicateCode(code) {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${String(code || 'EVL').slice(0, 28)}-CP-${random}`.toUpperCase();
}

function createMockCode(code) {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${String(code || 'EVL').slice(0, 25)}-MK-${random}`.toUpperCase();
}

async function allowReusableAssignmentCredentialIndexes() {
  await Promise.all(
    [
      [AssessmentStudent, 'generatedExamId_1'],
      [AssessmentProctor, 'generatedProctorId_1'],
    ].map(async ([Model, indexName]) => {
      try {
        const indexes = await Model.collection.indexes();
        const index = indexes.find((item) => item.name === indexName);
        if (index?.unique) {
          await Model.collection.dropIndex(indexName);
        }
      } catch (error) {
        if (error.codeName !== 'IndexNotFound') throw error;
      }
    })
  );
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

    const baseQuery = getAssessmentListBaseQuery(req);
    const query = { ...baseQuery };

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
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const assessmentIds = items.map((assessment) => assessment._id);
    const [studentMailCounts, proctorMailCounts, reviewCounts, reviewAssignments, questionMappings] = assessmentIds.length > 0
      ? await Promise.all([
        AssessmentStudent.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          { $group: { _id: { assessmentId: '$assessmentId', mailStatus: '$mailStatus' }, count: { $sum: 1 } } },
        ]),
        AssessmentProctor.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          { $group: { _id: { assessmentId: '$assessmentId', mailStatus: '$mailStatus' }, count: { $sum: 1 } } },
        ]),
        AssessmentAssignment.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          { $group: { _id: { assessmentId: '$assessmentId', status: '$status' }, count: { $sum: 1 } } },
        ]),
        AssessmentAssignment.find({ assessmentId: { $in: assessmentIds } }),
        AssessmentQuestion.aggregate([
          { $match: { assessmentId: { $in: assessmentIds } } },
          {
            $group: {
              _id: { assessmentId: '$assessmentId', courseName: '$courseName', courseId: '$courseId' },
              count: { $sum: 1 },
              paperHeadings: { $addToSet: '$sourcePaperHeading' },
            },
          },
        ]),
      ])
      : [[], [], [], [], []];

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
        reviewSummary: buildReviewSummary(reviewCounts, assessment._id, assessment, reviewAssignments, questionMappings),
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

router.post('/', adminWriteLimiter, validateBody(assessmentCreateBodySchema), requirePermission('assessment.create'), async (req, res, next) => {
  try {
    const {
      title,
      assessmentCode,
      type,
      description,
      instructions,
      internalNote,
      visibility = 'hidden',
      questionSource = 'both',
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

    if (!['faculty', 'both', 'admin'].includes(questionSource)) {
      return res.status(400).json({ message: 'Invalid question source.' });
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
      questionSource,
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

    return res.status(201).json({
      assessment: {
        ...serializeAssessment(assessment),
        reviewSummary: emptyReviewSummary(),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Assessment code already exists for this owner.' });
    }

    return next(error);
  }
});

router.patch('/:id', adminWriteLimiter, validateBody(assessmentPatchBodySchema), requirePermission('assessment.edit'), async (req, res, next) => {
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
      questionSource,
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

    if (questionSource && !['faculty', 'both', 'admin'].includes(questionSource)) {
      return res.status(400).json({ message: 'Invalid question source.' });
    }

    if (status && !['draft', 'review', 'upcoming', 'active', 'pending', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid assessment status.' });
    }

    if (status === 'review' && req.user.role !== ROLES.SUPER_ADMIN && !req.user.permissions.includes('assessment.review.send')) {
      return res.status(403).json({ message: 'You do not have permission to send assessments for review.' });
    }

    if (
      status === 'pending' &&
      visibility === 'visible' &&
      req.user.role !== ROLES.SUPER_ADMIN &&
      !req.user.permissions.includes('assessment.publish')
    ) {
      return res.status(403).json({ message: 'You do not have permission to publish assessments.' });
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
    if (Object.prototype.hasOwnProperty.call(req.body, 'questionSource')) assessment.questionSource = questionSource;
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

    if (assessment.status === 'pending' && assessment.visibility === 'visible') {
      const reviewSummary = await getReviewSummary(assessment._id);
      if (!reviewSummary.readyToPublish) {
        return res.status(400).json({
          message: 'Moderator approval is required for every assigned course before this assessment can be published.',
          reviewSummary,
        });
      }
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

    return res.json({
      assessment: {
        ...serializeAssessment(assessment),
        reviewSummary: await getReviewSummary(assessment._id),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Assessment code already exists for this owner.' });
    }

    return next(error);
  }
});

router.patch('/:id/visibility', adminWriteLimiter, validateBody(visibilityBodySchema), requirePermission('assessment.hide'), async (req, res, next) => {
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
        reviewSummary: await getReviewSummary(assessment._id),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', adminWriteLimiter, validateBody(assessmentStatusBodySchema), requirePermission('assessment.complete'), async (req, res, next) => {
  try {
    const status = String(req.body.status || '').trim();

    if (!['draft', 'review', 'upcoming', 'active', 'pending', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid assessment status.' });
    }

    if (status === 'review' && req.user.role !== ROLES.SUPER_ADMIN && !req.user.permissions.includes('assessment.review.send')) {
      return res.status(403).json({ message: 'You do not have permission to send assessments for review.' });
    }

    if (status === 'pending' && req.user.role !== ROLES.SUPER_ADMIN && !req.user.permissions.includes('assessment.publish')) {
      return res.status(403).json({ message: 'You do not have permission to publish assessments.' });
    }

    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const previousStatus = assessment.status;
    assessment.status = status;

    if (assessment.status === 'pending') {
      const reviewSummary = await getReviewSummary(assessment._id);
      if (!reviewSummary.readyToPublish) {
        return res.status(400).json({
          message: 'Moderator approval is required for every assigned course before this assessment can be published.',
          reviewSummary,
        });
      }
    }

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
        reviewSummary: await getReviewSummary(assessment._id),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/assignments/restart-course', adminWriteLimiter, validateBody(restartCourseBodySchema), requirePermission('assessment.review.send'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const courseSubdocumentId = String(req.body.courseSubdocumentId || '').trim();
    const bodyCourseKey = req.body.course ? getCourseKey(req.body.course) : '';
    const course = (assessment.courses || []).find((item) =>
      String(item._id) === courseSubdocumentId || (bodyCourseKey && getCourseKey(item) === bodyCourseKey)
    );

    if (!course) {
      return res.status(404).json({ message: 'Course was not found on this assessment.' });
    }

    if (!course.facultyId || !course.moderatorId) {
      return res.status(400).json({ message: 'Assign faculty and moderator before restarting this course review.' });
    }

    assessment.status = 'review';
    assessment.visibility = 'hidden';
    assessment.updatedBy = req.user._id;
    await assessment.save();

    const restartMessage = String(req.body.message || '').trim();
    await syncAssessmentAssignments(assessment, req.user, { restartCourseKeys: [getCourseKey(course)], restartMessage });

    await writeAuditLog(req, {
      action: 'assessment.assignment.restart',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        courseName: course.courseName,
        courseId: course.courseId,
      },
    });

    return res.json({
      assessment: {
        ...assessment.toObject(),
        operationalStatus: deriveOperationalStatus(assessment),
        reviewSummary: await getReviewSummary(assessment._id),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/assignments/passwords', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const assignments = await AssessmentAssignment.find({ assessmentId: assessment._id })
      .select('+passwordPreview')
      .populate('facultyId', 'name email')
      .populate('moderatorId', 'name email')
      .sort({ updatedAt: -1 });

    const grouped = new Map();
    assignments.forEach((assignment) => {
      const courseKey = assignment.courseKey || getCourseKey(assignment);
      if (!grouped.has(courseKey)) grouped.set(courseKey, []);
      grouped.get(courseKey).push(assignment);
    });

    const items = (assessment.courses || []).map((course) => {
      const assignment = pickPrimaryAssignment(grouped.get(getCourseKey(course)) || []);
      return {
        courseSubdocumentId: course._id,
        courseName: course.courseName,
        courseId: course.courseId,
        faculty: assignment?.facultyId ? {
          id: assignment.facultyId._id,
          name: assignment.facultyId.name,
          email: assignment.facultyId.email,
        } : course.facultyId ? {
          id: course.facultyId,
          name: course.facultyName,
          email: course.facultyEmail,
        } : null,
        moderator: assignment?.moderatorId ? {
          id: assignment.moderatorId._id,
          name: assignment.moderatorId.name,
          email: assignment.moderatorId.email,
        } : course.moderatorId ? {
          id: course.moderatorId,
          name: course.moderatorName,
          email: course.moderatorEmail,
        } : null,
        assignmentId: assignment?._id,
        status: assignment?.status || 'not_generated',
        password: assignment?.passwordPreview || '',
        facultyMail: assignment?.facultyMail || null,
        moderatorMail: assignment?.moderatorMail || null,
        updatedAt: assignment?.updatedAt,
      };
    });

    await writeAuditLog(req, {
      action: 'assessment.assignment.password.view',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: { assignmentCount: items.filter((item) => item.assignmentId).length },
    });

    return res.json({
      assessment: {
        _id: assessment._id,
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
      },
      items,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/password', adminWriteLimiter, requirePermission('assessment.edit'), (_req, res) => {
  return res.status(410).json({ message: 'Common assessment passwords are no longer used. Each user receives a unique password.' });
});

router.post('/:id/duplicate', adminWriteLimiter, requirePermission('assessment.duplicate'), async (req, res, next) => {
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
      questionSource: source.questionSource || 'both',
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

    return res.status(201).json({
      assessment: {
        ...serializeAssessment(duplicate),
        reviewSummary: emptyReviewSummary(),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Unable to generate a unique duplicate code. Try again.' });
    }

    return next(error);
  }
});

router.post('/:id/copy-as-mock', adminWriteLimiter, requirePermission('assessment.duplicate'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    await allowReusableAssignmentCredentialIndexes();

    const [sourceStudents, sourceProctors] = await Promise.all([
      AssessmentStudent.find({ assessmentId: assessment._id }).select('+passwordHash +passwordPreview'),
      AssessmentProctor.find({ assessmentId: assessment._id }).select('+passwordHash +passwordPreview'),
    ]);

    const courseStatsByKey = new Map();
    sourceStudents.forEach((student) => {
      const key = `${student.courseName}|${student.courseId || ''}`;
      const current = courseStatsByKey.get(key) || {
        courseName: student.courseName,
        courseId: student.courseId || '',
        studentCount: 0,
        eligibleStudentCount: 0,
      };
      current.studentCount += 1;
      if (student.eligibilityStatus === 'eligible') {
        current.eligibleStudentCount += 1;
      }
      courseStatsByKey.set(key, current);
    });

    const mock = await Assessment.create({
      title: `${assessment.title} Mock`,
      assessmentCode: createMockCode(assessment.assessmentCode),
      type: 'mock',
      description: '',
      instructions: '',
      internalNote: '',
      ownerAdminId: req.user.role === ROLES.SUPER_ADMIN ? assessment.ownerAdminId : req.user._id,
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      createdByRole: req.user.role,
      updatedBy: req.user._id,
      status: 'draft',
      visibility: 'hidden',
      questionSource: 'both',
      startAt: undefined,
      endAt: undefined,
      globalDurationMinutes: undefined,
      courses: Array.from(courseStatsByKey.values()).map((course) => ({
        courseName: course.courseName,
        courseId: course.courseId,
        questionCount: 0,
        studentCount: course.studentCount,
        eligibleStudentCount: course.eligibleStudentCount,
      })),
    });

    const copiedStudentBySourceId = new Map();
    const copiedStudents = [];

    for (const student of sourceStudents) {
      const copiedStudent = await AssessmentStudent.create({
        assessmentId: mock._id,
        studentProfileId: student.studentProfileId,
        ownerAdminId: mock.ownerAdminId,
        name: student.name,
        email: student.email,
        applicationNumber: student.applicationNumber,
        courseName: student.courseName,
        courseId: student.courseId,
        generatedExamId: student.generatedExamId,
        passwordHash: student.passwordHash,
        passwordPreview: student.passwordPreview,
        eligibilityStatus: student.eligibilityStatus,
        eligibilityReason: student.eligibilityReason,
        courseMatchStatus: student.courseMatchStatus,
        mailStatus: 'not_sent',
        examStatus: 'not_started',
        addedBy: req.user._id,
      });

      copiedStudentBySourceId.set(String(student._id), copiedStudent);
      copiedStudents.push(copiedStudent);
    }

    const studentProctorUpdates = [];
    const copiedProctors = [];

    for (const proctor of sourceProctors) {
      const assignedStudents = (proctor.assignedStudents || [])
        .map((assignedStudent) => copiedStudentBySourceId.get(String(assignedStudent.assessmentStudentId)))
        .filter(Boolean)
        .map((student) => ({
          assessmentStudentId: student._id,
          name: student.name,
          email: student.email,
          generatedExamId: student.generatedExamId,
          courseName: student.courseName,
          courseId: student.courseId,
        }));

      const copiedProctor = await AssessmentProctor.create({
        assessmentId: mock._id,
        proctorProfileId: proctor.proctorProfileId,
        ownerAdminId: mock.ownerAdminId,
        name: proctor.name,
        email: proctor.email,
        generatedProctorId: proctor.generatedProctorId,
        passwordHash: proctor.passwordHash,
        passwordPreview: proctor.passwordPreview,
        assignedStudents,
        mailStatus: 'not_sent',
        activeStatus: 'offline',
        addedBy: req.user._id,
      });

      assignedStudents.forEach((student) => {
        studentProctorUpdates.push({
          updateOne: {
            filter: { _id: student.assessmentStudentId },
            update: { $set: { assignedProctorId: copiedProctor._id } },
          },
        });
      });
      copiedProctors.push(copiedProctor);
    }

    if (studentProctorUpdates.length > 0) {
      await AssessmentStudent.bulkWrite(studentProctorUpdates);
    }

    mock.counts.proctors = copiedProctors.length;
    await mock.save();

    await writeAuditLog(req, {
      action: 'assessment.copy_as_mock',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        mockAssessmentId: mock._id,
        mockAssessmentCode: mock.assessmentCode,
        studentsCopied: copiedStudents.length,
        proctorsCopied: copiedProctors.length,
      },
    });

    return res.status(201).json({
      assessment: {
        ...serializeAssessment(mock),
        reviewSummary: emptyReviewSummary(),
      },
      summary: {
        studentsCopied: copiedStudents.length,
        proctorsCopied: copiedProctors.length,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Unable to generate a unique mock assessment copy. Try again.' });
    }

    return next(error);
  }
});

router.post('/:id/reset-attempts', adminWriteLimiter, requirePermission('assessment.edit'), async (req, res, next) => {
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

router.delete('/:id', adminWriteLimiter, requirePermission('assessment.delete'), async (req, res, next) => {
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
        reviewSummary: await getReviewSummary(assessment._id),
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
