import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  IdCard,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MoreVertical,
  PlayCircle,
  RefreshCcw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState } from '../../ui/Surface.jsx';

const initialCandidateFilters = {
  search: '',
  course: '',
  status: 'all',
  integrity: 'all',
  dateFrom: '',
  dateTo: '',
};

const reportRowModes = ['proctoring', 'score', 'attendance', 'answer-sheet', 'question-analysis', 'activity-log', 'response-log'];
const reportDataModes = ['proctoring-courses', ...reportRowModes];

const reportActions = [
  { id: 'score', label: 'View Score Report', icon: BarChart3, permission: 'reports.score.view', ready: true },
  { id: 'question-analysis', label: 'View Question Analysis Report', icon: ClipboardList, permission: 'reports.question_analysis.view', ready: true },
  { id: 'process-score', label: 'Process Score', icon: RefreshCcw, permission: 'reports.process_score', ready: true },
  { id: 'attendance', label: 'View Attendance Report', icon: UserCheck, permission: 'reports.attendance.view', ready: true },
  { id: 'answer-sheet', label: 'View Answer Sheet', icon: FileText, permission: 'reports.answer_sheet.view', ready: true },
  { id: 'activity-log', label: 'View Activity Log Report', icon: Activity, permission: 'reports.activity_log.view', ready: true },
  { id: 'response-log', label: 'View Response Log Report', icon: ListChecks, permission: 'reports.response_log.view', ready: true },
  { id: 'proctoring', label: 'View Proctoring Report', icon: ShieldAlert, permission: 'reports.proctoring.view', ready: true },
];

const candidateExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['name', 'Candidate Name'],
  ['email', 'Email'],
  ['applicationNumber', 'Application Number'],
  ['generatedExamId', 'Unique ID'],
  ['course', 'Course'],
  ['courseId', 'Course Code'],
  ['eligibilityStatus', 'Eligibility Status'],
  ['mailStatus', 'Mail Status'],
  ['examStatus', 'Assigned Exam Status'],
  ['status', 'Status'],
  ['startedAt', 'Started At'],
  ['submittedAt', 'Submitted At'],
  ['durationMinutes', 'Duration Minutes'],
  ['totalQuestions', 'Total Questions'],
  ['answered', 'Answered'],
  ['correct', 'Correct'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['pending', 'Pending'],
  ['markedForReview', 'Marked For Review'],
  ['score', 'Score'],
  ['maxMarks', 'Max Marks'],
  ['percentage', 'Percentage'],
  ['securityScore', 'Security Score'],
  ['fairnessScore', 'Fairness Score'],
  ['identityMatch', 'Identity Match'],
  ['identityStatus', 'Identity Status'],
  ['identityCapturedAt', 'Identity Captured At'],
  ['identityReviewNote', 'Identity Review Note'],
  ['selfieStorageKey', 'Candidate Photo Storage Key'],
  ['idCardStorageKey', 'Uploaded ID Storage Key'],
  ['warningEvents', 'Warnings'],
  ['criticalEvents', 'Critical Events'],
  ['totalSecurityEvents', 'Total Security Events'],
  ['ufmReviews', 'UFM Reviews'],
  ['latestUfmProctor', 'Latest UFM Proctor'],
  ['latestUfmAt', 'Latest UFM At'],
  ['latestUfmNote', 'Latest UFM Note'],
  ['integrity', 'Integrity'],
];

const questionAnalysisExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['number', 'Question No.'],
  ['courseName', 'Course'],
  ['courseId', 'Course ID'],
  ['type', 'Type'],
  ['questionText', 'Question'],
  ['maxMarks', 'Max Marks'],
  ['negativeMarks', 'Negative Marks'],
  ['eligible', 'Eligible Candidates'],
  ['attempted', 'Attempted'],
  ['correct', 'Correct'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['accuracy', 'Accuracy %'],
  ['averageScore', 'Average Score'],
];

const activityLogExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['occurredAt', 'Occurred At'],
  ['candidateName', 'Candidate Name'],
  ['email', 'Email'],
  ['uniqueId', 'Unique ID'],
  ['courseName', 'Course'],
  ['type', 'Activity Type'],
  ['severity', 'Severity'],
  ['score', 'Security Score'],
  ['message', 'Message'],
  ['proctorName', 'Proctor'],
];

const responseLogExportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['savedAt', 'Saved At'],
  ['candidateName', 'Candidate Name'],
  ['email', 'Email'],
  ['uniqueId', 'Unique ID'],
  ['courseName', 'Course'],
  ['questionType', 'Question Type'],
  ['questionText', 'Question'],
  ['response', 'Response'],
  ['answered', 'Answered'],
  ['markedForReview', 'Marked For Review'],
  ['result', 'Result'],
  ['score', 'Score'],
];

const exportFields = candidateExportFields;

const exportFieldCatalogByMode = {
  proctoring: candidateExportFields,
  score: candidateExportFields,
  attendance: candidateExportFields,
  'answer-sheet': candidateExportFields,
  'question-analysis': questionAnalysisExportFields,
  'activity-log': activityLogExportFields,
  'response-log': responseLogExportFields,
};

const candidateExportFieldGroups = [
  { title: 'Student identity', fields: ['name', 'email', 'applicationNumber', 'generatedExamId', 'course', 'courseId', 'eligibilityStatus', 'mailStatus'] },
  { title: 'Exam progress', fields: ['status', 'examStatus', 'startedAt', 'submittedAt', 'durationMinutes', 'totalQuestions', 'answered', 'pending', 'markedForReview'] },
  { title: 'Score data', fields: ['correct', 'wrong', 'skipped', 'score', 'maxMarks', 'percentage'] },
  { title: 'Proctoring & integrity', fields: ['securityScore', 'fairnessScore', 'integrity', 'warningEvents', 'criticalEvents', 'totalSecurityEvents', 'ufmReviews', 'latestUfmProctor', 'latestUfmAt', 'latestUfmNote'] },
  { title: 'Identity evidence', fields: ['identityMatch', 'identityStatus', 'identityCapturedAt', 'identityReviewNote', 'selfieStorageKey', 'idCardStorageKey'] },
  { title: 'Assessment', fields: ['assessment', 'assessmentCode'] },
];

function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(value));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatCount(value, fallback = '...') {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : value;
}

function formatType(value) {
  return String(value || '-').replaceAll('_', ' ').replaceAll('-', ' ');
}

function titleCase(value) {
  return formatType(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function exportFilePart(value, fallback = 'report') {
  return String(value || fallback)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || fallback;
}

function isCanceledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
}

async function readRequestError(error, fallback) {
  if (error?.response?.data instanceof window.Blob) {
    try {
      const text = await error.response.data.text();
      const payload = JSON.parse(text);
      return payload?.message || fallback;
    } catch {
      return fallback;
    }
  }

  return error?.response?.data?.message || fallback;
}

function roleBaseFromPath(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function canUse(user, permission, fallbackPermission = 'reports.view') {
  if (user?.role === 'super_admin') return true;
  if (!permission) return true;
  const permissions = user?.permissions || [];
  return permissions.includes(permission) || permissions.includes(fallbackPermission);
}

function canExport(user, format = 'any') {
  if (user?.role === 'super_admin') return true;
  const permissions = user?.permissions || [];
  if (format === 'csv') return permissions.includes('reports.export') || permissions.includes('reports.export.csv');
  if (format === 'pdf') return permissions.includes('reports.export') || permissions.includes('reports.export.pdf');
  if (format === 'xlsx') return permissions.includes('reports.export');
  return permissions.some((permission) => ['reports.export', 'reports.export.csv', 'reports.export.pdf'].includes(permission));
}

function canReviewUfm(user) {
  return user?.role === 'super_admin' || user?.permissions?.includes('ufm.reverse');
}

function fairnessScore(candidate) {
  const raw = 100 - Number(candidate?.securityScore || 0);
  return Math.max(0, Math.min(100, raw));
}

function statusBadgeClass(value) {
  const status = String(value || '').toLowerCase();
  if (status.includes('flag') || status.includes('ufm') || status.includes('critical') || status.includes('blocked')) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (status.includes('submitted') || status.includes('passed') || status.includes('clean') || status.includes('complete')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status.includes('progress') || status.includes('review') || status.includes('warning')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildExportSchema(fields = exportFields) {
  return fields.map(([key, label]) => ({
    header: { value: label, fontWeight: 'bold' },
    cell: (row) => ({
      type: typeof row[key] === 'number' ? Number : String,
      value: row[key] ?? '',
    }),
  }));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function printPdfReport({ title, rows, fields = exportFields }) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return;
  const headers = fields.slice(0, 12);
  const tableRows = rows.slice(0, 300).map((row) => (
    `<tr>${headers.map(([key]) => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`
  )).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { color: #f97316; font-size: 22px; margin: 0 0 6px; }
          p { color: #64748b; font-size: 12px; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #e2e8f0; padding: 7px; text-align: left; }
          th { background: #fff7ed; color: #9a3412; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Showing first ${Math.min(rows.length, 300)} rows. Use XLSX/CSV for full large exports.</p>
        <table>
          <thead><tr>${headers.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

function prepareExportRows(payload) {
  return (payload.rows || []).map((row) => ({
    ...row,
    course: row.course || row.courseName || '',
    startedAt: formatDate(row.startedAt),
    submittedAt: formatDate(row.submittedAt),
    identityCapturedAt: formatDate(row.identityCapturedAt),
    latestUfmAt: formatDate(row.latestUfmAt),
    occurredAt: formatDate(row.occurredAt),
    savedAt: formatDate(row.savedAt),
    percentage: Number(row.percentage || 0),
    fairnessScore: fairnessScore(row),
  }));
}

function getExportFieldsForMode(mode) {
  return exportFieldCatalogByMode[mode] || candidateExportFields;
}

function buildExportFieldGroups(mode) {
  const fields = getExportFieldsForMode(mode);
  if (fields === candidateExportFields) {
    const byKey = new Map(fields);
    return candidateExportFieldGroups
      .map((group) => ({
        title: group.title,
        fields: group.fields.filter((key) => byKey.has(key)).map((key) => [key, byKey.get(key)]),
      }))
      .filter((group) => group.fields.length);
  }

  return [{ title: `${titleCase(mode)} columns`, fields }];
}

function MetricCard({ label, value, helper, icon: Icon, tone = 'orange' }) {
  const toneClass = {
    orange: 'border-orange-100 bg-orange-50 text-brand-600',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-600',
    rose: 'border-rose-100 bg-rose-50 text-rose-600',
    blue: 'border-sky-100 bg-sky-50 text-sky-600',
  }[tone];

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 truncate text-lg font-black leading-none text-slate-950">{value}</p>
        </div>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${toneClass}`}>
          <Icon size={14} />
        </span>
      </div>
      {helper ? <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{helper}</p> : null}
    </article>
  );
}

function Panel({ title, description, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-orange-50 text-brand-600">
                <Icon size={14} />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-slate-950">{title}</h2>
              {description ? <p className="truncate text-[11px] font-medium text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

function ToolbarStat({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    orange: 'border-orange-200 bg-orange-50 text-brand-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-bold ${toneClass}`}>
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function ReportTableToolbar({
  title,
  eyebrow,
  subtitle,
  icon: Icon,
  stats = [],
  actions,
  onBack,
  searchValue,
  onSearchChange,
  onSearch,
  onClearSearch,
  searchPlaceholder = 'Search',
}) {
  const hasSearch = typeof onSearchChange === 'function';

  return (
    <section className="rounded-lg border border-orange-100 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          {onBack ? (
            <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-brand-700" type="button" onClick={onBack} aria-label="Back">
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {Icon ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-orange-50 text-brand-600">
              <Icon size={15} />
            </span>
          ) : null}
          <div className="min-w-[220px] flex-1">
            {eyebrow ? <p className="text-[10px] font-bold uppercase text-brand-600">{eyebrow}</p> : null}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className="truncate text-base font-black text-slate-950">{title}</h1>
              {subtitle ? <span className="truncate text-xs font-semibold text-slate-500">{subtitle}</span> : null}
            </div>
          </div>
          {stats.length ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {stats.map((stat) => (
                <ToolbarStat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
          {hasSearch ? (
            <div className="flex min-w-0 flex-1 gap-1.5 xl:w-[360px] xl:flex-none">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-8 text-xs outline-none focus:border-brand-400"
                  placeholder={searchPlaceholder}
                  value={searchValue || ''}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSearch?.();
                  }}
                />
                {searchValue ? (
                  <button
                    className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    type="button"
                    onClick={onClearSearch}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
              <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-bold text-white shadow-sm shadow-orange-200 hover:bg-brand-700" type="button" onClick={onSearch}>
                <Search size={13} />
                Search
              </button>
            </div>
          ) : null}
          {actions}
        </div>
      </div>
    </section>
  );
}

function Pill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    orange: 'border-orange-200 bg-orange-50 text-brand-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LoadingTable({ columns = 6 }) {
  return Array.from({ length: 7 }, (_, row) => (
    <tr key={row}>
      {Array.from({ length: columns }, (_item, column) => (
        <td className="px-4 py-2.5" key={column}>
          <div className="h-3.5 animate-pulse rounded bg-slate-100" />
        </td>
      ))}
    </tr>
  ));
}

function normalizeCourseToken(value) {
  return String(value || '').trim().toLowerCase();
}

function courseLabel(course) {
  return course?.course || course?.courseName || 'Unassigned course';
}

function courseFilterValue(course) {
  if (course?.all) return '';
  return course?.courseName || course?.course || course?.courseId || '';
}

function FloatingActionMenu({ anchorRef, open, width = 220, estimatedHeight = 240, children }) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setPosition(null);
      return undefined;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const maxLeft = window.innerWidth - width - margin;
      const left = Math.max(margin, Math.min(rect.right - width, maxLeft));
      const preferredTop = rect.bottom + 8;
      const top = preferredTop + estimatedHeight > window.innerHeight - margin
        ? Math.max(margin, rect.top - estimatedHeight - 8)
        : preferredTop;
      setPosition({ left, top, width });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, estimatedHeight, open, width]);

  if (!open || !position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed z-[120] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-2xl shadow-slate-300/60"
      style={{ left: position.left, top: position.top, width: position.width }}
    >
      {children}
    </div>,
    document.body
  );
}

function ReportHome({ basePath }) {
  const cards = [
    {
      title: 'Exam',
      description: 'Exam-level report dashboard, score summary, proctoring drill-down, action menus, and exports.',
      to: `${basePath}/assessments/reports/exam`,
      icon: BarChart3,
      helper: 'Recommended for admin review',
    },
    {
      title: 'Attendance Report',
      description: 'Candidate attendance, login/submission status, attempt state, and attendance export workflow.',
      to: `${basePath}/assessments/reports/attendance`,
      icon: UserCheck,
      helper: 'Built for high-volume batches',
    },
  ];

  return (
    <section className="min-h-[calc(100vh-120px)] rounded-lg border border-orange-100 bg-[#fff8f3] p-3">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg border border-orange-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Exam Report</p>
          <h1 className="mt-1 text-xl font-black text-slate-950">Choose report workspace</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Open exam analytics or attendance reports from one clean admin panel. Tables use paginated loading and details are fetched only when required.
          </p>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md hover:shadow-orange-100"
              key={card.title}
              to={card.to}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-50 text-brand-600">
                  <card.icon size={18} />
                </span>
                <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-700">
                  {card.helper}
                </span>
              </div>
              <h2 className="mt-3 text-base font-black text-slate-950">{card.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
              <span className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-brand-700">
                Open workspace
                <ArrowLeft className="rotate-180 transition group-hover:translate-x-1" size={15} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExamActionMenu({ assessment, open, onToggle, onAction, user, actions = reportActions }) {
  const buttonRef = useRef(null);

  return (
    <div className="relative inline-flex justify-end">
      <button
        ref={buttonRef}
        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-brand-600"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(open ? '' : assessment.id);
        }}
        aria-label="Open report actions"
      >
        <MoreVertical size={15} />
      </button>

      <FloatingActionMenu anchorRef={buttonRef} open={open} width={282} estimatedHeight={330}>
        {actions.map((action) => {
          const Icon = action.icon;
          const allowed = canUse(user, action.permission);
          return (
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!allowed}
              key={action.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction(action, assessment);
                onToggle('');
              }}
            >
              <Icon size={14} className="shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
              {!action.ready ? <span className="text-[9px] text-slate-400">setup</span> : null}
            </button>
          );
        })}
      </FloatingActionMenu>
    </div>
  );
}

function ExamReportTable({
  assessments,
  isLoading,
  filters,
  onFilters,
  onReset,
  onOpenAction,
  user,
  actions = reportActions,
  toolbarActions,
  title = 'All Exams',
  eyebrow = 'Exam Report',
  subtitle = 'Open score, attendance, activity, response, answer-sheet, and proctoring modules',
}) {
  const [openMenu, setOpenMenu] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return assessments.filter((assessment) => {
      const matchesSearch = !query || `${assessment.title} ${assessment.assessmentCode}`.toLowerCase().includes(query);
      const matchesStatus = filters.status === 'all' || assessment.status === filters.status;
      const startDate = assessment.startAt ? new Date(assessment.startAt) : null;
      const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const to = filters.dateTo ? new Date(filters.dateTo) : null;
      if (!matchesSearch || !matchesStatus) return false;
      if (from && (!startDate || startDate < from)) return false;
      if (to && (!startDate || startDate > to)) return false;
      return true;
    });
  }, [assessments, filters]);

  const pages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.dateFrom, filters.dateTo]);

  return (
    <div className="space-y-2">
      <ReportTableToolbar
        title={title}
        eyebrow={eyebrow}
        subtitle={subtitle}
        icon={BarChart3}
        stats={[
          { label: 'Exams', value: formatCount(filtered.length, 0), tone: 'blue' },
          { label: 'Candidates', value: formatCount(filtered.reduce((total, assessment) => total + Number(assessment.students || 0), 0), 0), tone: 'orange' },
          { label: 'Page', value: `${page}/${pages}`, tone: 'slate' },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            {toolbarActions}
            <select
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 outline-none focus:border-brand-400"
              value={filters.status}
              onChange={(event) => onFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <button className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-brand-600" type="button" onClick={onReset} title="Reset filters">
              <RefreshCcw size={13} />
            </button>
          </div>
        )}
        searchValue={filters.search}
        onSearchChange={(value) => onFilters((current) => ({ ...current, search: value }))}
        onSearch={() => setPage(1)}
        onClearSearch={() => onFilters((current) => ({ ...current, search: '' }))}
        searchPlaceholder="Search exam or code"
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-bold">Exam Name</th>
                <th className="px-4 py-2.5 font-bold">Exam Code</th>
                <th className="px-4 py-2.5 font-bold">Exam Date</th>
                <th className="px-4 py-2.5 text-right font-bold">Candidate Count</th>
                <th className="px-4 py-2.5 font-bold">Proctoring Type</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <LoadingTable columns={7} />
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title="No exams found" description="Try changing the search or status filter." />
                  </td>
                </tr>
              ) : (
                visibleRows.map((assessment) => (
                  <tr className="hover:bg-orange-50/40" key={assessment.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-slate-950">{assessment.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatType(assessment.status)}</p>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-600">{assessment.assessmentCode}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(assessment.startAt, { dateStyle: 'medium' })}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{Number(assessment.students || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5"><Pill tone="orange">Live</Pill></td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(assessment.status)}`}>{formatType(assessment.status)}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <ExamActionMenu
                        assessment={assessment}
                        open={openMenu === assessment.id}
                        onToggle={setOpenMenu}
                        onAction={onOpenAction}
                        user={user}
                        actions={actions}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="text-xs font-semibold text-slate-500">
            Showing {visibleRows.length} of {filtered.length.toLocaleString('en-IN')} exams
          </p>
          <div className="flex items-center gap-2">
            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Prev</button>
            <span className="text-xs font-bold text-slate-500">Page {page} / {pages}</span>
            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(current + 1, pages))}>Next</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ExamLanding({
  assessments,
  isLoading,
  filters,
  onFilters,
  onReset,
  onOpenAction,
  user,
  actions = reportActions,
  toolbarActions,
  title,
  eyebrow,
  subtitle,
}) {
  return (
    <div className="space-y-2">
      <ExamReportTable
        assessments={assessments}
        isLoading={isLoading}
        filters={filters}
        onFilters={onFilters}
        onReset={onReset}
        onOpenAction={onOpenAction}
        user={user}
        actions={actions}
        toolbarActions={toolbarActions}
        title={title}
        eyebrow={eyebrow}
        subtitle={subtitle}
      />
    </div>
  );
}

function DownloadMenu({ disabled, isExporting, onSelectFormat, canExportFormat }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const formats = [
    ['xlsx', 'Excel', FileSpreadsheet],
    ['csv', 'CSV', FileDown],
    ['pdf', 'PDF', FileText],
  ];

  return (
    <div className="relative inline-flex justify-end">
      <button
        ref={buttonRef}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || isExporting}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {isExporting ? <Loader2 className="animate-spin" size={13} /> : <FileDown size={13} />}
        Download
      </button>
      <FloatingActionMenu anchorRef={buttonRef} open={open} width={190} estimatedHeight={130}>
        {formats.map(([format, label, Icon]) => {
          const allowed = canExportFormat(format);
          return (
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!allowed}
              key={format}
              type="button"
              title={allowed ? `Download ${label}` : `Permission required for ${label} export`}
              onClick={() => {
                onSelectFormat(format);
                setOpen(false);
              }}
            >
              <Icon size={14} className="text-brand-500" />
              {label}
            </button>
          );
        })}
      </FloatingActionMenu>
    </div>
  );
}

function ExportSelectionModal({
  intent,
  mode,
  assessment,
  filters,
  isExporting,
  isQueueingExport,
  onClose,
  onDownload,
  onQueue,
}) {
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => buildExportFieldGroups(mode), [mode]);
  const allFields = useMemo(() => groups.flatMap((group) => group.fields), [groups]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(([key, label]) => `${key} ${label}`.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.fields.length);
  }, [groups, query]);

  useEffect(() => {
    if (!intent) return;
    setSelected(allFields.map(([key]) => key));
    setQuery('');
  }, [allFields, intent]);

  if (!intent) return null;

  const formatLabel = intent.format === 'xlsx' ? 'Excel' : intent.format.toUpperCase();
  const hasFilters = Object.entries(filters || {}).some(([, value]) => value && value !== 'all');

  function toggleField(key) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-brand-600">Download setup</p>
              <h2 className="mt-0.5 text-lg font-black text-slate-950">Select report columns</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {assessment?.title || 'Selected exam'} · {assessment?.assessmentCode || '-'} · {titleCase(mode)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-black text-brand-700">{formatLabel}</span>
              <button className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-900" type="button" onClick={onClose} aria-label="Close export setup">
                <X size={15} />
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{formatCount(selected.length, 0)} selected</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{formatCount(allFields.length, 0)} available</span>
              <span className={`rounded-full border px-2 py-1 ${hasFilters ? 'border-orange-200 bg-orange-50 text-brand-700' : 'border-slate-200 bg-slate-50'}`}>
                {hasFilters ? 'Current filters applied' : 'All filtered rows'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600 hover:border-orange-200 hover:text-brand-700" type="button" onClick={() => setSelected(allFields.map(([key]) => key))}>
                Select all
              </button>
              <button className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600 hover:border-orange-200 hover:text-brand-700" type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400"
              placeholder="Search columns like email, score, identity, proctor"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filteredGroups.map((group) => (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60" key={group.title}>
                <div className="border-b border-slate-200 px-3 py-2">
                  <p className="text-xs font-black text-slate-900">{group.title}</p>
                </div>
                <div className="grid gap-1 p-2">
                  {group.fields.map(([key, label]) => (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-orange-50" key={key}>
                      <input
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        type="checkbox"
                        checked={selectedSet.has(key)}
                        onChange={() => toggleField(key)}
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="text-[10px] font-bold text-slate-400">{key}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">
            Only selected columns will be included in the export.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {intent.format === 'csv' ? (
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-orange-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isQueueingExport || selected.length === 0}
                type="button"
                onClick={() => onQueue(intent.format, selected)}
              >
                {isQueueingExport ? <Loader2 className="animate-spin" size={14} /> : <Clock3 size={14} />}
                Queue CSV
              </button>
            ) : null}
            <button className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:border-orange-200 hover:text-brand-700" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-xs font-black text-white shadow-sm shadow-orange-200 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExporting || selected.length === 0}
              type="button"
              onClick={() => onDownload(intent.format, selected)}
            >
              {isExporting ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />}
              Download {formatLabel}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ExportJobsPanel({ jobs, isLoading, onRefresh, onDownload }) {
  if (!jobs.length && !isLoading) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Background Exports</p>
        <button className="text-[11px] font-bold text-brand-600 hover:text-brand-700" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="mt-2 grid gap-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Loader2 className="animate-spin" size={14} />
            Loading export jobs...
          </div>
        ) : jobs.slice(0, 3).map((job) => (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2" key={job.id}>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-800">{titleCase(job.module)} · {String(job.format || '').toUpperCase()}</p>
              <p className="text-[11px] font-semibold text-slate-500">
                {titleCase(job.status)}{job.rowCount ? ` · ${Number(job.rowCount).toLocaleString('en-IN')} rows` : ''}{job.completedAt ? ` · ${formatDate(job.completedAt)}` : ''}
              </p>
            </div>
            {job.status === 'completed' ? (
              <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-[11px] font-bold text-brand-700 hover:bg-orange-100" type="button" onClick={() => onDownload(job)}>
                <FileDown size={13} />
                Download
              </button>
            ) : (
              <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(job.status)}`}>
                {job.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pagination({ pagination, page, onPage, pageSize, onPageSize }) {
  const total = pagination?.total || 0;
  const first = total ? ((pagination?.page || page) - 1) * (pagination?.limit || pageSize) + 1 : 0;
  const last = Math.min(first + (pagination?.limit || pageSize) - 1, total);
  const pages = pagination?.pages || 1;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
      <p className="text-xs font-semibold text-slate-500">{first.toLocaleString('en-IN')}-{last.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 outline-none" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => onPage(Math.max(page - 1, 1))}>Prev</button>
        <span className="text-xs font-bold text-slate-500">Page {page} / {pages}</span>
        <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={page >= pages} onClick={() => onPage(Math.min(page + 1, pages))}>Next</button>
      </div>
    </footer>
  );
}

function CandidateActionMenu({ candidate, open, onToggle, onDetail }) {
  const buttonRef = useRef(null);

  return (
    <div className="relative inline-flex justify-end">
      <button
        ref={buttonRef}
        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-brand-600"
        type="button"
        onClick={() => onToggle(open ? '' : candidate.assignmentId)}
        aria-label="Open candidate actions"
      >
        <MoreVertical size={15} />
      </button>
      <FloatingActionMenu anchorRef={buttonRef} open={open} width={190} estimatedHeight={58}>
        <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-brand-700" type="button" onClick={() => { onDetail(candidate); onToggle(''); }}>
          <Eye size={14} className="text-brand-500" />
          View Detail Report
        </button>
      </FloatingActionMenu>
    </div>
  );
}

function ProctoringCandidateTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize, onDetail }) {
  const [openMenu, setOpenMenu] = useState('');

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1160px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase text-slate-500 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <th className="w-12 px-4 py-2.5"><input type="checkbox" className="rounded border-slate-300" aria-label="Select all candidates" /></th>
              <th className="px-4 py-2.5 font-bold">Unique ID</th>
              <th className="px-4 py-2.5 font-bold">Candidate Name</th>
              <th className="px-4 py-2.5 font-bold">Email</th>
              <th className="px-4 py-2.5 text-right font-bold">Attempt No.</th>
              <th className="px-4 py-2.5 text-right font-bold">Fairness</th>
              <th className="px-4 py-2.5 font-bold">Integrity</th>
              <th className="px-4 py-2.5 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={8} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title="No candidates found" description="Try another search, course, status, or integrity filter." />
                </td>
              </tr>
            ) : (
              items.map((candidate) => (
                <tr className="hover:bg-orange-50/40" key={candidate.assignmentId}>
                  <td className="px-4 py-2.5"><input type="checkbox" className="rounded border-slate-300" aria-label={`Select ${candidate.name}`} /></td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{candidate.generatedExamId || candidate.applicationNumber || '-'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-orange-50 text-[11px] font-bold text-brand-700">{candidate.name?.charAt(0)?.toUpperCase() || 'C'}</span>
                      <span className="font-bold text-slate-950">{candidate.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{candidate.email}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700">1</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatPercent(fairnessScore(candidate))}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(candidate.integrityStatus)}`}>{formatType(candidate.integrityStatus)}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <CandidateActionMenu candidate={candidate} open={openMenu === candidate.assignmentId} onToggle={setOpenMenu} onDetail={onDetail} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function ScoreReportTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize, onDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Candidate</th>
              <th className="px-4 py-3 font-bold">Unique ID</th>
              <th className="px-4 py-3 font-bold">Course</th>
              <th className="px-4 py-3 text-right font-bold">Answered</th>
              <th className="px-4 py-3 text-right font-bold">Score</th>
              <th className="px-4 py-3 text-right font-bold">Percentage</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-bold">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={8} />
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><EmptyState title="No score rows found" description="Scores will appear as candidates submit exams." /></td></tr>
            ) : (
              items.map((candidate) => (
                <tr className="hover:bg-orange-50/40" key={candidate.assignmentId}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{candidate.name}</p>
                    <p className="text-[11px] text-slate-400">{candidate.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{candidate.generatedExamId}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.courseName || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{candidate.answered}/{candidate.totalQuestions}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">{candidate.score}/{candidate.maxMarks}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-700">{formatPercent(candidate.percentage)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(candidate.status)}`}>{formatType(candidate.status)}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-brand-600" type="button" onClick={() => onDetail(candidate)} aria-label="Open score detail">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function AttendanceReportTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize, onDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-bold">Candidate</th>
              <th className="px-4 py-2.5 font-bold">Unique ID</th>
              <th className="px-4 py-2.5 font-bold">Login Time</th>
              <th className="px-4 py-2.5 font-bold">Submission Time</th>
              <th className="px-4 py-2.5 text-right font-bold">Duration</th>
              <th className="px-4 py-2.5 font-bold">Attendance</th>
              <th className="px-4 py-2.5 text-right font-bold">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={7} />
            ) : items.length === 0 ? (
              <tr><td colSpan={7}><EmptyState title="No attendance rows found" description="Attendance appears after candidates start their attempt." /></td></tr>
            ) : (
              items.map((candidate) => {
                const attended = Boolean(candidate.startedAt || candidate.submittedAt);
                return (
                  <tr className="hover:bg-orange-50/40" key={candidate.assignmentId}>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-slate-950">{candidate.name}</p>
                      <p className="text-[11px] text-slate-400">{candidate.email}</p>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{candidate.generatedExamId}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(candidate.startedAt)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(candidate.submittedAt)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{candidate.durationMinutes === null ? '-' : `${candidate.durationMinutes}m`}</td>
                    <td className="px-4 py-2.5"><Pill tone={attended ? 'green' : 'rose'}>{attended ? 'Present' : 'Absent'}</Pill></td>
                    <td className="px-4 py-2.5 text-right">
                      <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-brand-600" type="button" onClick={() => onDetail(candidate)} aria-label="Open attendance detail">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function AnswerSheetTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize, onDetail }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Candidate</th>
              <th className="px-4 py-3 font-bold">Unique ID</th>
              <th className="px-4 py-3 font-bold">Course</th>
              <th className="px-4 py-3 text-right font-bold">Answered</th>
              <th className="px-4 py-3 text-right font-bold">Marked</th>
              <th className="px-4 py-3 text-right font-bold">Score</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-bold">Answer Sheet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={8} />
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><EmptyState title="No answer sheets found" description="Answer sheets appear after candidates save responses." /></td></tr>
            ) : (
              items.map((candidate) => (
                <tr className="hover:bg-orange-50/40" key={candidate.assignmentId}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{candidate.name}</p>
                    <p className="text-[11px] text-slate-400">{candidate.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{candidate.generatedExamId}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.courseName || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{candidate.answered}/{candidate.totalQuestions}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{candidate.markedForReview || 0}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">{candidate.score}/{candidate.maxMarks}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(candidate.status)}`}>{formatType(candidate.status)}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:border-orange-200 hover:text-brand-700" type="button" onClick={() => onDetail(candidate, 'answers')}>
                      <FileText size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function QuestionAnalysisTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Question</th>
              <th className="px-4 py-3 font-bold">Course</th>
              <th className="px-4 py-3 font-bold">Type</th>
              <th className="px-4 py-3 text-right font-bold">Eligible</th>
              <th className="px-4 py-3 text-right font-bold">Attempted</th>
              <th className="px-4 py-3 text-right font-bold">Correct</th>
              <th className="px-4 py-3 text-right font-bold">Wrong</th>
              <th className="px-4 py-3 text-right font-bold">Skipped</th>
              <th className="px-4 py-3 text-right font-bold">Accuracy</th>
              <th className="px-4 py-3 text-right font-bold">Avg Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={10} />
            ) : items.length === 0 ? (
              <tr><td colSpan={10}><EmptyState title="No question analysis found" description="Try another question search or course filter." /></td></tr>
            ) : (
              items.map((question) => (
                <tr className="hover:bg-orange-50/40" key={question.questionId}>
                  <td className="max-w-md px-4 py-3">
                    <p className="font-bold text-slate-950">Q{question.number}</p>
                    <p className="mt-1 line-clamp-2 text-slate-600">{question.questionText}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{question.courseName || '-'}</td>
                  <td className="px-4 py-3"><Pill tone="orange">{formatType(question.type)}</Pill></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{question.eligible}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{question.attempted}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{question.correct}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-700">{question.wrong}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-500">{question.skipped}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-700">{formatPercent(question.accuracy)}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{question.averageScore}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function ActivityLogTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Time</th>
              <th className="px-4 py-3 font-bold">Candidate</th>
              <th className="px-4 py-3 font-bold">Unique ID</th>
              <th className="px-4 py-3 font-bold">Activity</th>
              <th className="px-4 py-3 font-bold">Severity</th>
              <th className="px-4 py-3 font-bold">Evidence</th>
              <th className="px-4 py-3 font-bold">Message</th>
              <th className="px-4 py-3 font-bold">Proctor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={8} />
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><EmptyState title="No activity logs found" description="Activity logs appear as monitoring events are captured." /></td></tr>
            ) : (
              items.map((event) => (
                <tr className="hover:bg-orange-50/40" key={event.id}>
                  <td className="px-4 py-3 font-semibold text-slate-600">{formatDate(event.occurredAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{event.candidateName}</p>
                    <p className="text-[11px] text-slate-400">{event.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{event.uniqueId || '-'}</td>
                  <td className="px-4 py-3 font-bold capitalize text-slate-800">{titleCase(event.type)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(event.severity)}`}>{event.severity}</span></td>
                  <td className="px-4 py-3">
                    {event.metadata?.evidence?.snapshotUrl ? (
                      <a href={event.metadata.evidence.snapshotUrl} target="_blank" rel="noreferrer" className="block w-28 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                        <img src={event.metadata.evidence.snapshotUrl} alt={`${titleCase(event.type)} snapshot`} className="h-16 w-full object-cover" loading="lazy" />
                        <span className="block px-1.5 py-1 text-[10px] font-semibold text-slate-500">{formatDate(event.metadata.evidence.capturedAt || event.occurredAt)}</span>
                      </a>
                    ) : '-'}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-slate-600">{event.message}</td>
                  <td className="px-4 py-3 text-slate-500">{event.proctorName || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function ResponseLogTable({ items, isLoading, pagination, page, pageSize, onPage, onPageSize }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Saved At</th>
              <th className="px-4 py-3 font-bold">Candidate</th>
              <th className="px-4 py-3 font-bold">Unique ID</th>
              <th className="px-4 py-3 font-bold">Question</th>
              <th className="px-4 py-3 font-bold">Response</th>
              <th className="px-4 py-3 font-bold">Result</th>
              <th className="px-4 py-3 text-right font-bold">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <LoadingTable columns={7} />
            ) : items.length === 0 ? (
              <tr><td colSpan={7}><EmptyState title="No response logs found" description="Responses appear after candidates save answers." /></td></tr>
            ) : (
              items.map((response) => (
                <tr className="hover:bg-orange-50/40" key={response.id}>
                  <td className="px-4 py-3 font-semibold text-slate-600">{formatDate(response.savedAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{response.candidateName}</p>
                    <p className="text-[11px] text-slate-400">{response.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{response.uniqueId || '-'}</td>
                  <td className="max-w-md px-4 py-3">
                    <p className="line-clamp-2 text-slate-600">{response.questionText}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{formatType(response.questionType)}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-700">{response.response || '-'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusBadgeClass(response.result)}`}>{formatType(response.result)}</span></td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{response.score}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} page={page} onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />
    </section>
  );
}

function PlaceholderReport({ action, assessment, onBack }) {
  const Icon = action?.icon || FileText;

  return (
    <Panel title={action?.label || 'Report module'} description="The report action is wired into the product flow and ready for backend-specific data mapping." icon={Icon}>
      <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-950">{assessment?.title}</p>
            <p className="mt-1 text-xs text-slate-500">{assessment?.assessmentCode}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
              This workspace has been added to the action menu. The scalable pattern is ready: fetch only the selected exam, paginate heavy rows, and add report-specific columns when the backend endpoint is available.
            </p>
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:text-brand-700" type="button" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to exams
          </button>
        </div>
      </div>
    </Panel>
  );
}

function ProcessScoreModal({ assessment, result, isProcessing, onClose, onConfirm }) {
  if (!assessment) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-200 bg-orange-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Process Score</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">{assessment.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{assessment.assessmentCode}</p>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-orange-100 bg-white text-slate-500 hover:text-slate-900" type="button" onClick={onClose} disabled={isProcessing} aria-label="Close process score">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="p-5">
          {!result ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                <p className="text-sm font-bold text-slate-950">This will recalculate score summaries for every started attempt in this exam.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Candidate answers and questions are re-graded, compact score summaries are saved on attempts, and the action is written to the audit log.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DetailRow label="Candidates" value={Number(assessment.students || 0).toLocaleString('en-IN')} />
                <DetailRow label="Submitted" value={Number(assessment.submitted || 0).toLocaleString('en-IN')} />
                <DetailRow label="Status" value={titleCase(assessment.status)} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-800">Score processing completed.</p>
                <p className="mt-1 text-xs text-emerald-700">Processed at {formatDate(result.processedAt)} by {result.processedBy?.name || 'Admin'}.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Candidates" value={result.summary?.candidates ?? 0} icon={Users} tone="blue" />
                <MetricCard label="Attempts" value={result.summary?.attempts ?? 0} icon={ListChecks} />
                <MetricCard label="Processed" value={result.summary?.processed ?? 0} icon={CheckCircle2} tone="green" />
                <MetricCard label="Average" value={formatPercent(result.summary?.averagePercentage)} icon={BarChart3} />
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:text-slate-900" type="button" onClick={onClose} disabled={isProcessing}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result ? (
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-bold text-white shadow-sm shadow-orange-200 hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70" type="button" onClick={onConfirm} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
              {isProcessing ? 'Processing...' : 'Process Score'}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function CourseActionMenu({ course, open, onToggle, onOpenStudents }) {
  const buttonRef = useRef(null);

  return (
    <div className="relative inline-flex justify-end">
      <button
        ref={buttonRef}
        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-brand-600"
        type="button"
        onClick={() => onToggle(open ? '' : `${course.course}-${course.courseId || ''}`)}
        aria-label="Open course report actions"
      >
        <MoreVertical size={15} />
      </button>
      <FloatingActionMenu anchorRef={buttonRef} open={open} width={210} estimatedHeight={62}>
        <button className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-brand-700" type="button" onClick={() => { onOpenStudents(course); onToggle(''); }}>
          <Users size={14} className="text-brand-500" />
          View Assigned Students
        </button>
      </FloatingActionMenu>
    </div>
  );
}

function ProctoringCourseOverview({ selectedAssessment, report, isLoading, onBack, onOpenStudents }) {
  const [openMenu, setOpenMenu] = useState('');
  const [coursePage, setCoursePage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 50;
  const summary = report?.summary || {};
  const rawCourses = report?.distributions?.courses || [];
  const courses = rawCourses.length
    ? rawCourses
    : [{ all: true, course: 'All assigned students', courseName: '', courseId: '', total: summary.assigned || 0, submitted: summary.submitted || 0, flagged: summary.flaggedSessions || 0 }];
  const courseQuery = normalizeCourseToken(search);
  const filteredCourses = courseQuery
    ? courses.filter((course) => [course.course, course.courseName, course.courseId].some((value) => normalizeCourseToken(value).includes(courseQuery)))
    : courses;
  const pages = Math.max(Math.ceil(filteredCourses.length / pageSize), 1);
  const visibleCourses = filteredCourses.slice((coursePage - 1) * pageSize, coursePage * pageSize);

  useEffect(() => {
    setCoursePage(1);
  }, [search, selectedAssessment?.id]);

  const summaryStats = [
    { label: 'Candidates', value: formatCount(summary.assigned), tone: 'blue' },
    { label: 'Submitted', value: formatCount(summary.submitted), tone: 'green' },
    { label: 'Flagged', value: formatCount(summary.flaggedSessions), tone: 'rose' },
    { label: 'Courses', value: formatCount(filteredCourses.length, 0), tone: 'orange' },
  ];

  return (
    <div className="space-y-2">
      <ReportTableToolbar
        title="Proctoring Report"
        eyebrow="Course List"
        subtitle={`${selectedAssessment?.title || 'Selected exam'} · ${selectedAssessment?.assessmentCode || '-'}`}
        icon={ShieldAlert}
        stats={summaryStats}
        onBack={onBack}
        searchValue={search}
        onSearchChange={setSearch}
        onSearch={() => setCoursePage(1)}
        onClearSearch={() => setSearch('')}
        searchPlaceholder="Search course"
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-bold">Course</th>
                <th className="px-4 py-2.5 text-right font-bold">Assigned</th>
                <th className="px-4 py-2.5 text-right font-bold">Submitted</th>
                <th className="px-4 py-2.5 text-right font-bold">Pending</th>
                <th className="px-4 py-2.5 text-right font-bold">Flagged</th>
                <th className="px-4 py-2.5 font-bold">Completion</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <LoadingTable columns={7} />
              ) : visibleCourses.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No courses found" description="Try another course search." /></td></tr>
              ) : visibleCourses.map((course) => {
                const total = Number(course.total || 0);
                const submitted = Number(course.submitted || 0);
                const flagged = Number(course.flagged || 0);
                const pending = Math.max(total - submitted, 0);
                const completion = total ? Number(((submitted / total) * 100).toFixed(1)) : 0;
                const rowKey = `${course.course}-${course.courseId || ''}`;
                return (
                  <tr className="hover:bg-orange-50/40" key={rowKey}>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-slate-950">{course.course}</p>
                      {course.courseId ? <p className="mt-0.5 text-[11px] text-slate-400">{course.courseId}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-950">{total.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{submitted.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-600">{pending.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-rose-700">{flagged.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(completion, 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{formatPercent(completion)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CourseActionMenu course={course} open={openMenu === rowKey} onToggle={setOpenMenu} onOpenStudents={onOpenStudents} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="text-xs font-semibold text-slate-500">Showing {visibleCourses.length} of {filteredCourses.length.toLocaleString('en-IN')} courses</p>
          <div className="flex items-center gap-2">
            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={coursePage <= 1} onClick={() => setCoursePage((current) => Math.max(current - 1, 1))}>Prev</button>
            <span className="text-xs font-bold text-slate-500">Page {coursePage} / {pages}</span>
            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40" type="button" disabled={coursePage >= pages} onClick={() => setCoursePage((current) => Math.min(current + 1, pages))}>Next</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ReportWorkspace({
  mode,
  selectedAssessment,
  report,
  isLoading,
  filters,
  onFilters,
  onApply,
  onReset,
  page,
  pageSize,
  onPage,
  onPageSize,
  onBack,
  onDetail,
  onExport,
  onRefreshExportJobs,
  onDownloadExportJob,
  isExporting,
  isLoadingExportJobs,
  exportJobs,
  canExportFormat,
  lockedCourse,
}) {
  const summary = report?.summary || {};
  const items = report?.items || [];
  const titleMap = {
    proctoring: 'Proctoring Report',
    score: 'Score Report',
    attendance: 'Attendance Report',
    'answer-sheet': 'Answer Sheet Report',
    'question-analysis': 'Question Analysis Report',
    'activity-log': 'Activity Log Report',
    'response-log': 'Response Log Report',
  };
  const iconMap = {
    proctoring: ShieldAlert,
    score: BarChart3,
    attendance: UserCheck,
    'answer-sheet': FileText,
    'question-analysis': ClipboardList,
    'activity-log': Activity,
    'response-log': ListChecks,
  };
  const isLockedCourseProctoring = mode === 'proctoring' && lockedCourse;
  const isStudentListMode = isLockedCourseProctoring || mode === 'attendance';
  const studentListTotals = {
    total: isLockedCourseProctoring ? lockedCourse.total : summary.assigned,
    submitted: isLockedCourseProctoring ? lockedCourse.submitted : summary.submitted,
    flagged: isLockedCourseProctoring ? lockedCourse.flagged : summary.flaggedSessions,
  };
  const baseStats = [
    { label: 'Candidates', value: formatCount(studentListTotals.total ?? report?.pagination?.total), tone: 'blue' },
    { label: 'Submitted', value: formatCount(studentListTotals.submitted), tone: 'green' },
    { label: 'Flagged', value: formatCount(studentListTotals.flagged, 0), tone: 'rose' },
  ];
  const summaryStats = isStudentListMode ? baseStats : ({
    'question-analysis': [
      { label: 'Questions', value: formatCount(summary.totalQuestions), tone: 'blue' },
      { label: 'Eligible', value: formatCount(summary.totalEligible), tone: 'orange' },
      { label: 'Attempted', value: formatCount(summary.totalAttempted), tone: 'green' },
      { label: 'Accuracy', value: formatPercent(summary.averageAccuracy), tone: 'orange' },
    ],
    'activity-log': [
      { label: 'Activities', value: formatCount(summary.total), tone: 'blue' },
      { label: 'Critical', value: formatCount(summary.critical, 0), tone: 'rose' },
      { label: 'Warnings', value: formatCount(summary.warning, 0), tone: 'orange' },
      { label: 'Info', value: formatCount(summary.info, 0), tone: 'green' },
    ],
    'response-log': [
      { label: 'Responses', value: formatCount(summary.total), tone: 'blue' },
      { label: 'Answered', value: formatCount(summary.answered), tone: 'green' },
      { label: 'Marked', value: formatCount(summary.markedForReview, 0), tone: 'orange' },
    ],
  }[mode] || [
    { label: 'Candidates', value: formatCount(summary.assigned), tone: 'blue' },
    { label: 'Submitted', value: formatCount(summary.submitted), tone: 'green' },
    { label: 'Average', value: formatPercent(summary.averagePercentage), tone: 'orange' },
    { label: 'Flagged', value: formatCount(summary.flaggedSessions, 0), tone: 'rose' },
  ]);
  const reportTitle = isLockedCourseProctoring ? `${lockedCourse.label} Students` : titleMap[mode];
  const searchPlaceholderMap = {
    proctoring: 'Search name, email, ID',
    score: 'Search name, email, ID',
    attendance: 'Search name, email, ID',
    'answer-sheet': 'Search name, email, ID',
    'question-analysis': 'Search question or course',
    'activity-log': 'Search candidate or activity',
    'response-log': 'Search candidate, ID, question',
  };
  const tableContent = (
    <>
      {mode === 'proctoring' ? (
        <ProctoringCandidateTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} onDetail={onDetail} />
      ) : null}
      {mode === 'score' ? (
        <ScoreReportTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} onDetail={onDetail} />
      ) : null}
      {mode === 'attendance' ? (
        <AttendanceReportTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} onDetail={onDetail} />
      ) : null}
      {mode === 'answer-sheet' ? (
        <AnswerSheetTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} onDetail={onDetail} />
      ) : null}
      {mode === 'question-analysis' ? (
        <QuestionAnalysisTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} />
      ) : null}
      {mode === 'activity-log' ? (
        <ActivityLogTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} />
      ) : null}
      {mode === 'response-log' ? (
        <ResponseLogTable items={items} isLoading={isLoading} pagination={report?.pagination} page={page} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} />
      ) : null}
    </>
  );

  return (
    <div className="space-y-2">
      <ReportTableToolbar
        title={reportTitle}
        eyebrow={isStudentListMode ? 'Student List' : 'Report'}
        subtitle={`${selectedAssessment?.title || 'Selected exam'} · ${selectedAssessment?.assessmentCode || '-'}`}
        icon={iconMap[mode] || BarChart3}
        stats={summaryStats}
        onBack={onBack}
        actions={(
          <DownloadMenu
            disabled={!selectedAssessment?.id}
            isExporting={isExporting}
            onSelectFormat={onExport}
            canExportFormat={canExportFormat}
          />
        )}
        searchValue={filters.search}
        onSearchChange={(value) => onFilters((current) => ({ ...current, search: value }))}
        onSearch={onApply}
        onClearSearch={onReset}
        searchPlaceholder={searchPlaceholderMap[mode] || 'Search'}
      />

      <ExportJobsPanel
        jobs={exportJobs}
        isLoading={isLoadingExportJobs}
        onRefresh={onRefreshExportJobs}
        onDownload={onDownloadExportJob}
      />

      {tableContent}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-xs font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function getRecordingUrl(candidate) {
  const direct = candidate?.recordings?.camera || candidate?.recordings?.cameraUrl || candidate?.monitoring?.cameraRecordingUrl;
  if (direct) return direct;

  const event = (candidate?.securityEvents || []).find((item) => {
    const evidence = item.metadata?.evidence || {};
    const source = String(evidence.source || item.type || '').toLowerCase();
    return evidence.recordingUrl && (source.includes('camera') || source.includes('webcam'));
  });
  return event?.metadata?.evidence?.recordingUrl || '';
}

function VideoEvidence({ candidate }) {
  const url = getRecordingUrl(candidate);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-50 text-brand-600">
            <Camera size={15} />
          </span>
          <p className="text-sm font-bold text-slate-950">Candidate camera recording</p>
        </div>
        <Pill tone={url ? 'green' : 'slate'}>{url ? 'Available' : 'No recording'}</Pill>
      </div>
      {url ? (
        <video className="aspect-video w-full rounded-lg bg-slate-950" controls preload="none" src={url} />
      ) : (
        <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-center">
          <div>
            <PlayCircle className="mx-auto text-slate-300" size={34} />
            <p className="mt-2 text-sm font-bold text-slate-600">Recording not attached</p>
            <p className="mt-1 text-xs text-slate-400">The player is lazy-loaded and will use the recording URL when backend storage is connected.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function securityTone(severity) {
  if (severity === 'critical') return 'rose';
  if (severity === 'warning') return 'orange';
  return 'slate';
}

function summarizeSecurityEvents(events = []) {
  const byType = events.reduce((items, event) => {
    const key = event.type || 'activity';
    items[key] = (items[key] || 0) + 1;
    return items;
  }, {});

  return {
    total: events.length,
    critical: events.filter((event) => event.severity === 'critical').length,
    warning: events.filter((event) => event.severity === 'warning').length,
    info: events.filter((event) => event.severity === 'info').length,
    topTypes: Object.entries(byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

function ViolationOverview({ candidate }) {
  const summary = summarizeSecurityEvents(candidate.securityEvents || []);
  const identity = candidate.identityVerification || {};

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Events" value={summary.total} helper="Recorded monitoring events" icon={Activity} tone={summary.total ? 'orange' : 'green'} />
        <MetricCard label="Critical" value={summary.critical} helper="High-risk evidence" icon={ShieldAlert} tone={summary.critical ? 'rose' : 'green'} />
        <MetricCard label="Warnings" value={summary.warning} helper="Review signals" icon={ShieldAlert} tone={summary.warning ? 'orange' : 'green'} />
        <MetricCard label="Identity" value={titleCase(identity.status || 'not_started')} helper={`${formatPercent(identity.matchPercentage || 0)} match`} icon={IdCard} tone={identity.status === 'manual_review' || identity.status === 'failed' ? 'rose' : 'blue'} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Top Signals</p>
        <div className="mt-3 space-y-2">
          {summary.topTypes.length ? summary.topTypes.map((item) => (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2" key={item.type}>
              <span className="truncate text-xs font-bold text-slate-700">{titleCase(item.type)}</span>
              <span className="text-xs font-black text-brand-600">{item.count}</span>
            </div>
          )) : (
            <p className="text-xs font-semibold text-slate-500">No monitoring signals recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SecurityTimeline({ events }) {
  if (!events?.length) {
    return <EmptyState title="No timeline events" description="Monitoring timeline will appear when security events are recorded." />;
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <article className="relative rounded-xl border border-slate-200 bg-white p-4 pl-12" key={event.id || `${event.type}-${event.occurredAt}-${index}`}>
          <span className={`absolute left-4 top-5 grid h-6 w-6 place-items-center rounded-full border ${event.severity === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-600' : event.severity === 'warning' ? 'border-orange-200 bg-orange-50 text-brand-600' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            <ShieldAlert size={13} />
          </span>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-950">{titleCase(event.type)}</p>
                <Pill tone={securityTone(event.severity)}>{event.severity || 'info'}</Pill>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{event.message || 'Security event recorded.'}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-400">{formatDate(event.occurredAt)}</span>
          </div>
          {event.metadata?.evidence?.snapshotUrl ? (
            <a href={event.metadata.evidence.snapshotUrl} target="_blank" rel="noreferrer" className="mt-3 block max-w-xs overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={event.metadata.evidence.snapshotUrl} alt={`${titleCase(event.type)} snapshot`} className="h-32 w-full object-cover" loading="lazy" />
              <span className="block px-2 py-1.5 text-[11px] font-semibold text-slate-500">
                Snapshot captured {formatDate(event.metadata.evidence.capturedAt || event.occurredAt)}
              </span>
            </a>
          ) : null}
          {event.proctorName ? <p className="mt-3 text-[11px] font-bold text-slate-400">Marked by {event.proctorName}</p> : null}
        </article>
      ))}
    </div>
  );
}

function CandidateDetailModal({ detail, isLoading, initialTab = 'summary', onClose, onUfmDecision, canDecideUfm, canViewRecordings }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [logTab, setLogTab] = useState('exam');

  useEffect(() => {
    setActiveTab(initialTab);
    setLogTab('exam');
  }, [detail?.candidate?.assignmentId, initialTab]);

  if (!detail && !isLoading) return null;

  const candidate = detail?.candidate;
  const assessment = detail?.assessment;
  const identity = candidate?.identityVerification || {};
  const examLogs = candidate ? [
    ['Login Time', formatDate(candidate.startedAt)],
    ['Submission Time', formatDate(candidate.submittedAt)],
    ['Internet Check', candidate.startedAt ? 'Connectivity test passed' : 'Not captured'],
    ['Microphone Test', candidate.startedAt ? 'Microphone test passed' : 'Not captured'],
    ['Webcam Test', identity.status && identity.status !== 'not_started' ? 'Webcam and identity test captured' : 'Not captured'],
  ] : [];
  const proctoringLogs = candidate?.securityEvents || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <section className="flex h-[calc(100vh-32px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <Loader2 className="mx-auto animate-spin text-brand-600" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-700">Opening candidate report</p>
            </div>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    {identity.selfieImage ? (
                      <img className="h-full w-full object-cover" src={identity.selfieImage} alt={`${candidate.name} selfie`} loading="lazy" />
                    ) : (
                      <div className="grid h-full place-items-center text-slate-300"><Users size={34} /></div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold text-slate-950">{candidate.name}</h2>
                      <Pill tone={candidate.integrityStatus === 'flagged' ? 'rose' : 'green'}>{formatType(candidate.integrityStatus)}</Pill>
                    </div>
                    <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                      <p><span className="font-bold text-slate-900">Unique ID:</span> {candidate.generatedExamId || candidate.applicationNumber}</p>
                      <p><span className="font-bold text-slate-900">Email:</span> {candidate.email}</p>
                      <p><span className="font-bold text-slate-900">Fairness Score:</span> {formatPercent(fairnessScore(candidate))}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{assessment?.title} · {assessment?.assessmentCode}</p>
                  </div>
                </div>
                <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900" type="button" onClick={onClose} aria-label="Close candidate report">
                  <X size={16} />
                </button>
              </div>
            </header>

            <nav className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4">
              {[
                ['summary', 'Summary', LayoutDashboard],
                ['exam', 'Exam Details', ClipboardList],
                ['answers', 'Answer Sheet', FileText],
                ['log', 'Log', Activity],
                ['violations', 'Violations', ShieldAlert],
                ['recordings', 'Recordings', Video],
              ].map(([id, label, Icon]) => (
                <button
                  className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-bold ${activeTab === id ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {activeTab === 'summary' ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <section className="rounded-lg border border-slate-200 bg-white">
                      <header className="border-b border-slate-100 px-4 py-3">
                        <h3 className="text-sm font-black text-slate-950">Attempt overview</h3>
                      </header>
                      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ['Score', `${candidate.score}/${candidate.maxMarks}`],
                          ['Percentage', formatPercent(candidate.percentage)],
                          ['Duration', candidate.durationMinutes === null ? '-' : `${candidate.durationMinutes}m`],
                          ['Status', titleCase(candidate.status)],
                          ['Total Questions', candidate.totalQuestions],
                          ['Answered', candidate.answered],
                          ['Correct', candidate.correct],
                          ['Wrong', candidate.wrong],
                        ].map(([label, value]) => (
                          <div className="bg-white px-4 py-3" key={label}>
                            <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <h3 className="text-sm font-black text-slate-950">Integrity overview</h3>
                      <dl className="mt-3 grid gap-2">
                        {[
                          ['Fairness', formatPercent(fairnessScore(candidate))],
                          ['Security events', candidate.totalSecurityEvents],
                          ['Critical', candidate.criticalEvents || 0],
                          ['Warnings', candidate.warningEvents || 0],
                          ['Identity', `${titleCase(identity.status || 'not_started')} · ${formatPercent(identity.matchPercentage || 0)}`],
                        ].map(([label, value]) => (
                          <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2" key={label}>
                            <dt className="text-xs font-bold text-slate-500">{label}</dt>
                            <dd className="text-xs font-black text-slate-950">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                  <Panel title="Identity Evidence" description="Candidate photo and ID proof captured during exam setup." icon={IdCard}>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        ['Candidate Photo', identity.selfieImage],
                        ['Uploaded ID', identity.idCardImage],
                      ].map(([label, image]) => (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50" key={label}>
                          <div className="aspect-video bg-white">
                            {image ? <img className="h-full w-full object-cover" src={image} alt={label} loading="lazy" /> : <div className="grid h-full place-items-center text-slate-300"><IdCard size={34} /></div>}
                          </div>
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <p className="text-xs font-bold text-slate-700">{label}</p>
                            <Pill tone={image ? 'green' : 'slate'}>{image ? 'Captured' : 'Missing'}</Pill>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {activeTab === 'exam' ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailRow label="Course" value={candidate.courseName || '-'} />
                  <DetailRow label="Started At" value={formatDate(candidate.startedAt)} />
                  <DetailRow label="Submitted At" value={formatDate(candidate.submittedAt)} />
                  <DetailRow label="Status" value={titleCase(candidate.status)} />
                  <DetailRow label="Total Questions" value={candidate.totalQuestions} />
                  <DetailRow label="Answered" value={candidate.answered} />
                  <DetailRow label="Correct" value={candidate.correct} />
                  <DetailRow label="Wrong" value={candidate.wrong} />
                </div>
              ) : null}

              {activeTab === 'answers' ? (
                <div className="space-y-3">
                  {(candidate.questionBreakdown || []).length === 0 ? (
                    <EmptyState title="No answer sheet data" description="Question-wise answers will appear after the candidate starts saving responses." />
                  ) : (
                    candidate.questionBreakdown.map((question) => (
                      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={question.questionId}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Question {question.number}</p>
                              <Pill tone={question.result === 'correct' ? 'green' : question.result === 'wrong' ? 'rose' : 'slate'}>{formatType(question.result)}</Pill>
                              {question.markedForReview ? <Pill tone="orange">Marked</Pill> : null}
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{question.questionText}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-lg font-bold text-slate-950">{question.score}/{question.maxMarks}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Marks</p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <DetailRow label="Type" value={titleCase(question.type)} />
                          <DetailRow label="Response" value={question.textAnswer || question.selectedOptionId || '-'} />
                          <DetailRow label="Saved At" value={formatDate(question.savedAt)} />
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : null}

              {activeTab === 'log' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['exam', 'Exam Log'],
                      ['proctoring', 'Proctoring Log'],
                    ].map(([id, label]) => (
                      <button className={`rounded-lg border px-3 py-2 text-xs font-bold ${logTab === id ? 'border-orange-200 bg-orange-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`} key={id} type="button" onClick={() => setLogTab(id)}>{label}</button>
                    ))}
                  </div>
                  {logTab === 'exam' ? (
                    <div className="space-y-2">
                      {examLogs.map(([time, message]) => (
                        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:grid-cols-[180px_minmax(0,1fr)]" key={`${time}-${message}`}>
                          <span className="font-bold text-brand-700">{time}</span>
                          <span className="text-slate-700">{message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {proctoringLogs.length === 0 ? <EmptyState title="No proctoring logs" description="No monitoring events were recorded for this attempt." /> : proctoringLogs.map((event) => (
                        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:grid-cols-[180px_minmax(0,1fr)]" key={event.id}>
                          <span className="font-bold text-brand-700">{formatDate(event.occurredAt)}</span>
                          <span className="text-slate-700">{titleCase(event.type)} · {event.message || 'Activity recorded'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === 'violations' ? (
                <div className="space-y-3">
                  <ViolationOverview candidate={candidate} />
                  {canDecideUfm && (candidate.integrityStatus === 'flagged' || candidate.ufmReviews?.length > 0) ? (
                    <div className="flex flex-wrap gap-2 rounded-xl border border-orange-100 bg-orange-50 p-3">
                      <button className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700" type="button" onClick={() => onUfmDecision(candidate, 'ufm')}>Confirm UFM</button>
                      <button className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700" type="button" onClick={() => onUfmDecision(candidate, 'clear')}>Clear Review</button>
                    </div>
                  ) : null}
                  <SecurityTimeline events={candidate.securityEvents || []} />
                </div>
              ) : null}

              {activeTab === 'recordings' ? (
                canViewRecordings ? (
                  <VideoEvidence candidate={candidate} />
                ) : (
                  <EmptyState title="Recording access is restricted" description="Ask a super admin to enable report recording access for this admin." />
                )
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function ExamReportsPage({ reportMode = 'home' }) {
  const { user } = useAuth();
  const location = useLocation();
  const basePath = roleBaseFromPath(location.pathname);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [examFilters, setExamFilters] = useState({ search: '', status: 'all', dateFrom: '', dateTo: '' });
  const [workspace, setWorkspace] = useState({ mode: reportMode === 'attendance' ? 'attendance' : 'exam-list', action: null });
  const [selectedReportCourse, setSelectedReportCourse] = useState(null);
  const [candidateFilters, setCandidateFilters] = useState(initialCandidateFilters);
  const [appliedCandidateFilters, setAppliedCandidateFilters] = useState(initialCandidateFilters);
  const [report, setReport] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState('summary');
  const [processTarget, setProcessTarget] = useState(null);
  const [processResult, setProcessResult] = useState(null);
  const [exportIntent, setExportIntent] = useState(null);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState(50);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isProcessingScore, setIsProcessingScore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isQueueingExport, setIsQueueingExport] = useState(false);
  const [isLoadingExportJobs, setIsLoadingExportJobs] = useState(false);
  const [exportJobs, setExportJobs] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const assessmentsRequestRef = useRef(null);
  const reportRequestRef = useRef(null);
  const detailRequestRef = useRef(null);
  const exportJobsRequestRef = useRef(null);

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => String(assessment.id) === String(selectedAssessmentId)),
    [assessments, selectedAssessmentId]
  );
  const loadAssessments = useCallback(async () => {
    assessmentsRequestRef.current?.abort();
    const controller = new AbortController();
    assessmentsRequestRef.current = controller;
    setIsLoadingAssessments(true);
    setError('');
    try {
      const response = await api.get('/reports/assessments', { signal: controller.signal });
      const items = response.data.items || [];
      setAssessments(items);
      setSelectedAssessmentId((current) => current || items[0]?.id || '');
    } catch (requestError) {
      if (isCanceledRequest(requestError)) return;
      setError(requestError.response?.data?.message || 'Unable to load exam reports.');
    } finally {
      if (assessmentsRequestRef.current === controller) {
        assessmentsRequestRef.current = null;
        setIsLoadingAssessments(false);
      }
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!selectedAssessmentId || !reportDataModes.includes(workspace.mode) || reportMode === 'home') {
      reportRequestRef.current?.abort();
      return;
    }
    reportRequestRef.current?.abort();
    const controller = new AbortController();
    reportRequestRef.current = controller;
    setIsLoadingReport(true);
    setError('');
    try {
      const endpointByMode = {
        'question-analysis': `/reports/assessments/${selectedAssessmentId}/question-analysis`,
        'activity-log': `/reports/assessments/${selectedAssessmentId}/activity-log`,
        'response-log': `/reports/assessments/${selectedAssessmentId}/response-log`,
      };
      const response = await api.get(endpointByMode[workspace.mode] || `/reports/assessments/${selectedAssessmentId}`, {
        params: workspace.mode === 'proctoring-courses'
          ? { page: 1, limit: 1 }
          : {
            ...appliedCandidateFilters,
            page: candidatePage,
            limit: candidatePageSize,
          },
        signal: controller.signal,
      });
      setReport(response.data);
    } catch (requestError) {
      if (isCanceledRequest(requestError)) return;
      setError(requestError.response?.data?.message || 'Unable to load report data.');
    } finally {
      if (reportRequestRef.current === controller) {
        reportRequestRef.current = null;
        setIsLoadingReport(false);
      }
    }
  }, [appliedCandidateFilters, candidatePage, candidatePageSize, reportMode, selectedAssessmentId, workspace.mode]);

  const loadExportJobs = useCallback(async () => {
    if (!selectedAssessmentId) {
      setExportJobs([]);
      return;
    }

    exportJobsRequestRef.current?.abort();
    const controller = new AbortController();
    exportJobsRequestRef.current = controller;
    setIsLoadingExportJobs(true);
    try {
      const response = await api.get('/reports/export-jobs', {
        params: { assessmentId: selectedAssessmentId },
        signal: controller.signal,
      });
      setExportJobs(response.data.items || []);
    } catch (requestError) {
      if (!isCanceledRequest(requestError)) {
        setError(requestError.response?.data?.message || 'Unable to load export jobs.');
      }
    } finally {
      if (exportJobsRequestRef.current === controller) {
        exportJobsRequestRef.current = null;
        setIsLoadingExportJobs(false);
      }
    }
  }, [selectedAssessmentId]);

  useEffect(() => () => {
    assessmentsRequestRef.current?.abort();
    reportRequestRef.current?.abort();
    detailRequestRef.current?.abort();
    exportJobsRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (reportMode !== 'home') {
      loadAssessments();
    }
  }, [loadAssessments, reportMode]);

  useEffect(() => {
    if (reportMode === 'attendance') {
      setWorkspace({ mode: 'exam-list', action: null });
      setSelectedReportCourse(null);
    } else if (reportMode === 'exam') {
      setWorkspace({ mode: 'exam-list', action: null });
      setSelectedReportCourse(null);
    } else {
      setWorkspace({ mode: 'home', action: null });
      setSelectedReportCourse(null);
    }
    setReport(null);
    setCandidatePage(1);
  }, [reportMode]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (reportRowModes.includes(workspace.mode)) {
      loadExportJobs();
    }
  }, [loadExportJobs, workspace.mode]);

  useEffect(() => {
    const hasActiveJob = exportJobs.some((job) => ['queued', 'processing'].includes(job.status));
    if (!hasActiveJob) return undefined;
    const timer = window.setInterval(() => {
      loadExportJobs();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [exportJobs, loadExportJobs]);

  function resetExamFilters() {
    setExamFilters({ search: '', status: 'all', dateFrom: '', dateTo: '' });
  }

  function openAction(action, assessment) {
    if (!canUse(user, action.permission)) return;
    setNotice('');
    setSelectedAssessmentId(assessment.id);
    setCandidatePage(1);
    setCandidateFilters(initialCandidateFilters);
    setAppliedCandidateFilters(initialCandidateFilters);
    setSelectedReportCourse(null);

    if (action.id === 'process-score') {
      setProcessTarget(assessment);
      setProcessResult(null);
      return;
    }

    if (action.id === 'proctoring') {
      setWorkspace({ mode: 'proctoring-courses', action });
    } else if (action.ready) {
      setWorkspace({ mode: action.id, action });
    } else {
      setWorkspace({ mode: 'placeholder', action });
    }
  }

  function applyCandidateFilters() {
    setCandidatePage(1);
    setAppliedCandidateFilters(candidateFilters);
  }

  function resetCandidateFilters() {
    const baseFilters = selectedReportCourse
      ? { ...initialCandidateFilters, course: selectedReportCourse.filter }
      : initialCandidateFilters;
    setCandidateFilters(baseFilters);
    setAppliedCandidateFilters(baseFilters);
    setCandidatePage(1);
  }

  function openCourseStudents(course) {
    const filter = courseFilterValue(course);
    const label = courseLabel(course);
    const nextFilters = { ...initialCandidateFilters, course: filter };
    setSelectedReportCourse({
      label,
      filter,
      courseId: course.courseId || '',
      courseName: course.courseName || label,
      total: Number(course.total || 0),
      submitted: Number(course.submitted || 0),
      flagged: Number(course.flagged || 0),
    });
    setCandidateFilters(nextFilters);
    setAppliedCandidateFilters(nextFilters);
    setCandidatePage(1);
    setReport(null);
    setWorkspace({ mode: 'proctoring', action: reportActions.find((action) => action.id === 'proctoring') });
  }

  async function openCandidateDetail(candidate, initialTab = 'summary') {
    if (!selectedAssessmentId || !candidate?.assignmentId) return;
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    setIsLoadingDetail(true);
    setDetailInitialTab(initialTab);
    setError('');
    try {
      const response = await api.get(`/reports/assessments/${selectedAssessmentId}/candidates/${candidate.assignmentId}`, {
        signal: controller.signal,
      });
      setDetail(response.data);
    } catch (requestError) {
      if (isCanceledRequest(requestError)) return;
      setError(requestError.response?.data?.message || 'Unable to open candidate detail report.');
    } finally {
      if (detailRequestRef.current === controller) {
        detailRequestRef.current = null;
        setIsLoadingDetail(false);
      }
    }
  }

  async function decideUfm(candidate, decision) {
    if (!selectedAssessmentId || !candidate?.assignmentId || !canReviewUfm(user)) return;
    const note = window.prompt(decision === 'ufm' ? 'Enter final UFM reason' : 'Enter clear-review note') || '';
    if (!note.trim()) return;
    setError('');
    try {
      await api.post(`/reports/assessments/${selectedAssessmentId}/candidates/${candidate.assignmentId}/ufm-review`, { decision, note });
      setNotice(decision === 'ufm' ? 'UFM decision saved.' : 'Review cleared.');
      await loadReport();
      await openCandidateDetail(candidate);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save UFM decision.');
    }
  }

  async function processScore() {
    if (!processTarget?.id || !canUse(user, 'reports.process_score', '')) return;
    setIsProcessingScore(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post(`/reports/assessments/${processTarget.id}/process-score`);
      setProcessResult(response.data);
      setNotice(`Score processed for ${Number(response.data.summary?.processed || 0).toLocaleString('en-IN')} attempt(s).`);
      await loadAssessments();
      if (String(selectedAssessmentId) === String(processTarget.id) && workspace.mode !== 'exam-list') {
        await loadReport();
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to process score.');
    } finally {
      setIsProcessingScore(false);
    }
  }

  function openExportSetup(format) {
    if (!selectedAssessmentId || !canExport(user, format)) return;
    setExportIntent({ format, mode: workspace.mode || 'score' });
  }

  async function exportReport(format, selectedFields = []) {
    if (!selectedAssessmentId || !canExport(user, format)) return;
    setIsExporting(true);
    setError('');
    try {
      const selectedCode = selectedAssessment?.assessmentCode || 'exam-report';
      const selectedModule = workspace.mode || 'report';
      const fieldKeys = selectedFields.join(',');
      if (format === 'csv') {
        const response = await api.get(`/reports/assessments/${selectedAssessmentId}/export`, {
          params: { ...appliedCandidateFilters, format, module: selectedModule, fields: fieldKeys },
          responseType: 'blob',
        });
        downloadBlob(response.data, `elvora-${exportFilePart(selectedCode, 'exam-report')}-${exportFilePart(selectedModule)}.csv`);
        setExportIntent(null);
        return;
      }

      const response = await api.get(`/reports/assessments/${selectedAssessmentId}/export`, {
        params: { ...appliedCandidateFilters, format, module: selectedModule, fields: fieldKeys },
      });
      const rows = prepareExportRows(response.data);
      const code = response.data.assessment?.assessmentCode || 'exam-report';
      const moduleName = response.data.module || workspace.mode || 'report';
      const fields = response.data.fields || exportFields;
      if (format === 'xlsx') {
        await downloadXlsx(rows, `elvora-${code}-${moduleName}.xlsx`, { columns: buildExportSchema(fields) });
      } else {
        printPdfReport({ title: `${response.data.assessment?.title || 'Elvora'} ${titleCase(moduleName)} Report`, rows, fields });
      }
      setExportIntent(null);
    } catch (requestError) {
      setError(await readRequestError(requestError, 'Unable to export report.'));
    } finally {
      setIsExporting(false);
    }
  }

  async function queueExportJob(format = 'csv', selectedFields = []) {
    if (!selectedAssessmentId || !canExport(user, format)) return;
    setIsQueueingExport(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post(`/reports/assessments/${selectedAssessmentId}/export-jobs`, {
        format,
        module: workspace.mode,
        filters: appliedCandidateFilters,
        fields: selectedFields,
      });
      setExportJobs((current) => [response.data.job, ...current.filter((job) => job.id !== response.data.job.id)].slice(0, 12));
      setNotice('CSV export queued. It will appear in Background Exports when ready.');
      setExportIntent(null);
    } catch (requestError) {
      setError(await readRequestError(requestError, 'Unable to queue export job.'));
    } finally {
      setIsQueueingExport(false);
    }
  }

  async function downloadExportJob(job) {
    if (!job?.id) return;
    setError('');
    try {
      const response = await api.get(`/reports/export-jobs/${job.id}/download`, { responseType: 'blob' });
      downloadBlob(response.data, job.fileName || `elvora-${exportFilePart(job.assessmentCode, 'exam-report')}-${exportFilePart(job.module)}.csv`);
    } catch (requestError) {
      setError(await readRequestError(requestError, 'Unable to download export file.'));
    }
  }

  if (reportMode === 'home') {
    return <ReportHome basePath={basePath} />;
  }

  const canViewRecordings = canUse(user, 'reports.recordings.view', '');
  const assessmentActions = reportMode === 'attendance'
    ? reportActions.filter((action) => action.id === 'attendance')
    : reportActions;
  const reportOptionsLink = (
    <Link className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-brand-700" to={`${basePath}/assessments/reports`}>
      <LayoutDashboard size={13} />
      Report options
    </Link>
  );
  return (
    <section className="min-h-[calc(100vh-112px)] rounded-lg border border-orange-100 bg-[#fff8f3] p-2">
      <div className="mx-auto max-w-[1900px] space-y-2">
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{notice}</div> : null}

        {workspace.mode === 'exam-list' ? (
          <ExamLanding
            assessments={assessments}
            isLoading={isLoadingAssessments}
            filters={examFilters}
            onFilters={setExamFilters}
            onReset={resetExamFilters}
            onOpenAction={openAction}
            user={user}
            actions={assessmentActions}
            toolbarActions={reportOptionsLink}
            title={reportMode === 'attendance' ? 'Attendance Exams' : 'All Exams'}
            eyebrow={reportMode === 'attendance' ? 'Attendance Report' : 'Exam Report'}
            subtitle={reportMode === 'attendance' ? 'Choose an assessment to view paginated attendance rows' : 'Open score, attendance, activity, response, answer-sheet, and proctoring modules'}
          />
        ) : null}

        {workspace.mode === 'proctoring-courses' ? (
          <ProctoringCourseOverview
            selectedAssessment={selectedAssessment}
            report={report}
            isLoading={isLoadingReport}
            onBack={() => {
              setSelectedReportCourse(null);
              setWorkspace({ mode: 'exam-list', action: null });
            }}
            onOpenStudents={openCourseStudents}
          />
        ) : null}

        {reportRowModes.includes(workspace.mode) ? (
          <ReportWorkspace
            mode={workspace.mode}
            selectedAssessment={selectedAssessment}
            report={report}
            isLoading={isLoadingReport}
            filters={candidateFilters}
            onFilters={setCandidateFilters}
            onApply={applyCandidateFilters}
            onReset={resetCandidateFilters}
            page={candidatePage}
            pageSize={candidatePageSize}
            onPage={setCandidatePage}
            onPageSize={(size) => { setCandidatePageSize(size); setCandidatePage(1); }}
            onBack={() => {
              if (workspace.mode === 'proctoring' && selectedReportCourse) {
                setWorkspace({ mode: 'proctoring-courses', action: reportActions.find((action) => action.id === 'proctoring') });
                setReport(null);
              } else if (reportMode === 'attendance') {
                setWorkspace({ mode: 'exam-list', action: null });
                setReport(null);
              } else {
                setWorkspace({ mode: 'exam-list', action: null });
              }
            }}
            onDetail={openCandidateDetail}
            onExport={openExportSetup}
            onRefreshExportJobs={loadExportJobs}
            onDownloadExportJob={downloadExportJob}
            isExporting={isExporting}
            isLoadingExportJobs={isLoadingExportJobs}
            exportJobs={exportJobs}
            canExportFormat={(format) => canExport(user, format)}
            lockedCourse={selectedReportCourse}
          />
        ) : null}

        {workspace.mode === 'placeholder' ? (
          <PlaceholderReport
            action={workspace.action}
            assessment={selectedAssessment}
            onBack={() => setWorkspace({ mode: 'exam-list', action: null })}
          />
        ) : null}
      </div>

      <ExportSelectionModal
        intent={exportIntent}
        mode={exportIntent?.mode || workspace.mode}
        assessment={selectedAssessment}
        filters={appliedCandidateFilters}
        isExporting={isExporting}
        isQueueingExport={isQueueingExport}
        onClose={() => {
          if (!isExporting && !isQueueingExport) setExportIntent(null);
        }}
        onDownload={exportReport}
        onQueue={queueExportJob}
      />
      <CandidateDetailModal
        detail={detail}
        isLoading={isLoadingDetail}
        initialTab={detailInitialTab}
        onClose={() => {
          detailRequestRef.current?.abort();
          setDetail(null);
        }}
        onUfmDecision={decideUfm}
        canDecideUfm={canReviewUfm(user)}
        canViewRecordings={canViewRecordings}
      />
      <ProcessScoreModal
        assessment={processTarget}
        result={processResult}
        isProcessing={isProcessingScore}
        onClose={() => {
          if (!isProcessingScore) {
            setProcessTarget(null);
            setProcessResult(null);
          }
        }}
        onConfirm={processScore}
      />
    </section>
  );
}
