import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Layers3,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState } from '../../ui/Surface.jsx';

const initialFilters = {
  search: '',
  course: '',
  status: 'all',
  integrity: 'all',
  minScore: '',
  maxScore: '',
  dateFrom: '',
  dateTo: '',
};

const exportFields = [
  ['assessment', 'Assessment'],
  ['assessmentCode', 'Assessment Code'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['applicationNumber', 'Application Number'],
  ['generatedExamId', 'Exam ID'],
  ['course', 'Course'],
  ['status', 'Status'],
  ['startedAt', 'Started At'],
  ['submittedAt', 'Submitted At'],
  ['durationMinutes', 'Duration Minutes'],
  ['totalQuestions', 'Total Questions'],
  ['answered', 'Answered'],
  ['correct', 'Correct'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['score', 'Score'],
  ['maxMarks', 'Max Marks'],
  ['percentage', 'Percentage'],
  ['securityScore', 'Security Score'],
  ['identityMatch', 'Identity Match'],
  ['identityStatus', 'Identity Status'],
  ['warningEvents', 'Warnings'],
  ['criticalEvents', 'Critical Events'],
  ['integrity', 'Integrity'],
];

function statusClass(status) {
  return `status-badge status-${String(status || 'draft').replace(/\s+/g, '_')}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatType(value) {
  return String(value || '').replaceAll('_', ' ');
}

function canExport(user) {
  return user?.role === 'super_admin' || user?.permissions?.includes('reports.export');
}

function canReviewUfm(user) {
  return user?.role === 'super_admin' || user?.permissions?.includes('ufm.reverse');
}

function buildReportSchema(selectedColumns) {
  const definitions = {
    assessment: { cell: (row) => ({ type: String, value: row.assessment || '' }) },
    assessmentCode: { cell: (row) => ({ type: String, value: row.assessmentCode || '' }) },
    name: { cell: (row) => ({ type: String, value: row.name || '' }) },
    email: { cell: (row) => ({ type: String, value: row.email || '' }) },
    applicationNumber: { cell: (row) => ({ type: String, value: row.applicationNumber || '' }) },
    generatedExamId: { cell: (row) => ({ type: String, value: row.generatedExamId || '' }) },
    course: { cell: (row) => ({ type: String, value: row.course || '' }) },
    status: { cell: (row) => ({ type: String, value: row.status || '' }) },
    startedAt: { cell: (row) => ({ type: String, value: formatDate(row.startedAt) }) },
    submittedAt: { cell: (row) => ({ type: String, value: formatDate(row.submittedAt) }) },
    durationMinutes: { cell: (row) => ({ type: Number, value: row.durationMinutes || 0 }) },
    totalQuestions: { cell: (row) => ({ type: Number, value: row.totalQuestions || 0 }) },
    answered: { cell: (row) => ({ type: Number, value: row.answered || 0 }) },
    correct: { cell: (row) => ({ type: Number, value: row.correct || 0 }) },
    wrong: { cell: (row) => ({ type: Number, value: row.wrong || 0 }) },
    skipped: { cell: (row) => ({ type: Number, value: row.skipped || 0 }) },
    score: { cell: (row) => ({ type: Number, value: row.score || 0 }) },
    maxMarks: { cell: (row) => ({ type: Number, value: row.maxMarks || 0 }) },
    percentage: { cell: (row) => ({ type: Number, value: row.percentage || 0 }) },
    securityScore: { cell: (row) => ({ type: Number, value: row.securityScore || 0 }) },
    identityMatch: { cell: (row) => ({ type: Number, value: row.identityMatch || row.identityVerification?.matchPercentage || 0 }) },
    identityStatus: { cell: (row) => ({ type: String, value: row.identityStatus || row.identityVerification?.status || '' }) },
    warningEvents: { cell: (row) => ({ type: Number, value: row.warningEvents || 0 }) },
    criticalEvents: { cell: (row) => ({ type: Number, value: row.criticalEvents || 0 }) },
    integrity: { cell: (row) => ({ type: String, value: row.integrity || '' }) },
  };

  return exportFields
    .filter(([key]) => selectedColumns.includes(key))
    .map(([key, column]) => ({ header: { value: column, fontWeight: 'bold' }, ...definitions[key] }));
}

function ReportPanel({ title, caption, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-50 text-brand-600">
              <Icon size={16} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-950">{title}</h2>
            {caption ? <p className="mt-0.5 text-[10px] text-slate-400">{caption}</p> : null}
          </div>
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, helper, icon: Icon, tone = 'orange' }) {
  const toneClass = tone === 'rose'
    ? 'bg-rose-50 text-rose-600'
    : tone === 'green'
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-orange-50 text-brand-600';

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`grid h-7 w-7 place-items-center rounded-md ${toneClass}`}>
        <Icon size={14} />
      </div>
      <p className="mt-2 truncate text-lg font-bold leading-6 text-slate-950">{value}</p>
      <p className="truncate text-[11px] font-semibold text-slate-500">{label}</p>
      {helper ? <p className="mt-1 truncate text-[9px] text-slate-400">{helper}</p> : null}
    </article>
  );
}

function BarList({ items, labelKey, valueKey, tone = 'orange' }) {
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  const barClass = tone === 'rose' ? 'bg-rose-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-brand-500';

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-xs font-medium text-slate-400">No data available.</p>
      ) : (
        items.map((item) => (
          <div key={item[labelKey]}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-600">
              <span className="truncate capitalize">{formatType(item[labelKey])}</span>
              <span>{item[valueKey]}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${barClass}`}
                style={{ width: `${Math.max((Number(item[valueKey] || 0) / max) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LoadingRows({ columns = 11 }) {
  return Array.from({ length: 6 }, (_, index) => (
    <tr key={index}>
      {Array.from({ length: columns }, (_item, cellIndex) => (
        <td key={cellIndex}>
          <div className="h-4 animate-pulse rounded bg-slate-100" />
        </td>
      ))}
    </tr>
  ));
}

function CandidateTable({
  items,
  isLoading,
  pagination,
  page,
  selectedAssessment,
  onPage,
  pageSize,
  onPageSize,
  onOpen,
  onViolations,
}) {
  const [jumpPage, setJumpPage] = useState('');
  const total = pagination?.total || 0;
  const firstRecord = total ? ((pagination?.page || 1) - 1) * (pagination?.limit || pageSize) + 1 : 0;
  const lastRecord = Math.min(firstRecord + items.length - 1, total);

  function submitJump(event) {
    event.preventDefault();
    const target = Math.min(Math.max(Number(jumpPage) || 1, 1), pagination?.pages || 1);
    onPage(target);
    setJumpPage('');
  }

  return (
    <section className="flex min-h-[440px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:flex-1">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <GraduationCap className="text-brand-600" size={16} />
          <h2 className="truncate text-xs font-bold text-slate-950">{selectedAssessment?.title || 'Candidates'}</h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{total.toLocaleString('en-IN')}</span>
        </div>
        <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          Rows
          <select className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold outline-none focus:border-brand-400" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-[1120px] w-full table-fixed border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-0 bg-slate-50 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <th className="w-12 px-2 py-2 font-bold text-slate-500">#</th>
              <th className="w-64 px-2 py-2 font-bold text-slate-500">Student</th>
              <th className="w-36 px-2 py-2 font-bold text-slate-500">Course / ID</th>
              <th className="w-24 px-2 py-2 text-right font-bold text-slate-500">Answered</th>
              <th className="w-24 px-2 py-2 text-right font-bold text-slate-500">Score</th>
              <th className="w-24 px-2 py-2 text-right font-bold text-slate-500">Correct</th>
              <th className="w-20 px-2 py-2 text-right font-bold text-slate-500">Time</th>
              <th className="w-28 px-2 py-2 font-bold text-slate-500">Status</th>
              <th className="w-28 px-2 py-2 font-bold text-slate-500">Integrity</th>
              <th className="w-16 px-2 py-2 text-center font-bold text-slate-500">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <LoadingRows columns={10} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState title="No reports found" description="Try adjusting filters or selecting another assessment." />
                </td>
              </tr>
            ) : (
              items.map((candidate, index) => (
                <tr
                  className={`h-11 cursor-pointer transition-colors hover:bg-orange-50/50 ${candidate.integrityStatus === 'flagged' ? 'bg-rose-50/35' : ''}`}
                  key={candidate.assignmentId}
                  onClick={() => onOpen(candidate)}
                >
                  <td className="px-2 py-1.5 text-slate-400">{((pagination?.page || 1) - 1) * (pagination?.limit || pageSize) + index + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-orange-100 text-[10px] font-bold text-brand-700">{candidate.name?.charAt(0)?.toUpperCase() || 'S'}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-4 text-slate-950">{candidate.name}</p>
                        <p className="truncate text-[9px] leading-3 text-slate-400">{candidate.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="truncate font-semibold text-slate-700">{candidate.course || '-'}</p>
                    <p className="truncate text-[9px] text-slate-400">{candidate.generatedExamId}</p>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{candidate.answered}/{candidate.totalQuestions}</td>
                  <td className="px-2 py-1.5 text-right">
                    <p className="font-bold text-slate-950">{candidate.score}/{candidate.maxMarks}</p>
                    <p className="text-[9px] text-slate-400">{formatPercent(candidate.percentage)}</p>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{candidate.correct}/{candidate.answered || 0}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{candidate.durationMinutes === null ? '-' : `${candidate.durationMinutes}m`}</td>
                  <td className="px-2 py-1.5"><span className={statusClass(candidate.status)}>{formatType(candidate.status)}</span></td>
                  <td className="px-2 py-1.5">
                    <button
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-bold ${
                        candidate.totalSecurityEvents > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                      }`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onViolations(candidate);
                      }}
                    >
                      {candidate.integrityStatus} · {candidate.totalSecurityEvents || 0}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      className="mx-auto grid h-7 w-7 place-items-center rounded border border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-brand-600"
                      type="button"
                      title="View candidate report"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(candidate);
                      }}
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <footer className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2">
          <p className="text-[10px] font-semibold text-slate-500">{firstRecord.toLocaleString('en-IN')}-{lastRecord.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</p>
          <div className="flex items-center gap-1.5">
            <button
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
              type="button"
              onClick={() => onPage(Math.max(page - 1, 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="whitespace-nowrap px-1 text-[10px] font-bold text-slate-600">Page {page} / {pagination.pages}</span>
            <button
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
              type="button"
              onClick={() => onPage(page + 1)}
              disabled={page >= pagination.pages}
              aria-label="Next page"
            >
              <ArrowRight size={14} />
            </button>
            <form className="ml-1 flex items-center gap-1" onSubmit={submitJump}>
              <input className="h-8 w-12 rounded border border-slate-200 bg-white px-1 text-center text-[10px] outline-none focus:border-brand-400" min="1" max={pagination.pages} placeholder="Page" type="number" value={jumpPage} onChange={(event) => setJumpPage(event.target.value)} />
              <button className="h-8 rounded border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 hover:border-orange-200 hover:text-brand-600" type="submit">Go</button>
            </form>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function CandidateDrawer({ detail, activeTab, onTab, onClose, onViolations, onUfmDecision, canDecideUfm }) {
  const candidate = detail?.candidate;
  const assessment = detail?.assessment;
  const identity = candidate?.identityVerification || {};
  if (!candidate) return null;

  return (
    <div className="fixed inset-0 z-[100] isolate flex justify-end overflow-hidden">
      <button className="absolute inset-0 z-0 bg-slate-950/45 backdrop-blur-sm" type="button" onClick={onClose} aria-label="Close drawer" />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-sm font-bold text-brand-700">
              {candidate.name?.charAt(0)?.toUpperCase() || 'S'}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-950">{candidate.name}</h2>
              <p className="truncate text-xs text-slate-400">{candidate.generatedExamId} · {assessment?.assessmentCode}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">{formatDate(candidate.submittedAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {candidate.totalSecurityEvents > 0 ? (
              <button className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700" type="button" onClick={onViolations}>
                {candidate.totalSecurityEvents} violations
              </button>
            ) : null}
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500" type="button" onClick={onClose} aria-label="Close report">
              <X size={15} />
            </button>
          </div>
        </header>

        <nav className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2">
          {[
            ['overview', 'Overview', LayoutDashboard],
            ['questions', 'Questions', GraduationCap],
            ['security', 'Security', ShieldAlert],
          ].map(([id, label, Icon]) => (
            <button
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-semibold ${
                activeTab === id ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500'
              }`}
              key={id}
              type="button"
              onClick={() => onTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {activeTab === 'overview' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Score" value={`${candidate.score}/${candidate.maxMarks}`} icon={TrendingUp} />
                <KpiCard label="Percentage" value={formatPercent(candidate.percentage)} icon={BarChart3} />
                <KpiCard label="Time" value={candidate.durationMinutes === null ? '-' : `${candidate.durationMinutes}m`} icon={Clock3} />
                <KpiCard label="Status" value={formatType(candidate.status)} icon={CheckCircle2} tone="green" />
              </div>
              <ReportPanel title="Attempt Summary" caption="Question and response outcome" icon={GraduationCap}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Answered', candidate.answered],
                    ['Correct', candidate.correct],
                    ['Wrong', candidate.wrong],
                    ['Skipped', candidate.skipped],
                  ].map(([label, value]) => (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={label}>
                      <p className="text-lg font-bold text-slate-950">{value}</p>
                      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              </ReportPanel>
            </div>
          ) : null}

          {activeTab === 'questions' ? (
            <div className="space-y-3">
              {candidate.questionBreakdown.map((question) => (
                <article
                  className={`rounded-xl border p-4 ${
                    question.result === 'correct'
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : question.result === 'wrong'
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                  key={question.questionId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-950">Question {question.number}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{question.questionText}</p>
                    </div>
                    <span className={statusClass(question.result)}>{question.result}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-500">
                    <span>Response: {question.textAnswer || question.selectedOptionId || '-'}</span>
                    <span>Marks: {question.score}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {activeTab === 'security' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Security Score" value={candidate.securityScore} icon={ShieldAlert} tone={candidate.integrityStatus === 'flagged' ? 'rose' : 'green'} />
                <KpiCard label="ID Match" value={identity.matchPercentage === undefined ? '-' : `${Number(identity.matchPercentage || 0).toFixed(1)}%`} icon={IdCard} tone={identity.status === 'manual_review' ? 'rose' : 'green'} />
                <KpiCard label="Warnings" value={candidate.warningEvents} icon={Activity} />
                <KpiCard label="Critical" value={candidate.criticalEvents} icon={ShieldAlert} tone="rose" />
                <KpiCard label="Events" value={candidate.totalSecurityEvents} icon={Layers3} />
              </div>
              <ReportPanel title="Identity Verification" caption="Selfie versus physical identity card face match" icon={IdCard}>
                {identity.status && identity.status !== 'not_started' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      {[
                        ['Status', formatType(identity.status)],
                        ['Match', `${Number(identity.matchPercentage || 0).toFixed(1)}%`],
                        ['Distance', identity.distance === null || identity.distance === undefined ? '-' : Number(identity.distance).toFixed(3)],
                        ['Captured', formatDate(identity.capturedAt)],
                      ].map(([label, value]) => (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={label}>
                          <p className="font-bold capitalize text-slate-900">{value}</p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['Live face capture', identity.selfieImage],
                        ['Identity card capture', identity.idCardImage],
                      ].map(([label, image]) => (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50" key={label}>
                          <div className="aspect-video bg-slate-100">
                            {image ? <img src={image} alt={label} className="h-full w-full object-cover" /> : null}
                          </div>
                          <p className="px-3 py-2 text-[11px] font-bold text-slate-600">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No identity capture" description="The student has not submitted identity verification evidence." />
                )}
              </ReportPanel>
              {canDecideUfm && (candidate.ufmReviews?.length > 0 || identity.status === 'manual_review' || candidate.integrityStatus === 'flagged') ? (
                <ReportPanel title="Final Integrity Decision" caption="Only admin or super admin can close this review" icon={ShieldAlert}>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100" type="button" onClick={() => onUfmDecision(candidate, 'ufm')}>
                      Confirm UFM
                    </button>
                    <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100" type="button" onClick={() => onUfmDecision(candidate, 'clear')}>
                      Clear review
                    </button>
                  </div>
                </ReportPanel>
              ) : null}
              <ReportPanel title="Security Timeline" caption="Captured monitoring events" icon={ShieldAlert}>
                <div className="space-y-3">
                  {candidate.securityEvents.length === 0 ? (
                    <EmptyState title="Clean session" description="No security events were recorded." />
                  ) : (
                    candidate.securityEvents.map((event) => (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={event.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className={statusClass(event.severity)}>{event.severity}</span>
                          <span className="text-[10px] font-semibold text-slate-400">{formatDate(event.occurredAt)}</span>
                        </div>
                        <p className="mt-2 text-xs font-bold capitalize text-slate-900">{formatType(event.type)}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{event.message || 'Security event recorded.'}</p>
                        {event.metadata?.evidence?.snapshotUrl ? (
                          <img
                            src={event.metadata.evidence.snapshotUrl}
                            alt={`${formatType(event.type)} evidence`}
                            className="mt-3 aspect-video w-full rounded-lg border border-slate-200 object-cover"
                          />
                        ) : null}
                        {event.metadata?.evidence?.recordingUrl ? (
                          <video
                            src={event.metadata.evidence.recordingUrl}
                            className="mt-3 aspect-video w-full rounded-lg border border-slate-200 bg-slate-950"
                            controls
                            preload="metadata"
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </ReportPanel>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ViolationModal({ detail, onClose }) {
  const candidate = detail?.candidate;
  if (!candidate) return null;

  const summary = candidate.securitySummary || {};
  const identity = candidate.identityVerification || {};
  const securityTiles = [
    ['Total Warnings', candidate.warningEvents || 0],
    ['Tab Switches', summary.tabSwitchCount || 0],
    ['Fullscreen Exits', summary.fullscreenExitCount || 0],
    ['Camera Flags', summary.cameraIssueCount || 0],
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-white shadow-2xl">
        <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-100">
                <ShieldAlert size={13} />
                Integrity Review
              </span>
              <h2 className="mt-3 text-xl font-bold">{candidate.name}</h2>
              <p className="mt-1 text-xs text-slate-300">{candidate.generatedExamId} · {candidate.courseName}</p>
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20" type="button" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {securityTiles.map(([label, value]) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={label}>
                <p className="text-2xl font-bold text-slate-950">{value}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <ReportPanel title="Device And Session" caption="Attempt security summary" icon={Activity}>
              <dl className="space-y-3 text-xs">
                {[
                  ['Security score', candidate.securityScore],
                  ['Integrity', candidate.integrityStatus],
                  ['AI alerts', summary.aiAlertCount || 0],
                  ['Microphone issues', summary.microphoneIssueCount || 0],
                  ['No-face events', summary.noFaceCount || 0],
                  ['Multiple-face events', summary.multipleFaceCount || 0],
                  ['Identity match', identity.status && identity.status !== 'not_started' ? `${Number(identity.matchPercentage || 0).toFixed(1)}%` : '-'],
                  ['Identity status', identity.status ? formatType(identity.status) : '-'],
                ].map(([label, value]) => (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2" key={label}>
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-bold capitalize text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </ReportPanel>

            <ReportPanel title="Suspicious Activity Timeline" caption="Ordered monitoring and proctoring evidence" icon={ShieldAlert}>
              <div className="relative max-h-[420px] space-y-4 overflow-y-auto pl-8 pr-1 before:absolute before:left-3 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
                {candidate.securityEvents.length === 0 ? (
                  <EmptyState title="No violations" description="This candidate has no recorded integrity events." />
                ) : (
                  candidate.securityEvents.map((event) => (
                    <article className="relative rounded-xl border border-slate-200 bg-slate-50 p-4" key={event.id}>
                      <span className={`absolute -left-[28px] top-4 h-3 w-3 rounded-full ring-4 ring-white ${
                        event.severity === 'critical' ? 'bg-rose-500' : event.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-400'
                      }`} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold capitalize text-slate-950">{formatType(event.type)}</p>
                        <span className="text-[10px] font-semibold text-slate-400">{formatDate(event.occurredAt)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{event.message || 'Security event recorded.'}</p>
                      {event.metadata?.evidence?.snapshotUrl ? (
                        <img
                          src={event.metadata.evidence.snapshotUrl}
                          alt={`${formatType(event.type)} evidence`}
                          className="mt-3 aspect-video w-full rounded-lg border border-slate-200 object-cover"
                        />
                      ) : null}
                      {event.metadata?.evidence?.recordingUrl ? (
                        <video
                          src={event.metadata.evidence.recordingUrl}
                          className="mt-3 aspect-video w-full rounded-lg border border-slate-200 bg-slate-950"
                          controls
                          preload="metadata"
                        />
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </ReportPanel>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExportModal({ open, columns, onColumns, onClose, onExport, isExporting }) {
  if (!open) return null;

  function toggleColumn(key) {
    onColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Export Report</h2>
            <p className="mt-1 text-xs text-slate-400">Choose the columns included in the Excel file.</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500" type="button" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button h-8 px-3 text-xs" type="button" onClick={() => onColumns(exportFields.map(([key]) => key))}>Select all</button>
            <button className="secondary-button h-8 px-3 text-xs" type="button" onClick={() => onColumns([])}>Unselect all</button>
          </div>
          <div className="mt-4 grid max-h-[420px] gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {exportFields.map(([key, label]) => (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-orange-50" key={key}>
                <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500">{columns.length} columns selected</p>
          <div className="flex gap-2">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="button" onClick={onExport} disabled={columns.length === 0 || isExporting}>
              <Download size={15} />
              {isExporting ? 'Exporting' : 'Download Excel'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function AssessmentReportsPage() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportView, setReportView] = useState('overview');
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drawerTab, setDrawerTab] = useState('overview');
  const [violationDetail, setViolationDetail] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState(() => exportFields.map(([key]) => key));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isLoadingIndex, setIsLoadingIndex] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const exportAllowed = canExport(user);
  const ufmReviewAllowed = canReviewUfm(user);

  const loadAssessments = useCallback(async () => {
    setIsLoadingIndex(true);
    setError('');
    try {
      const response = await api.get('/reports/assessments');
      setAssessments(response.data.items || []);
      setSelectedAssessmentId((current) => current || response.data.items?.[0]?.id || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load report assessments.');
    } finally {
      setIsLoadingIndex(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!selectedAssessmentId) return;
    setIsLoadingReport(true);
    setError('');
    try {
      const response = await api.get(`/reports/assessments/${selectedAssessmentId}`, {
        params: {
          ...appliedFilters,
          integrity: reportView === 'violations' ? 'flagged' : appliedFilters.integrity,
          page,
          limit: pageSize,
        },
      });
      setReport(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load detailed report.');
    } finally {
      setIsLoadingReport(false);
    }
  }, [appliedFilters, page, pageSize, reportView, selectedAssessmentId]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => String(assessment.id) === String(selectedAssessmentId)),
    [assessments, selectedAssessmentId]
  );

  const activeFilterEntries = useMemo(
    () => Object.entries(appliedFilters).filter(([, value]) => value !== '' && value !== 'all'),
    [appliedFilters]
  );

  async function loadCandidate(candidate, target = 'drawer') {
    setError('');
    try {
      const response = await api.get(`/reports/assessments/${selectedAssessmentId}/candidates/${candidate.assignmentId}`);
      if (target === 'violations') {
        setViolationDetail(response.data);
      } else {
        setDrawerTab('overview');
        setDetail(response.data);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to open candidate report.');
    }
  }

  async function decideUfm(candidate, decision) {
    if (!selectedAssessmentId || !candidate?.assignmentId || !ufmReviewAllowed) return;
    const note = window.prompt(decision === 'ufm' ? 'Enter final UFM reason' : 'Enter clear-review note') || '';
    if (!note.trim()) return;

    setError('');
    try {
      await api.post(`/reports/assessments/${selectedAssessmentId}/candidates/${candidate.assignmentId}/ufm-review`, {
        decision,
        note,
      });
      await loadReport();
      await loadCandidate(candidate);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save UFM review decision.');
    }
  }

  function applyFilters() {
    setPage(1);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  }

  function removeFilter(key) {
    const next = { ...appliedFilters, [key]: initialFilters[key] };
    setAppliedFilters(next);
    setFilters(next);
    setPage(1);
  }

  async function exportExcel() {
    if (!selectedAssessmentId || !exportAllowed || exportColumns.length === 0) return;
    setIsExporting(true);
    setError('');
    try {
      const response = await api.get(`/reports/assessments/${selectedAssessmentId}/export`, { params: appliedFilters });
      await downloadXlsx(
        response.data.rows || [],
        `evalora-report-${response.data.assessment.assessmentCode}.xlsx`,
        { columns: buildReportSchema(exportColumns) }
      );
      setExportOpen(false);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to export report.');
    } finally {
      setIsExporting(false);
    }
  }

  const summary = report?.summary || {};
  const violationCount = summary.totalSecurityEvents || selectedAssessment?.securityEvents || 0;
  const reportItems = report?.items || [];

  return (
    <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-orange-100 bg-[#fff8f3] lg:h-[calc(100vh-112px)]">
      <header className="shrink-0 border-b border-orange-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="grid items-center gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[250px_minmax(240px,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-sm shadow-orange-200">
              <BarChart3 size={19} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-950">Exam Reports</h1>
              <p className="truncate text-xs text-slate-500">
                {report?.pagination?.total || 0} candidate records across {assessments.length} assessments
              </p>
            </div>
          </div>

          <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-brand-400"
                placeholder="Search candidate records"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyFilters();
                }}
              />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500" type="button" onClick={resetFilters} title="Reset filters">
              <RotateCcw size={14} />
            </button>
            <button
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                filtersOpen || activeFilterEntries.length
                  ? 'border-orange-200 bg-orange-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterEntries.length ? (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">{activeFilterEntries.length}</span>
              ) : null}
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-50"
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!selectedAssessmentId || !exportAllowed}
            >
              <FileSpreadsheet size={14} />
              Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 bg-slate-50 sm:grid-cols-6">
          {[
            ['Assigned', summary.assigned ?? 0],
            ['Submitted', summary.submitted ?? 0],
            ['In progress', summary.inProgress ?? 0],
            ['Average', formatPercent(summary.averagePercentage)],
            ['Completion', formatPercent(summary.completionRate)],
            ['Flagged', summary.flaggedSessions ?? 0],
          ].map(([label, value]) => (
            <div className="flex items-baseline justify-between gap-2 px-3 py-2 sm:block" key={label}>
              <p className="text-[9px] font-bold uppercase text-slate-400">{label}</p>
              <p className={`text-sm font-bold ${label === 'Flagged' ? 'text-rose-700' : label === 'Submitted' ? 'text-emerald-700' : 'text-slate-950'}`}>{value}</p>
            </div>
          ))}
        </div>
        <nav className="flex overflow-x-auto border-t border-slate-200 bg-white px-3 sm:px-5" aria-label="Report sections">
          {[
            ['overview', 'Overview', LayoutDashboard],
            ['candidate-list', 'Candidates', Users],
            ['analytics', 'Analytics', BarChart3],
            ['violations', 'Violations', ShieldAlert],
          ].map(([id, label, Icon]) => (
            <button
              className={`relative flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-bold ${reportView === id ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              key={id}
              type="button"
              onClick={() => { setReportView(id); setPage(1); }}
            >
              <Icon size={14} />
              {label}
              {id === 'violations' && violationCount > 0 ? <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">{summary.flaggedSessions || 0}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      {error ? <div className="mx-4 mt-3 shrink-0 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 sm:mx-6">{error}</div> : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-5">
        <label className="text-[10px] font-bold uppercase text-slate-400" htmlFor="report-assessment">Assessment</label>
        <select
          id="report-assessment"
          className="h-8 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-400 sm:max-w-xl"
          value={selectedAssessmentId}
          disabled={isLoadingIndex}
          onChange={(event) => { setSelectedAssessmentId(event.target.value); setPage(1); }}
        >
          {assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title} - {assessment.assessmentCode}</option>)}
        </select>
        {selectedAssessment ? <><span className={statusClass(selectedAssessment.status)}>{selectedAssessment.status}</span><span className="text-[10px] font-semibold text-slate-400">{selectedAssessment.assessmentCode}</span></> : null}
      </div>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1 min-h-0 overflow-hidden px-4 py-3 sm:px-6">
        <main className={`flex min-h-0 w-full flex-col gap-3 ${reportView === 'candidate-list' ? 'overflow-hidden' : 'overflow-y-auto pr-1'}`}>
          {filtersOpen ? (
            <ReportPanel
              title="Advanced Filters"
              caption="Narrow the selected assessment report"
              icon={Filter}
              actions={<button className="text-[11px] font-semibold text-brand-600" type="button" onClick={resetFilters}>Reset all</button>}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <input className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" placeholder="Course" value={filters.course} onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))} />
                <select className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">All statuses</option>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="submitted">Submitted</option>
                  <option value="ufm">UFM</option>
                  <option value="blocked">Blocked</option>
                </select>
                <select className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" value={filters.integrity} onChange={(event) => setFilters((current) => ({ ...current, integrity: event.target.value }))}>
                  <option value="all">All integrity</option>
                  <option value="clean">Clean</option>
                  <option value="flagged">Flagged</option>
                </select>
                <input className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" type="number" placeholder="Minimum score" value={filters.minScore} onChange={(event) => setFilters((current) => ({ ...current, minScore: event.target.value }))} />
                <input className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" type="number" placeholder="Maximum score" value={filters.maxScore} onChange={(event) => setFilters((current) => ({ ...current, maxScore: event.target.value }))} />
                <button className="primary-button h-9 text-xs" type="button" onClick={applyFilters}>
                  <Filter size={13} />
                  Apply filters
                </button>
                <label>
                  <span className="field-label">Submitted from</span>
                  <input className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
                </label>
                <label>
                  <span className="field-label">Submitted to</span>
                  <input className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400" type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
                </label>
              </div>
            </ReportPanel>
          ) : null}

          {activeFilterEntries.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterEntries.map(([key, value]) => (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-brand-700" key={key}>
                  {formatType(key)}: {formatType(value)}
                  <button type="button" onClick={() => removeFilter(key)} aria-label={`Remove ${key} filter`}><X size={11} /></button>
                </span>
              ))}
              <button className="text-[11px] font-semibold text-slate-500" type="button" onClick={resetFilters}>Clear all</button>
            </div>
          ) : null}

          {reportView === 'overview' ? (
            <>
              <div className="grid shrink-0 gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Assigned" value={summary.assigned ?? '...'} helper="Eligible candidates" icon={Users} />
                <KpiCard label="Submitted" value={summary.submitted ?? '...'} helper={`${summary.inProgress || 0} in progress`} icon={CheckCircle2} tone="green" />
                <KpiCard label="Average Score" value={formatPercent(summary.averagePercentage)} helper={`Peak ${summary.highestScore || 0}`} icon={TrendingUp} />
                <KpiCard label="Completion Rate" value={formatPercent(summary.completionRate)} helper={`${summary.notStarted || 0} not started`} icon={Activity} />
                <KpiCard label="Questions" value={summary.totalQuestions ?? '...'} helper="Across mapped courses" icon={GraduationCap} />
                <KpiCard label="Violations" value={summary.totalSecurityEvents ?? '...'} helper={`${summary.flaggedSessions || 0} flagged sessions`} icon={ShieldAlert} tone="rose" />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <ReportPanel title="Score Distribution" caption="Submitted candidates by percentage band" icon={BarChart3}>
                  <BarList items={report?.distributions?.scoreBands || []} labelKey="label" valueKey="count" />
                </ReportPanel>
                <ReportPanel title="Completion Outcome" caption="Current assessment attempt state" icon={Activity}>
                  <BarList
                    items={[
                      { label: 'Submitted', count: summary.submitted || 0 },
                      { label: 'In progress', count: summary.inProgress || 0 },
                      { label: 'Not started', count: summary.notStarted || 0 },
                      { label: 'UFM', count: summary.ufm || 0 },
                    ]}
                    labelKey="label"
                    valueKey="count"
                    tone="green"
                  />
                </ReportPanel>
                <ReportPanel title="Integrity Summary" caption="Most frequent security signals" icon={ShieldAlert}>
                  <BarList items={(report?.distributions?.violationTypes || []).slice(0, 5)} labelKey="type" valueKey="count" tone="rose" />
                </ReportPanel>
              </div>

            </>
          ) : null}

          {reportView === 'candidate-list' ? (
            <CandidateTable
              items={reportItems}
              isLoading={isLoadingReport}
              pagination={report?.pagination}
              page={page}
              pageSize={pageSize}
              selectedAssessment={selectedAssessment}
              onPage={setPage}
              onPageSize={(size) => { setPageSize(size); setPage(1); }}
              onOpen={(candidate) => loadCandidate(candidate)}
              onViolations={(candidate) => loadCandidate(candidate, 'violations')}
            />
          ) : null}

          {reportView === 'analytics' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Candidates" value={summary.assigned ?? '...'} icon={Users} />
                <KpiCard label="Completed" value={summary.submitted ?? '...'} icon={CheckCircle2} tone="green" />
                <KpiCard label="Average" value={formatPercent(summary.averagePercentage)} icon={BarChart3} />
                <KpiCard label="Highest Score" value={summary.highestScore ?? '...'} icon={TrendingUp} />
                <KpiCard label="Flagged" value={summary.flaggedSessions ?? '...'} icon={ShieldAlert} tone="rose" />
                <KpiCard label="Security Events" value={summary.totalSecurityEvents ?? '...'} icon={Activity} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ReportPanel title="Score Distribution" caption="Performance spread" icon={BarChart3}>
                  <BarList items={report?.distributions?.scoreBands || []} labelKey="label" valueKey="count" />
                </ReportPanel>
                <ReportPanel title="Course Health" caption="Completion and flags by course" icon={Layers3} className="lg:col-span-2">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Course</th><th>Candidates</th><th>Submitted</th><th>Flagged</th><th>Health</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {(report?.distributions?.courses || []).map((course) => {
                          const completion = course.total ? (course.submitted / course.total) * 100 : 0;
                          return (
                            <tr key={course.course}>
                              <td className="font-semibold text-slate-900">{course.course}</td>
                              <td>{course.total}</td>
                              <td>{course.submitted}</td>
                              <td>{course.flagged}</td>
                              <td>
                                <div className="h-2 min-w-28 overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${completion}%` }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ReportPanel>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ReportPanel title="Violation Types" caption="Security event distribution" icon={ShieldAlert}>
                  <BarList items={report?.distributions?.violationTypes || []} labelKey="type" valueKey="count" tone="rose" />
                </ReportPanel>
                <ReportPanel title="Assessment Window" caption="Schedule context" icon={CalendarDays} className="lg:col-span-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="field-label">Starts</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{formatDate(report?.assessment?.startAt)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="field-label">Ends</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{formatDate(report?.assessment?.endAt)}</p>
                    </div>
                  </div>
                </ReportPanel>
              </div>
            </>
          ) : null}

          {reportView === 'violations' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <KpiCard label="Total Violations" value={summary.totalSecurityEvents ?? '...'} icon={ShieldAlert} tone="rose" />
                <KpiCard label="Flagged Sessions" value={summary.flaggedSessions ?? '...'} icon={Users} tone="rose" />
                <KpiCard label="UFM Cases" value={summary.ufm ?? '...'} icon={ShieldAlert} tone="rose" />
                <KpiCard label="Blocked" value={summary.blocked ?? '...'} icon={Activity} />
                <KpiCard label="Candidates" value={summary.assigned ?? '...'} icon={GraduationCap} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ReportPanel title="Violation Types" caption="Recorded security categories" icon={ShieldAlert} className="lg:col-span-2">
                  <BarList items={report?.distributions?.violationTypes || []} labelKey="type" valueKey="count" tone="rose" />
                </ReportPanel>
                <ReportPanel title="Risk Summary" caption="Assessment integrity position" icon={Activity}>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <p className="text-2xl font-bold text-rose-700">{summary.flaggedSessions || 0}</p>
                      <p className="text-xs font-semibold text-rose-600">Flagged candidates</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-2xl font-bold text-slate-950">{summary.assigned ? formatPercent((summary.flaggedSessions / summary.assigned) * 100) : '0.0%'}</p>
                      <p className="text-xs font-semibold text-slate-500">Flag rate</p>
                    </div>
                  </div>
                </ReportPanel>
              </div>
              <CandidateTable
                items={reportItems}
                isLoading={isLoadingReport}
              pagination={report?.pagination}
              page={page}
              pageSize={pageSize}
              selectedAssessment={selectedAssessment}
              flaggedOnly
              onPage={setPage}
              onPageSize={(size) => { setPageSize(size); setPage(1); }}
                onOpen={(candidate) => loadCandidate(candidate)}
                onViolations={(candidate) => loadCandidate(candidate, 'violations')}
              />
            </>
          ) : null}
        </main>
      </div>

      <CandidateDrawer
        detail={detail}
        activeTab={drawerTab}
        onTab={setDrawerTab}
        onClose={() => setDetail(null)}
        onViolations={() => {
          setViolationDetail(detail);
          setDetail(null);
        }}
        onUfmDecision={decideUfm}
        canDecideUfm={ufmReviewAllowed}
      />
      <ViolationModal detail={violationDetail} onClose={() => setViolationDetail(null)} />
      <ExportModal
        open={exportOpen}
        columns={exportColumns}
        onColumns={setExportColumns}
        onClose={() => setExportOpen(false)}
        onExport={exportExcel}
        isExporting={isExporting}
      />
    </section>
  );
}
