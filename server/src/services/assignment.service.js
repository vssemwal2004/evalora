const AssessmentAssignment = require('../models/AssessmentAssignment');
const User = require('../models/User');
const { sendAssignmentMail } = require('./credentialMail.service');
const { generatePassword } = require('../utils/credentials');

async function syncAssessmentAssignments(assessment, actor) {
  const activeKeys = [];
  const created = [];

  for (const course of assessment.courses || []) {
    if (!course.facultyId || !course.moderatorId) continue;
    activeKeys.push(course._id);
    let assignment = await AssessmentAssignment.findOne({ assessmentId: assessment._id, courseSubdocumentId: course._id });
    if (!assignment) {
      const password = generatePassword(8);
      assignment = await AssessmentAssignment.create({
        assessmentId: assessment._id,
        ownerAdminId: assessment.ownerAdminId,
        courseId: course.courseId,
        courseName: course.courseName,
        courseSubdocumentId: course._id,
        facultyId: course.facultyId,
        moderatorId: course.moderatorId,
        passwordHash: await AssessmentAssignment.hashPassword(password),
        passwordPreview: password,
        history: [{ action: 'assigned', message: `Assigned by ${actor?.name || 'administrator'}`, actorId: actor?._id, actorName: actor?.name }],
      });
      created.push(assignment._id);
    } else {
      assignment.courseId = course.courseId;
      assignment.courseName = course.courseName;
      assignment.facultyId = course.facultyId;
      assignment.moderatorId = course.moderatorId;
      await assignment.save();
    }
  }

  if (activeKeys.length) {
    await AssessmentAssignment.deleteMany({ assessmentId: assessment._id, courseSubdocumentId: { $nin: activeKeys }, status: { $in: ['assigned', 'in_progress'] } });
  }

  for (const id of created) {
    const assignment = await AssessmentAssignment.findById(id).select('+passwordPreview');
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
}

module.exports = { syncAssessmentAssignments };
