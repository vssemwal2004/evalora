const express = require('express');
const Question = require('../models/Question');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');
const { normalizeQuestionPayload, validateQuestionPayload } = require('../utils/questionValidation');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FACULTY));

function getScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  if (req.user.role === ROLES.FACULTY) return { createdBy: req.user._id };
  return { ownerAdminId: req.user._id };
}

function getLibraryOwner(req) {
  return req.user.role === ROLES.FACULTY ? req.user.ownerAdminId : req.user._id;
}

function getCreatorRoleMatch(source) {
  if (source === 'faculty') return [ROLES.FACULTY];
  if (source === 'admin') return [ROLES.SUPER_ADMIN, ROLES.ADMIN];
  return [];
}

function appendSourceLookup(pipeline, source) {
  const roles = getCreatorRoleMatch(source);
  if (roles.length === 0) return;
  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'creator',
      },
    },
    { $unwind: '$creator' },
    { $match: { 'creator.role': { $in: roles } } }
  );
}

function normalizeHeading(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeUniqueKey(value) {
  return normalizeHeading(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(normalizeHeading(value))}$`, 'i');
}

async function findExistingHeading(req, heading) {
  if (!normalizeHeading(heading)) return null;

  return Question.findOne({
    ...getScopedQuery(req),
    status: 'active',
    paperHeading: exactRegex(heading),
  }).select('paperHeading');
}

async function questionExists(req, { paperHeading, questionText, excludeId } = {}) {
  const heading = normalizeHeading(paperHeading);
  const text = normalizeHeading(questionText);

  if (!heading || !text) return false;

  const query = {
    ...getScopedQuery(req),
    status: 'active',
    paperHeading: exactRegex(heading),
    questionText: exactRegex(text),
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Boolean(await Question.exists(query));
}

function normalizeQuestionRow(row, index, defaultHeading) {
  const type = String(row.type || row['Question Type'] || 'mcq').trim().toLowerCase().replace(/\s+/g, '_');
  const correctOption = String(row.correctOption || row['Correct Option'] || '').trim().toUpperCase();
  const optionValues = ['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => ({
    letter,
    text: String(row[`option${letter}`] || row[`Option ${letter}`] || '').trim(),
  }));

  return {
    rowNumber: Number(row.rowNumber || index + 2),
    paperHeading: normalizeHeading(row.paperHeading || row['Paper Heading'] || defaultHeading),
    type: type === 'one_word' || type === 'one-word' ? 'one_word' : 'mcq',
    questionText: normalizeHeading(row.questionText || row.Question || row['Question Text']),
    options: optionValues
      .filter((option) => option.text)
      .map((option) => ({
        text: option.text,
        isCorrect: option.letter === correctOption || option.text.toLowerCase() === correctOption.toLowerCase(),
      })),
    expectedAnswer: String(row.expectedAnswer || row['Expected Answer'] || row.Answer || '').trim(),
    positiveMarks: Number(row.positiveMarks || row.Marks || row['Positive Marks'] || 1),
    difficulty: String(row.difficulty || row.Difficulty || 'medium').trim().toLowerCase(),
  };
}

function validateLibraryQuestion(row) {
  const errors = validateQuestionPayload(row, { requireCourse: false });

  if (!row.paperHeading?.trim()) {
    errors.push('Paper heading is required.');
  }

  return errors;
}

async function buildPreview(req, rows, defaultHeading) {
  const seen = new Set();

  const previewRows = rows.map((row, index) => {
    const normalized = normalizeQuestionRow(row, index, defaultHeading);
    const issues = validateLibraryQuestion(normalized);
    const key = `${normalizeUniqueKey(normalized.paperHeading)}::${normalizeUniqueKey(normalized.questionText)}`;

    if (normalized.paperHeading && normalized.questionText) {
      if (seen.has(key)) {
        issues.push('Duplicate question in this upload for the same heading.');
      }
      seen.add(key);
    }

    return {
      ...normalized,
      issues,
      canSave: issues.length === 0,
      decision: issues.length === 0 ? 'add' : 'skip',
      allowedDecisions: issues.length === 0 ? ['add', 'skip'] : ['skip'],
    };
  });

  await Promise.all(
    previewRows.map(async (row) => {
      if (row.paperHeading && row.questionText && await questionExists(req, row)) {
        row.issues.push('Question already exists in this heading.');
        row.canSave = false;
        row.decision = 'skip';
        row.allowedDecisions = ['skip'];
      }
    })
  );

  return previewRows;
}

router.get('/groups', requirePermission('library.view'), async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const source = String(req.query.source || 'both').trim();
    const match = { ...getScopedQuery(req), status: 'active' };

    if (search) {
      match.paperHeading = { $regex: search, $options: 'i' };
    }

    const pipeline = [{ $match: match }];
    appendSourceLookup(pipeline, source);
    pipeline.push(
      {
        $group: {
          _id: '$paperHeading',
          count: { $sum: 1 },
          mcqCount: { $sum: { $cond: [{ $eq: ['$type', 'mcq'] }, 1, 0] } },
          oneWordCount: { $sum: { $cond: [{ $eq: ['$type', 'one_word'] }, 1, 0] } },
          totalMarks: { $sum: '$positiveMarks' },
          firstCreatedAt: { $min: '$createdAt' },
          lastUpdatedAt: { $max: '$updatedAt' },
        },
      },
      { $sort: { lastUpdatedAt: -1 } }
    );

    const items = await Question.aggregate(pipeline);

    return res.json({
      items: items.map((item) => ({
        paperHeading: item._id || 'Untitled Paper',
        count: item.count,
        mcqCount: item.mcqCount,
        oneWordCount: item.oneWordCount,
        totalMarks: item.totalMarks,
        firstCreatedAt: item.firstCreatedAt,
        lastUpdatedAt: item.lastUpdatedAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/groups', requirePermission('library.edit'), async (req, res, next) => {
  try {
    const currentHeading = normalizeHeading(req.body.currentHeading);
    const nextHeading = normalizeHeading(req.body.nextHeading);

    if (!currentHeading || !nextHeading) {
      return res.status(400).json({ message: 'Current heading and new heading are required.' });
    }

    const existingNextHeading = await findExistingHeading(req, nextHeading);
    if (existingNextHeading && normalizeUniqueKey(existingNextHeading.paperHeading) !== normalizeUniqueKey(currentHeading)) {
      return res.status(409).json({ message: 'This heading already exists. Use a unique heading name.' });
    }

    const result = await Question.updateMany(
      {
        ...getScopedQuery(req),
        status: 'active',
        paperHeading: exactRegex(currentHeading),
      },
      { $set: { paperHeading: nextHeading } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Library folder was not found.' });
    }

    await writeAuditLog(req, {
      action: 'library.group.rename',
      targetType: 'Question',
      oldValue: { paperHeading: currentHeading },
      newValue: { paperHeading: nextHeading, updated: result.modifiedCount },
    });

    return res.json({ paperHeading: nextHeading, updated: result.modifiedCount });
  } catch (error) {
    return next(error);
  }
});

router.delete('/groups', requirePermission('library.archive'), async (req, res, next) => {
  try {
    const paperHeading = normalizeHeading(req.body.paperHeading);

    if (!paperHeading) {
      return res.status(400).json({ message: 'Paper heading is required.' });
    }

    const result = await Question.updateMany(
      {
        ...getScopedQuery(req),
        status: 'active',
        paperHeading: exactRegex(paperHeading),
      },
      { $set: { status: 'archived' } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Library folder was not found.' });
    }

    await writeAuditLog(req, {
      action: 'library.group.archive',
      targetType: 'Question',
      oldValue: { paperHeading },
      newValue: { archived: result.modifiedCount },
    });

    return res.json({ archived: result.modifiedCount });
  } catch (error) {
    return next(error);
  }
});

router.get('/questions', requirePermission('library.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const search = String(req.query.search || '').trim();
    const type = String(req.query.type || '').trim();
    const difficulty = String(req.query.difficulty || '').trim();
    const paperHeading = String(req.query.paperHeading || '').trim();
    const source = String(req.query.source || 'both').trim();

    const query = { ...getScopedQuery(req), status: 'active' };

    if (paperHeading) query.paperHeading = paperHeading;
    if (type) query.type = type;
    if (difficulty) query.difficulty = difficulty;

    if (search) {
      query.$or = [
        { questionText: { $regex: search, $options: 'i' } },
      ];
    }

    const roles = getCreatorRoleMatch(source);
    let itemsQuery = Question.find(query)
      .sort({ paperHeading: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    let countQuery = Question.countDocuments(query);

    if (roles.length > 0) {
      const creatorIds = await User.find({ role: { $in: roles } }).distinct('_id');
      query.createdBy = { $in: creatorIds };
      itemsQuery = Question.find(query)
        .sort({ paperHeading: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      countQuery = Question.countDocuments(query);
    }

    const [items, total] = await Promise.all([itemsQuery, countQuery]);

    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/questions/:id', requirePermission('library.edit'), async (req, res, next) => {
  try {
    const question = await Question.findOne({
      _id: req.params.id,
      ...getScopedQuery(req),
      status: 'active',
    });

    if (!question) {
      return res.status(404).json({ message: 'Library question was not found.' });
    }

    const draft = {
      ...question.toObject(),
      ...req.body,
      paperHeading: normalizeHeading(req.body.paperHeading || question.paperHeading),
      questionText: normalizeHeading(req.body.questionText || question.questionText),
      negativeMarks: 0,
    };

    const errors = validateQuestionPayload(draft, { requireCourse: false });
    if (!draft.paperHeading?.trim()) {
      errors.push('Paper heading is required.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (await questionExists(req, {
      paperHeading: draft.paperHeading,
      questionText: draft.questionText,
      excludeId: question._id,
    })) {
      return res.status(409).json({ message: 'This question already exists in the selected heading.' });
    }

    const payload = normalizeQuestionPayload(draft);
    question.set(payload);
    await question.save();

    await writeAuditLog(req, {
      action: 'library.question.update',
      targetType: 'Question',
      targetId: question._id,
      newValue: {
        paperHeading: question.paperHeading,
        type: question.type,
        questionText: question.questionText,
      },
    });

    return res.json({ question });
  } catch (error) {
    return next(error);
  }
});

router.delete('/questions/:id', requirePermission('library.archive'), async (req, res, next) => {
  try {
    const question = await Question.findOne({
      _id: req.params.id,
      ...getScopedQuery(req),
      status: 'active',
    });

    if (!question) {
      return res.status(404).json({ message: 'Library question was not found.' });
    }

    question.status = 'archived';
    await question.save();

    await writeAuditLog(req, {
      action: 'library.question.archive',
      targetType: 'Question',
      targetId: question._id,
      oldValue: {
        paperHeading: question.paperHeading,
        questionText: question.questionText,
      },
    });

    return res.json({ archived: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/questions/validate', requirePermission('library.create'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const paperHeading = String(req.body.paperHeading || '').trim();

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No question rows were provided.' });
    }

    if (rows.length > 1000) {
      return res.status(400).json({ message: 'Upload limit is 1000 questions per import.' });
    }

    const items = await buildPreview(req, rows, paperHeading);
    const summary = items.reduce(
      (acc, item) => ({
        total: acc.total + 1,
        ready: acc.ready + (item.canSave && item.decision !== 'skip' ? 1 : 0),
        errors: acc.errors + (item.issues.length > 0 ? 1 : 0),
        mcq: acc.mcq + (item.type === 'mcq' ? 1 : 0),
        oneWord: acc.oneWord + (item.type === 'one_word' ? 1 : 0),
      }),
      { total: 0, ready: 0, errors: 0, mcq: 0, oneWord: 0 }
    );

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/questions/bulk', requirePermission('library.create'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const paperHeading = String(req.body.paperHeading || '').trim();

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No reviewed question rows were provided.' });
    }

    const previewRows = await buildPreview(req, rows, paperHeading);
    const created = [];
    const skipped = [];

    for (const row of previewRows) {
      if (!row.canSave || row.decision === 'skip') {
        skipped.push({ rowNumber: row.rowNumber, reason: row.issues[0] || 'skipped' });
        continue;
      }

      const payload = normalizeQuestionPayload({
        ...row,
        paperHeading: normalizeHeading(row.paperHeading),
        questionText: normalizeHeading(row.questionText),
        negativeMarks: 0,
      });
      const question = await Question.create({
        ...payload,
        ownerAdminId: getLibraryOwner(req),
        createdBy: req.user._id,
      });
      created.push(question);
    }

    await writeAuditLog(req, {
      action: 'library.question.bulk_create',
      targetType: 'Question',
      newValue: {
        paperHeading,
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
    return next(error);
  }
});

router.post('/questions', requirePermission('library.create'), async (req, res, next) => {
  try {
    const draft = {
      ...req.body,
      paperHeading: normalizeHeading(req.body.paperHeading),
      questionText: normalizeHeading(req.body.questionText),
      negativeMarks: 0,
    };
    const errors = validateQuestionPayload(draft, { requireCourse: false });
    if (!draft.paperHeading?.trim()) {
      errors.push('Paper heading is required.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (await questionExists(req, draft)) {
      return res.status(409).json({ message: 'This question already exists in the selected heading.' });
    }

    const payload = normalizeQuestionPayload({
      ...draft,
      negativeMarks: 0,
    });
    const question = await Question.create({
      ...payload,
      ownerAdminId: getLibraryOwner(req),
      createdBy: req.user._id,
    });

    await writeAuditLog(req, {
      action: 'library.question.create',
      targetType: 'Question',
      targetId: question._id,
      newValue: {
        paperHeading: question.paperHeading,
        type: question.type,
        questionText: question.questionText,
      },
    });

    return res.status(201).json({ question });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
