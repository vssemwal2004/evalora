const Assessment = require('../models/Assessment');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const QuestionLibraryItem = require('../models/QuestionLibraryItem');

function normalizeQuestionPayload(payload) {
  const type = payload.type;

  if (!['mcq', 'one_word'].includes(type)) {
    const error = new Error('Only MCQ and one-word questions are supported in this phase.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.questionText?.trim()) {
    const error = new Error('Question text is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.courseName?.trim()) {
    const error = new Error('Course name is required.');
    error.statusCode = 400;
    throw error;
  }

  const base = {
    type,
    courseName: payload.courseName.trim(),
    courseId: String(payload.courseId || '').trim().toUpperCase(),
    questionText: payload.questionText.trim(),
    positiveMarks: Number(payload.positiveMarks || 1),
    negativeMarks: Number(payload.negativeMarks || 0),
    difficulty: payload.difficulty || 'medium',
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : String(payload.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
    explanation: payload.explanation || '',
  };

  if (type === 'mcq') {
    const options = (payload.options || [])
      .map((option) => ({
        text: String(option.text || '').trim(),
        isCorrect: Boolean(option.isCorrect),
      }))
      .filter((option) => option.text);

    if (options.length < 2) {
      const error = new Error('MCQ requires at least two options.');
      error.statusCode = 400;
      throw error;
    }

    if (!options.some((option) => option.isCorrect)) {
      const error = new Error('MCQ requires one correct option.');
      error.statusCode = 400;
      throw error;
    }

    return {
      ...base,
      options,
      expectedAnswer: '',
      alternateAnswers: [],
    };
  }

  if (!payload.expectedAnswer?.trim()) {
    const error = new Error('Expected answer is required for one-word questions.');
    error.statusCode = 400;
    throw error;
  }

  return {
    ...base,
    options: [],
    expectedAnswer: payload.expectedAnswer.trim(),
    alternateAnswers: Array.isArray(payload.alternateAnswers)
      ? payload.alternateAnswers.map((answer) => String(answer).trim()).filter(Boolean)
      : String(payload.alternateAnswers || '')
          .split(',')
          .map((answer) => answer.trim())
          .filter(Boolean),
  };
}

async function syncAssessmentCourseQuestionCounts(assessmentId) {
  const assessment = await Assessment.findById(assessmentId);

  if (!assessment) {
    return;
  }

  const counts = await AssessmentQuestion.aggregate([
    { $match: { assessmentId: assessment._id } },
    { $group: { _id: '$courseName', count: { $sum: 1 } } },
  ]);

  const countMap = counts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  assessment.courses = assessment.courses.map((course) => ({
    ...course.toObject(),
    questionCount: countMap[course.courseName] || 0,
  }));

  await assessment.save();
}

async function createAssessmentQuestion({ assessment, user, payload }) {
  const normalized = normalizeQuestionPayload(payload);

  const libraryItem = await QuestionLibraryItem.create({
    ownerAdminId: assessment.ownerAdminId,
    createdBy: user._id,
    ...normalized,
  });

  const questionCount = await AssessmentQuestion.countDocuments({ assessmentId: assessment._id });
  const assessmentQuestion = await AssessmentQuestion.create({
    assessmentId: assessment._id,
    ownerAdminId: assessment.ownerAdminId,
    createdBy: user._id,
    libraryItemId: libraryItem._id,
    order: questionCount + 1,
    ...normalized,
  });

  await syncAssessmentCourseQuestionCounts(assessment._id);

  return { assessmentQuestion, libraryItem };
}

module.exports = {
  createAssessmentQuestion,
  normalizeQuestionPayload,
  syncAssessmentCourseQuestionCounts,
};
