const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { ROLES, ADMIN_PERMISSIONS, STAFF_PERMISSIONS } = require('../constants/roles');

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
    passwordPreview: {
      type: String,
      select: false,
    },
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
  },
  { timestamps: true }
);

userSchema.index({ email: 1, role: 1 });
userSchema.index({ loginId: 1, role: 1 });
userSchema.index({ ownerAdminId: 1, role: 1 });

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

module.exports = mongoose.model('User', userSchema);
