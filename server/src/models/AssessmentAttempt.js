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
    identityVerification: {
      status: {
        type: String,
        enum: ['not_started', 'passed', 'failed', 'manual_review'],
        default: 'not_started',
        index: true,
      },
      matchPercentage: { type: Number, default: 0, min: 0, max: 100 },
      distance: { type: Number, default: null },
      threshold: { type: Number, default: 0.6 },
      selfieImage: { type: String, default: '' },
      idCardImage: { type: String, default: '' },
      selfieStorageKey: { type: String, default: '' },
      idCardStorageKey: { type: String, default: '' },
      selfieDescriptor: { type: [Number], default: undefined },
      idCardDescriptor: { type: [Number], default: undefined },
      capturedAt: Date,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      reviewedAt: Date,
      reviewNote: { type: String, trim: true },
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
    scoreSummary: {
      processedAt: Date,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      totalQuestions: { type: Number, default: 0 },
      answered: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
      wrong: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      markedForReview: { type: Number, default: 0 },
      score: { type: Number, default: 0 },
      maxMarks: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
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
assessmentAttemptSchema.index({ assessmentId: 1, status: 1, lastHeartbeatAt: -1 });
assessmentAttemptSchema.index({ ownerAdminId: 1, status: 1, updatedAt: -1 });
assessmentAttemptSchema.index({ assessmentId: 1, assessmentStudentId: 1, status: 1 });
assessmentAttemptSchema.index({ assessmentId: 1, lastHeartbeatAt: -1 });
assessmentAttemptSchema.index({ assessmentId: 1, submittedAt: -1 });
assessmentAttemptSchema.index({ assessmentId: 1, status: 1, submittedAt: -1 });
assessmentAttemptSchema.index({ assessmentId: 1, 'scoreSummary.score': 1 });
assessmentAttemptSchema.index({ assessmentId: 1, 'identityVerification.status': 1, securityScore: -1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
