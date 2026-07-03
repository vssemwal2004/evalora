const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
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

const questionSchema = new mongoose.Schema(
  {
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
    paperHeading: {
      type: String,
      trim: true,
      default: 'Untitled Paper',
      index: true,
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
      type: [optionSchema],
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
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    explanation: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

questionSchema.index({ questionText: 'text', paperHeading: 'text', courseName: 'text', courseId: 'text', tags: 'text' });
questionSchema.index({ ownerAdminId: 1, paperHeading: 1, createdAt: -1 });
questionSchema.index({ ownerAdminId: 1, status: 1, paperHeading: 1, createdAt: -1 });
questionSchema.index({ createdBy: 1, status: 1, paperHeading: 1, createdAt: -1 });
questionSchema.index({ ownerAdminId: 1, status: 1, type: 1, difficulty: 1 });

module.exports = mongoose.model('Question', questionSchema);
