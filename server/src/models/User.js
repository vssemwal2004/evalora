const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { ROLES, ADMIN_PERMISSIONS, STAFF_PERMISSIONS } = require('../constants/roles');
const { encryptedStringField } = require('../utils/fieldEncryption');

const assignedCourseSchema = new mongoose.Schema(
  {
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    loginId: {
      type: String,
      trim: true,
      index: true,
    },
    uniqueUsername: {
      type: String,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    passwordPreview: encryptedStringField(),
    mustChangePassword: {
      type: Boolean,
      default: false,
      index: true,
    },
    passwordChangedAt: Date,
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          return value.every((permission) => [...ADMIN_PERMISSIONS, ...STAFF_PERMISSIONS].includes(permission));
        },
        message: 'Invalid admin permission found.',
      },
    },
    assignedCourses: {
      type: [assignedCourseSchema],
      default: [],
    },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    lastLoginAt: Date,
    activeSessionId: {
      type: String,
      select: false,
    },
    tokenInvalidBefore: {
      type: Date,
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lastFailedLoginAt: {
      type: Date,
      select: false,
    },
    loginLockedUntil: {
      type: Date,
      select: false,
      index: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1, role: 1 });
userSchema.index({ loginId: 1, role: 1 });
userSchema.index({ ownerAdminId: 1, role: 1 });
userSchema.index({ ownerAdminId: 1, role: 1, status: 1, createdAt: -1 });
userSchema.index({ role: 1, status: 1, createdAt: -1 });

userSchema.methods.comparePassword = function comparePassword(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.isLoginLocked = function isLoginLocked() {
  return Boolean(this.loginLockedUntil && this.loginLockedUntil.getTime() > Date.now());
};

userSchema.methods.recordFailedLogin = async function recordFailedLogin({ maxAttempts, windowMs, lockMs }) {
  const now = new Date();
  const lastFailedAt = this.lastFailedLoginAt ? this.lastFailedLoginAt.getTime() : 0;
  const inWindow = lastFailedAt && now.getTime() - lastFailedAt <= windowMs;
  const nextAttempts = inWindow ? Number(this.failedLoginAttempts || 0) + 1 : 1;

  this.failedLoginAttempts = nextAttempts;
  this.lastFailedLoginAt = now;

  if (nextAttempts >= maxAttempts) {
    this.loginLockedUntil = new Date(now.getTime() + lockMs);
  }

  await this.save();
  return this;
};

userSchema.methods.clearLoginFailures = async function clearLoginFailures() {
  this.failedLoginAttempts = 0;
  this.lastFailedLoginAt = undefined;
  this.loginLockedUntil = undefined;
  await this.save();
  return this;
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

userSchema.set('toObject', { getters: true });
userSchema.set('toJSON', {
  getters: true,
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordPreview;
    delete ret.activeSessionId;
    delete ret.tokenInvalidBefore;
    delete ret.failedLoginAttempts;
    delete ret.lastFailedLoginAt;
    delete ret.loginLockedUntil;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
