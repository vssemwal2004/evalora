const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentAnswer = require('../models/AssessmentAnswer');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.STUDENT));

const SECURITY_HOLD_TYPES = [
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'screenshot_attempt',
  'duplicate_tab',
  'shortcut_attempt',
  'idle_detected',
];

function deriveOperationalStatus(assessment) {
  if (['draft', 'review', 'completed'].includes(assessment.status)) {
    return assessment.status;
  }

  const now = Date.now();
  const start = assessment.startAt ? new Date(assessment.startAt).getTime() : null;
  const end = assessment.endAt ? new Date(assessment.endAt).getTime() : null;

  if (!start || !end) return 'pending';
  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'active';
  return 'completed';
}

function isPublishedForStudents(assessment) {
  return assessment?.visibility === 'visible' && !['draft', 'review'].includes(assessment.status);
}

function isSameCourse(question, assignment) {
  const questionCourseId = String(question.courseId || '').trim().toUpperCase();
  const assignmentCourseId = String(assignment.courseId || '').trim().toUpperCase();
  const courseIdMatches = questionCourseId && assignmentCourseId && questionCourseId === assignmentCourseId;
  const courseNameMatches =
    String(question.courseName || '').trim().toLowerCase() === String(assignment.courseName || '').trim().toLowerCase();

  return courseIdMatches || courseNameMatches;
}

function getRequiredSetupSteps(assessment) {
  const settings = assessment.settings || {};
  const steps = ['verify', 'instructions', 'browser'];

  if (settings.cameraRequired || settings.cameraMonitoring || settings.proctoringEnabled) steps.push('camera');
  if (settings.microphoneRequired || settings.noiseMonitoring || settings.proctoringEnabled) steps.push('microphone');
  if (settings.fullscreenEnabled || settings.requireFullscreenBeforeStart) steps.push('fullscreen');

  steps.push('final');
  return steps;
}

function getStepStatus(attempt, key) {
  return attempt.setupSteps.find((step) => step.key === key)?.status;
}

function serializeExam({ assignment, assessment, attempt, questionSummary }) {
  const operationalStatus = deriveOperationalStatus(assessment);

  return {
    assignmentId: assignment._id,
    assessmentId: assessment._id,
    title: assessment.title,
    assessmentCode: assessment.assessmentCode,
    description: assessment.description,
    instructions: assessment.instructions,
    courseName: assignment.courseName,
    courseId: assignment.courseId,
    durationMinutes: assessment.globalDurationMinutes,
    startAt: assessment.startAt,
    endAt: assessment.endAt,
    status: assessment.status,
    operationalStatus,
    visibility: assessment.visibility,
    eligibilityStatus: assignment.eligibilityStatus,
    eligibilityReason: assignment.eligibilityReason,
    examStatus: assignment.examStatus,
    mailStatus: assignment.mailStatus,
    settings: assessment.settings || {},
    requiredSetupSteps: getRequiredSetupSteps(assessment),
    attempt: attempt
      ? {
          id: attempt._id,
          status: attempt.status,
          setupSteps: attempt.setupSteps,
          passwordVerified: Boolean(attempt.passwordVerifiedAt),
          startedAt: attempt.startedAt,
          allowedEndAt: attempt.allowedEndAt,
          submittedAt: attempt.submittedAt,
          securityScore: attempt.securityScore || 0,
          securitySummary: attempt.securitySummary,
          securityHold:
            attempt.securityHold?.active && SECURITY_HOLD_TYPES.includes(attempt.securityHold.triggerType)
              ? attempt.securityHold
              : null,
        }
      : null,
    questionSummary,
  };
}

function serializeProctorStudentUpdate({ assignment, attempt, alertCount = 0 }) {
  return {
    id: assignment._id,
    name: assignment.name,
    email: assignment.email,
    applicationNumber: assignment.applicationNumber,
    courseName: assignment.courseName,
    courseId: assignment.courseId,
    examId: assignment.generatedExamId,
    examStatus: assignment.examStatus,
    mailStatus: assignment.mailStatus,
    attemptStatus: attempt?.status || 'not_started',
    lastHeartbeatAt: attempt?.lastHeartbeatAt,
    securityScore: attempt?.securityScore || 0,
    alertCount,
  };
}

async function emitProctorStudentUpdate(req, { assessment, assignment, attempt, event = null }) {
  const io = req.app.get('io');
  if (!io) return;

  const proctorAssignment = await AssessmentProctor.findOne({
    assessmentId: assessment._id,
    'assignedStudents.assessmentStudentId': assignment._id,
  }).lean();

  if (!proctorAssignment) return;

  const alertCount = await AssessmentSecurityEvent.countDocuments({
    assessmentId: assessment._id,
    assessmentStudentId: assignment._id,
    severity: { $in: ['warning', 'critical'] },
  });

  const payload = {
    assessmentId: assessment._id,
    proctorAssignmentId: proctorAssignment._id,
    student: serializeProctorStudentUpdate({ assignment, attempt, alertCount }),
    event: event
      ? {
          id: event._id,
          studentId: event.assessmentStudentId,
          type: event.type,
          severity: event.severity,
          message: event.message,
          occurredAt: event.occurredAt,
        }
      : null,
  };

  io.to(`proctor:${proctorAssignment._id}`).emit(event ? 'proctor:security-event' : 'proctor:student-update', payload);
}

function serializeQuestion(question) {
  return {
    id: question._id,
    type: question.type,
    questionText: question.questionText,
    options: question.options.map((option) => ({
      id: option._id,
      text: option.text,
    })),
    positiveMarks: question.positiveMarks,
    negativeMarks: question.negativeMarks,
    difficulty: question.difficulty,
    order: question.order,
  };
}

function serializeAnswer(answer) {
  return {
    id: answer._id,
    questionId: answer.questionId,
    selectedOptionId: answer.selectedOptionId,
    textAnswer: answer.textAnswer || '',
    markedForReview: Boolean(answer.markedForReview),
    answered: Boolean(answer.answered),
    savedAt: answer.savedAt,
  };
}

async function findStudentAssignments(req) {
  return AssessmentStudent.find({
    $or: [{ email: req.user.email }, { generatedExamId: req.user.loginId }],
  }).sort({ createdAt: -1 });
}

async function findStudentExam(req, assignmentId) {
  const assignment = await AssessmentStudent.findOne({
    _id: assignmentId,
    $or: [{ email: req.user.email }, { generatedExamId: req.user.loginId }],
  });

  if (!assignment) return null;

  const assessment = await Assessment.findOne({
    _id: assignment.assessmentId,
    visibility: 'visible',
  });

  if (!assessment || !isPublishedForStudents(assessment)) return null;

  return { assignment, assessment };
}

async function getQuestionSummary(assessmentId, assignment) {
  const questions = await AssessmentQuestion.find({ assessmentId })
    .select('type courseName courseId positiveMarks')
    .sort({ order: 1, createdAt: 1 });
  const courseQuestions = questions.filter((question) => isSameCourse(question, assignment));

  return {
    totalQuestions: courseQuestions.length,
    totalMarks: courseQuestions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0),
    mcq: courseQuestions.filter((question) => question.type === 'mcq').length,
    oneWord: courseQuestions.filter((question) => question.type === 'one_word').length,
  };
}

async function getCourseQuestions(assessmentId, assignment) {
  const questions = await AssessmentQuestion.find({ assessmentId }).sort({ order: 1, createdAt: 1 });
  return questions.filter((question) => isSameCourse(question, assignment));
}

async function getOrCreateAttempt(assessment, assignment) {
  const attempt = await AssessmentAttempt.findOneAndUpdate(
    {
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    },
    {
      $setOnInsert: {
        assessmentId: assessment._id,
        assessmentStudentId: assignment._id,
        studentProfileId: assignment.studentProfileId,
        ownerAdminId: assessment.ownerAdminId,
        status: assignment.examStatus === 'in_progress' ? 'in_progress' : 'setup',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return attempt;
}

function upsertSetupStep(attempt, key, status, message) {
  const existing = attempt.setupSteps.find((step) => step.key === key);

  if (existing) {
    existing.status = status;
    existing.message = message;
    existing.completedAt = status === 'passed' ? new Date() : undefined;
    return;
  }

  attempt.setupSteps.push({
    key,
    status,
    message,
    completedAt: status === 'passed' ? new Date() : undefined,
  });
}

function validateExamCanStart(assessment, assignment, questionSummary) {
  const operationalStatus = deriveOperationalStatus(assessment);

  if (assignment.examStatus === 'submitted') return 'Attempt already submitted.';
  if (assignment.examStatus === 'ufm') return 'Assessment was closed due to UFM status.';
  if (assignment.examStatus === 'blocked') return 'Student account is blocked for this assessment.';
  if (assignment.eligibilityStatus !== 'eligible') return assignment.eligibilityReason || 'Student is not eligible for this assessment.';
  if (operationalStatus === 'upcoming') return 'Assessment has not started yet.';
  if (operationalStatus === 'completed') return 'Assessment window is closed.';
  if (operationalStatus !== 'active') return 'Assessment is not active right now.';
  if (questionSummary.totalQuestions === 0) return 'No course-mapped questions are available for this student.';

  return '';
}

function validateAttemptAccess(attempt, assignment, options = {}) {
  if (!attempt) return 'Start the exam setup before opening the attempt.';
  if (assignment.examStatus === 'submitted' || attempt.status === 'submitted') return 'Attempt already submitted.';
  if (assignment.examStatus === 'ufm' || attempt.status === 'ufm') return 'Assessment was closed due to UFM status.';
  if (assignment.examStatus === 'blocked' || attempt.status === 'blocked') return 'Student is blocked for this assessment.';
  if (attempt.status !== 'in_progress') return 'Complete secure setup before opening the exam.';
  if (attempt.securityHold?.active && !options.allowSecurityHold) return 'Exam is paused for a required security verification.';
  return '';
}

function applySecuritySummary(attempt, type, severity = 'warning') {
  if (type === 'fullscreen_exit') {
    attempt.securitySummary.fullscreenExitCount = Number(attempt.securitySummary.fullscreenExitCount || 0) + 1;
  }

  if (type === 'tab_switch' || type === 'window_blur') {
    attempt.securitySummary.tabSwitchCount = Number(attempt.securitySummary.tabSwitchCount || 0) + 1;
  }

  if (type === 'camera_missing' || type === 'camera_movement') {
    attempt.securitySummary.cameraIssueCount = Number(attempt.securitySummary.cameraIssueCount || 0) + 1;
  }

  if (type.startsWith('ai_')) {
    attempt.securitySummary.aiAlertCount = Number(attempt.securitySummary.aiAlertCount || 0) + 1;
  }

  if (type === 'ai_no_face') {
    attempt.securitySummary.noFaceCount = Number(attempt.securitySummary.noFaceCount || 0) + 1;
  }

  if (type === 'ai_multiple_faces') {
    attempt.securitySummary.multipleFaceCount = Number(attempt.securitySummary.multipleFaceCount || 0) + 1;
  }

  if (type === 'ai_looking_away') {
    attempt.securitySummary.lookingAwayCount = Number(attempt.securitySummary.lookingAwayCount || 0) + 1;
  }

  if (type === 'ai_camera_blocked') {
    attempt.securitySummary.cameraIssueCount = Number(attempt.securitySummary.cameraIssueCount || 0) + 1;
  }

  if (type === 'microphone_missing' || type === 'noise_detected') {
    attempt.securitySummary.microphoneIssueCount = Number(attempt.securitySummary.microphoneIssueCount || 0) + 1;
  }

  if (severity !== 'info' && type !== 'heartbeat') {
    attempt.securitySummary.warningCount = Number(attempt.securitySummary.warningCount || 0) + 1;
  }
}

function getViolationAction(settings, attempt, type) {
  if (!SECURITY_HOLD_TYPES.includes(type)) return 'record';

  const score = Number(attempt.securityScore || 0);
  const autoSubmitScore = Number(settings.autoSubmitScore || 0);
  const pauseScore = Number(settings.pauseScore || 0);

  if (autoSubmitScore > 0 && score >= autoSubmitScore) return 'autosubmit';

  if (type === 'fullscreen_exit' && attempt.securitySummary.fullscreenExitCount >= Number(settings.maxFullscreenExits || 0)) {
    return settings.fullscreenAction || 'warn';
  }

  if (['tab_switch', 'window_blur', 'duplicate_tab'].includes(type) && attempt.securitySummary.tabSwitchCount >= Number(settings.maxTabSwitches || 0)) {
    return settings.tabSwitchAction || 'warn';
  }

  if (type === 'camera_missing') return settings.cameraMissingAction || 'warn';
  if (pauseScore > 0 && score >= pauseScore) return 'pause';
  if (Number(settings.maxWarningCount || 0) > 0 && attempt.securitySummary.warningCount >= Number(settings.maxWarningCount)) return 'pause';
  return 'warn';
}

function startSecurityHold(attempt, assessment, type, reason) {
  if (attempt.securityHold?.active) return;

  const now = new Date();
  const immediateRecheck = ['fullscreen_exit', 'duplicate_tab'].includes(type);
  const graceSeconds = immediateRecheck ? 0 : 15;
  const timeoutSeconds = Math.max(Number(assessment.settings?.securityRecheckTimeoutSeconds || 120), 30);
  const graceEndsAt = new Date(now.getTime() + graceSeconds * 1000);

  attempt.securityHold = {
    active: true,
    phase: immediateRecheck ? 'recheck' : 'grace',
    reason,
    triggerType: type,
    detectedAt: now,
    graceEndsAt,
    recheckExpiresAt: new Date(graceEndsAt.getTime() + timeoutSeconds * 1000),
  };
}

function releaseSecurityHold(attempt) {
  if (!attempt.securityHold?.active) return;
  const now = new Date();
  const pausedAt = attempt.securityHold.detectedAt ? new Date(attempt.securityHold.detectedAt) : now;
  const pausedMs = Math.max(now.getTime() - pausedAt.getTime(), 0);

  if (attempt.allowedEndAt) {
    attempt.allowedEndAt = new Date(new Date(attempt.allowedEndAt).getTime() + pausedMs);
  }

  attempt.securityHold.active = false;
  attempt.securityHold.phase = 'none';
  attempt.securityHold.resolvedAt = now;
}

async function saveAnswer({ assessment, assignment, attempt, question, payload }) {
  const questionType = question.type;
  const selectedOptionId = questionType === 'mcq' && payload.selectedOptionId ? payload.selectedOptionId : undefined;
  const textAnswer = questionType === 'one_word' ? String(payload.textAnswer || '').trim() : '';
  const markedForReview = Boolean(payload.markedForReview);
  const answered = questionType === 'mcq' ? Boolean(selectedOptionId) : Boolean(textAnswer);

  const answer = await AssessmentAnswer.findOneAndUpdate(
    {
      attemptId: attempt._id,
      questionId: question._id,
    },
    {
      $set: {
        assessmentId: assessment._id,
        attemptId: attempt._id,
        assessmentStudentId: assignment._id,
        questionId: question._id,
        questionType,
        selectedOptionId,
        textAnswer,
        markedForReview,
        answered,
        savedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return answer;
}

router.get('/exams', async (req, res, next) => {
  try {
    const assignments = await findStudentAssignments(req);
    const items = [];

    for (const assignment of assignments) {
      const assessment = await Assessment.findOne({
        _id: assignment.assessmentId,
        visibility: 'visible',
      });

      if (!assessment || !isPublishedForStudents(assessment)) continue;

      const [attempt, questionSummary] = await Promise.all([
        AssessmentAttempt.findOne({ assessmentId: assessment._id, assessmentStudentId: assignment._id }),
        getQuestionSummary(assessment._id, assignment),
      ]);

      items.push(serializeExam({ assignment, assessment, attempt, questionSummary }));
    }

    const summary = {
      assigned: items.length,
      active: items.filter((item) => item.operationalStatus === 'active').length,
      submitted: items.filter((item) => item.examStatus === 'submitted').length,
    };

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/verify-password', (_req, res) => {
  return res.status(410).json({ message: 'Assessment password verification is no longer used.' });
});

router.post('/exams/:assignmentId/setup-step', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await getOrCreateAttempt(assessment, assignment);
    const requiredSteps = getRequiredSetupSteps(assessment);
    const key = String(req.body.key || '').trim();
    const status = req.body.status === 'failed' ? 'failed' : 'passed';

    if (!requiredSteps.includes(key)) {
      return res.status(400).json({ message: 'Invalid setup step for this assessment.' });
    }

    upsertSetupStep(attempt, key, status, String(req.body.message || ''));
    await attempt.save();

    return res.json({ attempt });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/start', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const questionSummary = await getQuestionSummary(assessment._id, assignment);
    const startBlockReason = validateExamCanStart(assessment, assignment, questionSummary);

    if (startBlockReason) {
      return res.status(400).json({ message: startBlockReason });
    }

    const attempt = await getOrCreateAttempt(assessment, assignment);
    const requiredSteps = getRequiredSetupSteps(assessment);
    const missingSteps = requiredSteps.filter((key) => key !== 'final' && getStepStatus(attempt, key) !== 'passed');

    if (missingSteps.length > 0) {
      return res.status(400).json({ message: `Complete required setup steps before starting: ${[...new Set(missingSteps)].join(', ')}.` });
    }

    const now = new Date();
    attempt.status = 'in_progress';
    attempt.startedAt = attempt.startedAt || now;
    attempt.allowedEndAt =
      attempt.allowedEndAt || new Date(now.getTime() + Number(assessment.globalDurationMinutes || 60) * 60 * 1000);
    attempt.lastHeartbeatAt = now;
    upsertSetupStep(attempt, 'final', 'passed', 'Exam started.');
    await attempt.save();

    assignment.examStatus = 'in_progress';
    await assignment.save();
    await emitProctorStudentUpdate(req, { assessment, assignment, attempt });

    return res.json({
      attempt,
      examUrl: `/student/exams/${assignment._id}/attempt`,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/exams/:assignmentId/attempt', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment, { allowSecurityHold: true });

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const [questions, answers] = await Promise.all([
      getCourseQuestions(assessment._id, assignment),
      AssessmentAnswer.find({ attemptId: attempt._id }),
    ]);

    return res.json({
      exam: serializeExam({
        assignment,
        assessment,
        attempt,
        questionSummary: {
          totalQuestions: questions.length,
          totalMarks: questions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0),
          mcq: questions.filter((question) => question.type === 'mcq').length,
          oneWord: questions.filter((question) => question.type === 'one_word').length,
        },
      }),
      questions: questions.map(serializeQuestion),
      answers: answers.map(serializeAnswer),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/answers', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment);

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const question = await AssessmentQuestion.findOne({
      _id: req.body.questionId,
      assessmentId: assessment._id,
    });

    if (!question || !isSameCourse(question, assignment)) {
      return res.status(404).json({ message: 'Question not found for this student course.' });
    }

    const answer = await saveAnswer({ assessment, assignment, attempt, question, payload: req.body });
    attempt.lastHeartbeatAt = new Date();
    await attempt.save();

    return res.json({ answer: serializeAnswer(answer) });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/answers/batch', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment);

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const payloadAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const questionIds = payloadAnswers.map((answer) => answer.questionId).filter(Boolean);
    const questions = await AssessmentQuestion.find({ _id: { $in: questionIds }, assessmentId: assessment._id });
    const questionById = new Map(questions.filter((question) => isSameCourse(question, assignment)).map((question) => [question._id.toString(), question]));
    const saved = [];

    for (const payload of payloadAnswers) {
      const question = questionById.get(String(payload.questionId));
      if (!question) continue;

      const answer = await saveAnswer({ assessment, assignment, attempt, question, payload });
      saved.push(serializeAnswer(answer));
    }

    attempt.lastHeartbeatAt = new Date();
    await attempt.save();

    return res.json({ items: saved });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/heartbeat', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment, { allowSecurityHold: true });

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const now = new Date();
    if (attempt.securityHold?.active && !SECURITY_HOLD_TYPES.includes(attempt.securityHold.triggerType)) {
      releaseSecurityHold(attempt);
    }
    if (attempt.securityHold?.active && attempt.securityHold.phase === 'grace' && now >= new Date(attempt.securityHold.graceEndsAt)) {
      attempt.securityHold.phase = 'recheck';
    }
    if (attempt.securityHold?.active && attempt.securityHold.recheckExpiresAt && now >= new Date(attempt.securityHold.recheckExpiresAt)) {
      attempt.securityHold.phase = 'expired';
    }
    attempt.lastHeartbeatAt = now;
    await attempt.save();
    await emitProctorStudentUpdate(req, { assessment, assignment, attempt });

    return res.json({ heartbeatAt: attempt.lastHeartbeatAt, securityHold: attempt.securityHold, allowedEndAt: attempt.allowedEndAt });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/security-event', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment, { allowSecurityHold: true });

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const type = String(req.body.type || '').trim();
    const allowedTypes = AssessmentSecurityEvent.schema.path('type').enumValues;

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid security event type.' });
    }

    const event = await AssessmentSecurityEvent.create({
      assessmentId: assessment._id,
      attemptId: attempt._id,
      assessmentStudentId: assignment._id,
      ownerAdminId: assessment.ownerAdminId,
      type,
      severity: req.body.severity || 'warning',
      score: Number(req.body.score || 1),
      message: String(req.body.message || '').trim(),
      metadata: req.body.metadata || {},
      occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(),
    });

    const severity = req.body.severity || 'warning';
    const score = Math.max(Number(req.body.score || 1), 0);
    if (attempt.securityHold?.active && !SECURITY_HOLD_TYPES.includes(attempt.securityHold.triggerType)) {
      releaseSecurityHold(attempt);
    }
    applySecuritySummary(attempt, type, severity);
    attempt.securityScore = Number(attempt.securityScore || 0) + score;
    const action = getViolationAction(assessment.settings || {}, attempt, type);

    if (action === 'autosubmit') {
      attempt.status = 'submitted';
      attempt.submittedAt = new Date();
      assignment.examStatus = 'submitted';
      await assignment.save();
    } else if (
      assessment.settings?.securityRecheckEnabled !== false
      && SECURITY_HOLD_TYPES.includes(type)
      && (action === 'pause' || action === 'warn')
    ) {
      startSecurityHold(attempt, assessment, type, event.message || 'A security violation requires verification.');
    }

    attempt.lastHeartbeatAt = new Date();
    await attempt.save();
    await emitProctorStudentUpdate(req, { assessment, assignment, attempt, event });

    return res.status(201).json({
      event,
      securitySummary: attempt.securitySummary,
      securityScore: attempt.securityScore,
      enforcement: {
        action,
        submitted: attempt.status === 'submitted',
        securityHold: attempt.securityHold,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/security-hold/return', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({ assessmentId: assessment._id, assessmentStudentId: assignment._id });
    const accessError = validateAttemptAccess(attempt, assignment, { allowSecurityHold: true });
    if (accessError) return res.status(400).json({ message: accessError });

    if (!attempt.securityHold?.active) {
      return res.json({ resumed: true, securityHold: attempt.securityHold, allowedEndAt: attempt.allowedEndAt });
    }

    const now = new Date();
    const returnableTypes = ['tab_switch', 'window_blur', 'idle_detected'];
    const canReturn = attempt.securityHold.phase === 'grace'
      && returnableTypes.includes(attempt.securityHold.triggerType)
      && now <= new Date(attempt.securityHold.graceEndsAt);

    if (!canReturn) {
      attempt.securityHold.phase = 'recheck';
      await attempt.save();
      return res.status(409).json({ message: 'Security re-verification is required before resuming.', securityHold: attempt.securityHold });
    }

    releaseSecurityHold(attempt);
    attempt.lastHeartbeatAt = now;
    await attempt.save();
    return res.json({ resumed: true, securityHold: attempt.securityHold, allowedEndAt: attempt.allowedEndAt });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/security-hold/recheck', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({ assessmentId: assessment._id, assessmentStudentId: assignment._id });
    const accessError = validateAttemptAccess(attempt, assignment, { allowSecurityHold: true });
    if (accessError) return res.status(400).json({ message: accessError });

    if (!attempt.securityHold?.active) {
      return res.json({ resumed: true, securityHold: attempt.securityHold, allowedEndAt: attempt.allowedEndAt });
    }

    const now = new Date();
    if (attempt.securityHold.recheckExpiresAt && now > new Date(attempt.securityHold.recheckExpiresAt)) {
      attempt.securityHold.phase = 'expired';
      await attempt.save();
      return res.status(410).json({ message: 'Security recheck time expired. Contact the exam administrator.', securityHold: attempt.securityHold });
    }

    const checks = req.body.checks || {};
    const settings = assessment.settings || {};
    const failed = [];
    if (!checks.visible || !checks.focused) failed.push('exam window');
    if ((settings.fullscreenEnabled || settings.requireFullscreenBeforeStart) && !checks.fullscreen) failed.push('full screen');
    if ((settings.cameraRequired || settings.cameraMonitoring || settings.proctoringEnabled) && !checks.camera) failed.push('camera');
    if ((settings.microphoneRequired || settings.noiseMonitoring || settings.proctoringEnabled) && !checks.microphone) failed.push('microphone');

    if (failed.length > 0) {
      return res.status(400).json({ message: `Verification failed: ${failed.join(', ')}.`, failed, securityHold: attempt.securityHold });
    }

    releaseSecurityHold(attempt);
    attempt.lastHeartbeatAt = now;
    await attempt.save();
    return res.json({ resumed: true, securityHold: attempt.securityHold, allowedEndAt: attempt.allowedEndAt });
  } catch (error) {
    return next(error);
  }
});

router.post('/exams/:assignmentId/submit', async (req, res, next) => {
  try {
    const found = await findStudentExam(req, req.params.assignmentId);
    if (!found) return res.status(404).json({ message: 'Assigned exam not found.' });

    const { assessment, assignment } = found;
    const attempt = await AssessmentAttempt.findOne({
      assessmentId: assessment._id,
      assessmentStudentId: assignment._id,
    });
    const accessError = validateAttemptAccess(attempt, assignment);

    if (accessError) {
      return res.status(400).json({ message: accessError });
    }

    const [questions, answers] = await Promise.all([
      getCourseQuestions(assessment._id, assignment),
      AssessmentAnswer.find({ attemptId: attempt._id }),
    ]);
    const answeredCount = answers.filter((answer) => answer.answered).length;
    const markedForReviewCount = answers.filter((answer) => answer.markedForReview).length;

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    attempt.lastHeartbeatAt = new Date();
    await attempt.save();

    assignment.examStatus = 'submitted';
    await assignment.save();

    return res.json({
      submitted: true,
      summary: {
        totalQuestions: questions.length,
        answered: answeredCount,
        unanswered: Math.max(questions.length - answeredCount, 0),
        markedForReview: markedForReviewCount,
        submittedAt: attempt.submittedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
