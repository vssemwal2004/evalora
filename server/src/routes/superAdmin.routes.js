const express = require('express');
const User = require('../models/User');
const { ADMIN_PERMISSIONS, ROLES } = require('../constants/roles');
const { authenticate, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit.service');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/admins', async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    const query = { role: ROLES.ADMIN };

    if (status) {
      query.status = status;
    }

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
        .select('name email loginId role status permissions lastLoginAt createdAt updatedAt'),
      User.countDocuments(query),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      availablePermissions: ADMIN_PERMISSIONS,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admins', async (req, res, next) => {
  try {
    const { name, email, password, permissions = [] } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { loginId: normalizedEmail }, { uniqueUsername: normalizedEmail }],
    }).select('email loginId uniqueUsername role');

    if (existing) {
      if (!existing.role && existing.email === normalizedEmail) {
        existing.name = name;
        existing.email = normalizedEmail;
        existing.loginId = normalizedEmail;
        existing.uniqueUsername = existing.uniqueUsername || normalizedEmail;
        existing.passwordHash = await User.hashPassword(password);
        existing.mustChangePassword = true;
        existing.passwordChangedAt = undefined;
        existing.role = ROLES.ADMIN;
        existing.status = 'active';
        existing.permissions = permissions;
        await existing.save();

        await writeAuditLog(req, {
          action: 'admin.create',
          targetType: 'User',
          targetId: existing._id,
          newValue: {
            name: existing.name,
            email: existing.email,
            permissions: existing.permissions,
            migratedLegacyUser: true,
          },
        });

        return res.status(201).json({
          admin: {
            id: existing._id,
            name: existing.name,
            email: existing.email,
            loginId: existing.loginId,
            role: existing.role,
            status: existing.status,
            permissions: existing.permissions,
          },
        });
      }

      return res.status(409).json({
        message:
          existing.role === ROLES.ADMIN
            ? 'Admin with this email already exists.'
            : 'This email or login ID is already assigned to another account.',
      });
    }

    const invalidPermissions = permissions.filter((permission) => !ADMIN_PERMISSIONS.includes(permission));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ message: `Invalid permissions: ${invalidPermissions.join(', ')}` });
    }

    const admin = await User.create({
      name,
      email: normalizedEmail,
      loginId: normalizedEmail,
      uniqueUsername: normalizedEmail,
      passwordHash: await User.hashPassword(password),
      role: ROLES.ADMIN,
      permissions,
      mustChangePassword: true,
    });

    await writeAuditLog(req, {
      action: 'admin.create',
      targetType: 'User',
      targetId: admin._id,
      newValue: {
        name: admin.name,
        email: admin.email,
        permissions: admin.permissions,
      },
    });

    return res.status(201).json({
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        loginId: admin.loginId,
        role: admin.role,
        status: admin.status,
        permissions: admin.permissions,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const fieldLabel =
        duplicateField === 'email'
          ? 'email'
          : duplicateField === 'uniqueUsername' || duplicateField === 'loginId'
            ? 'login ID'
            : 'value';

      return res.status(409).json({
        message: `This ${fieldLabel} is already assigned to another account.`,
      });
    }

    return next(error);
  }
});

router.patch('/admins/:id', async (req, res, next) => {
  try {
    const { name, email, permissions, status } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: ROLES.ADMIN });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const updates = {};

    if (typeof name === 'string' && name.trim()) {
      updates.name = name.trim();
    }

    if (typeof email === 'string' && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const conflictingUser = await User.findOne({
        _id: { $ne: admin._id },
        $or: [{ email: normalizedEmail }, { loginId: normalizedEmail }, { uniqueUsername: normalizedEmail }],
      }).select('_id');

      if (conflictingUser) {
        return res.status(409).json({ message: 'This email or login ID is already assigned to another account.' });
      }

      updates.email = normalizedEmail;
      updates.loginId = normalizedEmail;
      updates.uniqueUsername = normalizedEmail;
    }

    if (permissions !== undefined) {
      const nextPermissions = Array.isArray(permissions) ? permissions : [];
      const invalidPermissions = nextPermissions.filter((permission) => !ADMIN_PERMISSIONS.includes(permission));

      if (invalidPermissions.length > 0) {
        return res.status(400).json({ message: `Invalid permissions: ${invalidPermissions.join(', ')}` });
      }

      updates.permissions = nextPermissions;
    }

    if (status !== undefined) {
      if (!['active', 'inactive', 'blocked'].includes(status)) {
        return res.status(400).json({ message: 'Invalid admin status.' });
      }

      updates.status = status;
    }

    const oldValue = {
      name: admin.name,
      email: admin.email,
      loginId: admin.loginId,
      uniqueUsername: admin.uniqueUsername,
      permissions: admin.permissions,
      status: admin.status,
    };

    Object.assign(admin, updates);
    await admin.save();

    await writeAuditLog(req, {
      action: 'admin.update',
      targetType: 'User',
      targetId: admin._id,
      oldValue,
      newValue: {
        name: admin.name,
        email: admin.email,
        loginId: admin.loginId,
        uniqueUsername: admin.uniqueUsername,
        permissions: admin.permissions,
        status: admin.status,
      },
    });

    return res.json({ admin });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'This email or login ID is already assigned to another account.',
      });
    }

    return next(error);
  }
});

router.patch('/admins/:id/permissions', async (req, res, next) => {
  try {
    const { permissions = [] } = req.body;
    const invalidPermissions = permissions.filter((permission) => !ADMIN_PERMISSIONS.includes(permission));

    if (invalidPermissions.length > 0) {
      return res.status(400).json({ message: `Invalid permissions: ${invalidPermissions.join(', ')}` });
    }

    const admin = await User.findOne({ _id: req.params.id, role: ROLES.ADMIN });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const oldValue = { permissions: admin.permissions };
    admin.permissions = permissions;
    await admin.save();

    await writeAuditLog(req, {
      action: 'admin.permissions.update',
      targetType: 'User',
      targetId: admin._id,
      oldValue,
      newValue: { permissions: admin.permissions },
    });

    return res.json({ admin });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admins/:id/status', async (req, res, next) => {
  try {
    const { status, reason } = req.body;

    if (!['active', 'inactive', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid admin status.' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: ROLES.ADMIN });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const oldValue = { status: admin.status };
    admin.status = status;
    await admin.save();

    await writeAuditLog(req, {
      action: 'admin.status.update',
      targetType: 'User',
      targetId: admin._id,
      oldValue,
      newValue: { status },
      reason,
    });

    return res.json({ admin });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admins/:id', async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: ROLES.ADMIN });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    await User.deleteOne({ _id: admin._id });

    await writeAuditLog(req, {
      action: 'admin.delete',
      targetType: 'User',
      targetId: admin._id,
      oldValue: {
        name: admin.name,
        email: admin.email,
        status: admin.status,
        permissions: admin.permissions,
      },
    });

    return res.json({ message: 'Admin permanently deleted.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
