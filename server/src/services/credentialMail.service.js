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

module.exports = {
  hasSmtpConfig,
  sendStudentCredentialMail,
  sendProctorCredentialMail,
};
