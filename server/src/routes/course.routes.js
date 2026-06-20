const express = require('express');
const Course = require('../models/Course');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getReadScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function getWriteScopedQuery(req) {
  return { ownerAdminId: req.user._id };
}

function normalizeCourseRow(row, index) {
  return {
    rowNumber: Number(row.rowNumber || index + 2),
    courseName: String(row.courseName || row['Course Name'] || '').trim(),
    courseCode: String(row.courseCode || row.courseId || row['Course Code'] || row['Course ID'] || '').trim().toUpperCase(),
    decision: String(row.decision || '').trim(),
  };
}

async function buildBulkPreview(req, rows) {
  const normalizedRows = rows.map(normalizeCourseRow);
  const codes = normalizedRows.map((row) => row.courseCode).filter(Boolean);
  const codeOccurrences = codes.reduce((acc, code) => {
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const seenCodes = {};
  const existingCourses = await Course.find({ ...getWriteScopedQuery(req), courseCode: { $in: codes } });
  const existingByCode = new Map(existingCourses.map((course) => [course.courseCode, course]));

  return normalizedRows.map((row) => {
    const issues = [];
    const existingCourse = existingByCode.get(row.courseCode);
    seenCodes[row.courseCode] = (seenCodes[row.courseCode] || 0) + 1;

    if (!row.courseName) issues.push('Course name is required.');
    if (!row.courseCode) issues.push('Course code is required.');
    if (row.courseCode && codeOccurrences[row.courseCode] > 1 && seenCodes[row.courseCode] > 1) {
      issues.push('Duplicate course code in uploaded file.');
    }

    const canSave = issues.length === 0;
    const allowedDecisions = !canSave ? ['skip'] : existingCourse ? ['skip', 'replace'] : ['add', 'skip'];
    const defaultDecision = !canSave ? 'skip' : existingCourse ? 'skip' : 'add';

    return {
      rowNumber: row.rowNumber,
      courseName: row.courseName,
      courseCode: row.courseCode,
      courseStatus: existingCourse ? 'existing_course' : 'new_course',
      issues,
      canSave,
      allowedDecisions,
      decision: allowedDecisions.includes(row.decision) ? row.decision : defaultDecision,
    };
  });
}

router.get('/', requirePermission('course.view'), async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'active').trim();
    const query = { ...getReadScopedQuery(req) };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { courseName: { $regex: search, $options: 'i' } },
        { courseCode: { $regex: search, $options: 'i' } },
      ];
    }

    const items = await Course.find(query)
      .populate('ownerAdminId', 'name email')
      .sort({ courseName: 1, courseCode: 1 })
      .limit(Math.min(Number(req.query.limit || 500), 1000));

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requirePermission('course.create'), async (req, res, next) => {
  try {
    const courseName = String(req.body.courseName || '').trim();
    const courseCode = String(req.body.courseCode || req.body.courseId || '').trim().toUpperCase();

    if (!courseName || !courseCode) {
      return res.status(400).json({ message: 'Course name and course code are required.' });
    }

    const course = await Course.create({
      courseName,
      courseCode,
      ownerAdminId: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await writeAuditLog(req, {
      action: 'course.create',
      targetType: 'Course',
      targetId: course._id,
      newValue: { courseName, courseCode },
    });

    return res.status(201).json({ course });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Course code already exists.' });
    }

    return next(error);
  }
});

router.post('/bulk-validate', requirePermission('course.create'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No course rows were provided.' });
    }

    if (rows.length > 1000) {
      return res.status(400).json({ message: 'Upload limit is 1000 courses per import.' });
    }

    const items = await buildBulkPreview(req, rows);
    const summary = items.reduce(
      (acc, item) => ({
        total: acc.total + 1,
        ready: acc.ready + (item.canSave && item.decision !== 'skip' ? 1 : 0),
        conflicts: acc.conflicts + (item.courseStatus === 'existing_course' ? 1 : 0),
        errors: acc.errors + (item.issues.length > 0 ? 1 : 0),
      }),
      { total: 0, ready: 0, conflicts: 0, errors: 0 }
    );

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-save', requirePermission('course.create'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No reviewed course rows were provided.' });
    }

    const previewRows = await buildBulkPreview(req, rows);
    const processedCodes = new Set();
    const saved = [];
    const skipped = [];
    let created = 0;
    let replaced = 0;

    for (const row of previewRows) {
      if (!row.canSave || row.decision === 'skip') {
        skipped.push({ rowNumber: row.rowNumber, courseCode: row.courseCode, reason: row.issues[0] || 'skipped' });
        continue;
      }

      if (processedCodes.has(row.courseCode)) {
        skipped.push({ rowNumber: row.rowNumber, courseCode: row.courseCode, reason: 'duplicate_in_import' });
        continue;
      }

      const existingCourse = await Course.findOne({ ...getWriteScopedQuery(req), courseCode: row.courseCode });

      if (existingCourse && row.decision === 'replace') {
        existingCourse.courseName = row.courseName;
        existingCourse.status = 'active';
        existingCourse.updatedBy = req.user._id;
        await existingCourse.save();
        replaced += 1;
        saved.push({ action: 'replaced', courseName: existingCourse.courseName, courseCode: existingCourse.courseCode });
      } else if (!existingCourse) {
        const course = await Course.create({
          courseName: row.courseName,
          courseCode: row.courseCode,
          ownerAdminId: req.user._id,
          createdBy: req.user._id,
          updatedBy: req.user._id,
        });
        created += 1;
        saved.push({ action: 'created', courseName: course.courseName, courseCode: course.courseCode });
      } else {
        skipped.push({ rowNumber: row.rowNumber, courseCode: row.courseCode, reason: 'existing_course' });
      }

      processedCodes.add(row.courseCode);
    }

    await writeAuditLog(req, {
      action: 'course.bulk_import',
      targetType: 'Course',
      newValue: { created, replaced, skipped: skipped.length },
    });

    return res.status(201).json({
      summary: { created, replaced, skipped: skipped.length },
      saved,
      skipped,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
