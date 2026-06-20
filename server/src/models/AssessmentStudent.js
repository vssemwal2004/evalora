const mongoose = require('mongoose');

const assessmentStudentSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
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
      index: true,
    },
    applicationNumber: {
      type: String,
      trim: true,
      index: true,
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    courseId: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    generatedExamId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
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
    eligibilityStatus: {
      type: String,
      enum: ['eligible', 'not_eligible', 'needs_review'],
      default: 'eligible',
      index: true,
    },
    eligibilityReason: {
      type: String,
      trim: true,
    },
    courseMatchStatus: {
      type: String,
      enum: ['matched_by_course_id', 'matched_by_course_name', 'not_matched'],
      default: 'not_matched',
      index: true,
    },
    mailStatus: {
      type: String,
      enum: ['not_sent', 'queued', 'sent', 'failed', 'resent'],
      default: 'not_sent',
      index: true,
    },
    examStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'submitted', 'ufm', 'blocked'],
      default: 'not_started',
      index: true,
    },
    assignedProctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

assessmentStudentSchema.index({ assessmentId: 1, email: 1 }, { unique: true });
assessmentStudentSchema.index({ assessmentId: 1, courseName: 1 });

module.exports = mongoose.model('AssessmentStudent', assessmentStudentSchema);
