const mongoose = require('mongoose');

const optionSnapshotSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      trim: true,
      required: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const assessmentQuestionSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    libraryQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      index: true,
    },
    sourcePaperHeading: {
      type: String,
      trim: true,
      index: true,
    },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['mcq', 'one_word'],
      required: true,
      index: true,
    },
    courseName: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    questionText: {
      type: String,
      trim: true,
      required: true,
    },
    options: {
      type: [optionSnapshotSchema],
      default: [],
    },
    expectedAnswer: {
      type: String,
      trim: true,
    },
    alternateAnswers: {
      type: [String],
      default: [],
    },
    positiveMarks: {
      type: Number,
      min: 0,
      default: 1,
    },
    negativeMarks: {
      type: Number,
      min: 0,
      default: 0,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    tags: {
      type: [String],
      default: [],
    },
    explanation: String,
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

assessmentQuestionSchema.index({ assessmentId: 1, courseName: 1, type: 1 });

module.exports = mongoose.model('AssessmentQuestion', assessmentQuestionSchema);
