import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Clock3, FileQuestion, KeyRound, MessageSquareText, Plus, Search, Send, ShieldCheck, X, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { QuestionForm } from '../questions/QuestionForm.jsx';

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not scheduled';
}

function statusClass(status) { return `status-badge status-${status || 'pending'}`; }

const WORK_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'To do' },
  { key: 'submitted', label: 'In review' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'approved', label: 'Approved' },
];

function workStatusGroup(status) {
  if (status === 'approved') return 'approved';
  if (status === 'submitted') return 'submitted';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function questionFolderName(question) {
  return question.sourcePaperHeading || question.paperHeading || 'Untitled question set';
}

function groupQuestionsByTitle(questions) {
  const groups = new Map();
  questions.forEach((question) => {
    const heading = questionFolderName(question);
    const current = groups.get(heading) || { heading, questions: [], marks: 0, mcq: 0, oneWord: 0 };
    current.questions.push(question);
    current.marks += Number(question.positiveMarks || 0);
    if (question.type === 'mcq') current.mcq += 1;
    if (question.type === 'one_word') current.oneWord += 1;
    groups.set(heading, current);
  });
  return Array.from(groups.values()).sort((a, b) => a.heading.localeCompare(b.heading));
}

function compactHistoryTime(entry) {
  const value = entry.at || entry.createdAt || entry.updatedAt;
  if (!value) return 'Time not recorded';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function assignmentInstructionText(assessment) {
  const value = String(assessment.instructions || assessment.description || '').trim();
  return value || 'No special instruction from admin.';
}

function historyTitle(action) {
  const labels = {
    assigned: 'Assigned by admin',
    opened: 'Opened by faculty',
    submitted: 'Sent to moderator',
    approved: 'Approved by moderator',
    rejected: 'Returned by moderator',
    restart_requested: 'Review again requested',
    assignment_updated: 'Assignment updated',
  };
  return labels[action] || String(action || 'Update').replace('_', ' ');
}

function flowStepTone(step, status) {
  if (status === 'approved') return step === 'decision' ? 'approved' : 'done';
  if (status === 'rejected') return step === 'decision' ? 'rejected' : step === 'moderator' ? 'done' : step === 'faculty' ? 'active' : 'done';
  if (status === 'submitted') return step === 'moderator' ? 'active' : ['assigned', 'faculty'].includes(step) ? 'done' : 'waiting';
  if (status === 'in_progress') return step === 'faculty' ? 'active' : step === 'assigned' ? 'done' : 'waiting';
  return step === 'assigned' ? 'active' : 'waiting';
}

function AssignmentFlowDiagram({ assignment, compact = false }) {
  const status = assignment?.status || 'assigned';
  const steps = [
    { key: 'assigned', label: 'Assigned', Icon: CheckCircle2 },
    { key: 'faculty', label: status === 'rejected' ? 'Correction' : 'Faculty', Icon: FileQuestion },
    { key: 'moderator', label: 'Moderator', Icon: ShieldCheck },
    { key: 'decision', label: status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Decision', Icon: status === 'rejected' ? XCircle : CheckCircle2 },
  ];
  const toneClass = {
    done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    active: 'border-sky-200 bg-sky-50 text-sky-700',
    approved: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    rejected: 'border-rose-300 bg-rose-50 text-rose-700',
    waiting: 'border-slate-200 bg-slate-50 text-slate-400',
  };
  const lineClass = {
    done: 'bg-emerald-300',
    active: 'bg-sky-300',
    approved: 'bg-emerald-300',
    rejected: 'bg-rose-300',
    waiting: 'bg-slate-200',
  };
  const helper = status === 'submitted'
    ? `Waiting for ${assignment?.moderatorId?.name || 'moderator'} review`
    : status === 'approved'
      ? 'Moderator approved'
      : status === 'rejected'
        ? 'Returned for correction'
        : 'Faculty action pending';

  return (
    <div className={`${compact ? 'min-w-[260px]' : 'w-full'} rounded-md border border-slate-200 bg-white px-2 py-1.5`}>
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const tone = flowStepTone(step.key, status);
          const Icon = step.Icon;
          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
              <div className="min-w-0 text-center">
                <span className={`mx-auto grid ${compact ? 'h-6 w-6' : 'h-7 w-7'} place-items-center rounded-full border ${toneClass[tone]}`}>
                  <Icon size={compact ? 12 : 13} />
                </span>
                <p className={`mt-0.5 truncate ${compact ? 'text-[8px]' : 'text-[9px]'} font-bold uppercase ${tone === 'waiting' ? 'text-slate-400' : 'text-slate-700'}`}>{step.label}</p>
              </div>
              {index < steps.length - 1 ? <span className={`h-0.5 min-w-3 flex-1 rounded-full ${lineClass[flowStepTone(steps[index + 1].key, status)]}`} /> : null}
            </div>
          );
        })}
      </div>
      <p className={`mt-1 truncate text-center ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold ${status === 'rejected' ? 'text-rose-600' : status === 'approved' ? 'text-emerald-700' : status === 'submitted' ? 'text-sky-700' : 'text-slate-500'}`}>{helper}</p>
    </div>
  );
}

function workStatusCopy(status, moderator) {
  const facultyCopy = {
    assigned: 'Open the assignment and add questions from your library.',
    in_progress: 'Question authoring is in progress.',
    submitted: 'Submitted to moderator for review.',
    rejected: 'Moderator requested corrections.',
    approved: 'Moderator approved this question set.',
  };
  const moderatorCopy = {
    submitted: 'Ready for moderation decision.',
    rejected: 'Returned to faculty for correction.',
    approved: 'Approved and saved for this assessment.',
  };
  return (moderator ? moderatorCopy[status] : facultyCopy[status]) || 'Review assignment status and updates.';
}

function statusToneClasses(status) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'submitted') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function updateToneClasses(action) {
  if (action === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (action === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  if (action === 'restart_requested') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (action === 'submitted') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function UpdateDetailModal({ entry, onClose }) {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-3">
      <div className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className={`shrink-0 border-b px-4 py-3 ${updateToneClasses(entry.action)}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Work update</p>
              <h2 className="mt-1 text-base font-bold text-slate-950">{historyTitle(entry.action)}</h2>
              <p className="mt-1 text-xs font-semibold opacity-80">{compactHistoryTime(entry)}</p>
            </div>
            <button className="secondary-button h-8 w-8 bg-white p-0" type="button" onClick={onClose} aria-label="Close update message">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Message</p>
            <p className="mt-2 max-h-[48vh] overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm font-semibold leading-6 text-slate-800">
              {entry.message || 'No message was added for this update.'}
            </p>
          </div>
          {entry.actorName || entry.actorRole ? (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">Updated by</span><b className="mt-0.5 block text-slate-950">{entry.actorName || '-'}</b></p>
              <p><span className="text-slate-500">Role</span><b className="mt-0.5 block capitalize text-slate-950">{entry.actorRole || '-'}</b></p>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button className="primary-button h-8 px-3 text-xs" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function WorkReviewSummary({ assignment, assessment, questionCount, totalMarks, moderator }) {
  const updates = (assignment.history || []).slice().reverse();
  const statusLabel = assignment.status.replace('_', ' ');
  const [selectedUpdate, setSelectedUpdate] = useState(null);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 border-b border-slate-100 p-4 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-brand-600">{moderator ? 'Moderator workspace' : 'Faculty workspace'}</p>
              <h2 className="mt-1 text-base font-semibold text-slate-950">{workStatusCopy(assignment.status, moderator)}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {questionCount} question{questionCount === 1 ? '' : 's'} · {totalMarks} mark{totalMarks === 1 ? '' : 's'}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${statusToneClasses(assignment.status)}`}>{statusLabel}</span>
          </div>

          <div className="mt-3 max-w-3xl">
            <AssignmentFlowDiagram assignment={assignment} />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Admin instruction</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">{assignmentInstructionText(assessment)}</p>
            </div>
            {assignment.status === 'rejected' ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-red-600">Correction note</p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-red-800">{assignment.rejectionReason || 'Moderator returned this assignment for correction.'}</p>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">Assessment</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">{assessment.assessmentCode}</p>
              </div>
            )}
          </div>
        </div>

        <aside className="bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase text-slate-500">Updates</p>
            <span className="text-[11px] font-semibold text-slate-400">{updates.length}</span>
          </div>
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {updates.length ? updates.map((entry, index) => (
              <button
                key={`${entry.action}-${entry.at || index}`}
                className={`block w-full rounded-md border px-2.5 py-2 text-left transition hover:shadow-sm ${updateToneClasses(entry.action)}`}
                type="button"
                onClick={() => setSelectedUpdate(entry)}
                title="Open update message"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-xs font-bold">{historyTitle(entry.action)}</p>
                  <span className="shrink-0 text-[10px] font-semibold opacity-70">{compactHistoryTime(entry)}</span>
                </div>
                {entry.message ? <p className="mt-1 line-clamp-2 text-[11px] font-semibold opacity-80">{entry.message}</p> : null}
              </button>
            )) : <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-400">No updates yet</p>}
          </div>
        </aside>
      </div>
      <UpdateDetailModal entry={selectedUpdate} onClose={() => setSelectedUpdate(null)} />
    </div>
  );
}

function RestartNoticeModal({ assignment, notice, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-amber-200 bg-white text-amber-700">
              <AlertTriangle size={22} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">High priority</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">Review again requested</h2>
              <p className="mt-1 text-sm leading-5 text-amber-800">
                {notice?.actorName ? `${notice.actorName} requested this course to go through review again.` : 'Admin requested this course to go through review again.'}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p><span className="font-semibold text-slate-500">Course</span><b className="mt-0.5 block text-slate-950">{assignment.courseName}{assignment.courseId ? ` (${assignment.courseId})` : ''}</b></p>
            <p className="mt-2"><span className="font-semibold text-slate-500">Message</span><b className="mt-0.5 block text-slate-950">{notice?.message || 'Please review this assignment again.'}</b></p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Continue from this same assignment card. No duplicate card is created.
          </p>
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 p-4">
          <button className="primary-button" type="button" onClick={onClose}>Open assignment</button>
        </div>
      </div>
    </div>
  );
}

function QuestionAnswerDetail({ question }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="font-semibold leading-5 text-slate-800">{question.questionText}</p>
      {question.type === 'mcq' ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(question.options || []).map((option, index) => (
            <div key={option._id || `${question._id}-option-${index}`} className={`rounded-md border px-3 py-2 ${option.isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
              <span className="font-bold">{String.fromCharCode(65 + index)}.</span> {option.text}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">Answer: {question.expectedAnswer || '-'}</p>
      )}
      {question.explanation ? <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 leading-5 text-slate-600"><span className="font-semibold text-slate-800">Solution:</span> {question.explanation}</p> : null}
    </div>
  );
}

function PasswordModal({ item, group, onClose, onUnlocked }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function unlock(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const itemsToUnlock = group?.items?.length ? group.items : [item];
      const results = await Promise.allSettled(itemsToUnlock.map((workItem) => api.post(`/work/${workItem._id}/unlock`, { password })));
      const tokenMap = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.data?.token) {
          tokenMap[itemsToUnlock[index]._id] = result.value.data.token;
        }
      });
      if (!tokenMap[item._id]) {
        const firstError = results.find((result) => result.status === 'rejected');
        throw firstError?.reason || new Error('Unable to unlock assigned work.');
      }
      onUnlocked({ tokenMap, itemId: item._id });
    }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to unlock assigned work.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
    <form className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onSubmit={unlock}>
      <div className="border-b border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-brand-600">Secure assessment</p><h2 className="mt-1 text-xl font-bold text-slate-950">{item.assessmentId.title}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{group?.counts?.total || 1} assigned course{(group?.counts?.total || 1) === 1 ? '' : 's'} will open in one workspace.</p></div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 text-sm"><span className="text-slate-500">First course</span><b>{item.courseName}</b><span className="text-slate-500">Code</span><b>{item.assessmentId.assessmentCode}</b><span className="text-slate-500">Deadline</span><b>{formatDate(item.assessmentId.endAt)}</b></div>
        {item.rejectionReason ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Review note: {item.rejectionReason}</div> : null}
        <div><label className="field-label">Assignment password</label><div className="relative mt-2"><KeyRound className="absolute left-3 top-3 text-slate-400" size={17}/><input className="field-input pl-10" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required placeholder="Enter password from email"/></div></div>
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Verifying...' : 'Open assignment'}</button></div>
    </form>
  </div>;
}

function groupStatus(items) {
  if (items.some((item) => item.status === 'rejected')) return 'rejected';
  if (items.some((item) => item.status === 'submitted')) return 'submitted';
  if (items.some((item) => ['assigned', 'in_progress'].includes(item.status))) return 'assigned';
  if (items.every((item) => item.status === 'approved')) return 'approved';
  return items[0]?.status || 'assigned';
}

function groupProgress(counts) {
  const total = Math.max(Number(counts?.total || 0), 1);
  return Math.round((Number(counts?.approved || 0) / total) * 100);
}

function groupStatusLabel(status) {
  if (status === 'submitted') return 'In review';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Needs correction';
  return 'To do';
}

function buildWorkGroups(items) {
  const groups = new Map();
  items.forEach((item) => {
    const assessmentId = String(item.assessmentId?._id || item.assessmentId || '');
    if (!assessmentId) return;
    if (!groups.has(assessmentId)) {
      groups.set(assessmentId, {
        key: assessmentId,
        assessment: item.assessmentId,
        items: [],
        updatedAt: item.updatedAt || item.createdAt,
      });
    }
    const group = groups.get(assessmentId);
    group.items.push(item);
    if (new Date(item.updatedAt || item.createdAt || 0) > new Date(group.updatedAt || 0)) {
      group.updatedAt = item.updatedAt || item.createdAt;
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      status: groupStatus(group.items),
      counts: {
        total: group.items.length,
        pending: group.items.filter((item) => ['assigned', 'in_progress'].includes(item.status)).length,
        review: group.items.filter((item) => item.status === 'submitted').length,
        rejected: group.items.filter((item) => item.status === 'rejected').length,
        approved: group.items.filter((item) => item.status === 'approved').length,
      },
      items: group.items.sort((a, b) => {
        const statusDelta = ['submitted', 'rejected', 'assigned', 'in_progress', 'approved'].indexOf(a.status)
          - ['submitted', 'rejected', 'assigned', 'in_progress', 'approved'].indexOf(b.status);
        if (statusDelta) return statusDelta;
        return String(a.courseName || '').localeCompare(String(b.courseName || ''));
      }),
    }))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function saveWorkContext(group, tokenMap = {}) {
  const assessmentId = group?.key || '';
  if (!assessmentId) return;
  const context = {
    assessmentId,
    assessment: group.assessment,
    items: group.items,
    tokenMap,
    savedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(`evalora_work_context_${assessmentId}`, JSON.stringify(context));
}

function loadWorkContext(assessmentId) {
  if (!assessmentId) return null;
  try {
    return JSON.parse(window.sessionStorage.getItem(`evalora_work_context_${assessmentId}`) || 'null');
  } catch {
    return null;
  }
}

function AssessmentWorkCard({ group, isModerator, onOpen }) {
  const progress = groupProgress(group.counts);
  const nextCourse = group.items.find((item) => item.status === 'submitted')
    || group.items.find((item) => item.status === 'rejected')
    || group.items.find((item) => ['assigned', 'in_progress'].includes(item.status))
    || group.items[0];

  return (
    <article className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md xl:grid-cols-[minmax(0,1fr)_18rem_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusClass(group.status)}>{groupStatusLabel(group.status)}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500">
            {group.counts.total} course{group.counts.total === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] font-bold text-slate-400">{group.assessment?.assessmentCode}</span>
        </div>
        <h2 className="mt-2 truncate text-base font-bold text-slate-950">{group.assessment?.title}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Deadline: {formatDate(group.assessment?.endAt)}
        </p>
      </div>

      <div className="min-w-0">
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center text-[11px] font-bold">
          <span className="px-2 py-1.5 text-slate-600">Total {group.counts.total}</span>
          <span className="border-l border-slate-200 px-2 py-1.5 text-sky-700">Review {group.counts.review}</span>
          <span className="border-l border-slate-200 px-2 py-1.5 text-red-700">Reject {group.counts.rejected}</span>
          <span className="border-l border-slate-200 px-2 py-1.5 text-emerald-700">Done {group.counts.approved}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-10 text-right text-xs font-bold text-brand-700">{progress}%</span>
        </div>
      </div>

      <button className="primary-button h-10 px-4 text-xs" type="button" onClick={() => onOpen(group, nextCourse)}>
        <KeyRound size={15} />
        {isModerator ? 'Open review' : 'Open work'}
      </button>
    </article>
  );
}

export function AssignedWorkPage() {
  const { user } = useAuth(); const navigate = useNavigate(); const [items, setItems] = useState([]); const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [activeTab, setActiveTab] = useState('all');
  useEffect(() => { api.get('/work').then((r) => setItems(r.data.items || [])).catch((e) => setError(e.response?.data?.message || 'Unable to load assigned work.')).finally(() => setLoading(false)); }, []);
  const workGroups = useMemo(() => buildWorkGroups(items), [items]);
  const counts = useMemo(() => ({
    total: workGroups.length,
    pending: workGroups.filter((x) => ['assigned','in_progress'].includes(x.status)).length,
    review: workGroups.filter((x) => x.status === 'submitted').length,
    rejected: workGroups.filter((x) => x.status === 'rejected').length,
    completed: workGroups.filter((x) => x.status === 'approved').length,
  }), [workGroups]);
  const visibleItems = useMemo(() => items.filter((item) => {
    const haystack = `${item.assessmentId?.title || ''} ${item.assessmentId?.assessmentCode || ''} ${item.courseName || ''} ${item.courseId || ''} ${item.facultyId?.name || ''} ${item.moderatorId?.name || ''}`.toLowerCase();
    const matchesSearch = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesTab = activeTab === 'all' || workStatusGroup(item.status) === activeTab;
    return matchesSearch && matchesTab;
  }), [activeTab, items, query]);
  const visibleGroups = useMemo(() => buildWorkGroups(visibleItems), [visibleItems]);
  const isModerator = user.role === 'moderator';
  function openGroup(group, preferredItem) {
    setSelected({ group, item: preferredItem || group.items[0] });
  }
  function opened({ tokenMap, itemId }) {
    Object.entries(tokenMap || {}).forEach(([assignmentId, token]) => {
      window.sessionStorage.setItem(`evalora_work_${assignmentId}`, token);
    });
    saveWorkContext(selected.group, tokenMap);
    navigate(`/${user.role}/work/${itemId || selected.item._id}`);
  }
  return <section className="space-y-5">
    <PageHeader eyebrow={isModerator ? 'Moderation' : 'Faculty workspace'} title={isModerator ? 'Assessment Review Queue' : 'Assigned Work'} description={isModerator ? 'Open one assessment, then review all assigned courses from a focused course navigator.' : 'Open one assessment, then complete assigned courses from a focused course navigator.'}/>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
    <div className="grid gap-2 sm:grid-cols-4">{[['To do', counts.pending, Clock3], ['In review', counts.review, MessageSquareText], ['Rejected', counts.rejected, AlertTriangle], ['Approved', counts.completed, CheckCircle2]].map(([label,value,Icon]) => <button key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40" type="button" onClick={() => setActiveTab(label === 'To do' ? 'pending' : label === 'In review' ? 'submitted' : label.toLowerCase())}><Icon size={16} className="text-brand-600"/><p className="mt-2 text-lg font-semibold leading-none text-slate-950">{value}</p><p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">{label}</p></button>)}</div>
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {WORK_TABS.map((tab) => <button key={tab.key} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === tab.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} type="button" onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="relative min-w-64 flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={15}/>
          <input className="field-input h-9 pl-9 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assessment, course, code" />
        </div>
      </div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading assigned work...</p> : items.length === 0 ? <EmptyState title="No assigned work" description={isModerator ? 'Faculty submissions will appear here.' : 'New assessment assignments will appear here after an admin sends review work.'}/> : visibleGroups.length === 0 ? <EmptyState title="No matching work" description="Adjust search or choose another status."/> : <div className="grid gap-3 p-3 2xl:grid-cols-2">{visibleGroups.map((group) => (
        <AssessmentWorkCard key={group.key} group={group} isModerator={isModerator} onOpen={openGroup} />
      ))}</div>}
    </div>
    {selected ? <PasswordModal item={selected.item} group={selected.group} onClose={() => setSelected(null)} onUnlocked={opened}/> : null}
  </section>;
}

export function WorkWorkspacePage() {
  const { user } = useAuth(); const { assignmentId } = useParams(); const navigate = useNavigate();
  const token = window.sessionStorage.getItem(`evalora_work_${assignmentId}`); const [data, setData] = useState(null); const [workContext, setWorkContext] = useState(null); const [error, setError] = useState(''); const [editing, setEditing] = useState(null); const [filters, setFilters] = useState({ type: '', difficulty: '' }); const [courseQuery, setCourseQuery] = useState(''); const [courseFilter, setCourseFilter] = useState('all'); const [expandedFolder, setExpandedFolder] = useState(''); const [expanded, setExpanded] = useState(''); const [rejecting, setRejecting] = useState(false); const [confirmSubmit, setConfirmSubmit] = useState(false); const [showRestartNotice, setShowRestartNotice] = useState(true); const [submitMessage, setSubmitMessage] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const headers = token ? { 'x-assignment-token': token } : {};
  async function load() {
    if (!token) return navigate(`/${user.role}`, { replace: true });
    try {
      const r = await api.get(`/work/${assignmentId}/details`, { headers });
      setData(r.data);
      const assessmentId = String(r.data.assignment?.assessmentId || r.data.assessment?._id || '');
      const stored = loadWorkContext(assessmentId);
      if (stored?.items?.length) {
        const nextItems = stored.items.map((item) => String(item._id) === String(r.data.assignment._id) ? { ...item, ...r.data.assignment, assessmentId: stored.assessment || r.data.assessment } : item);
        const nextContext = { ...stored, assessment: stored.assessment || r.data.assessment, items: nextItems };
        window.sessionStorage.setItem(`evalora_work_context_${assessmentId}`, JSON.stringify(nextContext));
        setWorkContext(nextContext);
      } else {
        setWorkContext({ assessmentId, assessment: r.data.assessment, items: [{ ...r.data.assignment, assessmentId: r.data.assessment }] });
      }
    } catch (e) { setError(e.response?.data?.message || 'Unable to open assignment.'); }
  }
  // The assignment id is the lifecycle boundary; load is intentionally recreated with the current unlock token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [assignmentId]);
  useEffect(() => { setShowRestartNotice(true); }, [assignmentId]);
  const visibleQuestions = (data?.questions || []).filter((q) => (!filters.type || q.type === filters.type) && (!filters.difficulty || q.difficulty === filters.difficulty));
  const visibleQuestionGroups = useMemo(() => groupQuestionsByTitle(visibleQuestions), [visibleQuestions]);
  const courseItems = useMemo(() => {
    const base = workContext?.items?.length ? workContext.items : data?.assignment ? [{ ...data.assignment, assessmentId: data.assessment }] : [];
    return base
      .filter((item) => {
        const haystack = `${item.courseName || ''} ${item.courseId || ''} ${item.facultyId?.name || ''} ${item.moderatorId?.name || ''}`.toLowerCase();
        const matchesSearch = !courseQuery.trim() || haystack.includes(courseQuery.trim().toLowerCase());
        const matchesFilter = courseFilter === 'all' || workStatusGroup(item.status) === courseFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        const statusDelta = ['submitted', 'rejected', 'assigned', 'in_progress', 'approved'].indexOf(a.status) - ['submitted', 'rejected', 'assigned', 'in_progress', 'approved'].indexOf(b.status);
        if (statusDelta) return statusDelta;
        return String(a.courseName || '').localeCompare(String(b.courseName || ''));
      });
  }, [courseFilter, courseQuery, data, workContext]);
  const courseCounts = useMemo(() => {
    const base = workContext?.items?.length ? workContext.items : data?.assignment ? [data.assignment] : [];
    return {
      total: base.length,
      pending: base.filter((item) => ['assigned', 'in_progress'].includes(item.status)).length,
      review: base.filter((item) => item.status === 'submitted').length,
      rejected: base.filter((item) => item.status === 'rejected').length,
      approved: base.filter((item) => item.status === 'approved').length,
    };
  }, [data, workContext]);
  async function saveQuestion(event) { event.preventDefault(); setBusy(true); try { await api.patch(`/work/${assignmentId}/questions/${editing._id}`, editing, { headers }); setEditing(null); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to update question.'); } finally { setBusy(false); } }
  async function submit() { setBusy(true); try { await api.post(`/work/${assignmentId}/submit`, { message: submitMessage }, { headers }); setConfirmSubmit(false); setSubmitMessage(''); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to submit.'); } finally { setBusy(false); } }
  async function decide(decision) { setBusy(true); try { await api.post(`/work/${assignmentId}/decision`, { decision, reason }, { headers }); setRejecting(false); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to save decision.'); } finally { setBusy(false); } }
  if (!data) return <div className="p-8 text-center text-sm text-slate-500">{error || 'Opening secure workspace...'}</div>;
  const { assignment, assessment, canEdit } = data; const moderator = user.role === 'moderator';
  const totalMarks = data.questions.reduce((n,q) => n + Number(q.positiveMarks || 0),0);
  const restartNotice = (assignment.history || []).slice().reverse().find((entry) => entry.action === 'restart_requested');
  function openCourse(item) {
    if (String(item._id) === String(assignment._id)) return;
    const courseToken = window.sessionStorage.getItem(`evalora_work_${item._id}`);
    if (!courseToken) {
      setError('Unlock this assessment again to open that course.');
      return;
    }
    navigate(`/${user.role}/work/${item._id}`);
  }
  return <section className="space-y-3">
    <PageHeader eyebrow={moderator ? 'Moderator review' : 'Question authoring'} title={assessment.title} description={`${assessment.assessmentCode} · ${courseCounts.total} assigned course${courseCounts.total === 1 ? '' : 's'}`} actions={<button className="secondary-button h-9 px-3 text-xs" onClick={() => navigate(`/${user.role}`)}>Back</button>}/>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
    {restartNotice && showRestartNotice ? <RestartNoticeModal assignment={assignment} notice={restartNotice} onClose={() => setShowRestartNotice(false)} /> : null}
    <div className="grid gap-3 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-[11px] font-bold uppercase text-brand-600">Courses</p><p className="text-sm font-bold text-slate-950">{courseCounts.total} assigned</p></div>
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{groupProgress({ total: courseCounts.total, approved: courseCounts.approved })}%</span>
          </div>
          <div className="relative mt-3"><Search className="absolute left-3 top-2.5 text-slate-400" size={15}/><input className="field-input h-9 pl-9 text-sm" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search course or faculty" /></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[['all', 'All', courseCounts.total], ['pending', 'To do', courseCounts.pending], ['submitted', 'Review', courseCounts.review], ['approved', 'Done', courseCounts.approved]].map(([key, label, value]) => <button key={key} className={`rounded-md border px-2 py-1.5 text-xs font-bold transition ${courseFilter === key ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200'}`} type="button" onClick={() => setCourseFilter(key)}>{label} {value}</button>)}
          </div>
        </div>
        <div className="max-h-[calc(100vh-21rem)] min-h-[20rem] overflow-y-auto p-2">
          {courseItems.map((item) => {
            const active = String(item._id) === String(assignment._id);
            return <button key={item._id} className={`mb-1.5 block w-full rounded-lg border px-3 py-2 text-left transition ${active ? 'border-brand-200 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50'}`} type="button" onClick={() => openCourse(item)}>
              <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold text-slate-950">{item.courseName}</p><span className={statusClass(item.status)}>{item.status.replace('_',' ')}</span></div>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{item.courseId || 'No course ID'}</p>
              <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">{moderator ? `Faculty: ${item.facultyId?.name || '-'}` : `Moderator: ${item.moderatorId?.name || '-'}`}</p>
            </button>;
          })}
          {!courseItems.length ? <EmptyState title="No courses found" description="Adjust course search or status." /> : null}
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <WorkReviewSummary assignment={assignment} assessment={assessment} questionCount={data.questions.length} totalMarks={totalMarks} moderator={moderator} />
        <SectionPanel title={moderator ? 'Assessment questions' : 'Question set'} icon={FileQuestion} actions={<div className="flex flex-wrap gap-1.5">{!moderator && user.permissions.includes('library.create') ? <button className="secondary-button h-8 px-2.5 text-xs" onClick={() => navigate(`/faculty/library/add?workId=${assignmentId}`)}><Plus size={14}/> Create</button> : null}{!moderator && data.canAdd && user.permissions.includes('library.view') ? <button className="primary-button h-8 px-2.5 text-xs" onClick={() => navigate(`/faculty/library?workId=${assignmentId}`)}><BookOpen size={14}/> Import</button> : null}<select className="field-input h-8 w-32 text-xs" value={filters.type} onChange={(e) => setFilters({...filters,type:e.target.value})}><option value="">All types</option><option value="mcq">MCQ</option><option value="one_word">One word</option></select><select className="field-input h-8 w-36 text-xs" value={filters.difficulty} onChange={(e) => setFilters({...filters,difficulty:e.target.value})}><option value="">All difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>}>
          <div className="space-y-2 p-2.5">
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {visibleQuestionGroups.length} title{visibleQuestionGroups.length === 1 ? '' : 's'} · {visibleQuestions.length} question{visibleQuestions.length === 1 ? '' : 's'} · {visibleQuestions.filter((q) => q.type === 'mcq').length} MCQ · {visibleQuestions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0)} marks
            </p>
            <div className="max-h-[64vh] space-y-1.5 overflow-y-auto pr-1">
              {visibleQuestionGroups.map((group) => {
                const isOpen = expandedFolder === group.heading;
                return <div key={group.heading} className={`overflow-hidden rounded-lg border bg-white transition ${isOpen ? 'border-brand-200 shadow-sm' : 'border-slate-200'}`}>
                  <button className="grid w-full gap-2 px-3 py-2.5 text-left hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" type="button" onClick={() => { setExpandedFolder(isOpen ? '' : group.heading); setExpanded(''); }}>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{group.heading}</p><p className="mt-0.5 text-xs text-slate-500">{group.questions.length} questions · {group.mcq} MCQ · {group.oneWord} one-word · {group.marks} marks</p></div>
                    <ChevronDown className={`text-brand-600 transition ${isOpen ? 'rotate-180' : ''}`} size={16}/>
                  </button>
                  {isOpen ? <div className="border-t border-slate-100 bg-slate-50/50 p-1.5"><div className="space-y-1.5">
                    {group.questions.map((q, index) => <div key={q._id} className="rounded-lg border border-slate-200 bg-white">
                      <div className="grid gap-2 px-2.5 py-2 md:grid-cols-[2rem_minmax(0,1fr)_auto] md:items-center">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">{index + 1}</span>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{q.questionText}</p><p className="mt-0.5 text-xs text-slate-500">{q.type.replace('_',' ')} · {q.difficulty} · {q.positiveMarks || 0} marks</p></div>
                        <div className="flex items-center gap-1">{canEdit && assignment.status !== 'approved' ? <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => setEditing({ ...q, alternateAnswers: (q.alternateAnswers || []).join(', '), saveToLibrary: false })}>Edit</button> : null}<button className="secondary-button h-8 w-8 p-0" type="button" onClick={() => setExpanded(expanded === q._id ? '' : q._id)}><ChevronDown className={`transition ${expanded === q._id ? 'rotate-180' : ''}`} size={15}/></button></div>
                      </div>
                      {expanded === q._id ? <div className="border-t border-slate-100 p-3"><QuestionAnswerDetail question={q}/></div> : null}
                    </div>)}
                  </div></div> : null}
                </div>;
              })}
              {!visibleQuestions.length ? <EmptyState title="No questions found" description="Import questions or change the filters."/> : null}
            </div>
          </div>
        </SectionPanel>
      </div>
    </div>
    <div className="flex justify-end gap-3">{moderator && assignment.status === 'submitted' ? <><button className="secondary-button border-red-200 text-red-700" onClick={() => setRejecting(true)}><XCircle size={17}/> Reject with reason</button><button className="primary-button bg-green-600 hover:bg-green-700" disabled={busy} onClick={() => decide('approve')}><ShieldCheck size={17}/> Approve assessment</button></> : !moderator && ['assigned','in_progress','rejected'].includes(assignment.status) ? <button className="primary-button" disabled={busy || !data.questions.length} onClick={() => setConfirmSubmit(true)}><Send size={17}/> Submit to moderator</button> : null}</div>
    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 max-w-4xl rounded-xl bg-white p-5 shadow-2xl"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">Edit assessment question</h2><button onClick={() => setEditing(null)}>×</button></div><QuestionForm courses={[{courseName:assignment.courseName,courseId:assignment.courseId}]} value={editing} onChange={setEditing} onSubmit={saveQuestion} isSaving={busy} submitLabel="Update Question"/></div></div> : null}
    {confirmSubmit ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase text-brand-600">Send for moderator review</p><h2 className="mt-1 text-base font-semibold text-slate-950">{assignment.courseName}</h2><p className="mt-1 text-xs text-slate-500">{data.questions.length} questions will move to {assignment.moderatorId?.name || 'the assigned moderator'}.</p></div><button className="secondary-button h-8 w-8 p-0" type="button" onClick={() => setConfirmSubmit(false)}><X size={15}/></button></div><div className="space-y-3 p-4"><div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2"><p><span className="text-slate-500">Assessment</span><b className="mt-0.5 block text-slate-900">{assessment.title}</b></p><p><span className="text-slate-500">Moderator</span><b className="mt-0.5 block text-slate-900">{assignment.moderatorId?.name || 'Assigned moderator'}</b></p></div><label className="block"><span className="field-label">Optional note</span><textarea className="field-input mt-1 min-h-24 text-sm" value={submitMessage} onChange={(event) => setSubmitMessage(event.target.value)} placeholder="Short note for moderator, if needed." /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button className="secondary-button" type="button" onClick={() => setConfirmSubmit(false)}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={submit}><Send size={16}/>{busy ? 'Sending...' : 'Send to moderator'}</button></div></div></div> : null}
    {rejecting ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><h2 className="text-lg font-bold">Return for correction</h2><p className="mt-1 text-sm text-slate-500">Give faculty a specific, actionable reason.</p><textarea className="field-input mt-4 min-h-32" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Example: Questions 4 and 8 have duplicate correct options..."/><div className="mt-4 flex justify-end gap-2"><button className="secondary-button" onClick={() => setRejecting(false)}>Cancel</button><button className="primary-button bg-red-600 hover:bg-red-700" disabled={reason.trim().length < 5 || busy} onClick={() => decide('reject')}>Send rejection</button></div></div></div> : null}
  </section>;
}
