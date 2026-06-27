const AuditLog = require('../models/AuditLog');

async function writeAuditLog(req, payload) {
  try {
    await AuditLog.create({
      actorId: req.user?._id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      ...payload,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
}

module.exports = {
  writeAuditLog,
};
