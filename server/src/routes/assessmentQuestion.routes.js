const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const Question = require('../models/Question');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');
const { normalizeQuestionPayload, validateQuestionPayload } = require('../utils/questionValidation');

const router = express.Router({ mergeParams: true });

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getAssessmentScope(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

async function findScopedAssessment(req) {
  return Assessment.findOne({ _id: req.params.assessmentId, ...getAssessmentScope(req) });
}

async function syncAssessmentQuestionCounts(assessmentId) {
  const grouped = await AssessmentQuestion.aggregate([
    { $match: { assessmentId } },
    { $group: { _id: '$courseName', count: { $sum: 1 } } },
  ]);

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return;

  assessment.courses = assessment.courses.map((course) => {
    const match = grouped.find((item) => item._id === course.courseName);
    course.questionCount = match?.count || 0;
    return course;
  });

  await assessment.save();
}

function normalizeCoursePayload(course = {}) {
  return {
    courseName: String(course.courseName || '').trim(),
    courseId: String(course.courseId || course.courseCode || '').trim().toUpperCase(),
  };
}

function sameCourseMapping(left = {}, right = {}) {
  const normalizedLeft = normalizeCoursePayload(left);
  const normalizedRight = normalizeCoursePayload(right);

  const nameMatches =
    normalizedLeft.courseName &&
    normalizedRight.courseName &&
    normalizedLeft.courseName.toLowerCase() === normalizedRight.courseName.toLowerCase();
  const idMatches =
    normalizedLeft.courseId &&
    normalizedRight.courseId &&
    normalizedLeft.courseId === normalizedRight.courseId;

  return Boolean(idMatches || nameMatches);
}

function normalizeHeading(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(normalizeHeading(value))}$`, 'i');
}

async function ensureAssessmentCourse(assessment, coursePayload) {
  const course = normalizeCoursePayload(coursePayload);

  if (!course.courseName) {
    throw Object.assign(new Error('Select a course before adding questions.'), { statusCode: 400 });
  }

  const exists = assessment.courses.some((item) => {
    const nameMatches = item.courseName.toLowerCase() === course.courseName.toLowerCase();
    const idMatches = course.courseId && String(item.courseId || '').toUpperCase() === course.courseId;
    return nameMatches || idMatches;
  });

  if (!exists) {
    assessment.courses.push({
      courseName: course.courseName,
      courseId: course.courseId,
    });
    await assessment.save();
  }

  return course;
}

router.get('/', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const course = String(req.query.course || '').trim();
    const type = String(req.query.type || '').trim();
    const query = { assessmentId: assessment._id };

    if (course) {
      query.$or = [
        { courseName: { $regex: course, $options: 'i' } },
        { courseId: { $regex: course, $options: 'i' } },
      ];
    }

    if (type) {
      query.type = type;
    }

    const items = await AssessmentQuestion.find(query).sort({ courseName: 1, order: 1, createdAt: -1 });

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requirePermission('assessment.edit'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const errors = validateQuestionPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const payload = normalizeQuestionPayload(req.body);
    const mappedCourse = await ensureAssessmentCourse(assessment, payload);
    payload.courseName = mappedCourse.courseName;
    payload.courseId = mappedCourse.courseId;

    let libraryQuestion = null;

    if (req.body.saveToLibrary !== false) {
      libraryQuestion = await Question.create({
        ...payload,
        ownerAdminId: req.user._id,
        createdBy: req.user._id,
      });
    }

    const order = await AssessmentQuestion.countDocuments({ assessmentId: assessment._id, courseName: payload.courseName });
    const assessmentQuestion = await AssessmentQuestion.create({
      ...payload,
      assessmentId: assessment._id,
      libraryQuestionId: libraryQuestion?._id,
      ownerAdminId: assessment.ownerAdminId,
      createdBy: req.user._id,
      order,
    });

    await syncAssessmentQuestionCounts(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.question.create',
      targetType: 'AssessmentQuestion',
      targetId: assessmentQuestion._id,
      newValue: {
        assessmentId: assessment._id,
        type: assessmentQuestion.type,
        courseName: assessmentQuestion.courseName,
      },
    });

    return res.status(201).json({ question: assessmentQuestion, libraryQuestion });
  } catch (error) {
    return next(error);
  }
});

router.post('/from-library', requirePermission('assessment.edit'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const { questionIds = [] } = req.body;
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one library question.' });
    }

    const libraryScope = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    const libraryQuestions = await Question.find({ _id: { $in: questionIds }, ...libraryScope, status: 'active' });

    const created = [];

    for (const libraryQuestion of libraryQuestions) {
      const payload = normalizeQuestionPayload(libraryQuestion.toObject());
      const courseMatched = assessment.courses.some((course) => {
        const courseNameMatches = course.courseName.toLowerCase() === payload.courseName.toLowerCase();
        const courseIdMatches = payload.courseId && course.courseId === payload.courseId;
        return courseNameMatches || courseIdMatches;
      });

      if (!courseMatched) continue;

      const order = await AssessmentQuestion.countDocuments({ assessmentId: assessment._id, courseName: payload.courseName });
      const assessmentQuestion = await AssessmentQuestion.create({
        ...payload,
        assessmentId: assessment._id,
        libraryQuestionId: libraryQuestion._id,
        sourcePaperHeading: paperHeading,
        ownerAdminId: assessment.ownerAdminId,
        createdBy: req.user._id,
        order,
      });

      created.push(assessmentQuestion);
    }

    await syncAssessmentQuestionCounts(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.question.add_from_library',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        count: created.length,
      },
    });

    return res.status(201).json({ items: created });
  } catch (error) {
    return next(error);
  }
});

router.post('/from-library-heading', requirePermission('assessment.edit'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const paperHeading = normalizeHeading(req.body.paperHeading);
    const mappedCourse = normalizeCoursePayload(req.body.course || req.body);

    if (!paperHeading) {
      return res.status(400).json({ message: 'Library heading is required.' });
    }
    if (!mappedCourse.courseName) {
      return res.status(400).json({ message: 'Select a course before importing questions.' });
    }

    const existingFolderMapping = await AssessmentQuestion.findOne({
      assessmentId: assessment._id,
      sourcePaperHeading: exactRegex(paperHeading),
    }).select('sourcePaperHeading courseName courseId');

    if (existingFolderMapping && !sameCourseMapping(existingFolderMapping, mappedCourse)) {
      return res.status(400).json({
        message: `Folder "${paperHeading}" is already mapped to ${existingFolderMapping.courseName}${
          existingFolderMapping.courseId ? ` (${existingFolderMapping.courseId})` : ''
        }. One folder can only be mapped to one course.`,
      });
    }

    const existingCourseMapping = await AssessmentQuestion.findOne({
      assessmentId: assessment._id,
      sourcePaperHeading: { $exists: true, $ne: null },
      $or: [
        { courseName: exactRegex(mappedCourse.courseName) },
        ...(mappedCourse.courseId ? [{ courseId: mappedCourse.courseId }] : []),
      ],
    }).select('sourcePaperHeading courseName courseId');

    if (
      existingCourseMapping &&
      normalizeHeading(existingCourseMapping.sourcePaperHeading).toLowerCase() !== paperHeading.toLowerCase()
    ) {
      return res.status(400).json({
        message: `${mappedCourse.courseName}${mappedCourse.courseId ? ` (${mappedCourse.courseId})` : ''} is already mapped to folder "${
          existingCourseMapping.sourcePaperHeading
        }". Choose another course for this folder.`,
      });
    }

    await ensureAssessmentCourse(assessment, mappedCourse);

    const libraryScope = req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
    const libraryQuestions = await Question.find({
      ...libraryScope,
      status: 'active',
      paperHeading: exactRegex(paperHeading),
    }).sort({ createdAt: 1 });

    if (libraryQuestions.length === 0) {
      return res.status(404).json({ message: 'No active questions found in this library heading.' });
    }

    const existingQuestions = await AssessmentQuestion.find({
      assessmentId: assessment._id,
      courseName: mappedCourse.courseName,
    }).select('questionText libraryQuestionId');

    const existingKeys = new Set(
      existingQuestions.map((question) => String(question.questionText || '').trim().toLowerCase())
    );
    const existingLibraryIds = new Set(existingQuestions.map((question) => String(question.libraryQuestionId || '')));

    const created = [];
    const skipped = [];

    for (const libraryQuestion of libraryQuestions) {
      const questionKey = String(libraryQuestion.questionText || '').trim().toLowerCase();

      if (existingKeys.has(questionKey) || existingLibraryIds.has(String(libraryQuestion._id))) {
        skipped.push({ libraryQuestionId: libraryQuestion._id, reason: 'duplicate_question' });
        continue;
      }

      const payload = normalizeQuestionPayload({
        ...libraryQuestion.toObject(),
        courseName: mappedCourse.courseName,
        courseId: mappedCourse.courseId,
      });
      const order = await AssessmentQuestion.countDocuments({
        assessmentId: assessment._id,
        courseName: mappedCourse.courseName,
      });
      const assessmentQuestion = await AssessmentQuestion.create({
        ...payload,
        assessmentId: assessment._id,
        libraryQuestionId: libraryQuestion._id,
        sourcePaperHeading: paperHeading,
        ownerAdminId: assessment.ownerAdminId,
        createdBy: req.user._id,
        order,
      });

      created.push(assessmentQuestion);
      existingKeys.add(questionKey);
      existingLibraryIds.add(String(libraryQuestion._id));
    }

    await syncAssessmentQuestionCounts(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.question.import_library_heading',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        paperHeading,
        courseName: mappedCourse.courseName,
        courseId: mappedCourse.courseId,
        created: created.length,
        skipped: skipped.length,
      },
    });

    return res.status(201).json({
      summary: { created: created.length, skipped: skipped.length },
      items: created,
      skipped,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return next(error);
  }
});

module.exports = router;
