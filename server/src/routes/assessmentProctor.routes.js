const express = require('express');
const User = require('../models/User');
const Assessment = require('../models/Assessment');
const AssessmentProctor = require('../models/AssessmentProctor');
const AssessmentStudent = require('../models/AssessmentStudent');
const ProctorProfile = require('../models/ProctorProfile');
const { ROLES } = require('../constants/roles');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { adminWriteLimiter, mailSendLimiter } = require('../middleware/rateLimit');
const { validateBody, validateObjectIdParams, z } = require('../middleware/validate');
const { writeAuditLog } = require('../services/audit.service');
const { sendProctorCredentialMail } = require('../services/credentialMail.service');
const { generatePassword, generateProctorId } = require('../utils/credentials');

const router = express.Router({ mergeParams: true });
const addProctorBodySchema = z.object({
  name: z.string().trim().min(1, 'Proctor name is required.').max(160),
  email: z.string().trim().toLowerCase().email('Valid proctor email is required.').max(320),
  phone: z.string().trim().max(40).optional().default(''),
  department: z.string().trim().max(160).optional().default(''),
});
const capacityBodySchema = z.object({
  capacity: z.coerce.number().int().min(1).max(500).optional().default(50),
});

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));
router.use(validateObjectIdParams('assessmentId'));

function getAssessmentScope(req) {
  return req.user.role === ROLES.SUPER_ADMIN ? {} : { ownerAdminId: req.user._id };
}

async function findScopedAssessment(req) {
  return Assessment.findOne({ _id: req.params.assessmentId, ...getAssessmentScope(req) });
}

async function syncAssessmentProctorCount(assessmentId) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return;

  assessment.counts.proctors = await AssessmentProctor.countDocuments({ assessmentId });
  await assessment.save();
}

async function ensureProctorLoginUser(proctor) {
  let user = await User.findOne({ email: proctor.email, role: ROLES.PROCTOR }).select('+passwordHash +passwordPreview');
  let loginPassword = user?.passwordPreview;

  if (!loginPassword) {
    loginPassword = generatePassword(12);
  }

  const passwordHash = user?.passwordPreview ? user.passwordHash : await User.hashPassword(loginPassword);

  user = await User.findOneAndUpdate(
    { email: proctor.email, role: ROLES.PROCTOR },
    {
      $set: {
        name: proctor.name,
        email: proctor.email,
        loginId: proctor.generatedProctorId,
        uniqueUsername: proctor.generatedProctorId,
        passwordHash,
        passwordPreview: loginPassword,
        role: ROLES.PROCTOR,
        status: 'active',
        mustChangePassword: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).select('+passwordPreview');

  return user.passwordPreview;
}

async function withLoginPasswordPreviews(proctors) {
  const items = [];

  for (const proctor of proctors) {
    const loginPasswordPreview = await ensureProctorLoginUser(proctor);
    items.push({
      ...proctor.toObject(),
      loginPasswordPreview,
    });
  }

  return items;
}

function createDistributionPlan(totalStudents, totalProctors, capacity) {
  const safeCapacity = Math.max(Number(capacity || 50), 1);
  const requiredProctors = Math.ceil(totalStudents / safeCapacity);
  const availableCapacity = totalProctors * safeCapacity;
  const possible = availableCapacity >= totalStudents;

  return {
    totalStudents,
    totalProctors,
    capacity: safeCapacity,
    requiredProctors,
    availableCapacity,
    possible,
    warning: possible
      ? ''
      : `Need at least ${requiredProctors} proctors for ${totalStudents} students at ${safeCapacity} students per proctor.`,
  };
}

router.get('/', requirePermission('assessment.view'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const items = await AssessmentProctor.find({ assessmentId: assessment._id })
      .sort({ createdAt: -1 })
      .select('+passwordPreview');

    const totalEligibleStudents = await AssessmentStudent.countDocuments({
      assessmentId: assessment._id,
      eligibilityStatus: 'eligible',
    });

    const assignedStudentIds = new Set(
      items.flatMap((proctor) => proctor.assignedStudents.map((student) => student.assessmentStudentId.toString()))
    );

    return res.json({
      items: await withLoginPasswordPreviews(items),
      summary: {
        totalEligibleStudents,
        assignedStudents: assignedStudentIds.size,
        unassignedStudents: Math.max(totalEligibleStudents - assignedStudentIds.size, 0),
        totalProctors: items.length,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', adminWriteLimiter, validateBody(addProctorBodySchema), requirePermission('proctor.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const { name, email, phone, department } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Proctor name and email are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const proctorProfile = await ProctorProfile.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          name,
          email: normalizedEmail,
          phone,
          department,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    let generatedProctorId = generateProctorId();
    while (await AssessmentProctor.exists({ generatedProctorId })) {
      generatedProctorId = generateProctorId();
    }

    const plainPassword = generatePassword(10);
    const passwordHash = await User.hashPassword(plainPassword);

    const assignment = await AssessmentProctor.create({
      assessmentId: assessment._id,
      proctorProfileId: proctorProfile._id,
      ownerAdminId: assessment.ownerAdminId,
      name,
      email: normalizedEmail,
      generatedProctorId,
      passwordHash,
      passwordPreview: plainPassword,
      addedBy: req.user._id,
    });
    const loginPasswordPreview = await ensureProctorLoginUser(assignment);

    await syncAssessmentProctorCount(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.proctor.add',
      targetType: 'AssessmentProctor',
      targetId: assignment._id,
      newValue: {
        assessmentId: assessment._id,
        email: normalizedEmail,
        generatedProctorId,
      },
    });

    return res.status(201).json({
      proctor: {
        ...assignment.toObject(),
        passwordPreview: plainPassword,
        loginPasswordPreview,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Proctor is already added to this assessment.' });
    }

    return next(error);
  }
});

router.post('/distribution-plan', adminWriteLimiter, validateBody(capacityBodySchema), requirePermission('proctor.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const capacity = Number(req.body.capacity || 50);
    const [totalStudents, totalProctors] = await Promise.all([
      AssessmentStudent.countDocuments({ assessmentId: assessment._id, eligibilityStatus: 'eligible' }),
      AssessmentProctor.countDocuments({ assessmentId: assessment._id }),
    ]);

    return res.json({ plan: createDistributionPlan(totalStudents, totalProctors, capacity) });
  } catch (error) {
    return next(error);
  }
});

router.post('/auto-assign', adminWriteLimiter, validateBody(capacityBodySchema), requirePermission('proctor.add'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const capacity = Math.max(Number(req.body.capacity || 50), 1);
    const [students, proctors] = await Promise.all([
      AssessmentStudent.find({ assessmentId: assessment._id, eligibilityStatus: 'eligible' }).sort({ courseName: 1, createdAt: 1 }),
      AssessmentProctor.find({ assessmentId: assessment._id }).sort({ createdAt: 1 }),
    ]);

    if (proctors.length === 0) {
      return res.status(400).json({ message: 'Add at least one proctor before assignment.' });
    }

    const plan = createDistributionPlan(students.length, proctors.length, capacity);
    if (!plan.possible) {
      return res.status(400).json({ message: plan.warning, plan });
    }

    await AssessmentProctor.updateMany({ assessmentId: assessment._id }, { $set: { assignedStudents: [], assignedStudentCount: 0 } });

    const bulkStudentUpdates = [];
    proctors.forEach((proctor) => {
      proctor.assignedStudents = [];
    });

    students.forEach((student, index) => {
      const proctorIndex = Math.floor(index / capacity);
      const proctor = proctors[proctorIndex];
      const assignedStudent = {
        assessmentStudentId: student._id,
        name: student.name,
        email: student.email,
        generatedExamId: student.generatedExamId,
        courseName: student.courseName,
        courseId: student.courseId,
      };

      proctor.assignedStudents.push(assignedStudent);
      bulkStudentUpdates.push({
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { assignedProctorId: proctor._id } },
        },
      });
    });

    const proctorWrites = proctors.map((proctor) => ({
      updateOne: {
        filter: { _id: proctor._id },
        update: {
          $set: {
            assignedStudents: proctor.assignedStudents,
            assignedStudentCount: proctor.assignedStudents.length,
          },
        },
      },
    }));

    if (proctorWrites.length > 0) {
      await AssessmentProctor.bulkWrite(proctorWrites);
    }

    if (bulkStudentUpdates.length > 0) {
      await AssessmentStudent.bulkWrite(bulkStudentUpdates);
    }

    await writeAuditLog(req, {
      action: 'assessment.proctor.auto_assign',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        capacity,
        assignedStudents: students.length,
        proctors: proctors.length,
      },
    });

    return res.json({
      plan,
      assignedStudents: students.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/send-mail', mailSendLimiter, requirePermission('mail.send'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const proctors = await AssessmentProctor.find({ assessmentId: assessment._id }).select('+passwordPreview');
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const proctor of proctors) {
      if (['sent', 'resent'].includes(proctor.mailStatus)) {
        skipped += 1;
        continue;
      }

      try {
        const loginPassword = await ensureProctorLoginUser(proctor);
        await sendProctorCredentialMail({ assessment, proctor, loginPassword });
        proctor.mailStatus = 'sent';
        await proctor.save();
        sent += 1;
      } catch (mailError) {
        proctor.mailStatus = 'failed';
        await proctor.save().catch(() => null);
        failed += 1;
      }
    }

    await writeAuditLog(req, {
      action: 'assessment.proctor.bulk_send_mail',
      targetType: 'Assessment',
      targetId: assessment._id,
      newValue: {
        sent,
        failed,
        skipped,
        total: proctors.length,
      },
    });

    return res.json({
      message: sent > 0 ? 'Proctor credential mails sent successfully.' : 'No pending proctor mails were sent.',
      sent,
      failed,
      skipped,
      total: proctors.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:proctorId/send-mail', mailSendLimiter, validateObjectIdParams('proctorId'), requirePermission('mail.send'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const proctor = await AssessmentProctor.findOne({
      _id: req.params.proctorId,
      assessmentId: assessment._id,
    }).select('+passwordPreview');

    if (!proctor) {
      return res.status(404).json({ message: 'Proctor not found in this assessment.' });
    }

    const loginPassword = await ensureProctorLoginUser(proctor);
    await sendProctorCredentialMail({ assessment, proctor, loginPassword });

    proctor.mailStatus = ['sent', 'resent'].includes(proctor.mailStatus) ? 'resent' : 'sent';
    await proctor.save();

    await writeAuditLog(req, {
      action: 'assessment.proctor.send_mail',
      targetType: 'AssessmentProctor',
      targetId: proctor._id,
      newValue: {
        assessmentId: assessment._id,
        email: proctor.email,
        mailStatus: proctor.mailStatus,
      },
    });

    return res.json({
      item: proctor,
      message: 'Proctor credential mail sent successfully.',
    });
  } catch (error) {
    const assessment = await findScopedAssessment(req).catch(() => null);
    const proctor = assessment
      ? await AssessmentProctor.findOne({
          _id: req.params.proctorId,
          assessmentId: assessment._id,
        }).catch(() => null)
      : null;

    if (proctor) {
      proctor.mailStatus = 'failed';
      await proctor.save().catch(() => null);
    }

    return next(error);
  }
});

router.delete('/:proctorId', adminWriteLimiter, validateObjectIdParams('proctorId'), requirePermission('proctor.remove'), async (req, res, next) => {
  try {
    const assessment = await findScopedAssessment(req);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found.' });
    }

    const proctor = await AssessmentProctor.findOne({
      _id: req.params.proctorId,
      assessmentId: assessment._id,
    }).select('+passwordPreview');

    if (!proctor) {
      return res.status(404).json({ message: 'Proctor not found in this assessment.' });
    }

    await AssessmentStudent.updateMany(
      { assessmentId: assessment._id, assignedProctorId: proctor._id },
      { $unset: { assignedProctorId: '' } }
    );
    await AssessmentProctor.deleteOne({ _id: proctor._id });
    await syncAssessmentProctorCount(assessment._id);

    await writeAuditLog(req, {
      action: 'assessment.proctor.delete',
      targetType: 'AssessmentProctor',
      targetId: proctor._id,
      oldValue: {
        assessmentId: assessment._id,
        name: proctor.name,
        email: proctor.email,
        generatedProctorId: proctor.generatedProctorId,
        assignedStudentCount: proctor.assignedStudentCount,
      },
    });

    return res.json({ message: 'Proctor removed from this assessment.', id: proctor._id });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
