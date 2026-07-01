const express = require('express');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const AuditLog = require('../models/AuditLog');
const Course = require('../models/Course');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { adminWriteLimiter, bulkImportLimiter, mailSendLimiter } = require('../middleware/rateLimit');
const { validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { sendStaffCredentialMail } = require('../services/credentialMail.service');
const { writeAuditLog } = require('../services/audit.service');
const { generatePassword } = require('../utils/credentials');

const router = express.Router();
const assignedCoursesPayloadSchema = z.union([
  z.string().trim().max(10000),
  z.array(z.record(z.unknown())).max(500),
]);
const staffCreateBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(160),
  email: z.string().trim().toLowerCase().email('Valid email is required.').max(320),
  assignedCourses: assignedCoursesPayloadSchema,
});
const staffBulkRowsBodySchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, 'At least one row is required.').max(1000, 'Upload limit is 1000 rows per import.'),
  sendMail: z.boolean().optional().default(false),
});
const staffUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  assignedCourses: assignedCoursesPayloadSchema.optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  permissions: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const staffPasswordBodySchema = z.object({
  generate: z.boolean().optional().default(false),
  newPassword: z.string().max(200).optional().default(''),
  confirmPassword: z.string().max(200).optional().default(''),
  sendMail: z.boolean().optional().default(false),
});
const staffStatusBodySchema = z.object({
  status: z.enum(['active', 'inactive', 'blocked']),
});
const peopleKindSchema = z.enum(['faculty', 'moderators']);

function defaultStaffPermissions(role) {
  if (role === ROLES.FACULTY) return ['work.view', 'assessment.questions.add', 'assessment.questions.edit', 'assessment.submit', 'library.view', 'library.create', 'library.edit', 'library.archive'];
  if (role === ROLES.MODERATOR) return ['work.view', 'assessment.review', 'assessment.questions.edit'];
  return [];
}

const roleConfig = {
  faculty: {
    role: ROLES.FACULTY,
    label: 'Faculty',
    viewPermission: 'faculty.view',
    viewAllPermission: 'faculty.view.all',
    profilePermission: 'faculty.profile.view',
    createPermission: 'faculty.create',
    editPermission: 'faculty.edit',
    removePermission: 'faculty.remove',
  },
  moderators: {
    role: ROLES.MODERATOR,
    label: 'Moderator',
    viewPermission: 'moderator.view',
    viewAllPermission: 'moderator.view.all',
    profilePermission: 'moderator.profile.view',
    createPermission: 'moderator.create',
    editPermission: 'moderator.edit',
    removePermission: 'moderator.remove',
  },
};

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));
router.param('kind', (req, res, next, value) => {
  const result = peopleKindSchema.safeParse(value);
  if (!result.success) {
    return res.status(404).json({ message: 'People role not found.' });
  }

  req.params.kind = result.data;
  return next();
});

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

function isStrongPassword(password) {
  const value = String(password || '');
  return value.length > 8 && /[A-Z]/.test(value) && /[^A-Za-z0-9]/.test(value);
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

router.post('/:kind', adminWriteLimiter, validateBody(staffCreateBodySchema), async (req, res, next) => {
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

router.post('/:kind/bulk-validate', bulkImportLimiter, validateBody(staffBulkRowsBodySchema), async (req, res, next) => {
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

router.post('/:kind/bulk-save', bulkImportLimiter, validateBody(staffBulkRowsBodySchema), async (req, res, next) => {
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

function serializeAssignmentProfile(assignment) {
  const assessment = assignment.assessmentId;
  return {
    id: assignment._id,
    assessmentId: assessment?._id,
    assessmentTitle: assessment?.title || 'Assessment',
    assessmentCode: assessment?.assessmentCode || '',
    assessmentStatus: assessment?.status || '',
    courseName: assignment.courseName,
    courseId: assignment.courseId,
    status: assignment.status,
    facultyMail: assignment.facultyMail,
    moderatorMail: assignment.moderatorMail,
    submittedAt: assignment.submittedAt,
    reviewedAt: assignment.reviewedAt,
    updatedAt: assignment.updatedAt,
  };
}

function serializeProfileLog(log) {
  return {
    id: log._id,
    action: log.action,
    targetType: log.targetType,
    reason: log.reason,
    newValue: log.newValue,
    oldValue: log.oldValue,
    createdAt: log.createdAt,
  };
}

router.get('/:kind/:id/profile', validateObjectIdParams('id'), async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.profilePermission)) {
      return res.status(403).json({ message: `You do not have permission to view ${config.label.toLowerCase()} profiles.` });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) }).select('+passwordPreview');
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    const assignmentField = config.role === ROLES.FACULTY ? 'facultyId' : 'moderatorId';
    const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const [assignments, activity] = await Promise.all([
      AssessmentAssignment.find({ [assignmentField]: person._id })
        .populate('assessmentId', 'title assessmentCode status startAt endAt')
        .sort({ updatedAt: -1 })
        .limit(50),
      AuditLog.find({
        createdAt: { $gte: since },
        action: { $not: { $regex: '^request\\.' } },
        $or: [
          { actorId: person._id },
          { targetId: person._id },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(12),
    ]);

    const statusCounts = assignments.reduce((acc, assignment) => {
      acc[assignment.status] = (acc[assignment.status] || 0) + 1;
      return acc;
    }, {});

    const metrics = {
      totalAssigned: assignments.length,
      active: (statusCounts.assigned || 0) + (statusCounts.in_progress || 0) + (statusCounts.submitted || 0) + (statusCounts.rejected || 0),
      completed: statusCounts.approved || 0,
      waitingReview: statusCounts.submitted || 0,
      rejected: statusCounts.rejected || 0,
      courses: (person.assignedCourses || []).length,
    };

    await writeAuditLog(req, {
      action: `${req.params.kind}.profile.view`,
      targetType: 'User',
      targetId: person._id,
      newValue: { name: person.name, email: person.email },
    });

    return res.json({
      person: serializePerson(person, true),
      metrics,
      statusCounts,
      assignments: assignments.map(serializeAssignmentProfile),
      activity: activity.map(serializeProfileLog),
      retentionDays: 10,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:kind/:id', adminWriteLimiter, validateObjectIdParams('id'), validateBody(staffUpdateBodySchema), async (req, res, next) => {
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

router.patch('/:kind/:id/password', adminWriteLimiter, validateObjectIdParams('id'), validateBody(staffPasswordBodySchema), async (req, res, next) => {
  try {
    const config = getConfig(req, res);
    if (!config) return;
    if (!canSupervise(req, config.editPermission)) {
      return res.status(403).json({ message: 'You do not have permission to change this password.' });
    }

    const person = await User.findOne({ _id: req.params.id, role: config.role, ...getReadScope(req, config) }).select('+passwordPreview');
    if (!person) return res.status(404).json({ message: `${config.label} not found.` });

    const shouldGenerate = Boolean(req.body.generate);
    const newPassword = shouldGenerate ? generatePassword(12) : String(req.body.newPassword || '');
    const confirmPassword = shouldGenerate ? newPassword : String(req.body.confirmPassword || '');

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password do not match.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'Use a strong password with more than 8 characters, 1 capital letter, and 1 special character.',
      });
    }

    person.passwordHash = await User.hashPassword(newPassword);
    person.passwordPreview = newPassword;
    person.mustChangePassword = true;
    person.passwordChangedAt = undefined;
    await person.save();

    let mailStatus = 'not_sent';
    let mailError = '';
    if (req.body.sendMail) {
      try {
        await sendStaffCredentialMail({ person, label: config.label });
        mailStatus = 'sent';
      } catch (error) {
        mailStatus = 'failed';
        mailError = error.message || 'Mail failed.';
      }
    }

    await writeAuditLog(req, {
      action: `${req.params.kind}.password.update`,
      targetType: 'User',
      targetId: person._id,
      newValue: { email: person.email, mustChangePassword: true, mailStatus },
    });

    return res.json({
      person: {
        ...serializePerson(person, true),
        mailStatus,
        mailError,
      },
      message: `${config.label} password updated.${
        mailStatus === 'sent' ? ' Credential mail sent.' : mailStatus === 'failed' ? ' Mail failed, but the new password was saved.' : ''
      }`,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:kind/:id/status', adminWriteLimiter, validateObjectIdParams('id'), validateBody(staffStatusBodySchema), async (req, res, next) => {
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

router.post('/:kind/:id/send-mail', mailSendLimiter, validateObjectIdParams('id'), async (req, res, next) => {
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

router.delete('/:kind/:id', adminWriteLimiter, validateObjectIdParams('id'), async (req, res, next) => {
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
