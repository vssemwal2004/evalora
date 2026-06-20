const mongoose = require('mongoose');

const setupStepSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'passed', 'failed'],
      default: 'pending',
    },
    message: {
      type: String,
      trim: true,
    },
    completedAt: Date,
  },
  { _id: false }
);

const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    assessmentStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentStudent',
      required: true,
      index: true,
    },
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentProfile',
      required: true,
      index: true,
    },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['setup', 'in_progress', 'submitted', 'ufm', 'blocked', 'expired'],
      default: 'setup',
      index: true,
    },
    setupSteps: {
      type: [setupStepSchema],
      default: [],
    },
    passwordVerifiedAt: Date,
    startedAt: Date,
    allowedEndAt: Date,
    submittedAt: Date,
    lastHeartbeatAt: Date,
    securitySummary: {
      fullscreenExitCount: { type: Number, default: 0 },
      tabSwitchCount: { type: Number, default: 0 },
      warningCount: { type: Number, default: 0 },
      cameraIssueCount: { type: Number, default: 0 },
      microphoneIssueCount: { type: Number, default: 0 },
      aiAlertCount: { type: Number, default: 0 },
      noFaceCount: { type: Number, default: 0 },
      multipleFaceCount: { type: Number, default: 0 },
      lookingAwayCount: { type: Number, default: 0 },
    },
    securityScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    securityHold: {
      active: { type: Boolean, default: false },
      phase: { type: String, enum: ['none', 'grace', 'recheck', 'expired'], default: 'none' },
      reason: { type: String, trim: true },
      triggerType: { type: String, trim: true },
      detectedAt: Date,
      graceEndsAt: Date,
      recheckExpiresAt: Date,
      resolvedAt: Date,
    },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ assessmentId: 1, assessmentStudentId: 1 }, { unique: true });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
