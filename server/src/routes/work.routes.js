const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const Question = require('../models/Question');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { signAssignmentToken, verifyAssignmentToken } = require('../utils/tokens');
const { normalizeQuestionPayload } = require('../utils/questionValidation');
const { sendAssignmentMail } = require('../services/credentialMail.service');
const { writeAuditLog } = require('../services/audit.service');
const { getCourseKey, pickPrimaryAssignment } = require('../services/assignment.service');
const { objectIdString, validateBody, validateObjectIdParams, z } = require('../middleware/validate');

const router = express.Router();
const unlockBodySchema = z.object({
  password: z.string().min(1, 'Assignment password is required.').max(200),
});
const importQuestionsBodySchema = z.object({
  questionIds: z.array(objectIdString).min(1, 'Select at least one question.').max(500, 'Import 500 questions or fewer at once.'),
});
const importHeadingsBodySchema = z.object({
  paperHeadings: z.array(z.string().trim().min(1).max(300)).min(1, 'Select at least one library folder.').max(100),
});
const submitBodySchema = z.object({
  message: z.string().trim().max(2000).optional().default(''),
});
const decisionBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(2000).optional().default(''),
});
router.use(authenticate, requireRole(ROLES.FACULTY, ROLES.MODERATOR));

function hasPermission(req, permission) {
  const roleDefaults = {
    [ROLES.FACULTY]: ['work.view', 'assessment.questions.add', 'assessment.questions.edit', 'assessment.submit', 'library.view', 'library.create', 'library.edit', 'library.archive'],
    [ROLES.MODERATOR]: ['work.view', 'assessment.review', 'assessment.questions.edit'],
  };
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  return permissions.includes(permission) || (roleDefaults[req.user?.role] || []).includes(permission);
}

function assignmentScope(req) {
  return req.user.role === ROLES.FACULTY ? { facultyId: req.user._id } : { moderatorId: req.user._id };
}

function serialize(item) {
  const data = item.toObject ? item.toObject() : item;
  delete data.passwordHash;
  delete data.passwordPreview;
  return data;
}

function collapseDuplicateWorkItems(assignments) {
  const grouped = new Map();

  assignments
    .filter((item) => item.assessmentId)
    .forEach((item) => {
      const assessmentId = String(item.assessmentId?._id || item.assessmentId);
      const key = `${assessmentId}|${item.courseKey || getCourseKey(item)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });

  return [...grouped.values()]
    .map((items) => pickPrimaryAssignment(items))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

async function findAssignment(req, { tokenRequired = false } = {}) {
  const assignment = await AssessmentAssignment.findOne({ _id: req.params.id, ...assignmentScope(req) });
  if (!assignment) return null;
  if (tokenRequired) {
    const raw = req.headers['x-assignment-token'];
    let payload;
    try {
      payload = verifyAssignmentToken(raw || '');
    } catch (error) {
      error.statusCode = 401;
      error.publicMessage = 'Unlock this assignment again.';
      throw error;
    }
    if (payload.assignmentId !== String(assignment._id) || payload.sub !== String(req.user._id)) return null;
  }
  return assignment;
}

router.get('/', async (req, res, next) => {
  try {
    if (!hasPermission(req, 'work.view')) return res.status(403).json({ message: 'Assigned work access has not been granted.' });
    const assignments = await AssessmentAssignment.find(assignmentScope(req))
      .populate('assessmentId', 'title assessmentCode type description instructions startAt endAt globalDurationMinutes status counts ownerAdminId')
      .populate('facultyId', 'name email')
      .populate('moderatorId', 'name email')
      .sort({ updatedAt: -1 });
    return res.json({ items: collapseDuplicateWorkItems(assignments).map(serialize) });
  } catch (error) { return next(error); }
});

router.use('/:id', validateObjectIdParams('id'));
router.use('/:id/questions/:questionId', validateObjectIdParams('questionId'));

router.post('/:id/unlock', validateBody(unlockBodySchema), async (req, res, next) => {
  try {
    const assignment = await AssessmentAssignment.findOne({ _id: req.params.id, ...assignmentScope(req) }).select('+passwordHash');
    if (!assignment) return res.status(404).json({ message: 'Assigned work was not found.' });
    const rawPassword = String(req.body.password || '');
    let passwordMatches = await assignment.comparePassword(rawPassword);

    if (!passwordMatches) {
      const siblingAssignments = await AssessmentAssignment.find({
        assessmentId: assignment.assessmentId,
        ...assignmentScope(req),
        _id: { $ne: assignment._id },
      }).select('+passwordHash');
      for (const siblingAssignment of siblingAssignments) {
        if (await siblingAssignment.comparePassword(rawPassword)) {
          passwordMatches = true;
          break;
        }
      }
    }

    if (!passwordMatches) return res.status(401).json({ message: 'Incorrect assignment password.' });
    if (req.user.role === ROLES.FACULTY && assignment.status === 'assigned') {
      assignment.status = 'in_progress';
      assignment.history.push({ action: 'opened', actorId: req.user._id, actorName: req.user.name });
      await assignment.save();
      await writeAuditLog(req, {
        action: 'work.opened',
        targetType: 'AssessmentAssignment',
        targetId: assignment._id,
        newValue: {
          assessmentId: assignment.assessmentId,
          courseName: assignment.courseName,
          courseId: assignment.courseId,
          status: assignment.status,
        },
      });
    }
    return res.json({ token: signAssignmentToken({ assignmentId: assignment._id, userId: req.user._id, role: req.user.role }) });
  } catch (error) { return next(error); }
});

router.get('/:id/details', async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment) return res.status(404).json({ message: 'Assigned work was not found.' });
    const [assessment, questions] = await Promise.all([
      Assessment.findById(assignment.assessmentId).select('-commonAssessmentPasswordHash').populate('ownerAdminId', 'name email'),
      AssessmentQuestion.find({ assessmentId: assignment.assessmentId, courseName: assignment.courseName, ...(assignment.courseId ? { courseId: assignment.courseId } : {}) }).sort({ order: 1, createdAt: 1 }),
    ]);
    return res.json({ assignment: serialize(assignment), assessment, questions, canEdit: hasPermission(req, 'assessment.questions.edit'), canAdd: hasPermission(req, 'assessment.questions.add') });
  } catch (error) {
    return error.statusCode === 401 || error.name === 'JsonWebTokenError'
      ? res.status(401).json({ message: error.publicMessage || 'Unlock this assignment again.' })
      : next(error);
  }
});

router.post('/:id/questions', async (req, res, next) => {
  try {
    return res.status(403).json({ message: 'Create questions in your personal library, then import them into the assessment.' });
  } catch (error) { return next(error); }
});

router.post('/:id/questions/import', validateBody(importQuestionsBodySchema), async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.FACULTY || !hasPermission(req, 'assessment.questions.add') || !hasPermission(req, 'library.view')) return res.status(403).json({ message: 'Library import access has not been granted.' });
    const ids = req.body.questionIds;
    const source = await Question.find({ _id: { $in: ids }, createdBy: req.user._id, status: 'active' });
    const created = await AssessmentQuestion.insertMany(source.map((q) => ({
      ...normalizeQuestionPayload(q.toObject()), assessmentId: assignment.assessmentId, ownerAdminId: assignment.ownerAdminId,
      createdBy: req.user._id, libraryQuestionId: q._id, sourcePaperHeading: q.paperHeading,
      courseName: assignment.courseName, courseId: assignment.courseId,
    })));
    await writeAuditLog(req, {
      action: 'work.question.import',
      targetType: 'AssessmentAssignment',
      targetId: assignment._id,
      newValue: {
        assessmentId: assignment.assessmentId,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
        imported: created.length,
      },
    });
    return res.status(201).json({ items: created, imported: created.length });
  } catch (error) { return next(error); }
});

router.post('/:id/questions/import-headings', validateBody(importHeadingsBodySchema), async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.FACULTY || !hasPermission(req, 'assessment.questions.add') || !hasPermission(req, 'library.view')) {
      return res.status(403).json({ message: 'Library import access has not been granted.' });
    }

    const paperHeadings = Array.from(new Set(req.body.paperHeadings));

    const source = await Question.find({
      paperHeading: { $in: paperHeadings },
      createdBy: req.user._id,
      status: 'active',
    });
    if (!source.length) return res.status(400).json({ message: 'No active questions found in the selected folders.' });

    const sourceIds = source.map((question) => question._id);
    const existing = await AssessmentQuestion.find({
      assessmentId: assignment.assessmentId,
      courseName: assignment.courseName,
      ...(assignment.courseId ? { courseId: assignment.courseId } : {}),
      libraryQuestionId: { $in: sourceIds },
    }).select('libraryQuestionId');
    const existingIds = new Set(existing.map((question) => String(question.libraryQuestionId)));
    const candidates = source.filter((question) => !existingIds.has(String(question._id)));
    if (!candidates.length) {
      return res.status(409).json({ message: 'Selected folders are already added to this assignment.' });
    }

    const created = await AssessmentQuestion.insertMany(candidates.map((question) => ({
        ...normalizeQuestionPayload(question.toObject()),
        assessmentId: assignment.assessmentId,
        ownerAdminId: assignment.ownerAdminId,
        createdBy: req.user._id,
        libraryQuestionId: question._id,
        sourcePaperHeading: question.paperHeading,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
      })));

    await writeAuditLog(req, {
      action: 'work.question.import',
      targetType: 'AssessmentAssignment',
      targetId: assignment._id,
      newValue: {
        assessmentId: assignment.assessmentId,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
        paperHeadings,
        imported: created.length,
        skipped: source.length - created.length,
      },
    });
    return res.status(201).json({ items: created, imported: created.length, skipped: source.length - created.length });
  } catch (error) { return next(error); }
});

router.patch('/:id/questions/:questionId', async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    const canEdit = assignment && hasPermission(req, 'assessment.questions.edit');
    if (!canEdit || assignment.status === 'approved') return res.status(403).json({ message: 'Question editing is not allowed.' });
    const question = await AssessmentQuestion.findOne({ _id: req.params.questionId, assessmentId: assignment.assessmentId, courseName: assignment.courseName });
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    question.set(normalizeQuestionPayload({ ...question.toObject(), ...req.body, courseName: assignment.courseName, courseId: assignment.courseId }));
    await question.save();
    await writeAuditLog(req, {
      action: 'work.question.update',
      targetType: 'AssessmentQuestion',
      targetId: question._id,
      newValue: {
        assessmentId: assignment.assessmentId,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
        type: question.type,
        difficulty: question.difficulty,
      },
    });
    return res.json({ question });
  } catch (error) { return next(error); }
});

router.post('/:id/submit', validateBody(submitBodySchema), async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.FACULTY || !hasPermission(req, 'assessment.submit')) return res.status(403).json({ message: 'Assessment submission access has not been granted.' });
    const count = await AssessmentQuestion.countDocuments({ assessmentId: assignment.assessmentId, courseName: assignment.courseName });
    if (!count) return res.status(400).json({ message: 'Add at least one question before submitting.' });
    assignment.status = 'submitted'; assignment.rejectionReason = ''; assignment.submittedAt = new Date();
    assignment.history.push({ action: 'submitted', message: req.body.message, actorId: req.user._id, actorName: req.user.name });
    const [assessment, moderator] = await Promise.all([Assessment.findById(assignment.assessmentId), User.findById(assignment.moderatorId)]);
    try {
      const mailAssignment = await AssessmentAssignment.findById(assignment._id).select('+passwordPreview');
      await sendAssignmentMail({ assignment: mailAssignment, assessment, recipient: moderator, assignedBy: req.user, kind: 'submitted' });
      assignment.moderatorMail = { status: 'sent', sentAt: new Date() };
    } catch (error) { assignment.moderatorMail = { status: 'failed', error: error.message }; }
    await assignment.save();
    await writeAuditLog(req, {
      action: 'work.submit',
      targetType: 'AssessmentAssignment',
      targetId: assignment._id,
      newValue: {
        assessmentId: assignment.assessmentId,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
        questionCount: count,
        moderatorId: assignment.moderatorId,
        moderatorMailStatus: assignment.moderatorMail?.status,
      },
      reason: String(req.body.message || '').trim(),
    });
    return res.json({ assignment: serialize(assignment) });
  } catch (error) { return next(error); }
});

router.post('/:id/decision', validateBody(decisionBodySchema), async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.MODERATOR || !hasPermission(req, 'assessment.review')) return res.status(403).json({ message: 'Assessment review access has not been granted.' });
    const decision = req.body.decision; const reason = req.body.reason;
    if (decision === 'reject' && reason.length < 5) return res.status(400).json({ message: 'Enter a clear rejection reason.' });
    assignment.status = decision === 'approve' ? 'approved' : 'rejected'; assignment.rejectionReason = decision === 'reject' ? reason : ''; assignment.reviewedAt = new Date();
    assignment.history.push({ action: assignment.status, message: reason, actorId: req.user._id, actorName: req.user.name });
    if (decision === 'reject') {
      const [assessment, faculty] = await Promise.all([Assessment.findById(assignment.assessmentId), User.findById(assignment.facultyId)]);
      try { await sendAssignmentMail({ assignment, assessment, recipient: faculty, assignedBy: req.user, kind: 'rejected', reason }); } catch (error) { assignment.facultyMail = { status: 'failed', error: error.message }; }
    }
    await assignment.save();
    await writeAuditLog(req, {
      action: decision === 'approve' ? 'work.approve' : 'work.reject',
      targetType: 'AssessmentAssignment',
      targetId: assignment._id,
      newValue: {
        assessmentId: assignment.assessmentId,
        courseName: assignment.courseName,
        courseId: assignment.courseId,
        facultyId: assignment.facultyId,
        status: assignment.status,
      },
      reason,
    });
    return res.json({ assignment: serialize(assignment) });
  } catch (error) { return next(error); }
});

module.exports = router;
