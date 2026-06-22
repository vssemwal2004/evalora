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

const router = express.Router();
router.use(authenticate, requireRole(ROLES.FACULTY, ROLES.MODERATOR));

function hasPermission(req, permission) {
  return req.user.permissions.includes(permission);
}

function assignmentScope(req) {
  return req.user.role === ROLES.FACULTY ? { facultyId: req.user._id } : { moderatorId: req.user._id, status: { $in: ['submitted', 'approved'] } };
}

function serialize(item) {
  const data = item.toObject ? item.toObject() : item;
  delete data.passwordHash;
  delete data.passwordPreview;
  return data;
}

async function findAssignment(req, { tokenRequired = false } = {}) {
  const assignment = await AssessmentAssignment.findOne({ _id: req.params.id, ...assignmentScope(req) });
  if (!assignment) return null;
  if (tokenRequired) {
    const raw = req.headers['x-assignment-token'];
    const payload = verifyAssignmentToken(raw || '');
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
    return res.json({ items: assignments.filter((item) => item.assessmentId).map(serialize) });
  } catch (error) { return next(error); }
});

router.post('/:id/unlock', async (req, res, next) => {
  try {
    const assignment = await AssessmentAssignment.findOne({ _id: req.params.id, ...assignmentScope(req) }).select('+passwordHash');
    if (!assignment) return res.status(404).json({ message: 'Assigned work was not found.' });
    if (!(await assignment.comparePassword(String(req.body.password || '')))) return res.status(401).json({ message: 'Incorrect assignment password.' });
    if (req.user.role === ROLES.FACULTY && assignment.status === 'assigned') {
      assignment.status = 'in_progress';
      assignment.history.push({ action: 'opened', actorId: req.user._id, actorName: req.user.name });
      await assignment.save();
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
  } catch (error) { return error.name === 'JsonWebTokenError' ? res.status(401).json({ message: 'Unlock this assignment again.' }) : next(error); }
});

router.post('/:id/questions', async (req, res, next) => {
  try {
    return res.status(403).json({ message: 'Create questions in your personal library, then import them into the assessment.' });
  } catch (error) { return next(error); }
});

router.post('/:id/questions/import', async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.FACULTY || !hasPermission(req, 'assessment.questions.add') || !hasPermission(req, 'library.view')) return res.status(403).json({ message: 'Library import access has not been granted.' });
    const ids = Array.isArray(req.body.questionIds) ? req.body.questionIds : [];
    const source = await Question.find({ _id: { $in: ids }, createdBy: req.user._id, status: 'active' });
    const created = await AssessmentQuestion.insertMany(source.map((q) => ({
      ...normalizeQuestionPayload(q.toObject()), assessmentId: assignment.assessmentId, ownerAdminId: assignment.ownerAdminId,
      createdBy: req.user._id, libraryQuestionId: q._id, sourcePaperHeading: q.paperHeading,
      courseName: assignment.courseName, courseId: assignment.courseId,
    })));
    return res.status(201).json({ items: created, imported: created.length });
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
    return res.json({ question });
  } catch (error) { return next(error); }
});

router.post('/:id/submit', async (req, res, next) => {
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
    return res.json({ assignment: serialize(assignment) });
  } catch (error) { return next(error); }
});

router.post('/:id/decision', async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, { tokenRequired: true });
    if (!assignment || req.user.role !== ROLES.MODERATOR || !hasPermission(req, 'assessment.review')) return res.status(403).json({ message: 'Assessment review access has not been granted.' });
    const decision = String(req.body.decision || ''); const reason = String(req.body.reason || '').trim();
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Choose approve or reject.' });
    if (decision === 'reject' && reason.length < 5) return res.status(400).json({ message: 'Enter a clear rejection reason.' });
    assignment.status = decision === 'approve' ? 'approved' : 'rejected'; assignment.rejectionReason = decision === 'reject' ? reason : ''; assignment.reviewedAt = new Date();
    assignment.history.push({ action: assignment.status, message: reason, actorId: req.user._id, actorName: req.user.name });
    if (decision === 'reject') {
      const [assessment, faculty] = await Promise.all([Assessment.findById(assignment.assessmentId), User.findById(assignment.facultyId)]);
      try { await sendAssignmentMail({ assignment, assessment, recipient: faculty, assignedBy: req.user, kind: 'rejected', reason }); } catch (error) { assignment.facultyMail = { status: 'failed', error: error.message }; }
    }
    await assignment.save();
    return res.json({ assignment: serialize(assignment) });
  } catch (error) { return next(error); }
});

module.exports = router;
