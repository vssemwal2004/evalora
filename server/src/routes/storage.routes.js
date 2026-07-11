const express = require('express');
const mongoose = require('mongoose');
const AssessmentStudent = require('../models/AssessmentStudent');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody, validateQuery, z } = require('../middleware/validate');
const { createEvidenceUpload, isConfigured, uploadEvidenceBuffer } = require('../services/r2.service');

const router = express.Router();

const presignBodySchema = z.object({
  category: z.enum(['identity', 'snapshot', 'clip', 'recording']).default('snapshot'),
  assignmentId: z.string().trim().min(1).max(80).default('general'),
  filename: z.string().trim().min(1).max(120).default('evidence'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4']),
  size: z.coerce.number().int().min(1),
});
const identityUploadQuerySchema = z.object({
  assignmentId: z.string().trim().min(1).max(80),
  filename: z.string().trim().min(1).max(120).default('identity-evidence.jpg'),
});
const evidenceUploadQuerySchema = z.object({
  category: z.enum(['snapshot', 'clip', 'recording']).default('snapshot'),
  assignmentId: z.string().trim().min(1).max(80),
  filename: z.string().trim().min(1).max(120).default('evidence'),
});
const identityImageParser = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '2mb',
});
const evidenceParser = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'],
  limit: '512mb',
});

async function assertStudentCanUploadEvidence(req, assignmentId, message = 'Evidence upload is not allowed for this exam.') {
  if (req.user.role !== ROLES.STUDENT) return;
  if (!mongoose.isValidObjectId(assignmentId)) {
    const error = new Error('Assigned exam not found.');
    error.statusCode = 404;
    throw error;
  }
  const assignment = await AssessmentStudent.findOne({
    _id: assignmentId,
    $or: [{ email: req.user.email }, { generatedExamId: req.user.loginId }],
  }).select('_id');
  if (!assignment) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PROCTOR, ROLES.STUDENT));

router.get('/r2/status', (_req, res) => {
  return res.json({ configured: isConfigured() });
});

router.post('/r2/presign', validateBody(presignBodySchema), async (req, res, next) => {
  try {
    await assertStudentCanUploadEvidence(req, req.body.assignmentId);

    const upload = createEvidenceUpload({
      category: req.body.category,
      ownerId: req.user._id,
      assignmentId: req.body.assignmentId,
      filename: req.body.filename,
      contentType: req.body.contentType,
      size: req.body.size,
    });

    return res.json(upload);
  } catch (error) {
    error.statusCode = error.message.includes('configured') ? 503 : 400;
    return next(error);
  }
});

router.post('/r2/upload-identity', validateQuery(identityUploadQuerySchema), identityImageParser, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Choose a valid JPG, PNG, or WebP identity photo.' });
    }
    if (!mongoose.isValidObjectId(req.query.assignmentId)) {
      return res.status(404).json({ message: 'Assigned exam not found.' });
    }

    await assertStudentCanUploadEvidence(req, req.query.assignmentId, 'Photo upload is not allowed for this exam.');

    const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const upload = await uploadEvidenceBuffer({
      category: 'identity',
      ownerId: req.user._id,
      assignmentId: req.query.assignmentId,
      filename: req.query.filename,
      contentType,
      buffer: req.body,
    });

    return res.status(201).json(upload);
  } catch (error) {
    if (!error.statusCode) error.statusCode = error.message.includes('configured') ? 503 : 400;
    return next(error);
  }
});

router.post('/r2/upload-evidence', validateQuery(evidenceUploadQuerySchema), evidenceParser, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Choose valid evidence to upload.' });
    }

    await assertStudentCanUploadEvidence(req, req.query.assignmentId);

    const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const upload = await uploadEvidenceBuffer({
      category: req.query.category,
      ownerId: req.user._id,
      assignmentId: req.query.assignmentId,
      filename: req.query.filename,
      contentType,
      buffer: req.body,
    });

    return res.status(201).json(upload);
  } catch (error) {
    if (!error.statusCode) error.statusCode = error.message.includes('configured') ? 503 : 400;
    return next(error);
  }
});

module.exports = router;
