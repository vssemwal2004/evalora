const AssessmentAssignment = require('../models/AssessmentAssignment');
const User = require('../models/User');
const { sendAssignmentMail } = require('./credentialMail.service');
const { generatePassword } = require('../utils/credentials');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCourseId(value) {
  return String(value || '').trim().toUpperCase();
}

function getCourseKey(course) {
  const courseId = normalizeCourseId(course.courseId);
  return courseId ? `id:${courseId}` : `name:${normalizeText(course.courseName)}`;
}

function assignmentMatchesCourse(assignment, course) {
  if (!assignment || !course) return false;
  if (String(assignment.courseSubdocumentId || '') === String(course._id || '')) return true;
  return (assignment.courseKey || getCourseKey(assignment)) === getCourseKey(course);
}

function statusRank(status) {
  return {
    approved: 5,
    submitted: 4,
    rejected: 3,
    in_progress: 2,
    assigned: 1,
  }[status] || 0;
}

function pickPrimaryAssignment(items) {
  return [...items].sort((a, b) => {
    const rankDelta = statusRank(b.status) - statusRank(a.status);
    if (rankDelta) return rankDelta;
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  })[0];
}

async function removeDuplicateAssignments(assessmentId, assignments) {
  const grouped = new Map();

  assignments.forEach((assignment) => {
    const courseKey = assignment.courseKey || getCourseKey(assignment);
    if (!grouped.has(courseKey)) grouped.set(courseKey, []);
    grouped.get(courseKey).push(assignment);
  });

  const duplicateIds = [];
  grouped.forEach((items) => {
    if (items.length <= 1) return;
    const primary = pickPrimaryAssignment(items);
    items.forEach((item) => {
      if (String(item._id) !== String(primary._id)) duplicateIds.push(item._id);
    });
  });

  if (duplicateIds.length) {
    await AssessmentAssignment.deleteMany({ assessmentId, _id: { $in: duplicateIds } });
  }
}

async function syncAssessmentAssignments(assessment, actor, options = {}) {
  const activeCourseKeys = new Set();
  const mailQueue = [];
  const moderatorMailQueue = [];
  const restartCourseKeys = new Set((options.restartCourseKeys || []).filter(Boolean));
  const restartMessage = String(options.restartMessage || '').trim();
  const assignments = await AssessmentAssignment.find({ assessmentId: assessment._id }).select('+passwordHash +passwordPreview');
  const existingPasswordAssignment = assignments.find((assignment) => assignment.passwordPreview && assignment.passwordHash);
  const commonPassword = existingPasswordAssignment?.passwordPreview || generatePassword(8);
  const commonPasswordHash = existingPasswordAssignment?.passwordHash || await AssessmentAssignment.hashPassword(commonPassword);

  for (const course of assessment.courses || []) {
    if (!course.facultyId || !course.moderatorId) continue;

    const courseKey = getCourseKey(course);
    activeCourseKeys.add(courseKey);
    let assignment = pickPrimaryAssignment(assignments.filter((item) => assignmentMatchesCourse(item, course)));

    if (!assignment) {
      assignment = await AssessmentAssignment.create({
        assessmentId: assessment._id,
        ownerAdminId: assessment.ownerAdminId,
        courseId: course.courseId,
        courseName: course.courseName,
        courseKey,
        courseSubdocumentId: course._id,
        facultyId: course.facultyId,
        moderatorId: course.moderatorId,
        passwordHash: commonPasswordHash,
        passwordPreview: commonPassword,
        history: [{
          action: 'assigned',
          message: `Assigned by ${actor?.name || 'administrator'}`,
          actorId: actor?._id,
          actorName: actor?.name,
        }],
      });
      assignments.push(assignment);
      mailQueue.push(assignment._id);
      continue;
    }

    const wasApproved = assignment.status === 'approved';
    const isRestart = wasApproved && restartCourseKeys.has(courseKey);
    assignment.courseId = course.courseId;
    assignment.courseName = course.courseName;
    assignment.courseKey = courseKey;
    assignment.courseSubdocumentId = course._id;
    assignment.ownerAdminId = assessment.ownerAdminId;

    if (assignment.passwordPreview !== commonPassword && assignment.status !== 'approved') {
      assignment.passwordHash = commonPasswordHash;
      assignment.passwordPreview = commonPassword;
      if (['assigned', 'in_progress', 'rejected'].includes(assignment.status)) {
        assignment.facultyMail = { status: 'pending' };
        mailQueue.push(assignment._id);
      } else if (assignment.status === 'submitted') {
        assignment.moderatorMail = { status: 'not_sent' };
        moderatorMailQueue.push(assignment._id);
      }
    }

    if (!wasApproved || isRestart) {
      assignment.facultyId = course.facultyId;
      assignment.moderatorId = course.moderatorId;
    }

    if (isRestart) {
      assignment.status = 'assigned';
      assignment.rejectionReason = '';
      assignment.submittedAt = undefined;
      assignment.reviewedAt = undefined;
      assignment.facultyMail = { status: 'pending' };
      assignment.moderatorMail = { status: 'not_sent' };
      assignment.passwordHash = commonPasswordHash;
      assignment.passwordPreview = commonPassword;
      assignment.history.push({
        action: 'restart_requested',
        message: restartMessage || `Review again requested by ${actor?.name || 'administrator'}`,
        actorId: actor?._id,
        actorName: actor?.name,
      });
      mailQueue.push(assignment._id);
    } else if (!wasApproved) {
      assignment.history.push({
        action: 'assignment_updated',
        message: `Assignment updated by ${actor?.name || 'administrator'}`,
        actorId: actor?._id,
        actorName: actor?.name,
      });
    }

    await assignment.save();
  }

  const removable = assignments
    .filter((assignment) => !activeCourseKeys.has(assignment.courseKey || getCourseKey(assignment)))
    .filter((assignment) => ['assigned', 'in_progress'].includes(assignment.status))
    .map((assignment) => assignment._id);

  if (removable.length) {
    await AssessmentAssignment.deleteMany({ assessmentId: assessment._id, _id: { $in: removable } });
  }

  await removeDuplicateAssignments(assessment._id, await AssessmentAssignment.find({ assessmentId: assessment._id }));

  for (const id of Array.from(new Set(mailQueue.map((value) => String(value))))) {
    const assignment = await AssessmentAssignment.findById(id).select('+passwordPreview');
    if (!assignment) continue;

    const faculty = await User.findById(assignment.facultyId);
    if (!faculty?.email) continue;

    try {
      await sendAssignmentMail({ assignment, assessment, recipient: faculty, assignedBy: actor, kind: 'assigned' });
      assignment.facultyMail = { status: 'sent', sentAt: new Date() };
    } catch (error) {
      assignment.facultyMail = { status: 'failed', error: error.message };
    }
    await assignment.save();
  }

  for (const id of Array.from(new Set(moderatorMailQueue.map((value) => String(value))))) {
    const assignment = await AssessmentAssignment.findById(id).select('+passwordPreview');
    if (!assignment) continue;

    const moderator = await User.findById(assignment.moderatorId);
    if (!moderator?.email) continue;

    try {
      await sendAssignmentMail({ assignment, assessment, recipient: moderator, assignedBy: actor, kind: 'submitted' });
      assignment.moderatorMail = { status: 'sent', sentAt: new Date() };
    } catch (error) {
      assignment.moderatorMail = { status: 'failed', error: error.message };
    }
    await assignment.save();
  }
}

module.exports = {
  getCourseKey,
  pickPrimaryAssignment,
  removeDuplicateAssignments,
  syncAssessmentAssignments,
};
