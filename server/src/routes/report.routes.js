const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentAnswer = require('../models/AssessmentAnswer');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getScopedQuery(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function asNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getCorrectOptionId(question) {
  const option = (question.options || []).find((item) => item.isCorrect);
  return option?._id ? String(option._id) : '';
}

function isOneWordCorrect(question, answer) {
  const submitted = normalizeText(answer.textAnswer);
  if (!submitted) return false;
  const accepted = [question.expectedAnswer, ...(question.alternateAnswers || [])]
    .map(normalizeText)
    .filter(Boolean);
  return accepted.includes(submitted);
}

function gradeAnswer(question, answer) {
  if (!answer?.answered) return { state: 'skipped', score: 0 };

  const positiveMarks = asNumber(question.positiveMarks, 1);
  const negativeMarks = asNumber(question.negativeMarks, 0);
  const isCorrect =
    question.type === 'mcq'
      ? String(answer.selectedOptionId || '') === getCorrectOptionId(question)
      : isOneWordCorrect(question, answer);

  if (isCorrect) return { state: 'correct', score: positiveMarks };
  return { state: 'wrong', score: -negativeMarks };
}

function summarizeAttempt({ assignment, attempt, answers, questions, securityEvents }) {
  const answerByQuestion = new Map(answers.map((answer) => [String(answer.questionId), answer]));
  const maxMarks = questions.reduce((total, question) => total + asNumber(question.positiveMarks, 1), 0);
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let pending = 0;

  const questionBreakdown = questions.map((question, index) => {
    const answer = answerByQuestion.get(String(question._id));
    const graded = gradeAnswer(question, answer);

    score += graded.score;
    if (graded.state === 'correct') correct += 1;
    if (graded.state === 'wrong') wrong += 1;
    if (graded.state === 'skipped') skipped += 1;
    if (graded.state === 'pending') pending += 1;

    return {
      number: index + 1,
      questionId: question._id,
      type: question.type,
      courseName: question.courseName,
      courseId: question.courseId,
      questionText: question.questionText,
      maxMarks: asNumber(question.positiveMarks, 1),
      negativeMarks: asNumber(question.negativeMarks, 0),
      selectedOptionId: answer?.selectedOptionId || null,
      textAnswer: answer?.textAnswer || '',
      answered: Boolean(answer?.answered),
      markedForReview: Boolean(answer?.markedForReview),
      result: graded.state,
      score: graded.score,
      savedAt: answer?.savedAt || null,
    };
  });

  const submittedAt = attempt?.submittedAt || null;
  const startedAt = attempt?.startedAt || null;
  const durationMinutes =
    startedAt && submittedAt ? Math.max(Math.round((new Date(submittedAt) - new Date(startedAt)) / 60000), 0) : null;
  const warningEvents = securityEvents.filter((event) => event.severity === 'warning').length;
  const criticalEvents = securityEvents.filter((event) => event.severity === 'critical').length;
  const securityScore = asNumber(attempt?.securityScore, securityEvents.reduce((total, event) => total + asNumber(event.score), 0));
  const percentage = maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(2)) : 0;
  const status = attempt?.status || assignment.examStatus || 'not_started';
  const integrityStatus = status === 'ufm' || criticalEvents > 0 || securityScore >= 10 ? 'flagged' : 'clean';

  return {
    assignmentId: assignment._id,
    attemptId: attempt?._id || null,
    name: assignment.name,
    email: assignment.email,
    applicationNumber: assignment.applicationNumber || '',
    generatedExamId: assignment.generatedExamId,
    courseName: assignment.courseName,
    courseId: assignment.courseId || '',
    eligibilityStatus: assignment.eligibilityStatus,
    mailStatus: assignment.mailStatus,
    examStatus: assignment.examStatus,
    status,
    startedAt,
    submittedAt,
    durationMinutes,
    totalQuestions: questions.length,
    answered: answers.filter((answer) => answer.answered).length,
    correct,
    wrong,
    skipped,
    pending,
    markedForReview: answers.filter((answer) => answer.markedForReview).length,
    maxMarks,
    score: Number(score.toFixed(2)),
    percentage,
    securityScore,
    warningEvents,
    criticalEvents,
    totalSecurityEvents: securityEvents.length,
    integrityStatus,
    securitySummary: attempt?.securitySummary || {},
    questionBreakdown,
    securityEvents: securityEvents.map((event) => ({
      id: event._id,
      type: event.type,
      severity: event.severity,
      score: event.score,
      message: event.message,
      occurredAt: event.occurredAt,
    })),
  };
}

async function buildAssessmentReport(req, assessmentId, options = {}) {
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) }).populate('ownerAdminId', 'name email');
  if (!assessment) return null;

  const [assignments, attempts, questions, answers, securityEvents] = await Promise.all([
    AssessmentStudent.find({ assessmentId: assessment._id }).sort({ courseName: 1, name: 1 }),
    AssessmentAttempt.find({ assessmentId: assessment._id }),
    AssessmentQuestion.find({ assessmentId: assessment._id }).sort({ courseName: 1, order: 1, createdAt: 1 }),
    AssessmentAnswer.find({ assessmentId: assessment._id }),
    AssessmentSecurityEvent.find({ assessmentId: assessment._id }).sort({ occurredAt: -1 }),
  ]);

  const attemptByAssignment = new Map(attempts.map((attempt) => [String(attempt.assessmentStudentId), attempt]));
  const answersByAttempt = answers.reduce((groups, answer) => {
    const key = String(answer.attemptId);
    groups.set(key, [...(groups.get(key) || []), answer]);
    return groups;
  }, new Map());
  const eventsByAttempt = securityEvents.reduce((groups, event) => {
    const key = String(event.attemptId);
    groups.set(key, [...(groups.get(key) || []), event]);
    return groups;
  }, new Map());
  const questionsByCourse = questions.reduce((groups, question) => {
    const courseKey = `${question.courseName}|${question.courseId || ''}`;
    groups.set(courseKey, [...(groups.get(courseKey) || []), question]);
    return groups;
  }, new Map());

  const rows = assignments.map((assignment) => {
    const attempt = attemptByAssignment.get(String(assignment._id));
    const courseKey = `${assignment.courseName}|${assignment.courseId || ''}`;
    return summarizeAttempt({
      assignment,
      attempt,
      answers: attempt ? answersByAttempt.get(String(attempt._id)) || [] : [],
      questions: questionsByCourse.get(courseKey) || [],
      securityEvents: attempt ? eventsByAttempt.get(String(attempt._id)) || [] : [],
    });
  });

  const filteredRows = filterRows(rows, options.filters || {});
  const summary = summarizeRows(rows, questions, securityEvents);

  return {
    assessment: {
      id: assessment._id,
      title: assessment.title,
      assessmentCode: assessment.assessmentCode,
      status: assessment.status,
      startAt: assessment.startAt,
      endAt: assessment.endAt,
      ownerAdmin: assessment.ownerAdminId,
      courses: assessment.courses || [],
    },
    summary,
    rows: filteredRows,
    allRows: rows,
    distributions: buildDistributions(rows, securityEvents),
  };
}

function filterRows(rows, filters) {
  const search = normalizeText(filters.search);
  const course = normalizeText(filters.course);
  const status = String(filters.status || '').trim();
  const integrity = String(filters.integrity || '').trim();
  const minScore = filters.minScore === undefined || filters.minScore === '' ? null : Number(filters.minScore);
  const maxScore = filters.maxScore === undefined || filters.maxScore === '' ? null : Number(filters.maxScore);
  const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const to = filters.dateTo ? new Date(filters.dateTo) : null;

  return rows.filter((row) => {
    const haystack = normalizeText(`${row.name} ${row.email} ${row.generatedExamId} ${row.applicationNumber}`);
    if (search && !haystack.includes(search)) return false;
    if (course && !normalizeText(`${row.courseName} ${row.courseId}`).includes(course)) return false;
    if (status && status !== 'all' && row.status !== status && row.examStatus !== status) return false;
    if (integrity && integrity !== 'all' && row.integrityStatus !== integrity) return false;
    if (minScore !== null && row.score < minScore) return false;
    if (maxScore !== null && row.score > maxScore) return false;
    if (from && (!row.submittedAt || new Date(row.submittedAt) < from)) return false;
    if (to && (!row.submittedAt || new Date(row.submittedAt) > to)) return false;
    return true;
  });
}

function summarizeRows(rows, questions, securityEvents) {
  const submitted = rows.filter((row) => row.examStatus === 'submitted' || row.status === 'submitted').length;
  const inProgress = rows.filter((row) => row.examStatus === 'in_progress' || row.status === 'in_progress').length;
  const ufm = rows.filter((row) => row.examStatus === 'ufm' || row.status === 'ufm').length;
  const averagePercentage = submitted
    ? Number((rows.reduce((total, row) => total + (row.submittedAt ? row.percentage : 0), 0) / submitted).toFixed(2))
    : 0;

  return {
    assigned: rows.length,
    submitted,
    inProgress,
    notStarted: rows.filter((row) => row.examStatus === 'not_started' || row.status === 'not_started').length,
    ufm,
    blocked: rows.filter((row) => row.examStatus === 'blocked' || row.status === 'blocked').length,
    completionRate: rows.length ? Number(((submitted / rows.length) * 100).toFixed(2)) : 0,
    averagePercentage,
    highestScore: rows.reduce((highest, row) => Math.max(highest, row.score), 0),
    totalQuestions: questions.length,
    totalSecurityEvents: securityEvents.length,
    flaggedSessions: rows.filter((row) => row.integrityStatus === 'flagged').length,
  };
}

function buildDistributions(rows, securityEvents) {
  const scoreBands = [
    { label: '0-40%', min: 0, max: 40 },
    { label: '41-60%', min: 40.01, max: 60 },
    { label: '61-80%', min: 60.01, max: 80 },
    { label: '81-100%', min: 80.01, max: 100 },
  ].map((band) => ({
    ...band,
    count: rows.filter((row) => row.submittedAt && row.percentage >= band.min && row.percentage <= band.max).length,
  }));

  const violationTypes = securityEvents.reduce((items, event) => {
    items[event.type] = (items[event.type] || 0) + 1;
    return items;
  }, {});

  const courses = rows.reduce((items, row) => {
    const key = `${row.courseName}${row.courseId ? ` (${row.courseId})` : ''}`;
    const current = items[key] || { total: 0, submitted: 0, flagged: 0 };
    current.total += 1;
    if (row.submittedAt) current.submitted += 1;
    if (row.integrityStatus === 'flagged') current.flagged += 1;
    items[key] = current;
    return items;
  }, {});

  return {
    scoreBands,
    violationTypes: Object.entries(violationTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    courses: Object.entries(courses).map(([course, value]) => ({ course, ...value })),
  };
}

function serializeRows(rows) {
  return rows.map(({ questionBreakdown: _questionBreakdown, securityEvents: _securityEvents, ...row }) => row);
}

router.get('/assessments', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const search = normalizeText(req.query.search);
    const query = { ...getScopedQuery(req) };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { assessmentCode: { $regex: search, $options: 'i' } },
      ];
    }

    const assessments = await Assessment.find(query).sort({ updatedAt: -1 }).limit(50);
    const cards = await Promise.all(
      assessments.map(async (assessment) => {
        const [students, attempts, securityEvents] = await Promise.all([
          AssessmentStudent.countDocuments({ assessmentId: assessment._id }),
          AssessmentAttempt.find({ assessmentId: assessment._id }).select('status'),
          AssessmentSecurityEvent.countDocuments({ assessmentId: assessment._id }),
        ]);
        return {
          id: assessment._id,
          title: assessment.title,
          assessmentCode: assessment.assessmentCode,
          status: assessment.status,
          startAt: assessment.startAt,
          endAt: assessment.endAt,
          counts: assessment.counts,
          students,
          submitted: attempts.filter((attempt) => attempt.status === 'submitted').length,
          ufm: attempts.filter((attempt) => attempt.status === 'ufm').length,
          inProgress: attempts.filter((attempt) => attempt.status === 'in_progress').length,
          securityEvents,
        };
      })
    );

    return res.json({ items: cards });
  } catch (error) {
    return next(error);
  }
});

router.get('/assessments/:assessmentId', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const report = await buildAssessmentReport(req, req.params.assessmentId, {
      filters: req.query,
    });
    if (!report) return res.status(404).json({ message: 'Assessment report not found.' });

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const start = (page - 1) * limit;
    const rows = report.rows.slice(start, start + limit);

    return res.json({
      assessment: report.assessment,
      summary: report.summary,
      distributions: report.distributions,
      items: serializeRows(rows),
      pagination: {
        page,
        limit,
        total: report.rows.length,
        pages: Math.max(Math.ceil(report.rows.length / limit), 1),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/assessments/:assessmentId/export', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const report = await buildAssessmentReport(req, req.params.assessmentId, { filters: req.query });
    if (!report) return res.status(404).json({ message: 'Assessment report not found.' });

    await writeAuditLog(req, {
      action: 'reports.export',
      targetType: 'Assessment',
      targetId: report.assessment.id,
      newValue: {
        title: report.assessment.title,
        rows: report.rows.length,
      },
    });

    return res.json({
      assessment: report.assessment,
      columns: [
        'Assessment',
        'Assessment Code',
        'Name',
        'Email',
        'Application Number',
        'Exam ID',
        'Course',
        'Status',
        'Started At',
        'Submitted At',
        'Duration Minutes',
        'Total Questions',
        'Answered',
        'Correct',
        'Wrong',
        'Skipped',
        'Score',
        'Max Marks',
        'Percentage',
        'Security Score',
        'Warnings',
        'Critical Events',
        'Integrity',
      ],
      rows: serializeRows(report.rows).map((row) => ({
        assessment: report.assessment.title,
        assessmentCode: report.assessment.assessmentCode,
        name: row.name,
        email: row.email,
        applicationNumber: row.applicationNumber,
        generatedExamId: row.generatedExamId,
        course: `${row.courseName}${row.courseId ? ` (${row.courseId})` : ''}`,
        status: row.status,
        startedAt: row.startedAt,
        submittedAt: row.submittedAt,
        durationMinutes: row.durationMinutes,
        totalQuestions: row.totalQuestions,
        answered: row.answered,
        correct: row.correct,
        wrong: row.wrong,
        skipped: row.skipped,
        score: row.score,
        maxMarks: row.maxMarks,
        percentage: row.percentage,
        securityScore: row.securityScore,
        warningEvents: row.warningEvents,
        criticalEvents: row.criticalEvents,
        integrity: row.integrityStatus,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/assessments/:assessmentId/candidates/:assignmentId', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const report = await buildAssessmentReport(req, req.params.assessmentId);
    if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
    const candidate = report.allRows.find((row) => String(row.assignmentId) === String(req.params.assignmentId));
    if (!candidate) return res.status(404).json({ message: 'Candidate report not found.' });

    return res.json({ assessment: report.assessment, candidate });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
