const express = require('express');
const Assessment = require('../models/Assessment');
const AssessmentStudent = require('../models/AssessmentStudent');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function getStudentScope(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
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

function serializeStudent(student) {
  const assessment = student.assessmentId && typeof student.assessmentId === 'object' ? student.assessmentId : null;

  return {
    _id: student._id,
    name: student.name,
    email: student.email,
    applicationNumber: student.applicationNumber || '',
    courseName: student.courseName,
    courseId: student.courseId || '',
    generatedExamId: student.generatedExamId,
    mailStatus: student.mailStatus,
    examStatus: student.examStatus,
    status: student.examStatus === 'blocked' ? 'disabled' : 'enabled',
    isGivingExam: student.examStatus === 'in_progress',
    registeredAt: student.createdAt,
    updatedAt: student.updatedAt,
    assessment: assessment
      ? {
          _id: assessment._id,
          title: assessment.title,
          assessmentCode: assessment.assessmentCode,
          status: assessment.status,
          startAt: assessment.startAt,
          endAt: assessment.endAt,
        }
      : null,
  };
}

async function findScopedStudent(req, studentId) {
  return AssessmentStudent.findOne({ _id: studentId, ...getStudentScope(req) }).populate('assessmentId', 'title assessmentCode status startAt endAt');
}

router.get('/', requirePermission('student.view'), async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const course = String(req.query.course || '').trim();
    const assessment = String(req.query.assessment || '').trim();
    const status = String(req.query.status || '').trim();

    const query = { ...getStudentScope(req) };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { applicationNumber: { $regex: search, $options: 'i' } },
        { generatedExamId: { $regex: search, $options: 'i' } },
      ];
    }

    if (course) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { courseName: { $regex: course, $options: 'i' } },
            { courseId: { $regex: course, $options: 'i' } },
          ],
        },
      ];
    }

    if (status === 'enabled') query.examStatus = { $ne: 'blocked' };
    if (status === 'disabled') query.examStatus = 'blocked';
    if (['not_started', 'in_progress', 'submitted', 'ufm', 'blocked'].includes(status)) query.examStatus = status;

    let assessmentIds = [];
    if (assessment) {
      const assessmentQuery = {
        ...getStudentScope(req),
        $or: [
          { title: { $regex: assessment, $options: 'i' } },
          { assessmentCode: { $regex: assessment, $options: 'i' } },
        ],
      };
      const assessments = await Assessment.find(assessmentQuery).select('_id');
      assessmentIds = assessments.map((item) => item._id);
      query.assessmentId = { $in: assessmentIds };
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const skip = (page - 1) * limit;

    const [items, total, statusCounts] = await Promise.all([
      AssessmentStudent.find(query)
        .populate('assessmentId', 'title assessmentCode status startAt endAt')
        .select('+passwordPreview')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AssessmentStudent.countDocuments(query),
      AssessmentStudent.aggregate([
        { $match: getStudentScope(req) },
        {
          $group: {
            _id: '$examStatus',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts = statusCounts.reduce(
      (acc, item) => ({
        ...acc,
        [item._id || 'unknown']: item.count,
        all: acc.all + item.count,
        disabled: acc.disabled + (item._id === 'blocked' ? item.count : 0),
        enabled: acc.enabled + (item._id === 'blocked' ? 0 : item.count),
      }),
      { all: 0, enabled: 0, disabled: 0 }
    );

    return res.json({
      items: items.map(serializeStudent),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
      statusCounts: counts,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', requirePermission('student.edit'), async (req, res, next) => {
  try {
    const student = await findScopedStudent(req, req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const oldValue = {
      name: student.name,
      email: student.email,
      applicationNumber: student.applicationNumber,
    };
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const applicationNumber = String(req.body.applicationNumber || '').trim();

    if (!name || !email) {
      return res.status(400).json({ message: 'Student name and email are required.' });
    }

    const oldEmail = student.email;
    student.name = name;
    student.email = email;
    student.applicationNumber = applicationNumber;
    await student.save();

    await Promise.all([
      StudentProfile.findOneAndUpdate(
        { email: oldEmail },
        { $set: { name, email, applicationNumber } },
        { new: true }
      ),
      User.findOneAndUpdate(
        { email: oldEmail, role: ROLES.STUDENT },
        { $set: { name, email } },
        { new: true }
      ),
    ]);

    await writeAuditLog(req, {
      action: 'student.update',
      targetType: 'AssessmentStudent',
      targetId: student._id,
      oldValue,
      newValue: { name, email, applicationNumber },
    });

    const updated = await findScopedStudent(req, req.params.id);
    return res.json({ item: serializeStudent(updated) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A student with this email already exists in the assessment.' });
    }

    return next(error);
  }
});

router.patch('/:id/status', requirePermission('student.edit'), async (req, res, next) => {
  try {
    const student = await findScopedStudent(req, req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const action = String(req.body.action || '').trim();
    if (!['enable', 'disable'].includes(action)) {
      return res.status(400).json({ message: 'Invalid student status action.' });
    }

    const oldValue = { examStatus: student.examStatus };
    student.examStatus = action === 'disable' ? 'blocked' : 'not_started';
    await student.save();

    await writeAuditLog(req, {
      action: action === 'disable' ? 'student.disable' : 'student.enable',
      targetType: 'AssessmentStudent',
      targetId: student._id,
      oldValue,
      newValue: { examStatus: student.examStatus },
    });

    return res.json({ item: serializeStudent(student) });
  } catch (error) {
    return next(error);
  }
});

router.post('/bulk-action', requirePermission('student.view'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const action = String(req.body.action || '').trim();

    if (ids.length === 0) return res.status(400).json({ message: 'No students selected.' });
    if (!['enable', 'disable', 'delete'].includes(action)) return res.status(400).json({ message: 'Invalid bulk action.' });
    if (action !== 'delete' && req.user.role !== ROLES.SUPER_ADMIN && !req.user.permissions.includes('student.edit')) {
      return res.status(403).json({ message: 'Permission denied.' });
    }
    if (action === 'delete' && req.user.role !== ROLES.SUPER_ADMIN && !req.user.permissions.includes('student.remove')) {
      return res.status(403).json({ message: 'Permission denied.' });
    }

    const students = await AssessmentStudent.find({ _id: { $in: ids }, ...getStudentScope(req) });
    const assessmentIds = Array.from(new Set(students.map((student) => String(student.assessmentId))));

    if (action === 'delete') {
      await AssessmentStudent.deleteMany({ _id: { $in: students.map((student) => student._id) }, ...getStudentScope(req) });
    } else {
      await AssessmentStudent.updateMany(
        { _id: { $in: students.map((student) => student._id) }, ...getStudentScope(req) },
        { $set: { examStatus: action === 'disable' ? 'blocked' : 'not_started' } }
      );
    }

    await Promise.all(assessmentIds.map((assessmentId) => syncAssessmentStudentCounts(assessmentId)));

    await writeAuditLog(req, {
      action: `student.bulk_${action}`,
      targetType: 'AssessmentStudent',
      newValue: { count: students.length },
    });

    return res.json({ message: 'Student bulk action completed.', count: students.length });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requirePermission('student.remove'), async (req, res, next) => {
  try {
    const student = await AssessmentStudent.findOne({ _id: req.params.id, ...getStudentScope(req) });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const assessmentId = student.assessmentId;
    await AssessmentStudent.deleteOne({ _id: student._id });
    await syncAssessmentStudentCounts(assessmentId);

    await writeAuditLog(req, {
      action: 'student.delete',
      targetType: 'AssessmentStudent',
      targetId: student._id,
      oldValue: {
        name: student.name,
        email: student.email,
        assessmentId,
      },
    });

    return res.json({ message: 'Student deleted.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
