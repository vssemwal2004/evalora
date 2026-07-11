import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  Eye,
  IdCard,
  KeyRound,
  MessageSquare,
  Minus,
  Monitor,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const filters = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'live' },
  { label: 'Not started', value: 'not_started' },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Submitted', value: 'submitted' },
];

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  const value = String(status || 'pending').replace(/_/g, ' ');
  const tone = {
    active: 'status-active',
    upcoming: 'status-review',
    pending: 'status-pending',
    completed: 'status-completed',
    submitted: 'status-completed',
    in_progress: 'status-active',
    not_started: 'status-draft',
    ufm: 'status-rejected',
    blocked: 'status-rejected',
  }[status] || 'status-draft';

  return <span className={`status-badge ${tone}`}>{value}</span>;
}

const CLOSED_STUDENT_STATUSES = ['submitted', 'ufm', 'blocked'];
const STALE_HEARTBEAT_MS = 75000;

function getStudentRuntime(student, now = Date.now()) {
  const examStatus = String(student?.examStatus || 'not_started');
  const attemptStatus = String(student?.attemptStatus || 'not_started');
  const isClosed = CLOSED_STUDENT_STATUSES.includes(examStatus) || CLOSED_STUDENT_STATUSES.includes(attemptStatus);
  const isInProgress = examStatus === 'in_progress' || attemptStatus === 'in_progress';
  const heartbeatAt = student?.lastHeartbeatAt ? new Date(student.lastHeartbeatAt).getTime() : 0;
  const heartbeatIsValid = heartbeatAt && !Number.isNaN(heartbeatAt);
  const isStale = !isClosed && isInProgress && (!heartbeatIsValid || now - heartbeatAt > STALE_HEARTBEAT_MS);

  if (examStatus === 'submitted' || attemptStatus === 'submitted') {
    return { label: 'submitted', badgeStatus: 'submitted', isLive: false, isClosed: true, isStale: false };
  }
  if (examStatus === 'ufm' || attemptStatus === 'ufm') {
    return { label: 'ufm review', badgeStatus: 'ufm', isLive: false, isClosed: true, isStale: false };
  }
  if (examStatus === 'blocked' || attemptStatus === 'blocked') {
    return { label: 'blocked', badgeStatus: 'blocked', isLive: false, isClosed: true, isStale: false };
  }
  if (isStale) {
    return { label: 'connection lost', badgeStatus: 'connection_lost', isLive: false, isClosed: false, isStale: true };
  }
  if (isInProgress) {
    return { label: 'in progress', badgeStatus: 'in_progress', isLive: true, isClosed: false, isStale: false };
  }
  return { label: examStatus.replace(/_/g, ' '), badgeStatus: examStatus, isLive: false, isClosed: false, isStale: false };
}

function runtimeBadge(student, now) {
  const runtime = getStudentRuntime(student, now);
  if (runtime.isStale) {
    return <span className="status-badge status-pending">connection lost</span>;
  }
  return statusBadge(runtime.badgeStatus);
}

function assessmentWindowText(item) {
  return `${formatDateTime(item.window?.startAt)} - ${formatDateTime(item.window?.endAt)}`;
}

function studentMatchesFilter(student, filter, now = Date.now()) {
  const runtime = getStudentRuntime(student, now);
  if (filter === 'live') return runtime.isLive;
  if (filter === 'not_started') return student.examStatus === 'not_started' || student.attemptStatus === 'not_started';
  if (filter === 'flagged') return Number(student.alertCount || 0) > 0 || student.examStatus === 'ufm';
  if (filter === 'submitted') return runtime.isClosed;
  return true;
}

function summarizeProctorStudents(students = [], now = Date.now()) {
  return students.reduce(
    (summary, student) => {
      const runtime = getStudentRuntime(student, now);
      summary.assignedStudents += 1;
      if (runtime.isLive) summary.activeStudents += 1;
      if (runtime.isClosed) summary.submittedStudents += 1;
      if (student.examStatus === 'not_started' || student.attemptStatus === 'not_started') summary.notStartedStudents += 1;
      summary.alertCount += Number(student.alertCount || 0);
      return summary;
    },
    { assignedStudents: 0, activeStudents: 0, submittedStudents: 0, notStartedStudents: 0, alertCount: 0 }
  );
}

function socketUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return apiBase.replace(/\/api\/?$/, '');
}

function getIceServers() {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Allow simple comma-separated STUN/TURN URLs in local env files.
  }

  const urls = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return urls.length ? urls.map((url) => ({ urls: url })) : [{ urls: 'stun:stun.l.google.com:19302' }];
}

function PasswordModal({ item, password, onPasswordChange, onCancel, onConfirm, isUnlocking, error }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
              <KeyRound size={18} />
            </span>
            <div>
              <p className="field-label text-brand-600">Assessment access</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.assessmentCode}</p>
            </div>
          </div>
          <button className="secondary-button h-9 w-9 px-0" type="button" onClick={onCancel} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <form className="space-y-4 p-5" onSubmit={onConfirm}>
          <div>
            <label className="field-label">Assessment password</label>
            <input
              className="field-input mt-2"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter password from mail"
              autoFocus
              required
            />
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
          <div className="grid grid-cols-2 gap-2">
            <button className="secondary-button justify-center" type="button" onClick={onCancel} disabled={isUnlocking}>
              Cancel
            </button>
            <button className="primary-button justify-center" type="submit" disabled={isUnlocking || !password.trim()}>
              {isUnlocking ? 'Opening...' : 'Open'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssessmentCard({ item, onOpen }) {
  const summary = item.summary || {};
  const progress = Number(summary.assignedStudents || 0)
    ? Math.round((Number(summary.submittedStudents || 0) / Number(summary.assignedStudents || 1)) * 100)
    : 0;

  return (
    <button
      className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-panel"
      type="button"
      onClick={() => onOpen(item)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(item.status)}
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {item.assessmentCode || 'No code'}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold text-slate-950">{item.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{assessmentWindowText(item)}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
          <KeyRound size={19} />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center">
        <div className="border-r border-slate-200 px-2 py-2">
          <p className="text-sm font-bold text-slate-950">{summary.assignedStudents || 0}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Students</p>
        </div>
        <div className="border-r border-slate-200 px-2 py-2">
          <p className="text-sm font-bold text-green-700">{summary.activeStudents || 0}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Live</p>
        </div>
        <div className="border-r border-slate-200 px-2 py-2">
          <p className="text-sm font-bold text-amber-700">{summary.alertCount || 0}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Alerts</p>
        </div>
        <div className="px-2 py-2">
          <p className="text-sm font-bold text-brand-700">{progress}%</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Done</p>
        </div>
      </div>
    </button>
  );
}

function StudentCard({ student, selected, onSelect, now }) {
  const runtime = getStudentRuntime(student, now);
  const isLive = runtime.isLive;
  const isFlagged = Number(student.alertCount || 0) > 0 || student.examStatus === 'ufm';

  return (
    <button
      className={`group min-h-[122px] rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm ${
        selected ? 'border-brand-300 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white'
      }`}
      type="button"
      onClick={() => onSelect(student)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{student.name}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{student.examId}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isLive ? 'bg-green-500' : isFlagged ? 'bg-amber-500' : 'bg-slate-300'}`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {runtimeBadge(student, now)}
        {isFlagged ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            {student.alertCount} alert
          </span>
        ) : null}
        {runtime.isStale ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
            offline
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-xs font-semibold text-slate-500">
        {student.courseName}
        {student.courseId ? ` (${student.courseId})` : ''}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-bold text-slate-400">
        <span>{runtime.label}</span>
        <span className="text-brand-600 opacity-0 transition group-hover:opacity-100">Open</span>
      </div>
    </button>
  );
}

function StudentDetail({
  student,
  settings,
  onMarkUfm,
  isMarkingUfm,
  liveStatus,
  onStartLive,
  onStopLive,
  remoteVideoRef,
  chatMessages,
  chatDraft,
  onChatDraftChange,
  onSendChat,
  onOpenMonitor,
}) {
  const [ufmReason, setUfmReason] = useState('');

  if (!student) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <EmptyState title="Select a student" description="Open one student at a time to keep camera and microphone usage lightweight." />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="field-label text-brand-600">Student monitor</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">{student.name}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{student.email}</p>
          </div>
          {statusBadge(student.examStatus)}
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['Exam ID', student.examId],
            ['Course', `${student.courseName}${student.courseId ? ` (${student.courseId})` : ''}`],
            ['Security score', student.securityScore || 0],
            ['ID match', student.identityVerification?.status && student.identityVerification.status !== 'not_started' ? `${Number(student.identityVerification.matchPercentage || 0).toFixed(1)}% · ${String(student.identityVerification.status).replace(/_/g, ' ')}` : 'Pending'],
            ['Last heartbeat', formatDateTime(student.lastHeartbeatAt)],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" key={label}>
              <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value || '-'}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Video size={18} className={settings.cameraMonitoring || settings.cameraRequired ? 'text-brand-500' : 'text-slate-300'} />
            <p className="mt-2 text-xs font-bold uppercase text-slate-500">Camera</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {settings.cameraMonitoring || settings.cameraRequired ? 'Opens on live view' : 'Disabled'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <MessageSquare size={18} className={settings.chatEnabled ? 'text-brand-500' : 'text-slate-300'} />
            <p className="mt-2 text-xs font-bold uppercase text-slate-500">Chat</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{settings.chatEnabled ? 'Available' : 'Disabled'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <ShieldAlert size={18} className={settings.ufmActionEnabled ? 'text-brand-500' : 'text-slate-300'} />
            <p className="mt-2 text-xs font-bold uppercase text-slate-500">UFM</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{settings.ufmActionEnabled ? 'Pending review flow' : 'Disabled'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <IdCard size={18} className={student.identityVerification?.status === 'manual_review' ? 'text-amber-600' : 'text-brand-500'} />
            <p className="mt-2 text-xs font-bold uppercase text-slate-500">Identity</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {student.identityVerification?.status && student.identityVerification.status !== 'not_started'
                ? `${Number(student.identityVerification.matchPercentage || 0).toFixed(1)}% match`
                : 'Pending'}
            </p>
          </div>
        </div>

        {settings.ufmActionEnabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label className="field-label text-amber-700">UFM note</label>
            <textarea
              className="field-input mt-2 min-h-20 bg-white"
              value={ufmReason}
              onChange={(event) => setUfmReason(event.target.value)}
              placeholder="Write a short reason for admin review"
            />
            <div className="mt-2 flex justify-end">
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                type="button"
                disabled={isMarkingUfm || !ufmReason.trim()}
                onClick={async () => {
                  const ok = await onMarkUfm(student, ufmReason);
                  if (ok) setUfmReason('');
                }}
              >
                <ShieldAlert size={14} />
                {isMarkingUfm ? 'Marking...' : 'Mark UFM pending'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Live monitor</p>
              <p className="text-xs font-semibold text-white">
                {liveStatus === 'connected' ? 'Connected' : liveStatus === 'requesting' ? 'Requesting stream' : 'Camera opens only for this student'}
              </p>
            </div>
            {liveStatus === 'idle' ? (
              <button className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-500 px-3 text-xs font-bold text-white hover:bg-brand-600" type="button" onClick={() => onStartLive(student)}>
                <Video size={14} />
                Open live
              </button>
            ) : (
              <button className="inline-flex h-8 items-center gap-2 rounded-md border border-white/20 px-3 text-xs font-bold text-white hover:bg-white/10" type="button" onClick={onStopLive}>
                Stop
              </button>
            )}
            <button className="inline-flex h-8 items-center gap-2 rounded-md border border-white/20 px-3 text-xs font-bold text-white hover:bg-white/10" type="button" onClick={() => onOpenMonitor(student)}>
              <Eye size={14} />
              Focus
            </button>
          </div>
          <div className="relative aspect-video bg-slate-900">
            <video ref={remoteVideoRef} className="h-full w-full object-contain" autoPlay playsInline />
            {liveStatus !== 'connected' ? (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <Monitor size={28} className="mx-auto text-slate-500" />
                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    {liveStatus === 'requesting' ? 'Waiting for student browser...' : 'No stream open'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {settings.chatEnabled ? (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-bold uppercase text-slate-500">Live chat</p>
              <span className="text-[11px] font-semibold text-slate-400">Ephemeral</span>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto p-3">
              {chatMessages.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400">No messages yet.</p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-lg px-3 py-2 text-xs font-semibold leading-5 ${
                      message.senderRole === 'proctor' ? 'ml-auto bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <p>{message.text}</p>
                    <p className={`mt-1 text-[10px] ${message.senderRole === 'proctor' ? 'text-brand-50/80' : 'text-slate-400'}`}>{message.senderName}</p>
                  </div>
                ))
              )}
            </div>
            <form className="flex gap-2 border-t border-slate-200 p-3" onSubmit={(event) => { event.preventDefault(); onSendChat(student); }}>
              <input
                className="field-input h-9 text-sm"
                value={chatDraft}
                onChange={(event) => onChatDraftChange(event.target.value)}
                placeholder="Message student"
              />
              <button className="primary-button h-9 px-3 text-xs" type="submit" disabled={!chatDraft.trim()}>
                <Send size={14} />
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FocusedMonitorPage({
  assignment,
  student,
  settings,
  runtimeNow,
  liveStatus,
  onStartLive,
  onStopLive,
  onBack,
  remoteVideoRef,
  chatMessages,
  chatDraft,
  onChatDraftChange,
  onSendChat,
  alerts,
  onMarkUfm,
  isMarkingUfm,
}) {
  const [ufmReason, setUfmReason] = useState('');
  const [ufmOpen, setUfmOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [screenSize, setScreenSize] = useState('medium');
  const [alertFilter, setAlertFilter] = useState('all');

  if (!student) return null;

  const screenLevels = [
    { value: 'compact', label: 'Compact', rail: 'xl:grid-cols-[minmax(0,1fr)_360px]' },
    { value: 'medium', label: 'Normal', rail: 'xl:grid-cols-[minmax(0,1fr)_300px]' },
    { value: 'large', label: 'Large', rail: 'xl:grid-cols-[minmax(0,1fr)_270px]' },
    { value: 'focus', label: 'Max', rail: 'xl:grid-cols-[minmax(0,1fr)_240px]' },
  ];
  const screenLevelIndex = Math.max(0, screenLevels.findIndex((level) => level.value === screenSize));
  const screenLevel = screenLevels[screenLevelIndex] || screenLevels[1];
  const alertCount = alerts.length;
  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;
  const visibleAlerts = alertFilter === 'all' ? alerts : alerts.filter((alert) => alert.severity === alertFilter);
  const runtime = getStudentRuntime(student, runtimeNow);

  return (
    <section className="relative flex h-[calc(100vh-1rem)] min-h-0 flex-col gap-2 overflow-hidden">
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <button className="secondary-button h-9 px-3 text-sm" type="button" onClick={onBack} aria-label="Back to student grid">
              <ArrowLeft size={16} className="text-brand-500" />
              Back
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {runtimeBadge(student, runtimeNow)}
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {student.examId}
                </span>
              </div>
              <h1 className="mt-1 truncate text-lg font-semibold text-slate-950">{student.name}</h1>
              <p className="truncate text-xs font-semibold text-slate-500">
                {assignment.title} / {student.courseName}{student.courseId ? ` (${student.courseId})` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {liveStatus === 'idle' ? (
              <button className="primary-button h-9 px-3 text-sm" type="button" disabled={runtime.isClosed} onClick={() => onStartLive(student)}>
                <Video size={16} />
                {runtime.isClosed ? 'Exam ended' : 'Open live'}
              </button>
            ) : (
              <button className="secondary-button h-9 px-3 text-sm" type="button" onClick={onStopLive}>
                Stop live
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-1.5 p-2 sm:grid-cols-4">
          {[
            ['Security', student.securityScore || 0, Number(student.securityScore || 0) > 0 ? 'text-amber-700' : 'text-slate-800'],
            ['Alerts', student.alertCount || 0, Number(student.alertCount || 0) > 0 ? 'text-amber-700' : 'text-slate-800'],
            ['Heartbeat', runtime.isStale ? 'Connection lost' : formatDateTime(student.lastHeartbeatAt), runtime.isStale ? 'text-amber-700' : 'text-slate-800'],
            ['Mail', String(student.mailStatus || 'not sent').replace(/_/g, ' '), 'text-slate-800'],
          ].map(([label, value, tone]) => (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5" key={label}>
              <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
              <p className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 items-stretch gap-2 ${screenLevel.rail}`}>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Live camera</p>
              <p className="text-sm font-semibold text-white">
                {liveStatus === 'connected' ? 'Connected' : liveStatus === 'requesting' ? 'Waiting for student browser' : liveStatus === 'connecting' ? 'Connecting' : 'No stream open'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                <button
                  className="grid h-8 w-8 place-items-center text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-600"
                  type="button"
                  aria-label="Decrease student screen size"
                  disabled={screenLevelIndex === 0}
                  onClick={() => setScreenSize(screenLevels[Math.max(0, screenLevelIndex - 1)].value)}
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-16 border-x border-white/10 px-2 text-center text-[11px] font-bold text-white">
                  {screenLevel.label}
                </span>
                <button
                  className="grid h-8 w-8 place-items-center text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-600"
                  type="button"
                  aria-label="Increase student screen size"
                  disabled={screenLevelIndex === screenLevels.length - 1}
                  onClick={() => setScreenSize(screenLevels[Math.min(screenLevels.length - 1, screenLevelIndex + 1)].value)}
                >
                  <Plus size={14} />
                </button>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${liveStatus === 'connected' ? 'bg-green-500/15 text-green-200' : 'bg-amber-500/15 text-amber-100'}`}>
                {liveStatus}
              </span>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-slate-900 transition-all duration-200">
            <video ref={remoteVideoRef} className="h-full w-full object-contain" autoPlay playsInline />
            {liveStatus !== 'connected' ? (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <Monitor size={44} className="mx-auto text-slate-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-300">Open live only when you need to inspect this student.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Student tools</p>
              <p className="text-[11px] font-semibold text-slate-400">Identity, risk, and actions</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${alertCount ? 'bg-red-50 text-red-600 ring-1 ring-red-100' : 'bg-slate-100 text-slate-500'}`}>
              {alertCount} alerts
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
            <section>
              <p className="text-[10px] font-bold uppercase text-slate-400">Student overview</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {[
                  ['Email', student.email],
                  ['Course', student.courseId || '-'],
                  ['Status', runtime.label],
                  ['Attempt', String(student.attemptStatus || 'not_started').replace(/_/g, ' ')],
                ].map(([label, value]) => (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5" key={label}>
                    <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-900" title={value || '-'}>
                      {value || '-'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {settings.ufmActionEnabled ? (
              <section className={`overflow-hidden rounded-lg border transition ${ufmOpen ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  type="button"
                  onClick={() => setUfmOpen((value) => !value)}
                  aria-expanded={ufmOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${ufmOpen ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      <ShieldAlert size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold uppercase text-slate-700">UFM note</span>
                      <span className="block truncate text-[11px] font-semibold text-slate-400">
                        {ufmReason ? 'Draft reason added' : 'Optional action'}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Review</span>
                    <ChevronDown size={15} className={`text-slate-400 transition ${ufmOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {ufmOpen ? (
                  <div className="border-t border-amber-200 px-3 pb-2.5 pt-2">
                    <textarea
                      className="field-input min-h-14 bg-white text-xs"
                      value={ufmReason}
                      onChange={(event) => setUfmReason(event.target.value)}
                      placeholder="Short reason visible in report"
                    />
                    <button
                      className="mt-2 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      type="button"
                      disabled={isMarkingUfm || !ufmReason.trim()}
                      onClick={async () => {
                        const ok = await onMarkUfm(student, ufmReason);
                        if (ok) {
                          setUfmReason('');
                          setUfmOpen(false);
                        }
                      }}
                    >
                      <ShieldAlert size={13} />
                      {isMarkingUfm ? 'Marking...' : 'Mark UFM pending'}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Recent alerts</p>
                  <p className="text-[10px] font-semibold text-slate-400">{visibleAlerts.length} visible</p>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    ['all', alertCount, 'All'],
                    ['critical', criticalCount, 'C'],
                    ['warning', warningCount, 'W'],
                  ].map(([value, count, label]) => (
                    <button
                      key={value}
                      className={`h-7 rounded-full px-2 text-[10px] font-bold transition ${
                        alertFilter === value ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      type="button"
                      onClick={() => setAlertFilter(value)}
                    >
                      {label} {count}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                {visibleAlerts.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-400">
                    No alerts in this view.
                  </div>
                ) : visibleAlerts.map((alert) => (
                  <div
                    key={alert.id || `${alert.type}-${alert.occurredAt}`}
                    className={`rounded-lg border px-2.5 py-2 ${
                      alert.severity === 'critical' ? 'border-red-100 bg-red-50/60' : alert.severity === 'warning' ? 'border-amber-100 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                        <p className="truncate text-xs font-bold text-slate-800">{String(alert.type || 'activity').replace(/_/g, ' ')}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase ${alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>{alert.severity || 'info'}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{alert.message || 'Activity detected'}</p>
                    {alert.metadata?.evidence?.snapshotUrl ? (
                      <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
                        <img
                          src={alert.metadata.evidence.snapshotUrl}
                          alt={`${String(alert.type || 'alert').replace(/_/g, ' ')} snapshot`}
                          className="h-24 w-full object-cover"
                          loading="lazy"
                        />
                        <p className="px-2 py-1 text-[10px] font-semibold text-slate-500">
                          Snapshot {formatDateTime(alert.metadata.evidence.capturedAt || alert.occurredAt)}
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{formatDateTime(alert.occurredAt)}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {settings.chatEnabled ? (
        <>
          <button
            className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl shadow-brand-500/25 transition hover:bg-brand-600"
            type="button"
            aria-label="Open chat"
            onClick={() => setChatOpen(true)}
          >
            <MessageSquare size={20} />
            {chatMessages.length > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-slate-950 px-1 text-[10px] font-bold text-white">
                {chatMessages.length}
              </span>
            ) : null}
          </button>

          {chatOpen ? (
            <div className="fixed bottom-20 right-5 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Chat</p>
                  <p className="text-[11px] font-semibold text-slate-500">Temporary messages for this assessment</p>
                </div>
                <button className="secondary-button h-8 w-8 p-0" type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">
                  <X size={15} />
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                {chatMessages.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-400">No messages yet.</p>
                ) : chatMessages.map((message) => (
                  <div key={message.id} className={`max-w-[88%] rounded-lg px-3 py-2 text-xs font-semibold leading-5 ${message.senderRole === 'proctor' ? 'ml-auto bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <p>{message.text}</p>
                    <p className={`mt-1 text-[10px] ${message.senderRole === 'proctor' ? 'text-brand-50/80' : 'text-slate-400'}`}>{message.senderName}</p>
                  </div>
                ))}
              </div>
              <form className="flex gap-2 border-t border-slate-200 p-3" onSubmit={(event) => { event.preventDefault(); onSendChat(student); }}>
                <input className="field-input h-9 text-sm" value={chatDraft} onChange={(event) => onChatDraftChange(event.target.value)} placeholder="Message student" />
                <button className="primary-button h-9 px-3 text-xs" type="submit" disabled={!chatDraft.trim()}>
                  <Send size={14} />
                </button>
              </form>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function ProctorLivePage() {
  const [assignments, setAssignments] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [passwordModalItem, setPasswordModalItem] = useState(null);
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [monitorStudentId, setMonitorStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isMarkingUfm, setIsMarkingUfm] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [liveNotice, setLiveNotice] = useState(null);
  const [alertWindow, setAlertWindow] = useState({});
  const [socketClient, setSocketClient] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [liveStatus, setLiveStatus] = useState('idle');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [runtimeNow, setRuntimeNow] = useState(Date.now());
  const peerRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const liveSessionRef = useRef(null);

  useEffect(() => {
    liveSessionRef.current = liveSession;
  }, [liveSession]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('proctor-live-focus', Boolean(workspace));
    return () => document.body.classList.remove('proctor-live-focus');
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return undefined;
    const interval = window.setInterval(() => setRuntimeNow(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, [workspace]);

  useEffect(() => {
    let ignore = false;

    async function loadAssignments() {
      setIsLoading(true);
      setError('');
      try {
        const response = await api.get('/proctor/assignments');
        if (!ignore) setAssignments(response.data.items || []);
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load proctor dashboard.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadAssignments();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assignments;
    return assignments.filter((item) => `${item.title} ${item.assessmentCode}`.toLowerCase().includes(query));
  }, [assignments, search]);

  const dashboardSummary = useMemo(() => {
    return assignments.reduce(
      (acc, item) => {
        acc.assessments += 1;
        acc.students += Number(item.summary?.assignedStudents || 0);
        acc.live += Number(item.summary?.activeStudents || 0);
        acc.alerts += Number(item.summary?.alertCount || 0);
        return acc;
      },
      { assessments: 0, students: 0, live: 0, alerts: 0 }
    );
  }, [assignments]);

  const selectedStudent = useMemo(
    () => (workspace?.students || []).find((student) => String(student.id) === selectedStudentId),
    [workspace?.students, selectedStudentId]
  );

  const monitorStudent = useMemo(
    () => (workspace?.students || []).find((student) => String(student.id) === monitorStudentId),
    [workspace?.students, monitorStudentId]
  );

  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (workspace?.students || []).filter((student) => {
      const haystack = `${student.name} ${student.email} ${student.examId} ${student.courseName} ${student.courseId}`.toLowerCase();
      return studentMatchesFilter(student, activeFilter, runtimeNow) && (!query || haystack.includes(query));
    });
  }, [activeFilter, runtimeNow, studentSearch, workspace?.students]);

  useEffect(() => {
    setStudentPage(1);
  }, [activeFilter, studentSearch, workspace?.assignment?.assignmentId]);

  const studentPageSize = 50;
  const studentPages = Math.max(Math.ceil(visibleStudents.length / studentPageSize), 1);
  const pagedStudents = useMemo(() => {
    const safePage = Math.min(Math.max(studentPage, 1), studentPages);
    return visibleStudents.slice((safePage - 1) * studentPageSize, safePage * studentPageSize);
  }, [studentPage, studentPages, visibleStudents]);

  const selectedAlerts = useMemo(() => {
    const activeId = monitorStudentId || selectedStudentId;
    if (!activeId) return [];
    return (workspace?.alerts || []).filter((event) => String(event.studentId || event.assessmentStudentId || '') === String(activeId));
  }, [monitorStudentId, selectedStudentId, workspace?.alerts]);

  function closeLiveSession() {
    const currentSession = liveSessionRef.current;
    if (socketClient && currentSession?.assignmentId && currentSession?.studentId) {
      socketClient.emit('proctor:monitor-stop', currentSession);
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setLiveSession(null);
    setLiveStatus('idle');
  }

  useEffect(() => {
    if (!monitorStudent) return;
    const runtime = getStudentRuntime(monitorStudent, runtimeNow);
    if (runtime.isClosed && liveStatus !== 'idle') {
      closeLiveSession();
    }
  }, [liveStatus, monitorStudent?.attemptStatus, monitorStudent?.examStatus, monitorStudent?.id, runtimeNow]);

  function requestLiveStream(student) {
    if (!socketClient || !workspace?.assignment?.assignmentId || !student?.id) {
      setError('Live channel is still connecting. Try again in a moment.');
      return;
    }

    closeLiveSession();
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextSession = {
      sessionId,
      assignmentId: workspace.assignment.assignmentId,
      studentId: student.id,
    };
    setLiveSession(nextSession);
    setLiveStatus('requesting');
    socketClient.emit('proctor:monitor-request', nextSession, (ack) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Unable to request live stream.');
        closeLiveSession();
      }
    });
  }

  function sendChat(student) {
    const text = chatDraft.trim();
    if (!socketClient || !workspace?.assignment?.assignmentId || !student?.id || !text) return;
    socketClient.emit('proctor:chat-send', {
      assignmentId: workspace.assignment.assignmentId,
      studentId: student.id,
      text,
    }, (ack) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Unable to send chat message.');
        return;
      }
      setChatDraft('');
    });
  }

  useEffect(() => {
    if (!workspace?.assignment?.assignmentId) return undefined;

    const token = localStorage.getItem('evalora_token');
    const socket = io(socketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    setSocketClient(socket);

    socket.emit('proctor:join', { assignmentId: workspace.assignment.assignmentId }, (ack) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Unable to join live proctor channel.');
      }
    });

    function upsertStudent(nextStudent) {
      setWorkspace((current) => {
        if (!current) return current;
        const nextStudents = current.students.map((student) =>
          String(student.id) === String(nextStudent.id) ? { ...student, ...nextStudent } : student
        );
        const nextSummary = summarizeProctorStudents(nextStudents);
        setAssignments((currentAssignments) =>
          currentAssignments.map((item) =>
            String(item.assignmentId) === String(current.assignment.assignmentId)
              ? { ...item, summary: { ...(item.summary || {}), ...nextSummary } }
              : item
          )
        );
        return {
          ...current,
          students: nextStudents,
        };
      });
    }

    function handleStudentUpdate(payload) {
      if (payload?.student) upsertStudent(payload.student);
    }

    function handleSecurityEvent(payload) {
      if (payload?.student) upsertStudent(payload.student);
      if (payload?.event) {
        setWorkspace((current) => current ? { ...current, alerts: [payload.event, ...(current.alerts || [])].slice(0, 50) } : current);
      }

      const threshold = Math.max(Number(workspace.assignment.settings?.suspiciousActivityThresholdPerMinute || 5), 1);
      const studentId = String(payload?.student?.id || payload?.event?.studentId || '');
      const now = Date.now();
      if (!studentId) return;

      setAlertWindow((current) => {
        const recent = [...(current[studentId] || []), now].filter((time) => now - time <= 60000);
        if (workspace.assignment.settings?.proctorAlertPopupEnabled !== false && recent.length >= threshold) {
          setLiveNotice({
            student: payload.student,
            event: payload.event,
            count: recent.length,
            threshold,
          });
        }
        return { ...current, [studentId]: recent };
      });
    }

    async function handleOffer(payload) {
      const currentSession = liveSessionRef.current;
      if (!currentSession || String(payload?.sessionId) !== String(currentSession.sessionId)) return;

      if (peerRef.current) peerRef.current.close();
      const peer = new RTCPeerConnection({ iceServers: getIceServers() });
      peerRef.current = peer;

      peer.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams?.[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('proctor:ice-candidate', {
            assignmentId: currentSession.assignmentId,
            studentId: currentSession.studentId,
            sessionId: currentSession.sessionId,
            candidate: event.candidate,
          });
        }
      };
      peer.onconnectionstatechange = () => {
        if (['connected', 'completed'].includes(peer.connectionState)) setLiveStatus('connected');
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) setLiveStatus('idle');
      };

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('proctor:webrtc-answer', {
          assignmentId: currentSession.assignmentId,
          studentId: currentSession.studentId,
          sessionId: currentSession.sessionId,
          sdp: answer,
        });
        setLiveStatus('connecting');
      } catch {
        setError('Unable to connect live stream.');
        closeLiveSession();
      }
    }

    async function handleIceCandidate(payload) {
      const currentSession = liveSessionRef.current;
      if (!peerRef.current || !currentSession || String(payload?.sessionId) !== String(currentSession.sessionId)) return;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        // Ignore stale ICE candidates from a previous live request.
      }
    }

    function handleChatMessage(message) {
      setChatMessages((current) => [...current, message].slice(-100));
    }

    socket.on('proctor:student-update', handleStudentUpdate);
    socket.on('proctor:security-event', handleSecurityEvent);
    socket.on('proctor:webrtc-offer', handleOffer);
    socket.on('proctor:ice-candidate', handleIceCandidate);
    socket.on('proctor:chat-message', handleChatMessage);

    return () => {
      socket.off('proctor:student-update', handleStudentUpdate);
      socket.off('proctor:security-event', handleSecurityEvent);
      socket.off('proctor:webrtc-offer', handleOffer);
      socket.off('proctor:ice-candidate', handleIceCandidate);
      socket.off('proctor:chat-message', handleChatMessage);
      socket.disconnect();
      setSocketClient(null);
      closeLiveSession();
    };
  }, [workspace?.assignment?.assignmentId]);

  useEffect(() => {
    closeLiveSession();
    setChatMessages([]);
    setChatDraft('');
    if (!socketClient || !workspace?.assignment?.assignmentId || !selectedStudentId) return;

    socketClient.emit('proctor:chat-history', {
      assignmentId: workspace.assignment.assignmentId,
      studentId: selectedStudentId,
    }, (ack) => {
      if (ack?.ok) setChatMessages(ack.messages || []);
    });
  }, [selectedStudentId, socketClient, workspace?.assignment?.assignmentId]);

  async function openPasswordModal(item) {
    setPasswordModalItem(item);
    setPassword('');
    setModalError('');
  }

  async function verifyPassword(event) {
    event.preventDefault();
    if (!passwordModalItem) return;

    setIsUnlocking(true);
    setModalError('');
    try {
      const response = await api.post(`/proctor/assignments/${passwordModalItem.assignmentId}/verify`, { password });
      setWorkspace(response.data);
      setSelectedStudentId('');
      setMonitorStudentId('');
      setStudentPage(1);
      setActiveFilter('all');
      setStudentSearch('');
      setPasswordModalItem(null);
      setPassword('');
    } catch (requestError) {
      setModalError(requestError.response?.data?.message || 'Unable to open assessment workspace.');
    } finally {
      setIsUnlocking(false);
    }
  }

  async function markUfm(student, reason) {
    if (!workspace?.assignment?.assignmentId || !student?.id) return false;
    setIsMarkingUfm(true);
    setError('');
    try {
      const response = await api.post(`/proctor/assignments/${workspace.assignment.assignmentId}/students/${student.id}/ufm`, {
        reason,
      });
      setWorkspace((current) => {
        if (!current) return current;
        const nextStudents = current.students.map((item) =>
          String(item.id) === String(student.id) ? { ...item, ...response.data.student } : item
        );
        const nextSummary = summarizeProctorStudents(nextStudents);
        setAssignments((currentAssignments) =>
          currentAssignments.map((item) =>
            String(item.assignmentId) === String(current.assignment.assignmentId)
              ? { ...item, summary: { ...(item.summary || {}), ...nextSummary } }
              : item
          )
        );
        return {
          ...current,
          students: nextStudents,
          alerts: response.data.event ? [response.data.event, ...(current.alerts || [])].slice(0, 50) : current.alerts,
        };
      });
      setLiveNotice({
        student: response.data.student,
        event: response.data.event,
        count: 1,
        threshold: 1,
        manual: true,
      });
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to mark UFM.');
      return false;
    } finally {
      setIsMarkingUfm(false);
    }
  }

  if (workspace) {
    const assignment = workspace.assignment;
    const settings = assignment.settings || {};

    if (monitorStudent) {
      return (
        <FocusedMonitorPage
          assignment={assignment}
          student={monitorStudent}
          settings={settings}
          runtimeNow={runtimeNow}
          liveStatus={liveStatus}
          onStartLive={requestLiveStream}
          onStopLive={closeLiveSession}
          onBack={() => setMonitorStudentId('')}
          remoteVideoRef={remoteVideoRef}
          chatMessages={chatMessages.filter((message) => String(message.studentId) === String(monitorStudent.id))}
          chatDraft={chatDraft}
          onChatDraftChange={setChatDraft}
          onSendChat={sendChat}
          alerts={selectedAlerts}
          onMarkUfm={markUfm}
          isMarkingUfm={isMarkingUfm}
        />
      );
    }

    return (
      <section className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="field-label text-brand-600">Proctor workspace</p>
                {statusBadge(assignment.status)}
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {workspace.students.length} student(s)
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold text-slate-950">{assignment.title}</h1>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {assignment.assessmentCode} / {formatDateTime(assignment.window?.startAt)} - {formatDateTime(assignment.window?.endAt)}
              </p>
            </div>
            <button className="secondary-button h-10" type="button" onClick={() => setWorkspace(null)}>
              <ArrowLeft size={16} className="text-brand-500" />
              Dashboard
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="search-field h-10 min-w-[240px] flex-1">
              <Search size={15} className="text-brand-500" />
              <input
                className="h-full flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search student, exam ID, course"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  className={`h-10 rounded-lg border px-3 text-xs font-semibold transition ${
                    activeFilter === filter.value
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-slate-950'
                  }`}
                  type="button"
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Students</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Open one student to view camera, chat, alerts, and UFM actions.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {visibleStudents.length} visible
              </span>
              <button className="secondary-button h-9 px-3 text-xs" type="button" disabled={studentPage <= 1} onClick={() => setStudentPage((page) => Math.max(page - 1, 1))}>Prev</button>
              <button className="secondary-button h-9 px-3 text-xs" type="button" disabled={studentPage >= studentPages} onClick={() => setStudentPage((page) => Math.min(page + 1, studentPages))}>Next</button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-295px)] min-h-[430px] overflow-y-auto p-4">
            {visibleStudents.length === 0 ? (
              <EmptyState title="No students in this view" description="Change the search or filter." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {pagedStudents.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    now={runtimeNow}
                    selected={String(student.id) === selectedStudentId}
                    onSelect={(nextStudent) => {
                      setSelectedStudentId(nextStudent.id);
                      setMonitorStudentId(nextStudent.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2">
            <p className="text-[11px] font-bold text-slate-500">
              Page {Math.min(studentPage, studentPages)} of {studentPages}
            </p>
            <p className="text-[11px] font-bold text-slate-400">Camera streams stay closed until a student is opened.</p>
          </div>
        </div>

        {liveNotice ? (
          <div className="fixed right-5 top-20 z-50 w-full max-w-sm overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-200 bg-white text-amber-700">
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase text-amber-700">
                  {liveNotice.manual ? 'UFM review marked' : 'High activity detected'}
                </p>
                <h3 className="mt-1 truncate text-sm font-semibold text-slate-950">{liveNotice.student?.name || 'Student alert'}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {liveNotice.manual ? 'Sent to admin review log' : `${liveNotice.count}/${liveNotice.threshold} suspicious events in one minute`}
                </p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-md border border-amber-200 bg-white text-slate-500" type="button" onClick={() => setLiveNotice(null)} aria-label="Close alert">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="line-clamp-3 text-sm font-semibold leading-5 text-slate-700">
                {liveNotice.event?.message || liveNotice.event?.type || 'Review this student activity.'}
              </p>
              <button
                className="primary-button h-9 w-full justify-center text-xs"
                type="button"
                onClick={() => {
                  if (liveNotice.student?.id) {
                    setSelectedStudentId(liveNotice.student.id);
                    setMonitorStudentId(liveNotice.student.id);
                    setActiveFilter('all');
                  }
                  setLiveNotice(null);
                }}
              >
                <Eye size={14} />
                Check student
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Proctor Panel"
        title="Assessment Dashboard"
        description="Open one assessment, verify the assessment password, then monitor assigned students without loading every camera."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Assessments" value={dashboardSummary.assessments} icon={CalendarClock} />
        <MetricCard label="Assigned students" value={dashboardSummary.students} icon={Users} />
        <MetricCard label="Live now" value={dashboardSummary.live} icon={Video} />
        <MetricCard label="Alerts" value={dashboardSummary.alerts} icon={ShieldAlert} tone="warning" />
      </div>

      <SectionPanel
        title="Assigned Assessments"
        description="Assessment cards stay compact so 100+ assigned exams remain scannable."
        icon={Eye}
        actions={
          <div className="search-field h-10 w-full min-w-[260px] max-w-md">
            <Search size={15} className="text-brand-500" />
            <input
              className="h-full flex-1 border-0 bg-transparent px-2 text-sm outline-none"
              placeholder="Search assessment or code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
      >
        <div className="p-4">
          {isLoading ? (
            <EmptyState title="Loading assigned assessments" />
          ) : filteredAssignments.length === 0 ? (
            <EmptyState title="No assigned assessments" description="Assigned assessments appear here after admin sends proctor credentials." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filteredAssignments.map((item) => (
                <AssessmentCard key={item.assignmentId} item={item} onOpen={openPasswordModal} />
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      {dashboardSummary.alerts > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <AlertTriangle size={17} />
          {dashboardSummary.alerts} alert(s) are waiting across assigned assessments.
        </div>
      ) : null}

      {passwordModalItem ? (
        <PasswordModal
          item={passwordModalItem}
          password={password}
          onPasswordChange={setPassword}
          onCancel={() => setPasswordModalItem(null)}
          onConfirm={verifyPassword}
          isUnlocking={isUnlocking}
          error={modalError}
        />
      ) : null}
    </section>
  );
}
