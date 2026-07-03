const mongoose = require('mongoose');

function normalizeCourseKey(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

const courseSchema = new mongoose.Schema(
  {
    courseName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    courseNameKey: {
      type: String,
      index: true,
    },
    courseCodeKey: {
      type: String,
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
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

courseSchema.index({ ownerAdminId: 1, courseCode: 1 }, { unique: true });
courseSchema.index({ ownerAdminId: 1, courseNameKey: 1 }, { unique: true, partialFilterExpression: { courseNameKey: { $type: 'string' } } });
courseSchema.index({ ownerAdminId: 1, courseCodeKey: 1 }, { unique: true, partialFilterExpression: { courseCodeKey: { $type: 'string' } } });
courseSchema.index({ ownerAdminId: 1, status: 1, courseName: 1, courseCode: 1 });

courseSchema.pre('validate', function setCourseKeys(next) {
  this.courseNameKey = normalizeCourseKey(this.courseName);
  this.courseCodeKey = normalizeCourseKey(this.courseCode);
  next();
});

module.exports = mongoose.model('Course', courseSchema);
module.exports.normalizeCourseKey = normalizeCourseKey;
