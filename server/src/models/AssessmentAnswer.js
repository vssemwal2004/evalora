const mongoose = require('mongoose');

const assessmentAnswerSchema = new mongoose.Schema(
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
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentQuestion',
      required: true,
      index: true,
    },
    questionType: {
      type: String,
      enum: ['mcq', 'one_word'],
      required: true,
    },
    selectedOptionId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    textAnswer: {
      type: String,
      trim: true,
    },
    markedForReview: {
      type: Boolean,
      default: false,
    },
    answered: {
      type: Boolean,
      default: false,
      index: true,
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

assessmentAnswerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('AssessmentAnswer', assessmentAnswerSchema);
