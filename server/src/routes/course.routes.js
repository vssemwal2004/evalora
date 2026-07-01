const express = require('express');
const Course = require('../models/Course');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { adminWriteLimiter, bulkImportLimiter } = require('../middleware/rateLimit');
const { objectIdString, validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();
const courseBodySchema = z.object({
  courseName: z.string().trim().min(1, 'Course name is required.').max(200),
  courseCode: z.string().trim().max(80).optional(),
  courseId: z.string().trim().max(80).optional(),
}).refine((value) => value.courseCode || value.courseId, 'Course code is required.');
const bulkRowsBodySchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, 'At least one course row is required.').max(1000, 'Upload limit is 1000 courses per import.'),
});
const courseStatusBodySchema = z.object({
  status: z.enum(['active', 'archived']),
});
const courseBulkActionBodySchema = z.object({
  courseIds: z.array(objectIdString).min(1, 'Select at least one course.').max(1000, 'Select 1000 courses or fewer.'),
  action: z.enum(['hide', 'show', 'delete']),
});

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getReadScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function getWriteScopedQuery(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function normalizeCourseRow(row, index) {
  return {
    rowNumber: Number(row.rowNumber || index + 2),
    courseName: String(row.courseName || row['Course Name'] || '').trim().replace(/\s+/g, ' '),
    courseCode: String(row.courseCode || row.courseId || row['Course Code'] || row['Course ID'] || '').replace(/\s+/g, '').toUpperCase(),
    decision: String(row.decision || '').trim(),
  };
}

function courseKey(value) {
  return Course.normalizeCourseKey(value);
}

async function findDuplicateCourse(req, { courseName, courseCode, excludeId }) {
  const nameKey = courseKey(courseName);
  const codeKey = courseKey(courseCode);
  const query = { ...getWriteScopedQuery(req) };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const courses = await Course.find(query).select('courseName courseCode courseNameKey courseCodeKey');

  return courses.find((course) => {
    const existingNameKey = course.courseNameKey || courseKey(course.courseName);
    const existingCodeKey = course.courseCodeKey || courseKey(course.courseCode);
    return existingNameKey === nameKey || existingCodeKey === codeKey;
  });
}

async function findScopedCourse(req, courseId) {
  return Course.findOne({ _id: courseId, ...getWriteScopedQuery(req) });
}

async function buildBulkPreview(req, rows) {
  const normalizedRows = rows.map(normalizeCourseRow);
  const nameKeys = normalizedRows.map((row) => courseKey(row.courseName)).filter(Boolean);
  const codeKeys = normalizedRows.map((row) => courseKey(row.courseCode)).filter(Boolean);
  const nameOccurrences = nameKeys.reduce((acc, key) => {
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const codeOccurrences = codeKeys.reduce((acc, key) => {
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const seenNames = {};
  const seenCodes = {};
  const existingCourses = await Course.find(getWriteScopedQuery(req)).select('courseName courseCode courseNameKey courseCodeKey');
  const existingByName = new Map(existingCourses.map((course) => [course.courseNameKey || courseKey(course.courseName), course]));
  const existingByCode = new Map(existingCourses.map((course) => [course.courseCodeKey || courseKey(course.courseCode), course]));

  return normalizedRows.map((row) => {
    const issues = [];
    const rowNameKey = courseKey(row.courseName);
    const rowCodeKey = courseKey(row.courseCode);
    const existingByCourseName = existingByName.get(rowNameKey);
    const existingByCourseCode = existingByCode.get(rowCodeKey);
    const existingCourse = existingByCourseCode || existingByCourseName;
    seenNames[rowNameKey] = (seenNames[rowNameKey] || 0) + 1;
    seenCodes[rowCodeKey] = (seenCodes[rowCodeKey] || 0) + 1;

    if (!row.courseName) issues.push('Course name is required.');
    if (!row.courseCode) issues.push('Course code is required.');
    if (rowNameKey && nameOccurrences[rowNameKey] > 1 && seenNames[rowNameKey] > 1) {
      issues.push('Duplicate course name in uploaded file.');
    }
    if (rowCodeKey && codeOccurrences[rowCodeKey] > 1 && seenCodes[rowCodeKey] > 1) {
      issues.push('Duplicate course code in uploaded file.');
    }
    if (existingByCourseName) {
      issues.push(`Course name already exists as "${existingByCourseName.courseName}".`);
    }
    if (existingByCourseCode) {
      issues.push(`Course code already exists as "${existingByCourseCode.courseCode}".`);
    }

    const canSave = issues.length === 0;
    const allowedDecisions = canSave ? ['add', 'skip'] : ['skip'];
    const defaultDecision = canSave ? 'add' : 'skip';

    return {
      rowNumber: row.rowNumber,
      courseName: row.courseName,
      courseCode: row.courseCode,
      courseStatus: existingCourse || issues.length > 0 ? 'duplicate_course' : 'new_course',
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

router.post('/', adminWriteLimiter, validateBody(courseBodySchema), requirePermission('course.create'), async (req, res, next) => {
  try {
    const courseName = String(req.body.courseName || '').trim().replace(/\s+/g, ' ');
    const courseCode = String(req.body.courseCode || req.body.courseId || '').replace(/\s+/g, '').toUpperCase();

    if (!courseName || !courseCode) {
      return res.status(400).json({ message: 'Course name and course code are required.' });
    }

    const duplicate = await findDuplicateCourse(req, { courseName, courseCode });
    if (duplicate) {
      const duplicateName = courseKey(duplicate.courseName) === courseKey(courseName);
      const duplicateCode = courseKey(duplicate.courseCode) === courseKey(courseCode);
      const duplicateParts = [
        duplicateName ? `name "${duplicate.courseName}"` : '',
        duplicateCode ? `code "${duplicate.courseCode}"` : '',
      ].filter(Boolean);
      return res.status(409).json({
        message: `Duplicate course found with ${duplicateParts.join(' and ')}. Course name and code must be unique.`,
        duplicate: {
          courseName: duplicate.courseName,
          courseCode: duplicate.courseCode,
        },
      });
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
      return res.status(409).json({ message: 'Duplicate course found. Course name and course code must be unique.' });
    }

    return next(error);
  }
});

router.post('/bulk-validate', bulkImportLimiter, validateBody(bulkRowsBodySchema), requirePermission('course.create'), async (req, res, next) => {
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
        conflicts: acc.conflicts + (item.courseStatus === 'duplicate_course' ? 1 : 0),
        errors: acc.errors + (item.issues.length > 0 ? 1 : 0),
      }),
      { total: 0, ready: 0, conflicts: 0, errors: 0 }
    );

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-save', bulkImportLimiter, validateBody(bulkRowsBodySchema), requirePermission('course.create'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No reviewed course rows were provided.' });
    }

    const previewRows = await buildBulkPreview(req, rows);
    const processedKeys = new Set();
    const saved = [];
    const skipped = [];
    let created = 0;

    for (const row of previewRows) {
      if (!row.canSave || row.decision === 'skip') {
        skipped.push({ rowNumber: row.rowNumber, courseCode: row.courseCode, reason: row.issues[0] || 'skipped' });
        continue;
      }

      const rowNameKey = courseKey(row.courseName);
      const rowCodeKey = courseKey(row.courseCode);
      if (processedKeys.has(rowNameKey) || processedKeys.has(rowCodeKey)) {
        skipped.push({ rowNumber: row.rowNumber, courseCode: row.courseCode, reason: 'duplicate_in_import' });
        continue;
      }

      const course = await Course.create({
        courseName: row.courseName,
        courseCode: row.courseCode,
        ownerAdminId: req.user._id,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      created += 1;
      saved.push({ action: 'created', courseName: course.courseName, courseCode: course.courseCode });

      processedKeys.add(rowNameKey);
      processedKeys.add(rowCodeKey);
    }

    await writeAuditLog(req, {
      action: 'course.bulk_import',
      targetType: 'Course',
      newValue: { created, skipped: skipped.length },
    });

    return res.status(201).json({
      summary: { created, replaced: 0, skipped: skipped.length },
      saved,
      skipped,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', adminWriteLimiter, validateObjectIdParams('id'), validateBody(courseBodySchema), requirePermission('course.edit'), async (req, res, next) => {
  try {
    const course = await findScopedCourse(req, req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const courseName = String(req.body.courseName || '').trim().replace(/\s+/g, ' ');
    const courseCode = String(req.body.courseCode || req.body.courseId || '').replace(/\s+/g, '').toUpperCase();

    if (!courseName || !courseCode) {
      return res.status(400).json({ message: 'Course name and course code are required.' });
    }

    const duplicate = await findDuplicateCourse(req, { courseName, courseCode, excludeId: course._id });
    if (duplicate) {
      const duplicateName = courseKey(duplicate.courseName) === courseKey(courseName);
      const duplicateCode = courseKey(duplicate.courseCode) === courseKey(courseCode);
      const duplicateParts = [
        duplicateName ? `name "${duplicate.courseName}"` : '',
        duplicateCode ? `code "${duplicate.courseCode}"` : '',
      ].filter(Boolean);
      return res.status(409).json({
        message: `Duplicate course found with ${duplicateParts.join(' and ')}. Course name and code must be unique.`,
        duplicate: {
          courseName: duplicate.courseName,
          courseCode: duplicate.courseCode,
        },
      });
    }

    const oldValue = {
      courseName: course.courseName,
      courseCode: course.courseCode,
      status: course.status,
    };

    course.courseName = courseName;
    course.courseCode = courseCode;
    course.updatedBy = req.user._id;
    await course.save();

    await writeAuditLog(req, {
      action: 'course.update',
      targetType: 'Course',
      targetId: course._id,
      oldValue,
      newValue: { courseName: course.courseName, courseCode: course.courseCode, status: course.status },
    });

    return res.json({ course });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Duplicate course found. Course name and course code must be unique.' });
    }

    return next(error);
  }
});

router.patch('/:id/status', adminWriteLimiter, validateObjectIdParams('id'), validateBody(courseStatusBodySchema), requirePermission('course.archive'), async (req, res, next) => {
  try {
    const course = await findScopedCourse(req, req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const status = String(req.body.status || '').trim();
    if (!['active', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or archived.' });
    }

    const oldValue = { status: course.status };
    course.status = status;
    course.updatedBy = req.user._id;
    await course.save();

    await writeAuditLog(req, {
      action: status === 'archived' ? 'course.hide' : 'course.show',
      targetType: 'Course',
      targetId: course._id,
      oldValue,
      newValue: { status },
    });

    return res.json({ course });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-action', adminWriteLimiter, validateBody(courseBulkActionBodySchema), requirePermission('course.archive'), async (req, res, next) => {
  try {
    const courseIds = Array.isArray(req.body.courseIds) ? req.body.courseIds : [];
    const action = String(req.body.action || '').trim();

    if (courseIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one course.' });
    }

    if (!['hide', 'show', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Unsupported course action.' });
    }

    const courses = await Course.find({ _id: { $in: courseIds }, ...getWriteScopedQuery(req) });
    const matchedIds = courses.map((course) => course._id);

    if (action === 'delete') {
      await Course.deleteMany({ _id: { $in: matchedIds }, ...getWriteScopedQuery(req) });
    } else {
      await Course.updateMany(
        { _id: { $in: matchedIds }, ...getWriteScopedQuery(req) },
        { $set: { status: action === 'hide' ? 'archived' : 'active', updatedBy: req.user._id } }
      );
    }

    await writeAuditLog(req, {
      action: `course.bulk_${action}`,
      targetType: 'Course',
      newValue: {
        action,
        count: courses.length,
        courses: courses.map((course) => ({ courseName: course.courseName, courseCode: course.courseCode })),
      },
    });

    return res.json({ count: courses.length });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', adminWriteLimiter, validateObjectIdParams('id'), requirePermission('course.archive'), async (req, res, next) => {
  try {
    const course = await findScopedCourse(req, req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    await course.deleteOne();

    await writeAuditLog(req, {
      action: 'course.delete',
      targetType: 'Course',
      targetId: course._id,
      oldValue: {
        courseName: course.courseName,
        courseCode: course.courseCode,
        status: course.status,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
