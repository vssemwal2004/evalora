const mongoose = require('mongoose');

const assignedStudentSchema = new mongoose.Schema(
  {
    assessmentStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentStudent',
      required: true,
    },
    name: String,
    email: String,
    generatedExamId: String,
    courseName: String,
    courseId: String,
  },
  { _id: false }
);

const assessmentProctorSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    proctorProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProctorProfile',
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
    generatedProctorId: {
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
    assignedStudents: {
      type: [assignedStudentSchema],
      default: [],
    },
    assignedStudentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    mailStatus: {
      type: String,
      enum: ['not_sent', 'queued', 'sent', 'failed', 'resent'],
      default: 'not_sent',
      index: true,
    },
    activeStatus: {
      type: String,
      enum: ['offline', 'online'],
      default: 'offline',
      index: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

assessmentProctorSchema.index({ assessmentId: 1, email: 1 }, { unique: true });

assessmentProctorSchema.pre('save', function syncCount(next) {
  this.assignedStudentCount = this.assignedStudents.length;
  next();
});

module.exports = mongoose.model('AssessmentProctor', assessmentProctorSchema);
