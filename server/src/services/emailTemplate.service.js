const EmailTemplate = require('../models/EmailTemplate');
const env = require('../config/env');

const baseVariables = [
  'appName',
  'loginUrl',
  'recipientName',
  'recipientEmail',
  'assessmentTitle',
  'assessmentCode',
  'courseName',
  'courseId',
  'startAt',
  'endAt',
  'durationMinutes',
  'examId',
  'proctorId',
  'password',
  'loginEmail',
  'loginPassword',
  'assessmentPassword',
  'assignedStudents',
  'assignedBy',
  'reason',
];

function shell(title, body, ctaLabel = 'Open Evalora') {
  return `
  <div style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
      <div style="border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,.08);">
        <div style="padding:24px 28px;border-bottom:1px solid #fed7aa;background:linear-gradient(135deg,#fff7ed,#ffffff 62%);">
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#f97316;">{{appName}}</p>
          <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#0f172a;">${title}</h1>
        </div>
        <div style="padding:26px 28px;font-size:14px;line-height:1.7;color:#334155;">
          ${body}
          <div style="margin-top:22px;">
            <a href="{{loginUrl}}" style="display:inline-block;border-radius:10px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:800;padding:11px 16px;">${ctaLabel}</a>
          </div>
        </div>
        <div style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">
          This is an automated {{appName}} message.
        </div>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function plainTextToHtmlShell(subject, text) {
  const body = String(text || '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 12px;">${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return shell(escapeHtml(subject || 'Evalora notification'), body || '<p style="margin:0;">You have a new Evalora update.</p>');
}

function isHtmlDocument(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

const DEFAULT_EMAIL_TEMPLATES = [
  {
    key: 'student_credentials',
    name: 'Student Exam Credentials',
    audience: 'Students',
    description: 'Sent when student exam login details are shared.',
    subject: '{{appName}} Exam Access - {{assessmentTitle}}',
    html: shell(
      'Your exam access is ready',
      '<p>Hello <b>{{recipientName}}</b>,</p><p>Your exam access has been created for <b>{{assessmentTitle}}</b>.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;">{{credentialRows}}</table><p>Sign in with your login email or Exam ID, then use the login password above.</p>'
    ),
    text: 'Hello {{recipientName}},\n\nYour exam access has been created for {{assessmentTitle}}.\nAssessment Code: {{assessmentCode}}\nLogin Email: {{loginEmail}}\nExam ID: {{examId}}\nLogin Password: {{loginPassword}}\nCourse: {{courseName}} {{courseId}}\nStart: {{startAt}}\nEnd: {{endAt}}\nDuration: {{durationMinutes}} minutes\n\nSign in with your login email or Exam ID, then use the login password above.\n\nRegards,\n{{appName}} Team',
  },
  {
    key: 'proctor_credentials',
    name: 'Proctor Exam Credentials',
    audience: 'Proctors',
    description: 'Sent when proctor monitoring credentials are shared.',
    subject: '{{appName}} Proctor Access - {{assessmentTitle}}',
    html: shell(
      'Proctor monitoring access',
      '<p>Hello <b>{{recipientName}}</b>,</p><p>Your proctor access has been created for <b>{{assessmentTitle}}</b>.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;">{{credentialRows}}</table><p>Sign in with your email or Proctor ID, then enter the assessment password to monitor assigned students.</p>'
    ),
    text: 'Hello {{recipientName}},\n\nYour proctor access has been created for {{assessmentTitle}}.\nAssessment Code: {{assessmentCode}}\nLogin Email: {{recipientEmail}}\nProctor ID: {{proctorId}}\nLogin Password: {{loginPassword}}\nAssessment Password: {{assessmentPassword}}\nAssigned Students: {{assignedStudents}}\nStart: {{startAt}}\nEnd: {{endAt}}\n\nRegards,\n{{appName}} Team',
  },
  {
    key: 'staff_credentials',
    name: 'Faculty / Moderator Credentials',
    audience: 'Faculty and Moderators',
    description: 'Sent when faculty or moderator login credentials are shared.',
    subject: '{{appName}} {{staffRole}} Access',
    html: shell(
      '{{staffRole}} access created',
      '<p>Hello <b>{{recipientName}}</b>,</p><p>Your {{staffRole}} access has been created.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;">{{credentialRows}}</table><p>Use these credentials on the Evalora login page.</p>'
    ),
    text: 'Hello {{recipientName}},\n\nYour {{staffRole}} access has been created on {{appName}}.\nLogin Email: {{recipientEmail}}\nPassword: {{password}}\nAssigned Courses: {{courses}}\n\nRegards,\n{{appName}} Team',
  },
  {
    key: 'assignment_assigned',
    name: 'Faculty Assignment',
    audience: 'Faculty',
    description: 'Sent when a faculty member receives assessment question work.',
    subject: '{{appName}} assessment assigned - {{assessmentTitle}}',
    html: shell(
      'Assessment work assigned',
      '<p>Hello <b>{{recipientName}}</b>,</p><p><b>{{assessmentTitle}}</b> has been assigned to you by {{assignedBy}}.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;">{{credentialRows}}</table><p>Open Assigned Work to continue.</p>',
      'Open Assigned Work'
    ),
    text: 'Hello {{recipientName}},\n\n{{assessmentTitle}} has been assigned to you by {{assignedBy}}.\nAssessment Code: {{assessmentCode}}\nCourse: {{courseName}} {{courseId}}\nAssignment Password: {{password}}\n\nSign in to {{appName}} and open Assigned Work to continue.',
  },
  {
    key: 'assignment_submitted',
    name: 'Moderator Review Request',
    audience: 'Moderators',
    description: 'Sent when faculty submits questions for moderator review.',
    subject: '{{appName}} review requested - {{assessmentTitle}}',
    html: shell(
      'Question set ready for review',
      '<p>Hello <b>{{recipientName}}</b>,</p><p>The question set for <b>{{courseName}}</b> is ready for moderation.</p><table style="width:100%;border-collapse:collapse;margin:18px 0;">{{credentialRows}}</table><p>Open the review queue to approve or return corrections.</p>',
      'Open Review Queue'
    ),
    text: 'Hello {{recipientName}},\n\nThe question set for {{courseName}} is ready for moderation.\nAssessment Code: {{assessmentCode}}\nCourse: {{courseName}} {{courseId}}\nAssignment Password: {{password}}\n\nOpen the review queue to approve or return corrections.',
  },
  {
    key: 'assignment_rejected',
    name: 'Faculty Correction Request',
    audience: 'Faculty',
    description: 'Sent when moderator rejects a submitted faculty question set.',
    subject: '{{appName}} correction required - {{assessmentTitle}}',
    html: shell(
      'Corrections required',
      '<p>Hello <b>{{recipientName}}</b>,</p><p>The question set for <b>{{courseName}}</b> needs correction.</p><p style="padding:12px;border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;"><b>Reason:</b> {{reason}}</p><p>Open Assigned Work to update and resubmit.</p>',
      'Open Assigned Work'
    ),
    text: 'Hello {{recipientName}},\n\nThe question set for {{courseName}} needs correction.\nAssessment Code: {{assessmentCode}}\nCourse: {{courseName}} {{courseId}}\nReview reason: {{reason}}\n\nOpen Assigned Work to update and resubmit.',
  },
].map((template) => ({ ...template, variables: baseVariables }));

function valueFor(context, key) {
  const value = context[key];
  if (value === undefined || value === null) return '';
  return String(value);
}

function renderString(template, context) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => valueFor(context, key));
}

function buildRows(rows) {
  return rows
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')
    .map((row) => (
      `<tr><td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#64748b;">${row.label}</td><td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">${row.value}</td></tr>`
    ))
    .join('');
}

async function getTemplate(key) {
  const saved = await EmailTemplate.findOne({ key, status: 'active' }).lean();
  return saved || DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key);
}

async function renderEmail(key, context = {}, rows = []) {
  const template = await getTemplate(key);
  const nextContext = {
    appName: 'Evalora',
    loginUrl: `${env.frontendUrl || 'http://localhost:5173'}/login`,
    credentialRows: buildRows(rows),
    ...context,
  };
  const subject = renderString(template.subject, nextContext);
  const html = renderString(template.html, nextContext);
  const text = renderString(template.text, nextContext);

  return {
    subject,
    html: isHtmlDocument(html) ? html : renderString(plainTextToHtmlShell(subject, html || text), nextContext),
    text,
  };
}

module.exports = {
  DEFAULT_EMAIL_TEMPLATES,
  renderEmail,
};
