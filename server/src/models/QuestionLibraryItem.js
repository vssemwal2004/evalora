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

const questionLibraryItemSchema = new mongoose.Schema(
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
      index: true,
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
      default: 1,
      min: 0,
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: 0,
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

questionLibraryItemSchema.index({ ownerAdminId: 1, type: 1, courseId: 1 });
questionLibraryItemSchema.index({ ownerAdminId: 1, paperHeading: 1, createdAt: -1 });
questionLibraryItemSchema.index({ questionText: 'text', paperHeading: 'text', courseName: 'text', courseId: 'text', tags: 'text' });

module.exports = mongoose.model('QuestionLibraryItem', questionLibraryItemSchema);
