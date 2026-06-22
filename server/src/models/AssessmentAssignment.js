const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    message: { type: String, trim: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const assessmentAssignmentSchema = new mongoose.Schema(
  {
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    ownerAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: String, trim: true, uppercase: true },
    courseName: { type: String, trim: true, required: true },
    courseSubdocumentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    moderatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    passwordPreview: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['assigned', 'in_progress', 'submitted', 'rejected', 'approved'],
      default: 'assigned',
      index: true,
    },
    rejectionReason: { type: String, trim: true },
    submittedAt: Date,
    reviewedAt: Date,
    facultyMail: { status: { type: String, default: 'pending' }, error: String, sentAt: Date },
    moderatorMail: { status: { type: String, default: 'not_sent' }, error: String, sentAt: Date },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

assessmentAssignmentSchema.index({ assessmentId: 1, courseSubdocumentId: 1 }, { unique: true });
assessmentAssignmentSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};
assessmentAssignmentSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

module.exports = mongoose.model('AssessmentAssignment', assessmentAssignmentSchema);
