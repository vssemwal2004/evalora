const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const roleOptions = [
  { role: ROLES.ADMIN, label: 'Admins', permission: null },
  { role: ROLES.FACULTY, label: 'Faculty', permission: 'activity.faculty.view' },
  { role: ROLES.MODERATOR, label: 'Moderators', permission: 'activity.moderator.view' },
];

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN));

function hasPermission(req, permission) {
  return req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.includes(permission) || req.user.permissions.includes('audit.view');
}

function getAvailableRoles(req) {
  if (req.user.role === ROLES.SUPER_ADMIN) return roleOptions;
  return roleOptions.filter((option) => {
    if (option.role === ROLES.ADMIN) return false;
    const allPermission = option.role === ROLES.FACULTY ? 'faculty.view.all' : option.role === ROLES.MODERATOR ? 'moderator.view.all' : '';
    return hasPermission(req, option.permission) || req.user.permissions.includes(allPermission);
  });
}

function getRoleOption(req, role) {
  return getAvailableRoles(req).find((option) => option.role === role);
}

function getUserScope(req, role) {
  const scope = { role };
  const allPermission = role === ROLES.FACULTY ? 'faculty.view.all' : role === ROLES.MODERATOR ? 'moderator.view.all' : '';
  if (req.user.role === ROLES.ADMIN && !req.user.permissions.includes(allPermission)) {
    scope.ownerAdminId = req.user._id;
  }
  return scope;
}

function serializeUser(user) {
  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    loginId: user.loginId,
    role: user.role,
    status: user.status,
    permissions: user.permissions || [],
    ownerAdminId: user.ownerAdminId,
    assignedCourses: user.assignedCourses || [],
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function serializeLog(log) {
  return {
    id: log._id,
    action: log.action,
    actorRole: log.actorRole,
    actorName: log.actorName,
    actorEmail: log.actorEmail,
    targetType: log.targetType,
    targetId: log.targetId,
    reason: log.reason,
    metadata: log.metadata,
    oldValue: log.oldValue,
    newValue: log.newValue,
    ip: log.ip,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  };
}

router.get('/roles', (req, res) => {
  return res.json({ roles: getAvailableRoles(req) });
});

router.get('/users', async (req, res, next) => {
  try {
    const role = String(req.query.role || '').trim();
    const option = getRoleOption(req, role);
    if (!option) {
      return res.status(403).json({ message: 'You do not have permission to view this activity role.' });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const search = String(req.query.search || '').trim();
    const query = getUserScope(req, role);

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { loginId: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name email loginId role status permissions ownerAdminId assignedCourses lastLoginAt createdAt updatedAt'),
      User.countDocuments(query),
    ]);

    return res.json({
      items: items.map(serializeUser),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      retentionDays: 10,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/:id/logs', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id.' });
    }

    const user = await User.findById(req.params.id).select('name email loginId role status ownerAdminId assignedCourses createdAt lastLoginAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const option = getRoleOption(req, user.role);
    const allPermission = user.role === ROLES.FACULTY ? 'faculty.view.all' : user.role === ROLES.MODERATOR ? 'moderator.view.all' : '';
    const isOwnedByAdmin =
      req.user.role !== ROLES.ADMIN || req.user.permissions.includes(allPermission) || String(user.ownerAdminId) === String(req.user._id);
    if (!option || !isOwnedByAdmin) {
      return res.status(403).json({ message: 'You do not have permission to view this user activity.' });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const action = String(req.query.action || '').trim();
    const since = new Date(Date.now() - TEN_DAYS_MS);
    const query = {
      actorId: user._id,
      createdAt: { $gte: since },
      action: { $not: { $regex: '^request\\.' } },
    };

    if (action) {
      query.$and = [
        { action: { $not: { $regex: '^request\\.' } } },
        { action: { $regex: action, $options: 'i' } },
      ];
      delete query.action;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments(query),
    ]);

    return res.json({
      user: serializeUser(user),
      items: items.map(serializeLog),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      retentionDays: 10,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
