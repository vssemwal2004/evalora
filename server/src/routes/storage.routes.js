const express = require('express');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody, z } = require('../middleware/validate');
const { createEvidenceUpload, isConfigured } = require('../services/r2.service');

const router = express.Router();

const presignBodySchema = z.object({
  category: z.enum(['identity', 'snapshot', 'clip', 'recording']).default('snapshot'),
  assignmentId: z.string().trim().min(1).max(80).default('general'),
  filename: z.string().trim().min(1).max(120).default('evidence'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4']),
  size: z.coerce.number().int().min(1),
});

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PROCTOR, ROLES.STUDENT));

router.get('/r2/status', (_req, res) => {
  return res.json({ configured: isConfigured() });
});

router.post('/r2/presign', validateBody(presignBodySchema), (req, res, next) => {
  try {
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

module.exports = router;
