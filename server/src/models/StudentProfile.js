const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema(
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
    applicationNumber: {
      type: String,
      trim: true,
      index: true,
    },
    phone: {
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

studentProfileSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
