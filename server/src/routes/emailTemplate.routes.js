const express = require('express');
const EmailTemplate = require('../models/EmailTemplate');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { adminWriteLimiter } = require('../middleware/rateLimit');
const { validateBody, z } = require('../middleware/validate');
const { DEFAULT_EMAIL_TEMPLATES } = require('../services/emailTemplate.service');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();
const MAX_TEMPLATE_HTML_LENGTH = 150000;
const MAX_TEMPLATE_TEXT_LENGTH = 50000;
const MAX_TEMPLATE_SUBJECT_LENGTH = 200;
const templateKeySchema = z.string().trim().regex(/^[a-z0-9_.-]+$/i, 'Invalid template key.').max(120);
const templatePatchBodySchema = z
  .object({
    name: z.string().trim().max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    subject: z.string().trim().min(1).max(MAX_TEMPLATE_SUBJECT_LENGTH).optional(),
    html: z.string().min(1).max(MAX_TEMPLATE_HTML_LENGTH).optional(),
    text: z.string().min(1).max(MAX_TEMPLATE_TEXT_LENGTH).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));
router.param('key', (req, res, next, value) => {
  const result = templateKeySchema.safeParse(value);
  if (!result.success) {
    return res.status(400).json({ message: 'Invalid email template key.' });
  }

  req.params.key = result.data;
  return next();
});

function canView(req) {
  return req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes('email.template.view') || req.user.permissions.includes('email.template.manage');
}

function canManage(req) {
  return req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes('email.template.manage');
}

async function ensureDefaults() {
  const existing = await EmailTemplate.find({ key: { $in: DEFAULT_EMAIL_TEMPLATES.map((template) => template.key) } }).select('key');
  const existingKeys = new Set(existing.map((template) => template.key));
  const missing = DEFAULT_EMAIL_TEMPLATES.filter((template) => !existingKeys.has(template.key));

  if (missing.length > 0) {
    await EmailTemplate.insertMany(missing.map((template) => ({ ...template, status: 'active' })));
  }
}

function unsafeEmailHtmlReason(html) {
  const value = String(html || '');
  if (value.length > MAX_TEMPLATE_HTML_LENGTH) return 'HTML template is too large.';
  if (/<script[\s>]/i.test(value)) return 'Script tags are not allowed in email templates.';
  if (/\son[a-z]+\s*=/i.test(value)) return 'Inline event handlers are not allowed in email templates.';
  if (/javascript\s*:/i.test(value)) return 'javascript: URLs are not allowed in email templates.';
  return '';
}

router.get('/', async (req, res, next) => {
  try {
    if (!canView(req)) return res.status(403).json({ message: 'Permission denied.' });
    await ensureDefaults();

    const items = await EmailTemplate.find().sort({ audience: 1, name: 1 }).lean();
    return res.json({ items, defaultKeys: DEFAULT_EMAIL_TEMPLATES.map((template) => template.key) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:key', async (req, res, next) => {
  try {
    if (!canView(req)) return res.status(403).json({ message: 'Permission denied.' });
    await ensureDefaults();

    const template = await EmailTemplate.findOne({ key: req.params.key }).lean();
    if (!template) return res.status(404).json({ message: 'Email template not found.' });
    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:key', adminWriteLimiter, validateBody(templatePatchBodySchema), async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ message: 'Permission denied.' });
    await ensureDefaults();

    const { name, description, subject, html, text, status } = req.body;
    const template = await EmailTemplate.findOne({ key: req.params.key });
    if (!template) return res.status(404).json({ message: 'Email template not found.' });

    if (Object.prototype.hasOwnProperty.call(req.body, 'subject') && !String(subject || '').trim()) {
      return res.status(400).json({ message: 'Subject is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'subject') && String(subject).length > MAX_TEMPLATE_SUBJECT_LENGTH) {
      return res.status(400).json({ message: `Subject must be ${MAX_TEMPLATE_SUBJECT_LENGTH} characters or fewer.` });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'html') && !String(html || '').trim()) {
      return res.status(400).json({ message: 'HTML template is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'html')) {
      const unsafeReason = unsafeEmailHtmlReason(html);
      if (unsafeReason) return res.status(400).json({ message: unsafeReason });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'text') && !String(text || '').trim()) {
      return res.status(400).json({ message: 'Plain text template is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'text') && String(text).length > MAX_TEMPLATE_TEXT_LENGTH) {
      return res.status(400).json({ message: `Plain text template must be ${MAX_TEMPLATE_TEXT_LENGTH} characters or fewer.` });
    }

    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or inactive.' });
    }

    const oldValue = {
      name: template.name,
      subject: template.subject,
      status: template.status,
    };

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) template.name = String(name || '').trim() || template.name;
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) template.description = String(description || '').trim();
    if (Object.prototype.hasOwnProperty.call(req.body, 'subject')) template.subject = String(subject).trim();
    if (Object.prototype.hasOwnProperty.call(req.body, 'html')) template.html = String(html);
    if (Object.prototype.hasOwnProperty.call(req.body, 'text')) template.text = String(text);
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) template.status = status;
    template.updatedBy = req.user._id;
    await template.save();

    await writeAuditLog(req, {
      action: 'email.template.update',
      targetType: 'EmailTemplate',
      targetId: template._id,
      oldValue,
      newValue: {
        key: template.key,
        name: template.name,
        subject: template.subject,
        status: template.status,
      },
    });

    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

router.post('/:key/reset', adminWriteLimiter, async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ message: 'Permission denied.' });
    await ensureDefaults();

    const fallback = DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === req.params.key);
    if (!fallback) return res.status(404).json({ message: 'Default email template not found.' });

    const template = await EmailTemplate.findOneAndUpdate(
      { key: req.params.key },
      { ...fallback, status: 'active', updatedBy: req.user._id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await writeAuditLog(req, {
      action: 'email.template.reset',
      targetType: 'EmailTemplate',
      targetId: template._id,
      newValue: { key: template.key, name: template.name },
    });

    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
