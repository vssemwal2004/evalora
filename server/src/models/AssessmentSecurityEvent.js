const mongoose = require('mongoose');

const assessmentSecurityEventSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentAttempt',
      required: true,
      index: true,
    },
    assessmentStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentStudent',
      required: true,
      index: true,
    },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'fullscreen_exit',
        'tab_switch',
        'window_blur',
        'copy_blocked',
        'paste_blocked',
        'cut_blocked',
        'right_click_blocked',
        'camera_missing',
        'microphone_missing',
        'camera_movement',
        'ai_unavailable',
        'ai_no_face',
        'ai_multiple_faces',
        'ai_looking_away',
        'ai_camera_blocked',
        'ai_mobile_detected',
        'shortcut_attempt',
        'screenshot_attempt',
        'duplicate_tab',
        'idle_detected',
        'identity_verification',
        'exam_recording',
        'exam_camera_recording',
        'noise_detected',
        'ufm_pending',
        'heartbeat',
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'warning',
      index: true,
    },
    score: {
      type: Number,
      default: 1,
      min: 0,
    },
    message: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

assessmentSecurityEventSchema.index({ attemptId: 1, type: 1, occurredAt: -1 });
assessmentSecurityEventSchema.index({ assessmentId: 1, assessmentStudentId: 1, occurredAt: -1 });
assessmentSecurityEventSchema.index({ assessmentId: 1, occurredAt: -1 });
assessmentSecurityEventSchema.index({ assessmentId: 1, severity: 1, occurredAt: -1 });
assessmentSecurityEventSchema.index({ ownerAdminId: 1, occurredAt: -1 });
assessmentSecurityEventSchema.index({ assessmentId: 1, severity: 1, assessmentStudentId: 1, occurredAt: -1 });

module.exports = mongoose.model('AssessmentSecurityEvent', assessmentSecurityEventSchema);
