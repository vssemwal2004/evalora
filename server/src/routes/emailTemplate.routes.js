const express = require('express');
const EmailTemplate = require('../models/EmailTemplate');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_EMAIL_TEMPLATES } = require('../services/emailTemplate.service');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

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

router.patch('/:key', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ message: 'Permission denied.' });
    await ensureDefaults();

    const { name, description, subject, html, text, status } = req.body;
    const template = await EmailTemplate.findOne({ key: req.params.key });
    if (!template) return res.status(404).json({ message: 'Email template not found.' });

    if (Object.prototype.hasOwnProperty.call(req.body, 'subject') && !String(subject || '').trim()) {
      return res.status(400).json({ message: 'Subject is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'html') && !String(html || '').trim()) {
      return res.status(400).json({ message: 'HTML template is required.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'text') && !String(text || '').trim()) {
      return res.status(400).json({ message: 'Plain text template is required.' });
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

router.post('/:key/reset', async (req, res, next) => {
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
