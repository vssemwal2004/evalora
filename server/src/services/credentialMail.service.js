const nodemailer = require('nodemailer');
const env = require('../config/env');
const { renderEmail } = require('./emailTemplate.service');

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
  const email = await renderEmail('student_credentials', {
    recipientName: student.name,
    recipientEmail: student.email,
    assessmentTitle: assessment.title,
    assessmentCode: assessment.assessmentCode,
    examId: student.generatedExamId,
    password: student.passwordPreview,
    courseName: student.courseName,
    courseId: student.courseId ? `(${student.courseId})` : '',
    startAt: formatDateTime(assessment.startAt),
    endAt: formatDateTime(assessment.endAt),
    durationMinutes: assessment.globalDurationMinutes || 0,
  }, [
    { label: 'Assessment Code', value: assessment.assessmentCode },
    { label: 'Exam ID', value: student.generatedExamId },
    { label: 'Password', value: student.passwordPreview },
    { label: 'Course', value: `${student.courseName}${student.courseId ? ` (${student.courseId})` : ''}` },
    { label: 'Start', value: formatDateTime(assessment.startAt) },
    { label: 'End', value: formatDateTime(assessment.endAt) },
    { label: 'Duration', value: `${assessment.globalDurationMinutes || 0} minutes` },
  ]);

  await transport.sendMail({
    from: env.smtp.from,
    to: student.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendProctorCredentialMail({ assessment, proctor }) {
  const transport = getTransporter();
  const email = await renderEmail('proctor_credentials', {
    recipientName: proctor.name,
    recipientEmail: proctor.email,
    assessmentTitle: assessment.title,
    assessmentCode: assessment.assessmentCode,
    proctorId: proctor.generatedProctorId,
    password: proctor.passwordPreview,
    assignedStudents: proctor.assignedStudentCount || 0,
    startAt: formatDateTime(assessment.startAt),
    endAt: formatDateTime(assessment.endAt),
  }, [
    { label: 'Assessment Code', value: assessment.assessmentCode },
    { label: 'Proctor ID', value: proctor.generatedProctorId },
    { label: 'Password', value: proctor.passwordPreview },
    { label: 'Assigned Students', value: proctor.assignedStudentCount || 0 },
    { label: 'Start', value: formatDateTime(assessment.startAt) },
    { label: 'End', value: formatDateTime(assessment.endAt) },
  ]);

  await transport.sendMail({
    from: env.smtp.from,
    to: proctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendStaffCredentialMail({ person, label }) {
  const transport = getTransporter();
  const courses = (person.assignedCourses || [])
    .map((course) => `${course.courseName} (${course.courseCode})`)
    .join(', ');
  const email = await renderEmail('staff_credentials', {
    recipientName: person.name,
    recipientEmail: person.email,
    staffRole: label,
    password: person.passwordPreview || 'Use the password shared by your admin.',
    courses: courses || 'Not assigned',
  }, [
    { label: 'Login Email', value: person.email },
    { label: 'Password', value: person.passwordPreview || 'Use the password shared by your admin.' },
    { label: 'Assigned Courses', value: courses || 'Not assigned' },
  ]);

  await transport.sendMail({
    from: env.smtp.from,
    to: person.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendAssignmentMail({ assignment, assessment, recipient, assignedBy, kind, reason }) {
  const transport = getTransporter();
  const isRejection = kind === 'rejected';
  const templateKey = isRejection ? 'assignment_rejected' : kind === 'submitted' ? 'assignment_submitted' : 'assignment_assigned';
  const email = await renderEmail(templateKey, {
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    assessmentTitle: assessment.title,
    assessmentCode: assessment.assessmentCode,
    courseName: assignment.courseName,
    courseId: assignment.courseId ? `(${assignment.courseId})` : '',
    password: assignment.passwordPreview,
    assignedBy: assignedBy?.name || 'an administrator',
    reason: reason || '',
  }, [
    { label: 'Assessment Code', value: assessment.assessmentCode },
    { label: 'Course', value: `${assignment.courseName}${assignment.courseId ? ` (${assignment.courseId})` : ''}` },
    { label: 'Assignment Password', value: isRejection || kind === 'submitted' ? '' : assignment.passwordPreview },
    { label: 'Review Reason', value: reason || '' },
  ]);
  await transport.sendMail({ from: env.smtp.from, to: recipient.email, subject: email.subject, text: email.text, html: email.html });
}

module.exports = {
  hasSmtpConfig,
  sendStudentCredentialMail,
  sendProctorCredentialMail,
  sendStaffCredentialMail,
  sendAssignmentMail,
};
