const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

function hasSmtpConfig() {
  return Boolean(env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass && env.smtp.from);
}

function getTransporter() {
  if (!hasSmtpConfig()) {
    const error = new Error('SMTP is not configured.');
    error.statusCode = 500;
    throw error;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: Number(env.smtp.port) === 465,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }

  return transporter;
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function sendStudentCredentialMail({ assessment, student }) {
  const transport = getTransporter();
  const subject = `Evalora Exam Access - ${assessment.title}`;
  const text = [
    `Hello ${student.name},`,
    '',
    `Your exam access has been created for ${assessment.title}.`,
    `Assessment Code: ${assessment.assessmentCode}`,
    `Exam ID: ${student.generatedExamId}`,
    `Password: ${student.passwordPreview}`,
    `Course: ${student.courseName}${student.courseId ? ` (${student.courseId})` : ''}`,
    `Start: ${formatDateTime(assessment.startAt)}`,
    `End: ${formatDateTime(assessment.endAt)}`,
    `Duration: ${assessment.globalDurationMinutes || 0} minutes`,
    '',
    'Use your assigned credentials on the Evalora login page to access the exam dashboard.',
    'If your admin has enabled a separate assessment password, it will be shared with you separately.',
    '',
    'Regards,',
    'Evalora Team',
  ].join('\n');

  await transport.sendMail({
    from: env.smtp.from,
    to: student.email,
    subject,
    text,
  });
}

async function sendProctorCredentialMail({ assessment, proctor }) {
  const transport = getTransporter();
  const subject = `Evalora Proctor Access - ${assessment.title}`;
  const text = [
    `Hello ${proctor.name},`,
    '',
    `Your proctor access has been created for ${assessment.title}.`,
    `Assessment Code: ${assessment.assessmentCode}`,
    `Proctor ID: ${proctor.generatedProctorId}`,
    `Password: ${proctor.passwordPreview}`,
    `Assigned Students: ${proctor.assignedStudentCount || 0}`,
    `Start: ${formatDateTime(assessment.startAt)}`,
    `End: ${formatDateTime(assessment.endAt)}`,
    '',
    'Use your assigned credentials on the Evalora login page to access proctor monitoring.',
    '',
    'Regards,',
    'Evalora Team',
  ].join('\n');

  await transport.sendMail({
    from: env.smtp.from,
    to: proctor.email,
    subject,
    text,
  });
}

async function sendStaffCredentialMail({ person, label }) {
  const transport = getTransporter();
  const courses = (person.assignedCourses || [])
    .map((course) => `${course.courseName} (${course.courseCode})`)
    .join(', ');
  const subject = `Evalora ${label} Access`;
  const text = [
    `Hello ${person.name},`,
    '',
    `Your ${label.toLowerCase()} access has been created on Evalora.`,
    `Login Email: ${person.email}`,
    `Password: ${person.passwordPreview || 'Use the password shared by your admin.'}`,
    `Assigned Courses: ${courses || 'Not assigned'}`,
    '',
    'Use these credentials on the Evalora login page.',
    '',
    'Regards,',
    'Evalora Team',
  ].join('\n');

  await transport.sendMail({
    from: env.smtp.from,
    to: person.email,
    subject,
    text,
  });
}

async function sendAssignmentMail({ assignment, assessment, recipient, assignedBy, kind, reason }) {
  const transport = getTransporter();
  const isRejection = kind === 'rejected';
  const subject = isRejection
    ? `Evalora review required - ${assessment.title}`
    : `Evalora assessment assigned - ${assessment.title}`;
  const text = [
    `Hello ${recipient.name},`,
    '',
    isRejection
      ? `The question set for ${assignment.courseName} needs correction.`
      : `${assessment.title} has been assigned to you by ${assignedBy?.name || 'an administrator'}.`,
    `Assessment Code: ${assessment.assessmentCode}`,
    `Course: ${assignment.courseName}${assignment.courseId ? ` (${assignment.courseId})` : ''}`,
    reason ? `Review reason: ${reason}` : '',
    !isRejection ? `Assignment Password: ${assignment.passwordPreview}` : '',
    '',
    'Sign in to Evalora and open Assigned Work to continue.',
    '',
    'Regards,',
    'Evalora Team',
  ].filter((line) => line !== '').join('\n');
  await transport.sendMail({ from: env.smtp.from, to: recipient.email, subject, text });
}

module.exports = {
  hasSmtpConfig,
  sendStudentCredentialMail,
  sendProctorCredentialMail,
  sendStaffCredentialMail,
  sendAssignmentMail,
};
