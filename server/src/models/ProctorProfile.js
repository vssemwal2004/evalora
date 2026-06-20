const mongoose = require('mongoose');

const proctorProfileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

proctorProfileSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('ProctorProfile', proctorProfileSchema);
