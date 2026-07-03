const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    courseId: {
      type: String,
      trim: true,
    },
    questionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    studentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    eligibleStudentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    facultyName: {
      type: String,
      trim: true,
    },
    facultyEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    moderatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    moderatorName: {
      type: String,
      trim: true,
    },
    moderatorEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
  },
  { _id: true }
);

const assessmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    assessmentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    type: {
      type: String,
      trim: true,
      default: 'exam',
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    instructions: {
      type: String,
      trim: true,
    },
    internalNote: {
      type: String,
      trim: true,
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
    createdByName: {
      type: String,
      trim: true,
    },
    createdByEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    createdByRole: {
      type: String,
      trim: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['draft', 'review', 'upcoming', 'active', 'pending', 'completed'],
      default: 'draft',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['visible', 'hidden'],
      default: 'hidden',
      index: true,
    },
    questionSource: {
      type: String,
      enum: ['faculty', 'both', 'admin'],
      default: 'both',
      index: true,
    },
    startAt: Date,
    endAt: Date,
    globalDurationMinutes: {
      type: Number,
      min: 1,
    },
    commonAssessmentPasswordHash: {
      type: String,
      select: false,
    },
    courses: {
      type: [courseSchema],
      default: [],
    },
    counts: {
      courses: {
        type: Number,
        default: 0,
      },
      students: {
        type: Number,
        default: 0,
      },
      eligibleStudents: {
        type: Number,
        default: 0,
      },
      proctors: {
        type: Number,
        default: 0,
      },
      questions: {
        type: Number,
        default: 0,
      },
      pendingStudentMails: {
        type: Number,
        default: 0,
      },
      sentStudentMails: {
        type: Number,
        default: 0,
      },
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        passwordRequired: false,
        proctoringEnabled: false,
        chatEnabled: false,
        proctorGlobalChatEnabled: true,
        warningMessagesEnabled: true,
        ufmActionEnabled: true,
        screenMonitoringEnabled: false,
        liveStatusPollingSeconds: 10,
        maxStudentsPerProctor: 50,
        suspiciousActivityThresholdPerMinute: 5,
        proctorAlertPopupEnabled: true,
        fullscreenEnabled: true,
        requireFullscreenBeforeStart: true,
        maxFullscreenExits: 3,
        fullscreenAction: 'warn',
        tabSwitchDetection: true,
        maxTabSwitches: 3,
        tabSwitchAction: 'warn',
        copyPasteDisabled: true,
        rightClickDisabled: true,
        shortcutBlocking: true,
        screenshotWarning: true,
        cameraRequired: false,
        cameraMonitoring: false,
        snapshotIntervalSeconds: 30,
        cameraMissingAction: 'warn',
        microphoneRequired: false,
        noiseMonitoring: false,
        noiseThreshold: 70,
        aiProctoringEnabled: false,
        detectNoFace: true,
        detectMultipleFaces: true,
        detectMultiplePersons: true,
        detectMobilePhone: true,
        detectLookingAway: true,
        detectCameraBlocked: true,
        detectionIntervalMs: 1500,
        confidenceThreshold: 0.75,
        violationCooldownSeconds: 10,
        multipleTabDetection: true,
        idleDetection: true,
        idleThresholdMinutes: 5,
        watermarkEnabled: true,
        watermarkOpacity: 0.16,
        watermarkFontSize: 18,
        warningScore: 5,
        pauseScore: 15,
        autoSubmitScore: 30,
        maxWarningCount: 5,
        securityRecheckEnabled: true,
        securityRecheckTimeoutSeconds: 120,
        reminder24Hours: true,
        reminder1Hour: true,
        reminder10Minutes: true,
        showResultToStudent: false,
        negativeMarkingEnabled: false,
        negativeMarkingPercent: 25,
      }),
    },
  },
  { timestamps: true }
);

assessmentSchema.index({ assessmentCode: 1, ownerAdminId: 1 }, { unique: true });
assessmentSchema.index({ status: 1, startAt: 1, endAt: 1 });
assessmentSchema.index({ ownerAdminId: 1, status: 1, createdAt: -1 });
assessmentSchema.index({ ownerAdminId: 1, createdBy: 1, createdAt: -1 });
assessmentSchema.index({ visibility: 1, status: 1, startAt: 1, endAt: 1 });

assessmentSchema.pre('save', function syncCounts(next) {
  this.counts.courses = this.courses.length;
  this.counts.questions = this.courses.reduce((total, course) => total + Number(course.questionCount || 0), 0);
  this.counts.students = this.courses.reduce((total, course) => total + Number(course.studentCount || 0), 0);
  this.counts.eligibleStudents = this.courses.reduce(
    (total, course) => total + Number(course.eligibleStudentCount || 0),
    0
  );
  next();
});

assessmentSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

module.exports = mongoose.model('Assessment', assessmentSchema);
