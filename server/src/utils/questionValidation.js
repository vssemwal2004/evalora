function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeAlternateAnswers(answers) {
  if (Array.isArray(answers)) {
    return answers.map((answer) => String(answer).trim()).filter(Boolean);
  }

  if (typeof answers === 'string') {
    return answers
      .split(',')
      .map((answer) => answer.trim())
      .filter(Boolean);
  }

  return [];
}

function validateQuestionPayload(payload, options = {}) {
  const errors = [];
  const type = payload.type;
  const requireCourse = options.requireCourse !== false;

  if (!['mcq', 'one_word'].includes(type)) {
    errors.push('Question type must be MCQ or one-word.');
  }

  if (!payload.questionText?.trim()) {
    errors.push('Question text is required.');
  }

  if (requireCourse && !payload.courseName?.trim()) {
    errors.push('Course name is required.');
  }

  if (type === 'mcq') {
    const options = Array.isArray(payload.options) ? payload.options : [];
    const cleanOptions = options.filter((option) => option.text?.trim());

    if (cleanOptions.length < 2) {
      errors.push('MCQ requires at least two options.');
    }

    if (cleanOptions.filter((option) => option.isCorrect).length !== 1) {
      errors.push('MCQ requires exactly one correct option.');
    }
  }

  if (type === 'one_word' && !payload.expectedAnswer?.trim()) {
    errors.push('One-word question requires an expected answer.');
  }

  return errors;
}

function normalizeQuestionPayload(payload) {
  return {
    type: payload.type,
    paperHeading: String(payload.paperHeading || 'Untitled Paper').trim(),
    courseName: String(payload.courseName || '').trim(),
    courseId: String(payload.courseId || '').trim().toUpperCase(),
    questionText: String(payload.questionText || '').trim(),
    options:
      payload.type === 'mcq'
        ? (payload.options || [])
            .filter((option) => option.text?.trim())
            .map((option) => ({
              text: String(option.text).trim(),
              isCorrect: Boolean(option.isCorrect),
            }))
        : [],
    expectedAnswer: payload.type === 'one_word' ? String(payload.expectedAnswer || '').trim() : undefined,
    alternateAnswers: normalizeAlternateAnswers(payload.alternateAnswers),
    positiveMarks: Number(payload.positiveMarks || 1),
    negativeMarks: Number(payload.negativeMarks || 0),
    difficulty: payload.difficulty || 'medium',
    tags: normalizeTags(payload.tags),
    explanation: String(payload.explanation || '').trim(),
  };
}

module.exports = {
  normalizeQuestionPayload,
  validateQuestionPayload,
};
