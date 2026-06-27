const express = require('express');
const Course = require('../models/Course');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { sendStaffCredentialMail } = require('../services/credentialMail.service');
const { writeAuditLog } = require('../services/audit.service');
const { generatePassword } = require('../utils/credentials');

const router = express.Router();

function defaultStaffPermissions(role) {
  if (role === ROLES.FACULTY) return ['work.view', 'assessment.questions.add', 'assessment.questions.edit', 'assessment.submit', 'library.view', 'library.create', 'library.edit', 'library.archive'];
  if (role === ROLES.MODERATOR) return ['work.view', 'assessment.review'];
  return [];
}

const roleConfig = {
  faculty: {
    role: ROLES.FACULTY,
    label: 'Faculty',
    viewPermission: 'faculty.view',
    viewAllPermission: 'faculty.view.all',
    createPermission: 'faculty.create',
    editPermission: 'faculty.edit',
    removePermission: 'faculty.remove',
  },
  moderators: {
    role: ROLES.MODERATOR,
    label: 'Moderator',
    viewPermission: 'moderator.view',
    viewAllPermission: 'moderator.view.all',
    createPermission: 'moderator.create',
    editPermission: 'moderator.edit',
    removePermission: 'moderator.remove',
  },
};

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getConfig(req, res) {
  const config = roleConfig[req.params.kind];
  if (!config) {
    res.status(404).json({ message: 'People role not found.' });
    return null;
  }
  return config;
}

function canSupervise(req, permission) {
  return req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes(permission);
}

function getReadScope(req, config) {
  if (req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes(config.viewAllPermission)) {
    return {};
  }

  return { ownerAdminId: req.user._id };
}

function getOwnedScope(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

function getWriteOwner(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? req.user._id : req.user._id;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCourseCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCourseRows(value) {
  if (Array.isArray(value)) {
    return value.map((course) => ({
      courseName: String(course.courseName || course['Course Name'] || '').trim(),
      courseCode: normalizeCourseCode(course.courseCode || course.courseId || course['Course Code'] || course['Course ID']),
    }));
  }

  return String(value || '')
    .split(/[;,|]/)
    .map(normalizeCourseCode)
    .filter(Boolean)
    .map((courseCode) => ({ courseName: '', courseCode }));
}

function normalizePersonRow(row, index) {
  return {
    rowNumber: Number(row.rowNumber || index + 2),
    name: String(row.name || row['Name'] || '').trim(),
    email: normalizeEmail(row.email || row['Email']),
    assignedCourses: normalizeCourseRows(
      row.assignedCourses || row.courses || row['Assigned Courses'] || row['Course Codes'] || row['Courses']
    ),
    decision: String(row.decision || '').trim(),
  };
}

async function resolveAssignedCourses(req, assignedCourses) {
  const requestedCodes = Array.from(new Set(assignedCourses.map((course) => course.courseCode).filter(Boolean)));
  if (requestedCodes.length === 0) return { courses: [], missingCodes: [] };

  const courses = await Course.find({
    ...getOwnedScope(req),
    status: 'active',
    courseCode: { $in: requestedCodes },
  }).sort({ courseName: 1 });
  const courseByCode = new Map(courses.map((course) => [course.courseCode, course]));
  const missingCodes = requestedCodes.filter((code) => !courseByCode.has(code));

  return {
    missingCodes,
    courses: requestedCodes
      .filter((code) => courseByCode.has(code))
      .map((code) => {
        const course = courseByCode.get(code);
        return {
          courseName: course.courseName,
          courseCode: course.courseCode,
        };
      }),
  };
}

function serializePerson(person, includePassword = false) {
  const data = person.toObject ? person.toObject() : person;
  return {
    id: data._id,
    _id: data._id,
    name: data.name,
    email: data.email,
    loginId: data.loginId,
    role: data.role,
    status: data.status,
    assignedCourses: data.assignedCourses || [],
    permissions: data.permissions || [],
    ownerAdminId: data.ownerAdminId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    password: includePassword ? data.passwordPreview : undefined,
  };
}

async function buildBulkPreview(req, config, rows) {
  const normalizedRows = rows.map(normalizePersonRow);
  const emails = normalizedRows.map((row) => row.email).filter(Boolean);
  const emailOccurrences = emails.reduce((acc, email) => {
    acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {});
  const seenEmails = {};
  const existingUsers = await User.find({ email: { $in: emails } }).select('email role');
  const existingByEmail = new Map(existingUsers.map((user) => [user.email, user]));

  const previews = [];
  for (const row of normalizedRows) {
    const issues = [];
    const existingUser = existingByEmail.get(row.email);
    seenEmails[row.email] = (seenEmails[row.email] || 0) + 1;

    if (!row.name) issues.push('Name is required.');
    if (!row.email) issues.push('Email is required.');
    if (row.email && emailOccurrences[row.email] > 1 && seenEmails[row.email] > 1) {
      issues.push('Duplicate email in uploaded file.');
    }

    const resolved = await resolveAssignedCourses(req, row.assignedCourses);
    if (resolved.courses.length === 0) issues.push('At least one uploaded master course is required.');
    if (resolved.missingCodes.length > 0) {
      issues.push(`Course code not found: ${resolved.missingCodes.join(', ')}`);
    }
    if (existingUser) {
      issues.push(
        existingUser.role === config.role
          ? `${config.label} with this email already exists.`
          : 'This email is already assigned to another account.'
      );
    }

    const canSave = issues.length === 0;
    const allowedDecisions = canSave ? ['add', 'skip'] : ['skip'];

    previews.push({
      rowNumber: row.rowNumber,
      name: row.name,
      email: row.email,
      assignedCourses: resolved.courses,
      requestedCourseCodes: row.assignedCourses.map((course) => course.courseCode).filter(Boolean),
      issues,
      canSave,
      decision: allowedDecisions.includes(row.decision) ? row.decision : canSave ? 'add' : 'skip',
      allowedDecisions,
    });
  }

  return previews;
}

router.get('/:kind', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.viewPermission)) {
      return res.status(403).json({ message: 'You do not have permission to view these users.' });
    }

    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const query = { role: config.role, ...getReadScope(req, config) };

    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'assignedCourses.courseName': { $regex: search, $options: 'i' } },
        { 'assignedCourses.courseCode': { $regex: search, $options: 'i' } },
      ];
    }

    const items = await User.find(query)
      .select('+passwordPreview')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit || 500), 1000));

    return res.json({ items: items.map((person) => serializePerson(person, true)) });
  } catch (error) {
    return next(error);
  }
});

router.post('/:kind', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.createPermission)) {
      return res.status(403).json({ message: 'You do not have permission to create this user.' });
    }

    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const resolved = await resolveAssignedCourses(req, normalizeCourseRows(req.body.assignedCourses));

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }
    if (resolved.courses.length === 0) {
      return res.status(400).json({ message: 'At least one valid assigned course is required.' });
    }
    if (resolved.missingCodes.length > 0) {
      return res.status(400).json({ message: `Course code not found: ${resolved.missingCodes.join(', ')}` });
    }

    const existing = await User.findOne({
      $or: [{ email }, { loginId: email }, { uniqueUsername: email }],
    }).select('_id role');

    if (existing) {
      return res.status(409).json({
        message: existing.role === config.role ? `${config.label} with this email already exists.` : 'This email is already assigned to another account.',
      });
    }

    const password = generatePassword();
    const person = await User.create({
      name,
      email,
      loginId: email,
      uniqueUsername: email,
      passwordHash: await User.hashPassword(password),
      passwordPreview: password,
      role: config.role,
      permissions: defaultStaffPermissions(config.role),
      status: 'active',
      assignedCourses: resolved.courses,
      ownerAdminId: getWriteOwner(req),
      mustChangePassword: true,
    });

    await writeAuditLog(req, {
      action: `${req.params.kind}.create`,
      targetType: 'User',
      targetId: person._id,
      newValue: { name, email, assignedCourses: resolved.courses },
    });

    return res.status(201).json({ person: serializePerson({ ...person.toObject(), passwordPreview: password }, true) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already assigned to another account.' });
    }
    return next(error);
  }
});

router.post('/:kind/bulk-validate', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.createPermission)) {
      return res.status(403).json({ message: 'You do not have permission to create these users.' });
    }

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ message: 'No rows were provided.' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Upload limit is 1000 rows per import.' });

    const items = await buildBulkPreview(req, config, rows);
    const summary = items.reduce(
      (acc, item) => ({
        total: acc.total + 1,
        ready: acc.ready + (item.canSave && item.decision !== 'skip' ? 1 : 0),
        failed: acc.failed + (item.issues.length > 0 ? 1 : 0),
        coursesMatched: acc.coursesMatched + item.assignedCourses.length,
      }),
      { total: 0, ready: 0, failed: 0, coursesMatched: 0 }
    );

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/:kind/bulk-save', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.createPermission)) {
      return res.status(403).json({ message: 'You do not have permission to create these users.' });
    }

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const shouldSendMail = Boolean(req.body.sendMail);
    const previewRows = await buildBulkPreview(req, config, rows);
    const created = [];
    const skipped = [];
    const processedEmails = new Set();

    for (const row of previewRows) {
      if (!row.canSave || row.decision === 'skip' || processedEmails.has(row.email)) {
        skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: row.issues[0] || 'skipped' });
        continue;
      }

      const password = generatePassword();
      const person = await User.create({
        name: row.name,
        email: row.email,
        loginId: row.email,
        uniqueUsername: row.email,
        passwordHash: await User.hashPassword(password),
        passwordPreview: password,
        role: config.role,
        permissions: defaultStaffPermissions(config.role),
        status: 'active',
        assignedCourses: row.assignedCourses,
        ownerAdminId: getWriteOwner(req),
        mustChangePassword: true,
      });

      const serializedPerson = serializePerson({ ...person.toObject(), passwordPreview: password }, true);

      if (shouldSendMail) {
        try {
          await sendStaffCredentialMail({ person: { ...person.toObject(), passwordPreview: password }, label: config.label });
          serializedPerson.mailStatus = 'sent';
        } catch (mailError) {
          serializedPerson.mailStatus = 'failed';
          serializedPerson.mailError = mailError.message || 'Mail failed.';
        }
      } else {
        serializedPerson.mailStatus = 'not_sent';
      }

      created.push(serializedPerson);
      processedEmails.add(row.email);
    }

    await writeAuditLog(req, {
      action: `${req.params.kind}.bulk_create`,
      targetType: 'User',
      newValue: { created: created.length, skipped: skipped.length, mailSent: shouldSendMail },
    });

    return res.status(201).json({ summary: { created: created.length, skipped: skipped.length }, created, skipped });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'One or more emails are already assigned to another account.' });
    }
    return next(error);
  }
});

router.patch('/:kind/:id', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.editPermission)) {
      return res.status(403).json({ message: 'You do not have permission to edit this user.' });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) }).select('+passwordPreview');
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    const updates = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
    if (typeof req.body.email === 'string' && req.body.email.trim()) {
      const email = normalizeEmail(req.body.email);
      const conflict = await User.findOne({
        _id: { $ne: person._id },
        $or: [{ email }, { loginId: email }, { uniqueUsername: email }],
      }).select('_id');
      if (conflict) return res.status(409).json({ message: 'This email is already assigned to another account.' });
      updates.email = email;
      updates.loginId = email;
      updates.uniqueUsername = email;
    }
    if (req.body.assignedCourses !== undefined) {
      const resolved = await resolveAssignedCourses(req, normalizeCourseRows(req.body.assignedCourses));
      if (resolved.courses.length === 0) return res.status(400).json({ message: 'At least one valid assigned course is required.' });
      if (resolved.missingCodes.length > 0) {
        return res.status(400).json({ message: `Course code not found: ${resolved.missingCodes.join(', ')}` });
      }
      updates.assignedCourses = resolved.courses;
    }
    if (req.body.status !== undefined) {
      if (!['active', 'inactive', 'blocked'].includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid status.' });
      }
      updates.status = req.body.status;
    }
    if (req.body.permissions !== undefined) {
      if (req.user.role !== ROLES.SUPER_ADMIN) return res.status(403).json({ message: 'Only super admin can change staff permissions.' });
      updates.permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    }

    Object.assign(person, updates);
    await person.save();

    await writeAuditLog(req, {
      action: `${req.params.kind}.update`,
      targetType: 'User',
      targetId: person._id,
      newValue: updates,
    });

    return res.json({ person: serializePerson(person, true) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:kind/:id/status', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.editPermission)) {
      return res.status(403).json({ message: 'You do not have permission to update this user.' });
    }

    const status = String(req.body.status || '').trim();
    if (!['active', 'inactive', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) }).select('+passwordPreview');
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    person.status = status;
    await person.save();
    return res.json({ person: serializePerson(person, true) });
  } catch (error) {
    return next(error);
  }
});

router.post('/:kind/:id/send-mail', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, 'mail.send')) {
      return res.status(403).json({ message: 'You do not have permission to send mail.' });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) }).select('+passwordPreview');
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    await sendStaffCredentialMail({ person, label: config.label });
    return res.json({ message: `${config.label} credential mail sent.` });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:kind/:id', async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.removePermission)) {
      return res.status(403).json({ message: 'You do not have permission to delete this user.' });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) });
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    await User.deleteOne({ _id: person._id });
    await writeAuditLog(req, {
      action: `${req.params.kind}.delete`,
      targetType: 'User',
      targetId: person._id,
      oldValue: { name: person.name, email: person.email },
    });

    return res.json({ message: `${config.label} deleted.` });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
