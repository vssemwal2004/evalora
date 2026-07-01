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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function appendHtmlBeforeClose(html, block) {
  const source = String(html || '');
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${block}</body>`);
  }
  return `${source}${block}`;
}

function ensureAssignmentPasswordInEmail(email, password, label = 'Assignment Password') {
  if (!password) return email;

  const passwordText = String(password);
  const nextEmail = { ...email };

  if (!String(nextEmail.text || '').includes(passwordText)) {
    nextEmail.text = `${String(nextEmail.text || '').trim()}\n\n${label}: ${passwordText}`.trim();
  }

  if (!String(nextEmail.html || '').includes(passwordText)) {
    const block = `
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;">
        <div style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c2410c;">Secure access</div>
        <div style="font-size:14px;color:#334155;">${escapeHtml(label)}</div>
        <div style="margin-top:4px;font-size:20px;line-height:1.2;font-weight:800;color:#0f172a;letter-spacing:.04em;">${escapeHtml(passwordText)}</div>
      </div>`;
    nextEmail.html = appendHtmlBeforeClose(nextEmail.html, block);
  }

  return nextEmail;
}

async function sendStudentCredentialMail({ assessment, student }) {
  const transport = getTransporter();
  let email = await renderEmail('student_credentials', {
    recipientName: student.name,
    recipientEmail: student.email,
    loginEmail: student.email,
    assessmentTitle: assessment.title,
    assessmentCode: assessment.assessmentCode,
    examId: student.generatedExamId,
    loginPassword: student.passwordPreview,
    password: student.passwordPreview,
    courseName: student.courseName,
    courseId: student.courseId ? `(${student.courseId})` : '',
    startAt: formatDateTime(assessment.startAt),
    endAt: formatDateTime(assessment.endAt),
    durationMinutes: assessment.globalDurationMinutes || 0,
  }, [
    { label: 'Assessment Code', value: assessment.assessmentCode },
    { label: 'Login Email', value: student.email },
    { label: 'Exam ID', value: student.generatedExamId },
    { label: 'Login Password', value: student.passwordPreview },
    { label: 'Course', value: `${student.courseName}${student.courseId ? ` (${student.courseId})` : ''}` },
    { label: 'Start', value: formatDateTime(assessment.startAt) },
    { label: 'End', value: formatDateTime(assessment.endAt) },
    { label: 'Duration', value: `${assessment.globalDurationMinutes || 0} minutes` },
  ]);
  email = ensureAssignmentPasswordInEmail(email, student.passwordPreview, 'Login Password');

  await transport.sendMail({
    from: env.smtp.from,
    to: student.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendProctorCredentialMail({ assessment, proctor, loginPassword }) {
  const transport = getTransporter();
  const assessmentPassword = proctor.passwordPreview;
  const safeLoginPassword = loginPassword || proctor.loginPassword || proctor.passwordPreview;
  let email = await renderEmail('proctor_credentials', {
    recipientName: proctor.name,
    recipientEmail: proctor.email,
    assessmentTitle: assessment.title,
    assessmentCode: assessment.assessmentCode,
    proctorId: proctor.generatedProctorId,
    password: safeLoginPassword,
    loginPassword: safeLoginPassword,
    assessmentPassword,
    assignedStudents: proctor.assignedStudentCount || 0,
    startAt: formatDateTime(assessment.startAt),
    endAt: formatDateTime(assessment.endAt),
  }, [
    { label: 'Assessment Code', value: assessment.assessmentCode },
    { label: 'Login Email', value: proctor.email },
    { label: 'Proctor ID', value: proctor.generatedProctorId },
    { label: 'Login Password', value: safeLoginPassword },
    { label: 'Assessment Password', value: assessmentPassword },
    { label: 'Assigned Students', value: proctor.assignedStudentCount || 0 },
    { label: 'Start', value: formatDateTime(assessment.startAt) },
    { label: 'End', value: formatDateTime(assessment.endAt) },
  ]);
  email = ensureAssignmentPasswordInEmail(email, safeLoginPassword, 'Login Password');
  email = ensureAssignmentPasswordInEmail(email, assessmentPassword, 'Assessment Password');

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
  const passwordLabel = kind === 'submitted' ? 'Moderator Review Password' : 'Assignment Password';
  const templateKey = isRejection ? 'assignment_rejected' : kind === 'submitted' ? 'assignment_submitted' : 'assignment_assigned';
  let email = await renderEmail(templateKey, {
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
    { label: passwordLabel, value: isRejection ? '' : assignment.passwordPreview },
    { label: 'Review Reason', value: reason || '' },
  ]);
  if (!isRejection) {
    email = ensureAssignmentPasswordInEmail(email, assignment.passwordPreview, passwordLabel);
  }
  await transport.sendMail({ from: env.smtp.from, to: recipient.email, subject: email.subject, text: email.text, html: email.html });
}

module.exports = {
  hasSmtpConfig,
  sendStudentCredentialMail,
  sendProctorCredentialMail,
  sendStaffCredentialMail,
  sendAssignmentMail,
};
