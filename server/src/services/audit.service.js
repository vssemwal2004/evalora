const AuditLog = require('../models/AuditLog');
const { ROLES } = require('../constants/roles');

function resolveOwnerAdminId(req, payload = {}) {
  if (payload.ownerAdminId) return payload.ownerAdminId;
  if (payload.metadata?.ownerAdminId) return payload.metadata.ownerAdminId;
  if (payload.newValue?.ownerAdminId) return payload.newValue.ownerAdminId;
  if (payload.oldValue?.ownerAdminId) return payload.oldValue.ownerAdminId;

  if (req.user?.role === ROLES.ADMIN) return req.user._id;
  if ([ROLES.FACULTY, ROLES.MODERATOR, ROLES.STUDENT, ROLES.PROCTOR].includes(req.user?.role)) {
    return req.user.ownerAdminId;
  }

  return undefined;
}

async function writeAuditLog(req, payload) {
  try {
    await AuditLog.create({
      actorId: req.user?._id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      ownerAdminId: resolveOwnerAdminId(req, payload),
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
