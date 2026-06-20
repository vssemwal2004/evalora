const express = require('express');
const User = require('../models/User');
const Assessment = require('../models/Assessment');
const AssessmentStudent = require('../models/AssessmentStudent');
const StudentProfile = require('../models/StudentProfile');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');
const { sendStudentCredentialMail } = require('../services/credentialMail.service');
const { generateExamId, generatePassword } = require('../utils/credentials');

const router = express.Router({ mergeParams: true });

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getAssessmentScope(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

async function findScopedAssessment(req) {
  return Assessment.findOne({ _id: req.params.assessmentId, ...getAssessmentScope(req) });
}

function matchCourse(assessment, studentCourseName, studentCourseId) {
  const cleanCourseName = String(studentCourseName || '').trim();
  const cleanCourseId = String(studentCourseId || '').trim().toUpperCase();

  const byId = cleanCourseId
    ? assessment.courses.find((course) => String(course.courseId || '').toUpperCase() === cleanCourseId)
    : null;

  if (byId) {
    return { course: byId, status: 'matched_by_course_id' };
  }

  const byName = assessment.courses.find(
    (course) => course.courseName.trim().toLowerCase() === cleanCourseName.toLowerCase()
  );

  if (byName) {
    return { course: byName, status: 'matched_by_course_name' };
  }

  return { course: null, status: 'not_matched' };
}

async function syncAssessmentStudentCounts(assessmentId) {
  const grouped = await AssessmentStudent.aggregate([
    { $match: { assessmentId } },
    {
      $group: {
        _id: '$courseName',
        total: { $sum: 1 },
        eligible: {
          $sum: {
            $cond: [{ $eq: ['$eligibilityStatus', 'eligible'] }, 1, 0],
          },
        },
      },
    },
  ]);

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return;

  assessment.courses = assessment.courses.map((course) => {
    const match = grouped.find((item) => item._id === course.courseName);
    course.studentCount = match?.total || 0;
    course.eligibleStudentCount = match?.eligible || 0;
    return course;
  });

  await assessment.save();
}

function normalizeEligibilityStatus(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  return ['eligible', 'not_eligible', 'needs_review'].includes(normalizedStatus) ? normalizedStatus : 'eligible';
}

function normalizeBulkRow(row, index) {
  return {
    rowNumber: Number(row.rowNumber || index + 2),
    name: String(row.name || row.studentName || row['Student Name'] || '').trim(),
    email: String(row.email || row.studentEmail || row['Student Email'] || '').trim().toLowerCase(),
    applicationNumber: String(row.applicationNumber || row['Application Number'] || '').trim(),
    courseName: String(row.courseName || row.inputCourseName || row['Course Name'] || row.studentCourse || '').trim(),
    courseId: String(row.courseId || row.inputCourseId || row['Course ID'] || '').trim().toUpperCase(),
    eligibilityStatus: normalizeEligibilityStatus(
      String(row.eligibilityStatus || row['Eligibility Status'] || 'eligible').trim()
    ),
    eligibilityReason: String(row.eligibilityReason || row['Eligibility Reason'] || '').trim(),
    decision: String(row.decision || '').trim(),
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function generateUniqueExamId() {
  let generatedExamId = generateExamId();
  while (await AssessmentStudent.exists({ generatedExamId })) {
    generatedExamId = generateExamId();
  }
  return generatedExamId;
}

async function buildBulkPreview(assessment, rows) {
  const normalizedRows = rows.map(normalizeBulkRow);
  const emails = normalizedRows.map((row) => row.email).filter(Boolean);
  const emailOccurrences = emails.reduce((acc, email) => {
    acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {});
  const seenEmails = {};

  const [profiles, assignments] = await Promise.all([
    StudentProfile.find({ email: { $in: emails } }),
    AssessmentStudent.find({ assessmentId: assessment._id, email: { $in: emails } }),
  ]);

  const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile]));
  const assignmentByEmail = new Map(assignments.map((assignment) => [assignment.email, assignment]));

  return normalizedRows.map((row) => {
    const issues = [];
    const { course, status: courseMatchStatus } = matchCourse(assessment, row.courseName, row.courseId);
    const existingProfile = profileByEmail.get(row.email);
    const existingAssignment = assignmentByEmail.get(row.email);

    seenEmails[row.email] = (seenEmails[row.email] || 0) + 1;

    if (!row.name) issues.push('Student name is required.');
    if (!row.email || !isValidEmail(row.email)) issues.push('Valid email is required.');
    if (!row.courseName && !row.courseId) issues.push('Course name or course ID is required.');
    if (row.email && emailOccurrences[row.email] > 1 && seenEmails[row.email] > 1) {
      issues.push('Duplicate row in uploaded file.');
    }
    if (!course) issues.push('Course does not match assessment setup.');

    const canSave = issues.length === 0;
    const allowedDecisions = !canSave
      ? ['skip']
      : existingAssignment
        ? ['skip', 'replace']
        : ['add', 'not_eligible', 'skip'];
    const requestedDecision = allowedDecisions.includes(row.decision) ? row.decision : '';
    const defaultDecision = !canSave ? 'skip' : existingAssignment ? 'skip' : row.eligibilityStatus === 'not_eligible' ? 'not_eligible' : 'add';

    return {
      rowNumber: row.rowNumber,
      name: row.name,
      email: row.email,
      applicationNumber: row.applicationNumber,
      inputCourseName: row.courseName,
      inputCourseId: row.courseId,
      matchedCourseName: course?.courseName || '',
      matchedCourseId: course?.courseId || '',
      courseMatchStatus,
      eligibilityStatus: row.eligibilityStatus,
      eligibilityReason: row.eligibilityReason,
      profileStatus: existingProfile ? 'existing_profile' : 'new_profile',
      assignmentStatus: existingAssignment ? 'already_assigned' : 'new_assignment',
      issues,
      canSave,
      allowedDecisions,
      decision: requestedDecision || defaultDecision,
    };
  });
}

async function createOrReplaceStudentAssignment({ assessment, row, decision, actorId }) {
  const existingAssignment = await AssessmentStudent.findOne({ assessmentId: assessment._id, email: row.email });

  if (existingAssignment && decision !== 'replace') {
    return { action: 'skipped', reason: 'already_assigned', assignment: existingAssignment };
  }

  const studentProfile = await StudentProfile.findOneAndUpdate(
    { email: row.email },
    {
      $set: {
        name: row.name,
        email: row.email,
        applicationNumber: row.applicationNumber,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const generatedExamId = await generateUniqueExamId();
  const plainPassword = generatePassword(10);
  const passwordHash = await User.hashPassword(plainPassword);
  const eligibilityStatus = decision === 'not_eligible' ? 'not_eligible' : row.eligibilityStatus || 'eligible';
  await User.findOneAndUpdate(
    { email: row.email, role: ROLES.STUDENT },
    {
      $set: {
        name: row.name,
        email: row.email,
        loginId: generatedExamId,
        uniqueUsername: generatedExamId,
        passwordHash,
        role: ROLES.STUDENT,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (existingAssignment) {
    existingAssignment.set({
      studentProfileId: studentProfile._id,
      name: row.name,
      email: row.email,
      applicationNumber: row.applicationNumber,
      courseName: row.matchedCourseName,
      courseId: row.matchedCourseId,
      generatedExamId,
      passwordHash,
      passwordPreview: plainPassword,
      eligibilityStatus,
      eligibilityReason: row.eligibilityReason,
      courseMatchStatus: row.courseMatchStatus,
      assignedProctorId: undefined,
      addedBy: actorId,
      mailStatus: 'not_sent',
      examStatus: 'not_started',
    });
    await existingAssignment.save();

    return {
      action: 'replaced',
      assignment: existingAssignment,
      passwordPreview: plainPassword,
    };
  }

  const assignment = await AssessmentStudent.create({
    assessmentId: assessment._id,
    studentProfileId: studentProfile._id,
    ownerAdminId: assessment.ownerAdminId,
    name: row.name,
    email: row.email,
    applicationNumber: row.applicationNumber,
    courseName: row.matchedCourseName,
    courseId: row.matchedCourseId,
    generatedExamId,
    passwordHash,
    passwordPreview: plainPassword,
    eligibilityStatus,
    eligibilityReason: row.eligibilityReason,
    courseMatchStatus: row.courseMatchStatus,
    addedBy: actorId,
  });

  return {
    action: 'created',
    assignment,
    passwordPreview: plainPassword,
  };
}

router.get('/', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const search = String(req.query.search || '').trim();
    const course = String(req.query.course || '').trim();
    const eligibility = String(req.query.eligibility || '').trim();

    const query = { assessmentId: assessment._id };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { generatedExamId: { $regex: search, $options: 'i' } },
        { applicationNumber: { $regex: search, $options: 'i' } },
      ];
    }

    if (course) {
      query.$or = [
        ...(query.$or || []),
        { courseName: { $regex: course, $options: 'i' } },
        { courseId: { $regex: course, $options: 'i' } },
      ];
    }

    if (eligibility) {
      query.eligibilityStatus = eligibility;
    }

    const items = await AssessmentStudent.find(query)
      .sort({ createdAt: -1 })
      .select('+passwordPreview');

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-validate', requirePermission('student.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No student rows were provided.' });
    }

    if (rows.length > 1000) {
      return res.status(400).json({ message: 'Upload limit is 1000 students per import.' });
    }

    const items = await buildBulkPreview(assessment, rows);
    const summary = items.reduce(
      (acc, item) => ({
        total: acc.total + 1,
        ready: acc.ready + (item.canSave && item.decision !== 'skip' ? 1 : 0),
        conflicts: acc.conflicts + (item.assignmentStatus === 'already_assigned' ? 1 : 0),
        errors: acc.errors + (item.issues.length > 0 ? 1 : 0),
        courseMatched: acc.courseMatched + (item.courseMatchStatus !== 'not_matched' ? 1 : 0),
      }),
      { total: 0, ready: 0, conflicts: 0, errors: 0, courseMatched: 0 }
    );

    return res.json({ items, summary });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-save', requirePermission('student.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No reviewed student rows were provided.' });
    }

    const previewRows = await buildBulkPreview(assessment, rows);
    const processedEmails = new Set();
    const credentials = [];
    const skipped = [];
    let created = 0;
    let replaced = 0;

    for (const row of previewRows) {
      if (!row.canSave || row.decision === 'skip') {
        skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: row.issues[0] || 'skipped' });
        continue;
      }

      if (processedEmails.has(row.email)) {
        skipped.push({ rowNumber: row.rowNumber, email: row.email, reason: 'duplicate_in_import' });
        continue;
      }

      const result = await createOrReplaceStudentAssignment({
        assessment,
        row,
        decision: row.decision,
        actorId: req.user._id,
      });

      processedEmails.add(row.email);

      if (result.action === 'created') created += 1;
      if (result.action === 'replaced') replaced += 1;

      if (result.action === 'created' || result.action === 'replaced') {
        credentials.push({
          action: result.action,
          name: result.assignment.name,
          email: result.assignment.email,
          courseName: result.assignment.courseName,
          courseId: result.assignment.courseId,
          generatedExamId: result.assignment.generatedExamId,
          passwordPreview: result.passwordPreview,
          eligibilityStatus: result.assignment.eligibilityStatus,
        });
      }
    }

    await syncAssessmentStudentCounts(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.student.bulk_import',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        created,
        replaced,
        skipped: skipped.length,
      },
    });

    return res.status(201).json({
      summary: {
        created,
        replaced,
        skipped: skipped.length,
      },
      credentials,
      skipped,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requirePermission('student.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const { name, email, applicationNumber, courseName, courseId, eligibilityStatus, eligibilityReason } = req.body;

    if (!name || !email || !courseName) {
      return res.status(400).json({ message: 'Student name, email, and course name are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const { course, status: courseMatchStatus } = matchCourse(assessment, courseName, courseId);

    if (!course) {
      return res.status(400).json({ message: 'Student course does not match assessment course setup.' });
    }

    const studentProfile = await StudentProfile.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          name,
          email: normalizedEmail,
          applicationNumber,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    let generatedExamId = generateExamId();
    while (await AssessmentStudent.exists({ generatedExamId })) {
      generatedExamId = generateExamId();
    }

    const plainPassword = generatePassword(10);
    const passwordHash = await User.hashPassword(plainPassword);
    await User.findOneAndUpdate(
      { email: normalizedEmail, role: ROLES.STUDENT },
      {
        $set: {
          name,
          email: normalizedEmail,
          loginId: generatedExamId,
          uniqueUsername: generatedExamId,
          passwordHash,
          role: ROLES.STUDENT,
          status: 'active',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const assignment = await AssessmentStudent.create({
      assessmentId: assessment._id,
      studentProfileId: studentProfile._id,
      ownerAdminId: assessment.ownerAdminId,
      name,
      email: normalizedEmail,
      applicationNumber,
      courseName: course.courseName,
      courseId: course.courseId,
      generatedExamId,
      passwordHash,
      passwordPreview: plainPassword,
      eligibilityStatus: eligibilityStatus || 'eligible',
      eligibilityReason,
      courseMatchStatus,
      addedBy: req.user._id,
    });

    await syncAssessmentStudentCounts(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.student.add',
      targetType: 'AssessmentStudent',
      targetId: assignment._id,
      newValue: {
        assessmentId: assessment._id,
        email: normalizedEmail,
        courseName: assignment.courseName,
        generatedExamId,
      },
    });

    return res.status(201).json({
      student: {
        ...assignment.toObject(),
        passwordPreview: plainPassword,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Student is already added to this assessment.' });
    }

    return next(error);
  }
});

router.post('/:studentId/send-mail', requirePermission('mail.send'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const student = await AssessmentStudent.findOne({
      _id: req.params.studentId,
      assessmentId: assessment._id,
    }).select('+passwordPreview');

    if (!student) {
      return res.status(404).json({ message: 'Student not found in this assessment.' });
    }

    await sendStudentCredentialMail({ assessment, student });

    student.mailStatus = ['sent', 'resent'].includes(student.mailStatus) ? 'resent' : 'sent';
    await student.save();

    await writeAuditLog(req, {
      action: 'assessment.student.send_mail',
      targetType: 'AssessmentStudent',
      targetId: student._id,
      newValue: {
        assessmentId: assessment._id,
        email: student.email,
        mailStatus: student.mailStatus,
      },
    });

    return res.json({
      item: student,
      message: 'Student credential mail sent successfully.',
    });
  } catch (error) {
    const assessment = await findScopedAssessment(req).catch(() => null);
    const student = assessment
      ? await AssessmentStudent.findOne({
          _id: req.params.studentId,
          assessmentId: assessment._id,
        }).catch(() => null)
      : null;

    if (student) {
      student.mailStatus = 'failed';
      await student.save().catch(() => null);
    }

    return next(error);
  }
});

module.exports = router;
