const { once } = require('events');
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const Assessment = require('../models/Assessment');
const AssessmentAnswer = require('../models/AssessmentAnswer');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentSecurityEvent = require('../models/AssessmentSecurityEvent');
const AssessmentStudent = require('../models/AssessmentStudent');
const ReportExportJob = require('../models/ReportExportJob');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { objectIdString, validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();
const reportExportDirectory = path.join(__dirname, '..', '..', 'storage', 'report-exports');
const ufmReviewBodySchema = z.object({
  decision: z.enum(['ufm', 'clear']),
  note: z.string().trim().max(1000).optional().default(''),
});
const reportExportJobBodySchema = z.object({
  format: z.enum(['csv']).optional().default('csv'),
  module: z.string().trim().optional().default('score'),
  filters: z.record(z.any()).optional().default({}),
  fields: z.array(z.string().trim().min(1).max(80)).max(80).optional().default([]),
});

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));
router.use('/assessments/:assessmentId', validateObjectIdParams('assessmentId'));
router.use('/assessments/:assessmentId/candidates/:assignmentId', validateObjectIdParams('assignmentId'));
router.use('/export-jobs/:jobId', validateObjectIdParams('jobId'));

function getScopedQuery(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

function userHasPermission(user, permission) {
  return user?.role === ROLES.SUPER_ADMIN || user?.permissions?.includes(permission);
}

function userHasAnyPermission(user, permissions) {
  return user?.role === ROLES.SUPER_ADMIN || permissions.some((permission) => user?.permissions?.includes(permission));
}

const reportModulePermissions = {
  score: ['reports.view', 'reports.score.view'],
  attendance: ['reports.view', 'reports.attendance.view'],
  proctoring: ['reports.view', 'reports.proctoring.view'],
  'answer-sheet': ['reports.view', 'reports.answer_sheet.view'],
  'question-analysis': ['reports.view', 'reports.question_analysis.view'],
  'activity-log': ['reports.view', 'reports.activity_log.view'],
  'response-log': ['reports.view', 'reports.response_log.view'],
};

const reportListPermissions = Array.from(new Set(Object.values(reportModulePermissions).flat()));
const candidateReportPermissions = Array.from(new Set([
  ...reportModulePermissions.score,
  ...reportModulePermissions.attendance,
  ...reportModulePermissions.proctoring,
  ...reportModulePermissions['answer-sheet'],
]));

function normalizeReportModule(value) {
  const module = String(value || 'score').trim();
  return reportModulePermissions[module] ? module : 'score';
}

function normalizeSelectedFieldKeys(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());
  return [...new Set(raw.filter(Boolean))];
}

function selectExportFields(allFields, selectedKeys) {
  const keys = new Set(normalizeSelectedFieldKeys(selectedKeys));
  if (!keys.size) return allFields;
  const fields = allFields.filter(([key]) => keys.has(key));
  return fields.length ? fields : allFields;
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (userHasAnyPermission(req.user, permissions)) {
      return next();
    }

    return res.status(403).json({ message: 'Permission denied.' });
  };
}

function reportExportFormatPermission(format) {
  return format === 'csv'
    ? 'reports.export.csv'
    : format === 'pdf'
      ? 'reports.export.pdf'
      : 'reports.export';
}

function userCanExportReport(user, format, module) {
  const formatPermission = reportExportFormatPermission(format);
  return userHasAnyPermission(user, ['reports.export', formatPermission])
    && userHasAnyPermission(user, reportModulePermissions[module]);
}

function requireReportExportPermission(req, res, next) {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const module = normalizeReportModule(req.query.module);

  return userCanExportReport(req.user, format, module)
    ? next()
    : res.status(403).json({ message: 'Permission denied.' });
}

function stripRecordingEvidence(candidate) {
  return {
    ...candidate,
    recordings: undefined,
    securityEvents: (candidate.securityEvents || []).map((event) => {
      const metadata = event.metadata || {};
      const evidence = metadata.evidence || {};
      return {
        ...event,
        metadata: {
          ...metadata,
          evidence: {
            ...evidence,
            recordingUrl: '',
            cameraRecordingUrl: '',
          },
        },
      };
    }),
  };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextRegex(value) {
  const text = normalizeText(value);
  return text ? new RegExp(escapeRegExp(text), 'i') : null;
}

function buildDateRange(fromValue, toValue) {
  const range = {};
  if (fromValue) {
    const from = new Date(fromValue);
    if (!Number.isNaN(from.getTime())) range.$gte = from;
  }
  if (toValue) {
    const to = new Date(toValue);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      range.$lte = to;
    }
  }
  return Object.keys(range).length ? range : null;
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

function serializeUfmReview(event) {
  const metadata = event.metadata || {};
  return {
    id: event._id,
    status: metadata.reviewStatus || 'pending',
    message: event.message || '',
    proctorId: metadata.proctorId || null,
    proctorName: metadata.proctorName || '',
    proctorEmail: metadata.proctorEmail || '',
    markedAt: event.occurredAt,
  };
}

function computeScoreSummary(questions, answers) {
  const answerByQuestion = new Map(answers.map((answer) => [String(answer.questionId), answer]));
  const maxMarks = questions.reduce((total, question) => total + asNumber(question.positiveMarks, 1), 0);
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let pending = 0;
  let answered = 0;
  let markedForReview = 0;

  questions.forEach((question) => {
    const answer = answerByQuestion.get(String(question._id));
    const graded = gradeAnswer(question, answer);
    score += graded.score;
    if (answer?.answered) answered += 1;
    if (answer?.markedForReview) markedForReview += 1;
    if (graded.state === 'correct') correct += 1;
    if (graded.state === 'wrong') wrong += 1;
    if (graded.state === 'skipped') skipped += 1;
    if (graded.state === 'pending') pending += 1;
  });

  return {
    totalQuestions: questions.length,
    answered,
    correct,
    wrong,
    skipped,
    pending,
    markedForReview,
    score: Number(score.toFixed(2)),
    maxMarks,
    percentage: maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(2)) : 0,
  };
}

function summarizeAttempt({
  assignment,
  attempt,
  answers,
  questions,
  securityEvents,
  includeQuestionBreakdown = true,
  includeSecurityEvents = true,
  includeEvidence = true,
}) {
  const cachedScore = !includeQuestionBreakdown && attempt?.scoreSummary?.processedAt ? attempt.scoreSummary : null;
  const answerByQuestion = new Map(answers.map((answer) => [String(answer.questionId), answer]));
  const maxMarks = questions.reduce((total, question) => total + asNumber(question.positiveMarks, 1), 0);
  let score = cachedScore ? asNumber(cachedScore.score) : 0;
  let correct = cachedScore ? asNumber(cachedScore.correct) : 0;
  let wrong = cachedScore ? asNumber(cachedScore.wrong) : 0;
  let skipped = cachedScore ? asNumber(cachedScore.skipped) : 0;
  let pending = cachedScore ? asNumber(cachedScore.pending) : 0;
  let answeredCount = cachedScore ? asNumber(cachedScore.answered) : 0;
  let markedForReviewCount = cachedScore ? asNumber(cachedScore.markedForReview) : 0;
  const questionBreakdown = [];

  if (!cachedScore) questions.forEach((question, index) => {
    const answer = answerByQuestion.get(String(question._id));
    const graded = gradeAnswer(question, answer);

    score += graded.score;
    if (answer?.answered) answeredCount += 1;
    if (answer?.markedForReview) markedForReviewCount += 1;
    if (graded.state === 'correct') correct += 1;
    if (graded.state === 'wrong') wrong += 1;
    if (graded.state === 'skipped') skipped += 1;
    if (graded.state === 'pending') pending += 1;

    if (includeQuestionBreakdown) {
      questionBreakdown.push({
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
      });
    }
  });

  const submittedAt = attempt?.submittedAt || null;
  const startedAt = attempt?.startedAt || null;
  const durationMinutes =
    startedAt && submittedAt ? Math.max(Math.round((new Date(submittedAt) - new Date(startedAt)) / 60000), 0) : null;
  const warningEvents = securityEvents.filter((event) => event.severity === 'warning').length;
  const criticalEvents = securityEvents.filter((event) => event.severity === 'critical').length;
  const ufmReviews = securityEvents.filter((event) => event.type === 'ufm_pending').map(serializeUfmReview);
  const securityScore = asNumber(attempt?.securityScore, securityEvents.reduce((total, event) => total + asNumber(event.score), 0));
  const identity = attempt?.identityVerification || {};
  const identityVerification = {
    status: identity.status || 'not_started',
    matchPercentage: asNumber(identity.matchPercentage, 0),
    distance: identity.distance ?? null,
    threshold: identity.threshold ?? 0.6,
    capturedAt: identity.capturedAt || null,
    selfieImage: includeEvidence ? identity.selfieImage || '' : '',
    idCardImage: includeEvidence ? identity.idCardImage || '' : '',
    selfieStorageKey: includeEvidence ? identity.selfieStorageKey || '' : '',
    idCardStorageKey: includeEvidence ? identity.idCardStorageKey || '' : '',
    reviewNote: identity.reviewNote || '',
  };
  const effectiveMaxMarks = cachedScore ? asNumber(cachedScore.maxMarks, maxMarks) : maxMarks;
  const percentage = cachedScore ? asNumber(cachedScore.percentage) : effectiveMaxMarks > 0 ? Number(((score / effectiveMaxMarks) * 100).toFixed(2)) : 0;
  const status = attempt?.status || assignment.examStatus || 'not_started';
  const integrityStatus = status === 'ufm' || ufmReviews.length > 0 || criticalEvents > 0 || securityScore >= 10 || identityVerification.status === 'manual_review' ? 'flagged' : 'clean';

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
    totalQuestions: cachedScore ? asNumber(cachedScore.totalQuestions, questions.length) : questions.length,
    answered: answeredCount,
    correct,
    wrong,
    skipped,
    pending,
    markedForReview: markedForReviewCount,
    maxMarks: effectiveMaxMarks,
    score: Number(score.toFixed(2)),
    percentage,
    securityScore,
    warningEvents,
    criticalEvents,
    totalSecurityEvents: securityEvents.length,
    ufmReviews,
    identityVerification,
    integrityStatus,
    securitySummary: attempt?.securitySummary || {},
    questionBreakdown: includeQuestionBreakdown ? questionBreakdown : [],
    securityEvents: includeSecurityEvents
      ? securityEvents.map((event) => ({
          id: event._id,
          type: event.type,
          severity: event.severity,
          score: event.score,
          message: event.message,
          metadata: event.metadata || {},
          proctorName: event.metadata?.proctorName || '',
          proctorEmail: event.metadata?.proctorEmail || '',
          occurredAt: event.occurredAt,
        }))
      : [],
  };
}

async function buildAssessmentReport(req, assessmentId, options = {}) {
  const includeDetail = Boolean(options.includeDetail);
  const includeEvidence = options.includeEvidence ?? includeDetail;
  const includeQuestionBreakdown = options.includeQuestionBreakdown ?? includeDetail;
  const includeSecurityEvents = options.includeSecurityEvents ?? includeDetail;
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) })
    .select('title assessmentCode status startAt endAt ownerAdminId courses')
    .populate('ownerAdminId', 'name email')
    .lean();
  if (!assessment) return null;

  const [assignments, attempts, questions, answers, securityEvents] = await Promise.all([
    AssessmentStudent.find({ assessmentId: assessment._id })
      .select('name email applicationNumber generatedExamId courseName courseId eligibilityStatus mailStatus examStatus')
      .sort({ courseName: 1, name: 1 })
      .lean(),
    AssessmentAttempt.find({ assessmentId: assessment._id })
      .select('assessmentStudentId status startedAt submittedAt securityScore identityVerification securitySummary scoreSummary')
      .lean(),
    AssessmentQuestion.find({ assessmentId: assessment._id })
      .select('type courseName courseId questionText options expectedAnswer alternateAnswers positiveMarks negativeMarks order createdAt')
      .sort({ courseName: 1, order: 1, createdAt: 1 })
      .lean(),
    AssessmentAnswer.find({ assessmentId: assessment._id })
      .select('attemptId assessmentStudentId questionId selectedOptionId textAnswer markedForReview answered savedAt')
      .lean(),
    AssessmentSecurityEvent.find({ assessmentId: assessment._id })
      .select('attemptId assessmentStudentId type severity score message metadata occurredAt')
      .sort({ occurredAt: -1 })
      .lean(),
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
      includeQuestionBreakdown,
      includeSecurityEvents,
      includeEvidence,
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

async function buildCandidateReport(req, assessmentId, assignmentId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) })
    .select('title assessmentCode status startAt endAt ownerAdminId courses')
    .populate('ownerAdminId', 'name email')
    .lean();
  if (!assessment) return null;

  const assignment = await AssessmentStudent.findOne({ _id: assignmentId, assessmentId: assessment._id })
    .select('name email applicationNumber generatedExamId courseName courseId eligibilityStatus mailStatus examStatus')
    .lean();
  if (!assignment) return { assessment, candidate: null };

  const questionCourseQuery = {
    assessmentId: assessment._id,
    courseName: assignment.courseName,
    ...(assignment.courseId
      ? { courseId: assignment.courseId }
      : { $or: [{ courseId: '' }, { courseId: null }, { courseId: { $exists: false } }] }),
  };

  const [attempt, questions] = await Promise.all([
    AssessmentAttempt.findOne({ assessmentId: assessment._id, assessmentStudentId: assignment._id })
      .select('assessmentStudentId status startedAt submittedAt securityScore identityVerification securitySummary scoreSummary')
      .lean(),
    AssessmentQuestion.find(questionCourseQuery)
      .select('type courseName courseId questionText options expectedAnswer alternateAnswers positiveMarks negativeMarks order createdAt')
      .sort({ courseName: 1, order: 1, createdAt: 1 })
      .lean(),
  ]);

  const [answers, securityEvents] = attempt
    ? await Promise.all([
        AssessmentAnswer.find({ assessmentId: assessment._id, attemptId: attempt._id })
          .select('attemptId assessmentStudentId questionId selectedOptionId textAnswer markedForReview answered savedAt')
          .lean(),
        AssessmentSecurityEvent.find({ assessmentId: assessment._id, attemptId: attempt._id })
          .select('attemptId assessmentStudentId type severity score message metadata occurredAt')
          .sort({ occurredAt: -1 })
          .lean(),
      ])
    : [[], []];

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
    candidate: summarizeAttempt({
      assignment,
      attempt,
      answers,
      questions,
      securityEvents,
      includeQuestionBreakdown: true,
      includeSecurityEvents: true,
      includeEvidence: true,
    }),
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
  return rows.map(({ questionBreakdown: _questionBreakdown, securityEvents: _securityEvents, identityVerification, ...row }) => ({
    ...row,
    identityVerification: identityVerification
      ? {
          ...identityVerification,
          selfieImage: '',
          idCardImage: '',
        }
      : identityVerification,
  }));
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value) {
  return `"${csvValue(value).replaceAll('"', '""')}"`;
}

function exportFileStem(assessment, module) {
  const code = String(assessment?.assessmentCode || 'exam-report')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const moduleName = String(module || 'report').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return `elvora-${code || 'exam-report'}-${moduleName || 'report'}`;
}

async function writeCsvLine(res, line) {
  if (!res.write(`${line}\n`)) {
    await once(res, 'drain');
  }
}

async function sendCsvExport(res, payload) {
  const headers = payload.fields.map(([, label]) => label);
  const keys = payload.fields.map(([key]) => key);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileStem(payload.assessment, payload.module)}.csv"`);
  res.setHeader('X-Report-Module', payload.module);
  res.setHeader('X-Report-Rows', String(payload.rows.length));

  await writeCsvLine(res, `\uFEFF${headers.map(csvEscape).join(',')}`);
  for (const row of payload.rows) {
    await writeCsvLine(res, keys.map((key) => csvEscape(row[key])).join(','));
  }
  res.end();
}

async function writeCsvExportFile(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  try {
    const headers = payload.fields.map(([, label]) => label);
    const keys = payload.fields.map(([key]) => key);
    await writeCsvLine(stream, `\uFEFF${headers.map(csvEscape).join(',')}`);
    for (const row of payload.rows) {
      await writeCsvLine(stream, keys.map((key) => csvEscape(row[key])).join(','));
    }
    stream.end();
    await Promise.race([
      once(stream, 'finish'),
      once(stream, 'error').then(([error]) => {
        throw error;
      }),
    ]);
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

function cleanExportFilters(filters = {}) {
  const allowed = new Set(['search', 'course', 'status', 'integrity', 'dateFrom', 'dateTo', 'minScore', 'maxScore']);
  return Object.entries(filters).reduce((next, [key, value]) => {
    if (!allowed.has(key) || value === undefined || value === null || value === '') return next;
    next[key] = typeof value === 'string' ? value.trim() : value;
    return next;
  }, {});
}

function serializeExportJob(job) {
  return {
    id: job._id,
    assessmentId: job.assessmentId,
    assessmentTitle: job.assessmentTitle,
    assessmentCode: job.assessmentCode,
    module: job.module,
    format: job.format,
    filters: job.filters || {},
    fields: job.fields || [],
    status: job.status,
    rowCount: job.rowCount || 0,
    fileName: job.fileName || '',
    contentType: job.contentType || '',
    errorMessage: job.errorMessage || '',
    requestedByName: job.requestedByName || '',
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
  };
}

function buildExportJobReq(job) {
  return {
    user: {
      _id: job.requestedBy,
      role: job.requestedByRole,
      name: job.requestedByName,
      email: job.requestedByEmail,
      permissions: job.requestedPermissions || [],
    },
    query: {
      ...(job.filters || {}),
      format: job.format,
      module: job.module,
      fields: job.fields || [],
    },
    ip: 'background-export',
    get: () => 'background-export',
  };
}

async function runReportExportJob(jobId) {
  const job = await ReportExportJob.findById(jobId);
  if (!job || !['queued', 'processing'].includes(job.status)) return;

  await ReportExportJob.updateOne(
    { _id: job._id },
    { $set: { status: 'processing', startedAt: new Date(), errorMessage: '' } }
  );

  try {
    const payload = await buildExportPayload(buildExportJobReq(job), job.assessmentId);
    if (!payload) throw new Error('Assessment report not found.');

    const fileName = `${exportFileStem(payload.assessment, payload.module)}.csv`;
    const filePath = path.join(reportExportDirectory, `${job._id}-${fileName}`);
    await writeCsvExportFile(filePath, payload);

    await ReportExportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'completed',
          rowCount: payload.rows.length,
          fileName,
          filePath,
          contentType: 'text/csv; charset=utf-8',
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }
    );
  } catch (error) {
    await ReportExportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          errorMessage: error.message || 'Export failed.',
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }
    );
  }
}

function queueReportExportJob(jobId) {
  setImmediate(() => {
    runReportExportJob(jobId).catch((error) => {
      console.error('Report export job failed:', error);
    });
  });
}

const candidateExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['applicationNumber', 'Application Number'],
  ['generatedExamId', 'Unique ID'],
  ['course', 'Course'],
  ['courseId', 'Course Code'],
  ['eligibilityStatus', 'Eligibility Status'],
  ['mailStatus', 'Mail Status'],
  ['examStatus', 'Assigned Exam Status'],
  ['status', 'Status'],
  ['startedAt', 'Started At'],
  ['submittedAt', 'Submitted At'],
  ['durationMinutes', 'Duration Minutes'],
  ['totalQuestions', 'Total Questions'],
  ['answered', 'Answered'],
  ['correct', 'Correct'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['pending', 'Pending'],
  ['markedForReview', 'Marked For Review'],
  ['score', 'Score'],
  ['maxMarks', 'Max Marks'],
  ['percentage', 'Percentage'],
  ['securityScore', 'Security Score'],
  ['fairnessScore', 'Fairness Score'],
  ['identityMatch', 'Identity Match'],
  ['identityStatus', 'Identity Status'],
  ['identityCapturedAt', 'Identity Captured At'],
  ['identityReviewNote', 'Identity Review Note'],
  ['selfieStorageKey', 'Candidate Photo Storage Key'],
  ['idCardStorageKey', 'Uploaded ID Storage Key'],
  ['warningEvents', 'Warnings'],
  ['criticalEvents', 'Critical Events'],
  ['totalSecurityEvents', 'Total Security Events'],
  ['ufmReviews', 'UFM Reviews'],
  ['latestUfmProctor', 'Latest UFM Proctor'],
  ['latestUfmAt', 'Latest UFM At'],
  ['latestUfmNote', 'Latest UFM Note'],
  ['integrity', 'Integrity'],
];

const questionAnalysisExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['number', 'Question No.'],
  ['courseName', 'Course'],
  ['courseId', 'Course ID'],
  ['type', 'Type'],
  ['questionText', 'Question'],
  ['maxMarks', 'Max Marks'],
  ['negativeMarks', 'Negative Marks'],
  ['eligible', 'Eligible Candidates'],
  ['attempted', 'Attempted'],
  ['correct', 'Correct'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['accuracy', 'Accuracy %'],
  ['averageScore', 'Average Score'],
];

const activityLogExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['occurredAt', 'Occurred At'],
  ['candidateName', 'Candidate Name'],
  ['email', 'Email'],
  ['uniqueId', 'Unique ID'],
  ['courseName', 'Course'],
  ['type', 'Activity Type'],
  ['severity', 'Severity'],
  ['score', 'Security Score'],
  ['message', 'Message'],
  ['proctorName', 'Proctor'],
];

const responseLogExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['savedAt', 'Saved At'],
  ['candidateName', 'Candidate Name'],
  ['email', 'Email'],
  ['uniqueId', 'Unique ID'],
  ['courseName', 'Course'],
  ['questionType', 'Question Type'],
  ['questionText', 'Question'],
  ['response', 'Response'],
  ['answered', 'Answered'],
  ['markedForReview', 'Marked For Review'],
  ['result', 'Result'],
  ['score', 'Score'],
];

function mapCandidateExportRows(report) {
  return serializeRows(report.rows).map((row) => ({
    assessment: report.assessment.title,
    assessmentCode: report.assessment.assessmentCode,
    name: row.name,
    email: row.email,
    applicationNumber: row.applicationNumber,
    generatedExamId: row.generatedExamId,
    course: `${row.courseName}${row.courseId ? ` (${row.courseId})` : ''}`,
    courseId: row.courseId,
    eligibilityStatus: row.eligibilityStatus,
    mailStatus: row.mailStatus,
    examStatus: row.examStatus,
    status: row.status,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    durationMinutes: row.durationMinutes,
    totalQuestions: row.totalQuestions,
    answered: row.answered,
    correct: row.correct,
    wrong: row.wrong,
    skipped: row.skipped,
    pending: row.pending,
    markedForReview: row.markedForReview,
    score: row.score,
    maxMarks: row.maxMarks,
    percentage: row.percentage,
    securityScore: row.securityScore,
    fairnessScore: Math.max(100 - Number(row.securityScore || 0), 0),
    identityMatch: row.identityVerification?.matchPercentage || 0,
    identityStatus: row.identityVerification?.status || 'not_started',
    identityCapturedAt: row.identityVerification?.capturedAt || '',
    identityReviewNote: row.identityVerification?.reviewNote || '',
    selfieStorageKey: row.identityVerification?.selfieStorageKey || '',
    idCardStorageKey: row.identityVerification?.idCardStorageKey || '',
    warningEvents: row.warningEvents,
    criticalEvents: row.criticalEvents,
    totalSecurityEvents: row.totalSecurityEvents,
    ufmReviews: row.ufmReviews?.length || 0,
    latestUfmProctor: row.ufmReviews?.[0]?.proctorName || '',
    latestUfmAt: row.ufmReviews?.[0]?.markedAt || '',
    latestUfmNote: row.ufmReviews?.[0]?.message || '',
    integrity: row.integrityStatus,
  }));
}

async function buildExportPayload(req, assessmentId) {
  const module = normalizeReportModule(req.query.module);
  const requestedFields = req.query.fields;

  if (module === 'question-analysis') {
    const report = await loadQuestionAnalysis(req, assessmentId, { all: true });
    if (!report) return null;
    return {
      module,
      assessment: report.assessment,
      fields: selectExportFields(questionAnalysisExportFields, requestedFields),
      rows: report.items.map((row) => ({
        assessment: report.assessment.title,
        assessmentCode: report.assessment.assessmentCode,
        ...row,
      })),
    };
  }

  if (module === 'activity-log') {
    const report = await loadActivityLog(req, assessmentId, { all: true });
    if (!report) return null;
    return {
      module,
      assessment: report.assessment,
      fields: selectExportFields(activityLogExportFields, requestedFields),
      rows: report.items.map((row) => ({
        assessment: report.assessment.title,
        assessmentCode: report.assessment.assessmentCode,
        ...row,
      })),
    };
  }

  if (module === 'response-log') {
    const report = await loadResponseLog(req, assessmentId, { all: true });
    if (!report) return null;
    return {
      module,
      assessment: report.assessment,
      fields: selectExportFields(responseLogExportFields, requestedFields),
      rows: report.items.map((row) => ({
        assessment: report.assessment.title,
        assessmentCode: report.assessment.assessmentCode,
        ...row,
      })),
    };
  }

  const report = await buildAssessmentReport(req, assessmentId, { filters: req.query, includeEvidence: true });
  if (!report) return null;
  return {
    module,
    assessment: report.assessment,
    fields: selectExportFields(candidateExportFields, requestedFields),
    rows: mapCandidateExportRows(report),
  };
}

function getPageQuery(query, options = {}) {
  if (options.all) {
    return { page: 1, limit: Number.MAX_SAFE_INTEGER, skip: 0 };
  }

  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 25), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function buildPagination({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
}

async function getAssessmentForReport(req, assessmentId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) })
    .select('title assessmentCode status startAt endAt ownerAdminId courses')
    .lean();
  if (!assessment) return null;

  return {
    id: assessment._id,
    title: assessment.title,
    assessmentCode: assessment.assessmentCode,
    status: assessment.status,
    startAt: assessment.startAt,
    endAt: assessment.endAt,
    ownerAdmin: assessment.ownerAdminId,
    courses: assessment.courses || [],
  };
}

function assessmentMeta(assessment) {
  return {
    id: assessment._id,
    title: assessment.title,
    assessmentCode: assessment.assessmentCode,
    status: assessment.status,
    startAt: assessment.startAt,
    endAt: assessment.endAt,
    ownerAdmin: assessment.ownerAdminId,
    courses: assessment.courses || [],
  };
}

function hasCandidateFilters(filters) {
  return Boolean(
    normalizeText(filters.search) ||
    normalizeText(filters.course) ||
    (filters.status && filters.status !== 'all') ||
    (filters.integrity && filters.integrity !== 'all') ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.minScore !== undefined ||
    filters.maxScore !== undefined
  );
}

function intersectIds(left, right) {
  const rightSet = new Set(right.map((id) => String(id)));
  return left.filter((id) => rightSet.has(String(id)));
}

function constrainAssignmentIds(query, ids) {
  if (!ids) return true;
  if (ids.length === 0) return false;

  const current = query._id && typeof query._id === 'object' ? query._id : {};
  const nextIds = current.$in ? intersectIds(current.$in, ids) : ids;
  if (nextIds.length === 0) return false;
  query._id = { ...current, $in: nextIds };
  return true;
}

function excludeAssignmentIds(query, ids) {
  if (!ids?.length) return;
  const current = query._id && typeof query._id === 'object' ? query._id : {};
  query._id = { ...current, $nin: [...(current.$nin || []), ...ids] };
}

function uniqueIds(...groups) {
  const seen = new Set();
  const ids = [];
  groups.flat().forEach((id) => {
    const key = String(id);
    if (id && !seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  });
  return ids;
}

async function findFlaggedAssignmentIds(assessmentId, scopeIds = null) {
  if (scopeIds && scopeIds.length === 0) return [];

  const scope = scopeIds ? { assessmentStudentId: { $in: scopeIds } } : {};
  const [attemptIds, eventIds] = await Promise.all([
    AssessmentAttempt.distinct('assessmentStudentId', {
      assessmentId,
      ...scope,
      $or: [
        { status: 'ufm' },
        { securityScore: { $gte: 10 } },
        { 'identityVerification.status': 'manual_review' },
      ],
    }),
    AssessmentSecurityEvent.distinct('assessmentStudentId', {
      assessmentId,
      ...scope,
      $or: [
        { severity: 'critical' },
        { type: 'ufm_pending' },
      ],
    }),
  ]);

  return uniqueIds(attemptIds, eventIds);
}

async function buildReportAssignmentQuery(assessmentId, filters) {
  const query = { assessmentId };
  const searchRegex = buildTextRegex(filters.search);
  const courseRegex = buildTextRegex(filters.course);
  const status = String(filters.status || '').trim();
  const integrity = String(filters.integrity || '').trim();

  if (searchRegex) {
    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { generatedExamId: searchRegex },
      { applicationNumber: searchRegex },
    ];
  }

  if (courseRegex) {
    const courseClause = {
      $or: [
        { courseName: courseRegex },
        { courseId: courseRegex },
      ],
    };
    if (query.$or) {
      query.$and = [{ $or: query.$or }, courseClause];
      delete query.$or;
    } else {
      Object.assign(query, courseClause);
    }
  }

  if (status && status !== 'all') {
    query.examStatus = status;
  }

  const attemptQuery = { assessmentId };
  const submittedAtRange = buildDateRange(filters.dateFrom, filters.dateTo);
  if (submittedAtRange) attemptQuery.submittedAt = submittedAtRange;

  const scoreRange = {};
  const minScore = Number(filters.minScore);
  const maxScore = Number(filters.maxScore);
  if (filters.minScore !== undefined && filters.minScore !== '' && Number.isFinite(minScore)) scoreRange.$gte = minScore;
  if (filters.maxScore !== undefined && filters.maxScore !== '' && Number.isFinite(maxScore)) scoreRange.$lte = maxScore;
  if (Object.keys(scoreRange).length) attemptQuery['scoreSummary.score'] = scoreRange;

  if (submittedAtRange || Object.keys(scoreRange).length) {
    const matchingIds = await AssessmentAttempt.distinct('assessmentStudentId', attemptQuery);
    if (!constrainAssignmentIds(query, matchingIds)) return { query, empty: true };
  }

  if (integrity && integrity !== 'all') {
    const flaggedIds = await findFlaggedAssignmentIds(assessmentId);
    if (integrity === 'flagged' && !constrainAssignmentIds(query, flaggedIds)) return { query, empty: true };
    if (integrity === 'clean') excludeAssignmentIds(query, flaggedIds);
  }

  return { query, empty: false };
}

function buildQuestionQueryForAssignments(assessmentId, assignments) {
  const seen = new Set();
  const clauses = [];
  assignments.forEach((assignment) => {
    const courseName = assignment.courseName || '';
    const courseId = assignment.courseId || '';
    const key = `${courseName}|${courseId}`;
    if (seen.has(key)) return;
    seen.add(key);

    clauses.push({
      courseName,
      ...(courseId
        ? { courseId }
        : { $or: [{ courseId: '' }, { courseId: null }, { courseId: { $exists: false } }] }),
    });
  });

  return clauses.length ? { assessmentId, $or: clauses } : { assessmentId, _id: { $exists: false } };
}

function buildEmptyPagedAssessmentReport(assessment, page, limit) {
  return {
    assessment: assessmentMeta(assessment),
    summary: {
      assigned: 0,
      submitted: 0,
      inProgress: 0,
      notStarted: 0,
      ufm: 0,
      blocked: 0,
      completionRate: 0,
      averagePercentage: 0,
      highestScore: 0,
      totalQuestions: 0,
      totalSecurityEvents: 0,
      flaggedSessions: 0,
    },
    distributions: { scoreBands: [], violationTypes: [], courses: [] },
    items: [],
    pagination: buildPagination({ page, limit, total: 0 }),
  };
}

async function buildPagedAssessmentReport(req, assessmentId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) })
    .select('title assessmentCode status startAt endAt ownerAdminId courses')
    .populate('ownerAdminId', 'name email')
    .lean();
  if (!assessment) return null;

  const { page, limit, skip } = getPageQuery(req.query);
  const { query: assignmentQuery, empty } = await buildReportAssignmentQuery(assessment._id, req.query);
  if (empty) return buildEmptyPagedAssessmentReport(assessment, page, limit);

  const total = await AssessmentStudent.countDocuments(assignmentQuery);
  if (total === 0) return buildEmptyPagedAssessmentReport(assessment, page, limit);

  const needsScopedSummary = hasCandidateFilters(req.query);
  const [assignments, scopedAssignments] = await Promise.all([
    AssessmentStudent.find(assignmentQuery)
      .select('name email applicationNumber generatedExamId courseName courseId eligibilityStatus mailStatus examStatus')
      .sort({ courseName: 1, name: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    needsScopedSummary
      ? AssessmentStudent.find(assignmentQuery).select('_id').lean()
      : Promise.resolve(null),
  ]);

  const scopedAssignmentIds = scopedAssignments ? scopedAssignments.map((assignment) => assignment._id) : null;
  const pageAssignmentIds = assignments.map((assignment) => assignment._id);
  const attemptMatch = {
    assessmentId: assessment._id,
    ...(scopedAssignmentIds ? { assessmentStudentId: { $in: scopedAssignmentIds } } : {}),
  };
  const securityMatch = {
    assessmentId: assessment._id,
    ...(scopedAssignmentIds ? { assessmentStudentId: { $in: scopedAssignmentIds } } : {}),
  };

  const [
    statusCounts,
    attemptMetrics,
    questionCount,
    securityMetrics,
    violationTypes,
    courseCounts,
    flaggedIds,
    pageAttempts,
    pageQuestions,
    pageSecurityEvents,
  ] = await Promise.all([
    AssessmentStudent.aggregate([
      { $match: assignmentQuery },
      { $group: { _id: '$examStatus', count: { $sum: 1 } } },
    ]),
    AssessmentAttempt.aggregate([
      { $match: attemptMatch },
      {
        $group: {
          _id: null,
          submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          ufm: { $sum: { $cond: [{ $eq: ['$status', 'ufm'] }, 1, 0] } },
          highestScore: { $max: { $ifNull: ['$scoreSummary.score', 0] } },
          scoredAttempts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'submitted'] }, { $gt: ['$scoreSummary.maxMarks', 0] }] },
                1,
                0,
              ],
            },
          },
          percentageTotal: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'submitted'] }, { $gt: ['$scoreSummary.maxMarks', 0] }] },
                { $ifNull: ['$scoreSummary.percentage', 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
    AssessmentQuestion.countDocuments({ assessmentId: assessment._id }),
    AssessmentSecurityEvent.aggregate([
      { $match: securityMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        },
      },
    ]),
    AssessmentSecurityEvent.aggregate([
      { $match: securityMatch },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    AssessmentStudent.aggregate([
      { $match: assignmentQuery },
      {
        $group: {
          _id: { courseName: '$courseName', courseId: { $ifNull: ['$courseId', ''] } },
          total: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ['$examStatus', 'submitted'] }, 1, 0] } },
          flagged: { $sum: { $cond: [{ $eq: ['$examStatus', 'ufm'] }, 1, 0] } },
        },
      },
    ]),
    findFlaggedAssignmentIds(assessment._id, scopedAssignmentIds),
    AssessmentAttempt.find({ assessmentId: assessment._id, assessmentStudentId: { $in: pageAssignmentIds } })
      .select('assessmentStudentId status startedAt submittedAt securityScore identityVerification securitySummary scoreSummary')
      .lean(),
    AssessmentQuestion.find(buildQuestionQueryForAssignments(assessment._id, assignments))
      .select('type courseName courseId questionText options expectedAnswer alternateAnswers positiveMarks negativeMarks order createdAt')
      .sort({ courseName: 1, order: 1, createdAt: 1 })
      .lean(),
    AssessmentSecurityEvent.find({ assessmentId: assessment._id, assessmentStudentId: { $in: pageAssignmentIds } })
      .select('attemptId assessmentStudentId type severity score message metadata occurredAt')
      .sort({ occurredAt: -1 })
      .lean(),
  ]);

  const attemptsNeedingAnswers = pageAttempts
    .filter((attempt) => !attempt.scoreSummary?.processedAt)
    .map((attempt) => attempt._id);
  const pageAnswers = attemptsNeedingAnswers.length
    ? await AssessmentAnswer.find({ assessmentId: assessment._id, attemptId: { $in: attemptsNeedingAnswers } })
      .select('attemptId assessmentStudentId questionId selectedOptionId textAnswer markedForReview answered savedAt')
      .lean()
    : [];

  const attemptByAssignment = new Map(pageAttempts.map((attempt) => [String(attempt.assessmentStudentId), attempt]));
  const answersByAttempt = pageAnswers.reduce((groups, answer) => {
    const key = String(answer.attemptId);
    groups.set(key, [...(groups.get(key) || []), answer]);
    return groups;
  }, new Map());
  const eventsByAssignment = pageSecurityEvents.reduce((groups, event) => {
    const key = String(event.assessmentStudentId);
    groups.set(key, [...(groups.get(key) || []), event]);
    return groups;
  }, new Map());
  const questionsByCourse = pageQuestions.reduce((groups, question) => {
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
      securityEvents: eventsByAssignment.get(String(assignment._id)) || [],
      includeQuestionBreakdown: false,
      includeSecurityEvents: false,
      includeEvidence: false,
    });
  });

  const statusByType = Object.fromEntries(statusCounts.map((item) => [item._id || 'not_started', item.count]));
  const metrics = attemptMetrics[0] || {};
  const security = securityMetrics[0] || {};
  const scoredAttempts = asNumber(metrics.scoredAttempts);
  const submitted = statusByType.submitted || asNumber(metrics.submitted);

  return {
    assessment: assessmentMeta(assessment),
    summary: {
      assigned: total,
      submitted,
      inProgress: statusByType.in_progress || asNumber(metrics.inProgress),
      notStarted: statusByType.not_started || 0,
      ufm: statusByType.ufm || asNumber(metrics.ufm),
      blocked: statusByType.blocked || 0,
      completionRate: total ? Number(((submitted / total) * 100).toFixed(2)) : 0,
      averagePercentage: scoredAttempts ? Number((asNumber(metrics.percentageTotal) / scoredAttempts).toFixed(2)) : 0,
      highestScore: asNumber(metrics.highestScore),
      totalQuestions: questionCount,
      totalSecurityEvents: asNumber(security.total),
      flaggedSessions: flaggedIds.length,
    },
    distributions: {
      scoreBands: [],
      violationTypes: violationTypes.map((item) => ({ type: item._id || 'activity', count: item.count })),
      courses: courseCounts.map((item) => ({
        courseName: item._id.courseName || 'Unassigned course',
        courseId: item._id.courseId || '',
        course: `${item._id.courseName || 'Unassigned course'}${item._id.courseId ? ` (${item._id.courseId})` : ''}`,
        total: item.total,
        submitted: item.submitted,
        flagged: item.flagged,
      })),
    },
    items: serializeRows(rows),
    pagination: buildPagination({ page, limit, total }),
  };
}

async function findMatchingAssignmentIds(assessmentId, filters) {
  const search = buildTextRegex(filters.search);
  const course = buildTextRegex(filters.course);
  if (!search && !course) return null;

  const query = { assessmentId };
  const clauses = [];
  if (search) {
    clauses.push({
      $or: [
        { name: search },
        { email: search },
        { generatedExamId: search },
        { applicationNumber: search },
      ],
    });
  }
  if (course) {
    clauses.push({
      $or: [
        { courseName: course },
        { courseId: course },
      ],
    });
  }
  if (clauses.length === 1) Object.assign(query, clauses[0]);
  if (clauses.length > 1) query.$and = clauses;

  const assignments = await AssessmentStudent.find(query).select('_id').lean();
  return assignments.map((assignment) => assignment._id);
}

async function loadQuestionAnalysis(req, assessmentId, options = {}) {
  const assessment = await getAssessmentForReport(req, assessmentId);
  if (!assessment) return null;

  const search = buildTextRegex(req.query.search);
  const course = buildTextRegex(req.query.course);
  const { page, limit, skip } = getPageQuery(req.query, options);
  const questionQuery = { assessmentId };
  if (search) questionQuery.questionText = search;
  if (course) {
    questionQuery.$or = [
      { courseName: course },
      { courseId: course },
    ];
  }

  const questionFindQuery = AssessmentQuestion.find(questionQuery)
    .select('type courseName courseId questionText options expectedAnswer alternateAnswers positiveMarks negativeMarks order createdAt')
    .sort({ courseName: 1, order: 1, createdAt: 1 });
  if (!options.all) questionFindQuery.skip(skip).limit(limit);

  const [totalQuestions, questions, courseCounts] = await Promise.all([
    AssessmentQuestion.countDocuments(questionQuery),
    questionFindQuery.lean(),
    AssessmentStudent.aggregate([
      { $match: { assessmentId: assessment.id } },
      {
        $group: {
          _id: { courseName: '$courseName', courseId: { $ifNull: ['$courseId', ''] } },
          total: { $sum: 1 },
        },
      },
    ]),
  ]);

  const questionIds = questions.map((question) => question._id);
  const answers = questionIds.length
    ? await AssessmentAnswer.find({ assessmentId, questionId: { $in: questionIds } })
      .select('questionId selectedOptionId textAnswer answered')
      .lean()
    : [];

  const answersByQuestion = answers.reduce((groups, answer) => {
    const key = String(answer.questionId);
    const current = groups.get(key) || [];
    current.push(answer);
    groups.set(key, current);
    return groups;
  }, new Map());
  const courseCountByKey = new Map(courseCounts.map((item) => [`${item._id.courseName}|${item._id.courseId || ''}`, item.total]));
  const questionOffset = options.all ? 0 : skip;

  const items = questions.map((question, index) => {
    const questionAnswers = answersByQuestion.get(String(question._id)) || [];
    let attempted = 0;
    let correct = 0;
    let wrong = 0;
    let scoreTotal = 0;

    questionAnswers.forEach((answer) => {
      const graded = gradeAnswer(question, answer);
      if (answer.answered) attempted += 1;
      if (graded.state === 'correct') correct += 1;
      if (graded.state === 'wrong') wrong += 1;
      scoreTotal += graded.score;
    });

    const eligible = courseCountByKey.get(`${question.courseName}|${question.courseId || ''}`) || 0;
    const skipped = Math.max(eligible - attempted, 0);

    return {
      questionId: question._id,
      number: questionOffset + index + 1,
      courseName: question.courseName,
      courseId: question.courseId || '',
      type: question.type,
      questionText: question.questionText,
      maxMarks: asNumber(question.positiveMarks, 1),
      negativeMarks: asNumber(question.negativeMarks, 0),
      eligible,
      attempted,
      correct,
      wrong,
      skipped,
      accuracy: attempted ? Number(((correct / attempted) * 100).toFixed(2)) : 0,
      averageScore: attempted ? Number((scoreTotal / attempted).toFixed(2)) : 0,
    };
  });

  return {
    assessment,
    summary: {
      totalQuestions,
      totalEligible: items.reduce((total, item) => total + item.eligible, 0),
      totalAttempted: items.reduce((total, item) => total + item.attempted, 0),
      averageAccuracy: items.length ? Number((items.reduce((total, item) => total + item.accuracy, 0) / items.length).toFixed(2)) : 0,
    },
    items,
    pagination: buildPagination({ page, limit, total: totalQuestions }),
  };
}

async function loadActivityLog(req, assessmentId, options = {}) {
  const assessment = await getAssessmentForReport(req, assessmentId);
  if (!assessment) return null;

  const { page, limit, skip } = getPageQuery(req.query, options);
  const matchingAssignmentIds = await findMatchingAssignmentIds(assessmentId, req.query);
  if (matchingAssignmentIds && matchingAssignmentIds.length === 0) {
    return { assessment, summary: { total: 0, critical: 0, warning: 0 }, items: [], pagination: buildPagination({ page, limit, total: 0 }) };
  }

  const query = { assessmentId };
  if (matchingAssignmentIds) query.assessmentStudentId = { $in: matchingAssignmentIds };
  const occurredAtRange = buildDateRange(req.query.dateFrom, req.query.dateTo);
  if (occurredAtRange) query.occurredAt = occurredAtRange;

  const aggregateQuery = { ...query, assessmentId: assessment.id };
  const eventFindQuery = AssessmentSecurityEvent.find(query)
    .select('assessmentStudentId type severity score message metadata occurredAt')
    .sort({ occurredAt: -1 });
  if (!options.all) eventFindQuery.skip(skip).limit(limit);

  const [events, total, severityCounts] = await Promise.all([
    eventFindQuery.lean(),
    AssessmentSecurityEvent.countDocuments(query),
    AssessmentSecurityEvent.aggregate([
      { $match: aggregateQuery },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
  ]);
  const assignmentIds = [...new Set(events.map((event) => String(event.assessmentStudentId)))];
  const assignments = await AssessmentStudent.find({ _id: { $in: assignmentIds } })
    .select('name email generatedExamId applicationNumber courseName courseId')
    .lean();
  const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
  const severityByType = Object.fromEntries(severityCounts.map((item) => [item._id || 'info', item.count]));

  return {
    assessment,
    summary: {
      total,
      critical: severityByType.critical || 0,
      warning: severityByType.warning || 0,
      info: severityByType.info || 0,
    },
    items: events.map((event) => {
      const assignment = assignmentById.get(String(event.assessmentStudentId)) || {};
      return {
        id: event._id,
        occurredAt: event.occurredAt,
        type: event.type,
        severity: event.severity,
        score: event.score,
        message: event.message || 'Activity recorded.',
        metadata: event.metadata || {},
        candidateName: assignment.name || '-',
        email: assignment.email || '',
        uniqueId: assignment.generatedExamId || assignment.applicationNumber || '',
        courseName: assignment.courseName || '',
        proctorName: event.metadata?.proctorName || '',
      };
    }),
    pagination: buildPagination({ page, limit, total }),
  };
}

async function loadResponseLog(req, assessmentId, options = {}) {
  const assessment = await getAssessmentForReport(req, assessmentId);
  if (!assessment) return null;

  const { page, limit, skip } = getPageQuery(req.query, options);
  const matchingAssignmentIds = await findMatchingAssignmentIds(assessmentId, req.query);
  if (matchingAssignmentIds && matchingAssignmentIds.length === 0) {
    return { assessment, summary: { total: 0, answered: 0, markedForReview: 0 }, items: [], pagination: buildPagination({ page, limit, total: 0 }) };
  }

  const query = { assessmentId };
  if (matchingAssignmentIds) query.assessmentStudentId = { $in: matchingAssignmentIds };
  const savedAtRange = buildDateRange(req.query.dateFrom, req.query.dateTo);
  if (savedAtRange) query.savedAt = savedAtRange;

  const answerFindQuery = AssessmentAnswer.find(query)
    .select('assessmentStudentId questionId selectedOptionId textAnswer markedForReview answered savedAt')
    .sort({ savedAt: -1 });
  if (!options.all) answerFindQuery.skip(skip).limit(limit);

  const [answers, total, answeredCount, markedForReviewCount] = await Promise.all([
    answerFindQuery.lean(),
    AssessmentAnswer.countDocuments(query),
    AssessmentAnswer.countDocuments({ ...query, answered: true }),
    AssessmentAnswer.countDocuments({ ...query, markedForReview: true }),
  ]);
  const assignmentIds = [...new Set(answers.map((answer) => String(answer.assessmentStudentId)))];
  const questionIds = [...new Set(answers.map((answer) => String(answer.questionId)))];
  const [assignments, questions] = await Promise.all([
    AssessmentStudent.find({ _id: { $in: assignmentIds } })
      .select('name email generatedExamId applicationNumber courseName courseId')
      .lean(),
    AssessmentQuestion.find({ _id: { $in: questionIds } })
      .select('type courseName courseId questionText options expectedAnswer alternateAnswers positiveMarks negativeMarks order')
      .lean(),
  ]);
  const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
  const questionById = new Map(questions.map((question) => [String(question._id), question]));

  return {
    assessment,
    summary: {
      total,
      answered: answeredCount,
      markedForReview: markedForReviewCount,
    },
    items: answers.map((answer) => {
      const assignment = assignmentById.get(String(answer.assessmentStudentId)) || {};
      const question = questionById.get(String(answer.questionId)) || {};
      const graded = question._id ? gradeAnswer(question, answer) : { state: answer.answered ? 'answered' : 'skipped', score: 0 };
      return {
        id: answer._id,
        savedAt: answer.savedAt,
        candidateName: assignment.name || '-',
        email: assignment.email || '',
        uniqueId: assignment.generatedExamId || assignment.applicationNumber || '',
        courseName: assignment.courseName || question.courseName || '',
        questionText: question.questionText || '-',
        questionType: question.type || answer.questionType || '',
        response: answer.textAnswer || (answer.selectedOptionId ? String(answer.selectedOptionId) : '-'),
        answered: Boolean(answer.answered),
        markedForReview: Boolean(answer.markedForReview),
        result: graded.state,
        score: graded.score,
      };
    }),
    pagination: buildPagination({ page, limit, total }),
  };
}

async function processAssessmentScores(req, assessmentId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, ...getScopedQuery(req) })
    .select('title assessmentCode ownerAdminId')
    .lean();
  if (!assessment) return null;

  const [assignments, attempts, questions, answers] = await Promise.all([
    AssessmentStudent.find({ assessmentId: assessment._id })
      .select('courseName courseId examStatus')
      .lean(),
    AssessmentAttempt.find({ assessmentId: assessment._id })
      .select('assessmentStudentId status submittedAt')
      .lean(),
    AssessmentQuestion.find({ assessmentId: assessment._id })
      .select('type courseName courseId options expectedAnswer alternateAnswers positiveMarks negativeMarks')
      .lean(),
    AssessmentAnswer.find({ assessmentId: assessment._id })
      .select('attemptId assessmentStudentId questionId selectedOptionId textAnswer markedForReview answered')
      .lean(),
  ]);

  const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
  const answersByAttempt = answers.reduce((groups, answer) => {
    const key = String(answer.attemptId);
    groups.set(key, [...(groups.get(key) || []), answer]);
    return groups;
  }, new Map());
  const questionsByCourse = questions.reduce((groups, question) => {
    const courseKey = `${question.courseName}|${question.courseId || ''}`;
    groups.set(courseKey, [...(groups.get(courseKey) || []), question]);
    return groups;
  }, new Map());

  const now = new Date();
  const summaries = [];
  const writes = attempts.map((attempt) => {
    const assignment = assignmentById.get(String(attempt.assessmentStudentId));
    const courseKey = `${assignment?.courseName || ''}|${assignment?.courseId || ''}`;
    const summary = computeScoreSummary(
      questionsByCourse.get(courseKey) || [],
      answersByAttempt.get(String(attempt._id)) || []
    );

    summaries.push({ attempt, assignment, summary });
    return {
      updateOne: {
        filter: { _id: attempt._id },
        update: {
          $set: {
            scoreSummary: {
              ...summary,
              processedAt: now,
              processedBy: req.user._id,
            },
          },
        },
      },
    };
  });

  if (writes.length > 0) {
    await AssessmentAttempt.bulkWrite(writes);
  }

  const submitted = summaries.filter(({ attempt, assignment }) => attempt.status === 'submitted' || assignment?.examStatus === 'submitted').length;
  const averagePercentage = submitted
    ? Number((summaries.reduce((total, item) => total + (item.attempt.submittedAt ? item.summary.percentage : 0), 0) / submitted).toFixed(2))
    : 0;
  const highestScore = summaries.reduce((highest, item) => Math.max(highest, item.summary.score), 0);

  return {
    assessment: {
      id: assessment._id,
      title: assessment.title,
      assessmentCode: assessment.assessmentCode,
      ownerAdminId: assessment.ownerAdminId,
    },
    processedAt: now,
    processedBy: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
    },
    summary: {
      candidates: assignments.length,
      attempts: attempts.length,
      processed: writes.length,
      submitted,
      totalQuestions: questions.length,
      totalAnswers: answers.length,
      averagePercentage,
      highestScore,
    },
  };
}

router.get('/assessments', requireAnyPermission(...reportListPermissions), async (req, res, next) => {
  try {
    const search = normalizeText(req.query.search);
    const query = { ...getScopedQuery(req) };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { assessmentCode: { $regex: search, $options: 'i' } },
      ];
    }

    const assessments = await Assessment.find(query)
      .select('title assessmentCode status startAt endAt counts courses updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    const assessmentIds = assessments.map((assessment) => assessment._id);
    const [studentCounts, courseCounts, attemptStatusCounts, securityCounts] = await Promise.all([
      AssessmentStudent.aggregate([
        { $match: { assessmentId: { $in: assessmentIds } } },
        { $group: { _id: '$assessmentId', students: { $sum: 1 } } },
      ]),
      AssessmentStudent.aggregate([
        { $match: { assessmentId: { $in: assessmentIds } } },
        {
          $group: {
            _id: {
              assessmentId: '$assessmentId',
              courseName: { $ifNull: ['$courseName', 'Unassigned course'] },
              courseId: { $ifNull: ['$courseId', ''] },
            },
            total: { $sum: 1 },
            submitted: { $sum: { $cond: [{ $eq: ['$examStatus', 'submitted'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$examStatus', 'in_progress'] }, 1, 0] } },
            flagged: { $sum: { $cond: [{ $eq: ['$examStatus', 'ufm'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.courseName': 1, '_id.courseId': 1 } },
      ]),
      AssessmentAttempt.aggregate([
        { $match: { assessmentId: { $in: assessmentIds } } },
        { $group: { _id: { assessmentId: '$assessmentId', status: '$status' }, count: { $sum: 1 } } },
      ]),
      AssessmentSecurityEvent.aggregate([
        { $match: { assessmentId: { $in: assessmentIds } } },
        { $group: { _id: '$assessmentId', securityEvents: { $sum: 1 } } },
      ]),
    ]);

    const studentCountByAssessment = new Map(studentCounts.map((item) => [String(item._id), item.students]));
    const securityCountByAssessment = new Map(securityCounts.map((item) => [String(item._id), item.securityEvents]));
    const courseBreakdownByAssessment = courseCounts.reduce((map, item) => {
      const assessmentKey = String(item._id.assessmentId);
      const courseName = item._id.courseName || 'Unassigned course';
      const courseId = item._id.courseId || '';
      const list = map.get(assessmentKey) || [];
      list.push({
        courseName,
        courseId,
        course: `${courseName}${courseId ? ` (${courseId})` : ''}`,
        total: item.total,
        submitted: item.submitted,
        inProgress: item.inProgress,
        flagged: item.flagged,
      });
      map.set(assessmentKey, list);
      return map;
    }, new Map());
    const attemptCountsByAssessment = attemptStatusCounts.reduce((map, item) => {
      const assessmentKey = String(item._id.assessmentId);
      const counts = map.get(assessmentKey) || { submitted: 0, ufm: 0, inProgress: 0 };
      if (item._id.status === 'submitted') counts.submitted += item.count;
      if (item._id.status === 'ufm') counts.ufm += item.count;
      if (item._id.status === 'in_progress') counts.inProgress += item.count;
      map.set(assessmentKey, counts);
      return map;
    }, new Map());

    const cards = assessments.map((assessment) => {
      const key = String(assessment._id);
      const attemptCounts = attemptCountsByAssessment.get(key) || { submitted: 0, ufm: 0, inProgress: 0 };
      return {
        id: assessment._id,
        title: assessment.title,
        assessmentCode: assessment.assessmentCode,
        status: assessment.status,
        startAt: assessment.startAt,
        endAt: assessment.endAt,
        counts: assessment.counts,
        courses: assessment.courses || [],
        courseBreakdown: courseBreakdownByAssessment.get(key) || [],
        students: studentCountByAssessment.get(key) || 0,
        submitted: attemptCounts.submitted,
        ufm: attemptCounts.ufm,
        inProgress: attemptCounts.inProgress,
        securityEvents: securityCountByAssessment.get(key) || 0,
      };
    });

    return res.json({ items: cards });
  } catch (error) {
    return next(error);
  }
});

router.get('/export-jobs', requireAnyPermission('reports.export', 'reports.export.csv'), async (req, res, next) => {
  try {
    const query = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    if (req.query.assessmentId) {
      const result = objectIdString.safeParse(String(req.query.assessmentId));
      if (!result.success) return res.status(400).json({ message: 'Invalid assessmentId.' });
      query.assessmentId = result.data;
    }

    const jobs = await ReportExportJob.find(query)
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

    return res.json({ items: jobs.map(serializeExportJob) });
  } catch (error) {
    return next(error);
  }
});

router.get('/export-jobs/:jobId', requireAnyPermission('reports.export', 'reports.export.csv'), async (req, res, next) => {
  try {
    const query = { _id: req.params.jobId, ...(req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id }) };
    const job = await ReportExportJob.findOne(query).lean();
    if (!job) return res.status(404).json({ message: 'Export job not found.' });
    return res.json({ job: serializeExportJob(job) });
  } catch (error) {
    return next(error);
  }
});

router.get('/export-jobs/:jobId/download', requireAnyPermission('reports.export', 'reports.export.csv'), async (req, res, next) => {
  try {
    const query = { _id: req.params.jobId, ...(req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id }) };
    const job = await ReportExportJob.findOne(query).lean();
    if (!job) return res.status(404).json({ message: 'Export job not found.' });
    if (job.status !== 'completed') return res.status(409).json({ message: 'Export file is not ready yet.' });
    if (!job.filePath || !job.fileName) return res.status(404).json({ message: 'Export file is missing.' });

    const resolvedDirectory = path.resolve(reportExportDirectory);
    const resolvedFile = path.resolve(job.filePath);
    if (!resolvedFile.startsWith(resolvedDirectory)) {
      return res.status(404).json({ message: 'Export file is unavailable.' });
    }

    await fsp.access(resolvedFile);
    res.setHeader('Content-Type', job.contentType || 'text/csv; charset=utf-8');
    return res.download(resolvedFile, job.fileName, (error) => {
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ message: 'Export file is missing.' });
    return next(error);
  }
});

router.post(
  '/assessments/:assessmentId/export-jobs',
  validateBody(reportExportJobBodySchema),
  async (req, res, next) => {
    try {
      const format = String(req.body.format || 'csv').toLowerCase();
      const module = normalizeReportModule(req.body.module);
      if (!userCanExportReport(req.user, format, module)) {
        return res.status(403).json({ message: 'Permission denied.' });
      }

      const assessment = await Assessment.findOne({ _id: req.params.assessmentId, ...getScopedQuery(req) })
        .select('title assessmentCode ownerAdminId')
        .lean();
      if (!assessment) return res.status(404).json({ message: 'Assessment report not found.' });

      const job = await ReportExportJob.create({
        assessmentId: assessment._id,
        ownerAdminId: assessment.ownerAdminId || (req.user.role === ROLES.ADMIN ? req.user._id : undefined),
        requestedBy: req.user._id,
        requestedByName: req.user.name,
        requestedByEmail: req.user.email,
        requestedByRole: req.user.role,
        requestedPermissions: req.user.permissions || [],
        assessmentTitle: assessment.title,
        assessmentCode: assessment.assessmentCode,
        module,
        format,
        filters: cleanExportFilters(req.body.filters),
        fields: normalizeSelectedFieldKeys(req.body.fields),
        status: 'queued',
      });

      await writeAuditLog(req, {
        action: 'reports.export.queue',
        targetType: 'Assessment',
        targetId: assessment._id,
        ownerAdminId: assessment.ownerAdminId,
        newValue: {
          title: assessment.title,
          assessmentCode: assessment.assessmentCode,
          module,
          format,
          fields: normalizeSelectedFieldKeys(req.body.fields),
          jobId: job._id,
        },
      });

      queueReportExportJob(job._id);
      return res.status(202).json({ job: serializeExportJob(job) });
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/assessments/:assessmentId', requireAnyPermission(...candidateReportPermissions), async (req, res, next) => {
  try {
    const report = await buildPagedAssessmentReport(req, req.params.assessmentId);
    if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
    return res.json(report);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/assessments/:assessmentId/process-score',
  requireAnyPermission('reports.process_score'),
  async (req, res, next) => {
    try {
      const result = await processAssessmentScores(req, req.params.assessmentId);
      if (!result) return res.status(404).json({ message: 'Assessment report not found.' });

      await writeAuditLog(req, {
        action: 'reports.score.process',
        targetType: 'Assessment',
        targetId: result.assessment.id,
        ownerAdminId: result.assessment.ownerAdminId,
        newValue: {
          title: result.assessment.title,
          assessmentCode: result.assessment.assessmentCode,
          ...result.summary,
          processedAt: result.processedAt,
        },
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/assessments/:assessmentId/question-analysis',
  requireAnyPermission('reports.view', 'reports.question_analysis.view'),
  async (req, res, next) => {
    try {
      const report = await loadQuestionAnalysis(req, req.params.assessmentId);
      if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
      return res.json(report);
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/assessments/:assessmentId/activity-log',
  requireAnyPermission('reports.view', 'reports.activity_log.view'),
  async (req, res, next) => {
    try {
      const report = await loadActivityLog(req, req.params.assessmentId);
      if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
      return res.json(report);
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/assessments/:assessmentId/response-log',
  requireAnyPermission('reports.view', 'reports.response_log.view'),
  async (req, res, next) => {
    try {
      const report = await loadResponseLog(req, req.params.assessmentId);
      if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
      return res.json(report);
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/assessments/:assessmentId/export', requireReportExportPermission, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const payload = await buildExportPayload(req, req.params.assessmentId);
    if (!payload) return res.status(404).json({ message: 'Assessment report not found.' });

    await writeAuditLog(req, {
      action: 'reports.export',
      targetType: 'Assessment',
      targetId: payload.assessment.id,
      newValue: {
        title: payload.assessment.title,
        rows: payload.rows.length,
        format,
        module: payload.module,
        fields: payload.fields.map(([key]) => key),
      },
    });

    if (format === 'csv') {
      await sendCsvExport(res, payload);
      return undefined;
    }

    return res.json({
      module: payload.module,
      assessment: payload.assessment,
      fields: payload.fields,
      columns: payload.fields.map(([, label]) => label),
      rows: payload.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/assessments/:assessmentId/candidates/:assignmentId',
  requireAnyPermission('reports.view', 'reports.detail.view', 'reports.proctoring.view'),
  async (req, res, next) => {
  try {
    const report = await buildCandidateReport(req, req.params.assessmentId, req.params.assignmentId);
    if (!report) return res.status(404).json({ message: 'Assessment report not found.' });
    if (!report.candidate) return res.status(404).json({ message: 'Candidate report not found.' });

    if (!userHasPermission(req.user, 'reports.recordings.view')) {
      report.candidate = stripRecordingEvidence(report.candidate);
    }

    return res.json(report);
  } catch (error) {
    return next(error);
  }
});

router.post('/assessments/:assessmentId/candidates/:assignmentId/ufm-review', requirePermission('ufm.reverse'), validateBody(ufmReviewBodySchema), async (req, res, next) => {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.assessmentId, ...getScopedQuery(req) });
    if (!assessment) return res.status(404).json({ message: 'Assessment report not found.' });

    const [assignment, attempt] = await Promise.all([
      AssessmentStudent.findOne({ _id: req.params.assignmentId, assessmentId: assessment._id }),
      AssessmentAttempt.findOne({ assessmentId: assessment._id, assessmentStudentId: req.params.assignmentId }),
    ]);

    if (!assignment || !attempt) {
      return res.status(404).json({ message: 'Candidate attempt not found.' });
    }

    const decision = req.body.decision;
    const note = String(req.body.note || '').trim();
    const reviewStatus = decision === 'ufm' ? 'confirmed' : 'cleared';
    const now = new Date();

    await AssessmentSecurityEvent.updateMany(
      {
        assessmentId: assessment._id,
        assessmentStudentId: assignment._id,
        type: { $in: ['ufm_pending', 'identity_verification'] },
      },
      {
        $set: {
          'metadata.reviewStatus': reviewStatus,
          'metadata.reviewedBy': req.user._id,
          'metadata.reviewerName': req.user.name,
          'metadata.reviewedAt': now,
          'metadata.reviewNote': note,
        },
      }
    );

    if (attempt.identityVerification) {
      attempt.identityVerification.reviewedBy = req.user._id;
      attempt.identityVerification.reviewedAt = now;
      attempt.identityVerification.reviewNote = note;
      if (attempt.identityVerification.status === 'manual_review' && decision === 'clear') {
        attempt.identityVerification.status = 'passed';
      }
    }

    if (decision === 'ufm') {
      attempt.status = 'ufm';
      attempt.submittedAt = attempt.submittedAt || now;
      assignment.examStatus = 'ufm';
    } else if (assignment.examStatus === 'ufm') {
      assignment.examStatus = attempt.submittedAt ? 'submitted' : attempt.startedAt ? 'in_progress' : 'not_started';
      attempt.status = attempt.submittedAt ? 'submitted' : attempt.startedAt ? 'in_progress' : 'setup';
    }

    await Promise.all([attempt.save(), assignment.save()]);

    await writeAuditLog(req, {
      action: decision === 'ufm' ? 'reports.ufm.confirm' : 'reports.ufm.clear',
      targetType: 'AssessmentStudent',
      targetId: assignment._id,
      ownerAdminId: assessment.ownerAdminId,
      newValue: {
        assessmentId: assessment._id,
        note,
      },
    });

    return res.json({
      decision,
      assignmentStatus: assignment.examStatus,
      attemptStatus: attempt.status,
      identityVerification: attempt.identityVerification,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
