const mongoose = require('mongoose');

const reportExportJobSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedByName: {
      type: String,
      trim: true,
    },
    requestedByEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    requestedByRole: {
      type: String,
      trim: true,
    },
    requestedPermissions: {
      type: [String],
      default: [],
    },
    assessmentTitle: {
      type: String,
      trim: true,
    },
    assessmentCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    format: {
      type: String,
      enum: ['csv'],
      default: 'csv',
      index: true,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    fields: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'expired'],
      default: 'queued',
      index: true,
    },
    rowCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    fileName: {
      type: String,
      trim: true,
    },
    filePath: {
      type: String,
      trim: true,
    },
    contentType: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    startedAt: Date,
    completedAt: Date,
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

reportExportJobSchema.index({ ownerAdminId: 1, createdAt: -1 });
reportExportJobSchema.index({ requestedBy: 1, createdAt: -1 });
reportExportJobSchema.index({ assessmentId: 1, createdAt: -1 });
reportExportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ReportExportJob', reportExportJobSchema);
