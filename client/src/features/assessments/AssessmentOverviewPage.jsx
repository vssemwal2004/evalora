import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const statusTabs = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Review', value: 'review' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
];

const actionMenuSize = {
  width: 240,
  height: 470,
  gap: 8,
};

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return `status-badge status-${String(status || 'draft').replace(/\s+/g, '_')}`;
}

function mailSummaryText(summary) {
  const total = Number(summary?.total || 0);
  if (total === 0) return 'Mail: none';
  return `Mail: ${Number(summary?.sent || 0)}/${total}`;
}

function mailSummaryTone(summary) {
  const total = Number(summary?.total || 0);
  if (total === 0) return 'text-slate-400';
  return Number(summary?.sent || 0) >= total ? 'text-green-700' : 'text-amber-700';
}

function mailPendingCount(summary) {
  const total = Number(summary?.total || 0);
  const sent = Number(summary?.sent || 0);
  return Math.max(total - sent, 0);
}

function isPublishedForMail(assessment) {
  return !['draft', 'review'].includes(assessment?.status);
}

function canSendAssessmentMail(assessment, kind) {
  const summary = assessment?.mailSummary?.[kind];
  return isPublishedForMail(assessment) && Number(summary?.total || 0) > 0 && mailPendingCount(summary) > 0;
}

function getCreatePath(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin/assessments/create' : '/admin/assessments/create';
}

function getEditDraftPath(pathname, assessmentId) {
  return `${getCreatePath(pathname)}?draftId=${assessmentId}`;
}

function getQuestionPath(pathname, assessmentId) {
  return pathname.startsWith('/super-admin')
    ? `/super-admin/assessments/${assessmentId}/questions`
    : `/admin/assessments/${assessmentId}/questions`;
}

function getStudentPath(pathname, assessmentId) {
  return pathname.startsWith('/super-admin')
    ? `/super-admin/assessments/${assessmentId}/students`
    : `/admin/assessments/${assessmentId}/students`;
}

function getProctorPath(pathname, assessmentId) {
  return pathname.startsWith('/super-admin')
    ? `/super-admin/assessments/${assessmentId}/proctors`
    : `/admin/assessments/${assessmentId}/proctors`;
}

function getWorkspacePath(pathname, assessmentId) {
  return getEditDraftPath(pathname, assessmentId);
}

function getReviewQuestionPath(pathname, assessmentId) {
  return pathname.startsWith('/super-admin')
    ? `/super-admin/assessments/review/${assessmentId}/questions`
    : `/admin/assessments/review/${assessmentId}/questions`;
}

function reviewProgress(assessment) {
  return Number(assessment?.reviewSummary?.progressPercent || 0);
}

function reviewCourseTone(status, completed) {
  if (completed || status === 'mapped' || status === 'approved') {
    return {
      label: status === 'mapped' ? 'Admin' : 'Ready',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      bar: 'bg-emerald-500',
      step: 3,
    };
  }

  const tones = {
    pending: {
      label: 'Pending',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
      step: 0,
    },
    assigned: {
      label: 'Faculty',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      bar: 'bg-sky-500',
      step: 1,
    },
    in_progress: {
      label: 'Faculty',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      bar: 'bg-sky-500',
      step: 1,
    },
    submitted: {
      label: 'Moderator',
      className: 'border-violet-200 bg-violet-50 text-violet-700',
      bar: 'bg-violet-500',
      step: 2,
    },
    rejected: {
      label: 'Rework',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      bar: 'bg-rose-500',
      step: 1,
    },
  };

  return tones[status] || tones.pending;
}

function ReviewTimelinePopover({ assessment }) {
  const [isOpen, setIsOpen] = useState(false);
  const courses = assessment.reviewSummary?.courses || [];
  const total = Number(assessment.reviewSummary?.total || 0);
  const completed = Number(assessment.reviewSummary?.completed || 0);
  const pendingModerator = courses.filter((course) => course.status === 'submitted').length;
  const pendingFaculty = courses.filter((course) => ['assigned', 'in_progress', 'rejected'].includes(course.status)).length;
  const progress = reviewProgress(assessment);

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        className="w-full rounded-md px-1 py-1 text-left outline-none transition hover:bg-slate-50 focus:bg-slate-50"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open review progress diagram"
      >
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>{completed}/{total} courses</span>
          <span className="text-brand-700">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/35 p-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0 cursor-default" type="button" aria-label="Close review progress diagram" onClick={() => setIsOpen(false)} />
          <div className="relative mx-auto mt-8 flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="inline-flex items-baseline gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-brand-700">
                  {progress}%
                  <span className="text-[10px] font-semibold text-brand-700/55">progress</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  {completed}/{total}
                  <span className="text-[10px] font-semibold text-emerald-700/55">ready</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                  {pendingFaculty}
                  <span className="text-[10px] font-semibold text-sky-700/55">faculty</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">
                  {pendingModerator}
                  <span className="text-[10px] font-semibold text-violet-700/55">moderator</span>
                </span>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-950" type="button" onClick={() => setIsOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {courses.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm font-semibold text-slate-500">No courses</p>
              ) : (
                <div className="grid gap-1.5">
                  {courses.map((course) => {
                    const tone = reviewCourseTone(course.status || 'pending', course.completed);
                    const stages = [
                      { key: 'faculty', icon: UserRoundCheck, active: tone.step >= 1, current: tone.step === 1 && !course.completed && course.status !== 'mapped' },
                      { key: 'moderator', icon: ShieldCheck, active: tone.step >= 2, current: tone.step === 2 && !course.completed && course.status !== 'mapped' },
                      { key: 'approved', icon: CheckCircle2, active: tone.step >= 3, current: false },
                    ];

                    return (
                      <div key={course.courseSubdocumentId || `${course.courseName}-${course.courseId}`} className="grid items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 md:grid-cols-[minmax(160px,1fr)_minmax(280px,1.6fr)_92px]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{course.courseName}</p>
                          <p className="truncate text-[11px] font-semibold text-slate-500">{course.courseId || '-'}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {stages.map((stage, index) => {
                            const Icon = stage.icon;
                            return (
                              <div className="flex flex-1 items-center gap-2" key={stage.key}>
                                <span
                                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${
                                    stage.active
                                      ? `${tone.className} ${stage.current ? 'animate-pulse' : ''}`
                                      : 'border-slate-200 bg-slate-50 text-slate-300'
                                  }`}
                                  title={stage.key}
                                >
                                  <Icon size={15} />
                                </span>
                                {index < stages.length - 1 ? (
                                  <span className={`h-1 flex-1 rounded-full ${tone.step > index + 1 ? tone.bar : 'bg-slate-200'}`} />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <span className={`justify-self-start rounded-full border px-2 py-0.5 text-[11px] font-bold md:justify-self-end ${tone.className}`}>
                          {tone.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getActionLabel(action, assessment) {
  const labels = {
    visibility: assessment?.visibility === 'hidden' ? 'Show assessment' : 'Hide assessment',
    duplicate: 'Duplicate assessment',
    copy_mock: 'Copy assessment as mock',
    complete: 'Mark as complete',
    draft: 'Move to draft',
    delete: 'Delete assessment',
    reset: 'Reset all exam attempts',
    send_students: 'Send mail to students',
    send_proctors: 'Send mail to proctors',
    publish_review: 'Publish assessment',
  };

  return labels[action] || 'Confirm action';
}

function getActionDescription(action, assessment) {
  if (action === 'visibility') {
    return assessment?.visibility === 'hidden'
      ? 'This assessment will become visible where visibility is checked.'
      : 'This assessment will be hidden from normal operational visibility.';
  }

  if (action === 'duplicate') {
    return 'A new draft copy will be created with courses, settings, and questions. Students and proctors will not be copied.';
  }

  if (action === 'copy_mock') {
    return 'A new draft mock assessment will be created. Only student and proctor records are copied; questions, review mapping, schedule, and publish state start fresh.';
  }

  if (action === 'complete') {
    return 'This assessment will be marked completed.';
  }

  if (action === 'draft') {
    return 'This assessment will move back to draft status.';
  }

  if (action === 'delete') {
    return 'This will permanently delete the assessment with its assigned students, proctors, and questions.';
  }

  if (action === 'reset') {
    return 'This permanently removes all submitted and in-progress attempts, saved answers, and security events. Every assigned student will be able to start the exam again.';
  }

  if (action === 'send_students') {
    return 'Credential mail will be sent only to students who have not already received it. Already-sent records are skipped.';
  }

  if (action === 'send_proctors') {
    return 'Credential mail will be sent only to proctors who have not already received it. Already-sent records are skipped.';
  }

  if (action === 'publish_review') {
    return 'This assessment is review-ready and will become visible for the next operational phase.';
  }

  return 'Please confirm before continuing.';
}

function getBulkActionLabel(action) {
  const labels = {
    hide: 'Hide selected',
    show: 'Show selected',
    complete: 'Mark selected complete',
    draft: 'Move selected to draft',
    delete: 'Delete selected',
  };

  return labels[action] || 'Confirm selected action';
}

function getBulkActionDescription(action, count) {
  if (action === 'hide') {
    return `${count} selected assessment(s) will be hidden from normal operational visibility.`;
  }

  if (action === 'show') {
    return `${count} selected assessment(s) will become visible where visibility is checked.`;
  }

  if (action === 'complete') {
    return `${count} selected assessment(s) will be marked completed.`;
  }

  if (action === 'draft') {
    return `${count} selected assessment(s) will move back to draft status.`;
  }

  if (action === 'delete') {
    return `This will permanently delete ${count} selected assessment(s) with their assigned students, proctors, and questions.`;
  }

  return 'Please confirm before continuing.';
}

const pageCopy = {
  overview: {
    eyebrow: 'Assessment',
    title: 'Overall Assessments',
    description: 'Create, filter, and track exam operations from one scan-friendly table.',
    showCreate: true,
  },
  reports: {
    eyebrow: 'Assessment Reports',
    title: 'Assessment Reports',
    description: 'Review assessment-level reporting readiness, student/proctor counts, and operational status.',
    showCreate: false,
  },
  mine: {
    eyebrow: 'My Assessments',
    title: 'My Assessments',
    description: 'View assessments created by you with course, schedule, and assignment counts.',
    showCreate: true,
  },
  review: {
    eyebrow: 'Review Assessments',
    title: 'Review Assessments',
    description: 'Assessments waiting for faculty work or moderator review stay editable here.',
    showCreate: false,
    defaultStatus: 'review',
  },
};

export function AssessmentOverviewPage({ mode = 'overview' }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [statusCounts, setStatusCounts] = useState({ all: 0 });
  const copy = pageCopy[mode] || pageCopy.overview;
  const [activeStatus, setActiveStatus] = useState(() => searchParams.get('status') || copy.defaultStatus || 'all');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);

  const createPath = useMemo(() => getCreatePath(location.pathname), [location.pathname]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item._id)),
    [items, selectedIds]
  );
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item._id));

  const loadAssessments = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/assessments', {
        params: {
          status: mode === 'review' ? 'review' : activeStatus,
          mine: mode === 'mine' ? 'true' : undefined,
          search: appliedFilters.search || undefined,
          course: appliedFilters.course || undefined,
        },
      });
      setItems(response.data.items);
      setStatusCounts(response.data.statusCounts);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load assessments.');
    } finally {
      setIsLoading(false);
    }
  }, [activeStatus, appliedFilters, mode]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item._id === id)));
  }, [items]);

  function requestAction(action, assessment) {
    setOpenMenuId('');
    setConfirmAction({ action, assessment });
  }

  function toggleActionMenu(event, assessmentId) {
    if (openMenuId === assessmentId) {
      setOpenMenuId('');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuTopBelow = rect.bottom + actionMenuSize.gap;
    const menuTopAbove = rect.top - actionMenuSize.height - actionMenuSize.gap;
    const hasRoomBelow = window.innerHeight - rect.bottom >= actionMenuSize.height + actionMenuSize.gap;
    const top = hasRoomBelow ? menuTopBelow : Math.max(actionMenuSize.gap, menuTopAbove);
    const left = Math.min(
      Math.max(actionMenuSize.gap, rect.right - actionMenuSize.width),
      window.innerWidth - actionMenuSize.width - actionMenuSize.gap
    );

    setActionMenuPosition({ top, left });
    setOpenMenuId(assessmentId);
  }

  function toggleAssessmentSelection(assessmentId) {
    setSelectedIds((current) =>
      current.includes(assessmentId)
        ? current.filter((id) => id !== assessmentId)
        : [...current, assessmentId]
    );
    setOpenMenuId('');
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = items.map((item) => item._id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));

      if (allSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
    setOpenMenuId('');
  }

  function requestBulkAction(action) {
    setBulkMenuOpen(false);
    if (selectedItems.length === 0) return;
    setBulkAction({ action, assessments: selectedItems });
  }

  useEffect(() => {
    if (!openMenuId) return undefined;

    function closeMenu() {
      setOpenMenuId('');
    }

    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [openMenuId]);

  async function runConfirmedAction() {
    if (!confirmAction?.assessment?._id) {
      return;
    }

    const { action, assessment } = confirmAction;
    setIsActing(true);
    setError('');

    try {
      if (action === 'visibility') {
        await api.patch(`/assessments/${assessment._id}/visibility`, {
          visibility: assessment.visibility === 'hidden' ? 'visible' : 'hidden',
        });
      }

      if (action === 'duplicate') {
        await api.post(`/assessments/${assessment._id}/duplicate`);
      }

      if (action === 'copy_mock') {
        await api.post(`/assessments/${assessment._id}/copy-as-mock`);
      }

      if (action === 'complete') {
        await api.patch(`/assessments/${assessment._id}/status`, {
          status: 'completed',
        });
      }

      if (action === 'draft') {
        await api.patch(`/assessments/${assessment._id}/status`, {
          status: 'draft',
        });
      }

      if (action === 'delete') {
        await api.delete(`/assessments/${assessment._id}`);
      }

      if (action === 'reset') {
        await api.post(`/assessments/${assessment._id}/reset-attempts`);
      }

      if (action === 'send_students') {
        await api.post(`/assessments/${assessment._id}/students/send-mail`);
      }

      if (action === 'send_proctors') {
        await api.post(`/assessments/${assessment._id}/proctors/send-mail`);
      }

      if (action === 'publish_review') {
        await api.patch(`/assessments/${assessment._id}`, {
          status: 'pending',
          visibility: 'visible',
        });
      }

      setConfirmAction(null);
      await loadAssessments();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to complete assessment action.');
    } finally {
      setIsActing(false);
    }
  }

  async function runBulkAction() {
    if (!bulkAction?.assessments?.length) {
      return;
    }

    const { action, assessments } = bulkAction;
    setIsActing(true);
    setError('');

    try {
      await Promise.all(
        assessments.map((assessment) => {
          if (action === 'hide') {
            return api.patch(`/assessments/${assessment._id}/visibility`, { visibility: 'hidden' });
          }

          if (action === 'show') {
            return api.patch(`/assessments/${assessment._id}/visibility`, { visibility: 'visible' });
          }

          if (action === 'complete') {
            return api.patch(`/assessments/${assessment._id}/status`, { status: 'completed' });
          }

          if (action === 'draft') {
            return api.patch(`/assessments/${assessment._id}/status`, { status: 'draft' });
          }

          if (action === 'delete') {
            return api.delete(`/assessments/${assessment._id}`);
          }

          return Promise.resolve();
        })
      );

      setBulkAction(null);
      setSelectedIds([]);
      await loadAssessments();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to complete selected assessment action.');
    } finally {
      setIsActing(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={copy.showCreate ? <Link className="primary-button" to={createPath}>
          <Plus size={17} />
          Create Assessment
        </Link> : null}
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <SectionPanel>
        {mode !== 'review' ? (
          <div className="border-b border-slate-200 px-4 pt-3">
            <div className="flex flex-wrap gap-1">
              {statusTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={`border-b-2 px-3 py-3 text-sm font-semibold transition ${
                    activeStatus === tab.value
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-brand-600'
                  }`}
                  type="button"
                  onClick={() => setActiveStatus(tab.value)}
                >
                  {tab.label}
                  <span className="ml-2 text-xs text-slate-400">{statusCounts?.[tab.value] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="toolbar">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search title, code, or type"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <input
            className="field-input max-w-[240px]"
            placeholder="Course name or ID"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
          />
          <button className="secondary-button" type="button" onClick={() => setAppliedFilters({ search, course })}>
            Apply Filters
          </button>
          {mode !== 'review' && selectedItems.length > 0 ? (
            <div className="relative">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setBulkMenuOpen((current) => !current)}
              >
                <MoreHorizontal size={16} className="text-brand-500" />
                {selectedItems.length} selected
              </button>
              {bulkMenuOpen ? (
                <div className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Selected assessments</p>
                  </div>
                  <div className="p-1">
                    <button
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => requestBulkAction('hide')}
                    >
                      <EyeOff size={14} className="text-brand-500" />
                      Hide selected
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => requestBulkAction('show')}
                    >
                      <Eye size={14} className="text-brand-500" />
                      Show selected
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => requestBulkAction('complete')}
                    >
                      <CheckCircle2 size={14} className="text-brand-500" />
                      Mark complete
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => requestBulkAction('draft')}
                    >
                      <ClipboardList size={14} className="text-brand-500" />
                      Move to draft
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                      type="button"
                      onClick={() => requestBulkAction('delete')}
                    >
                      <Trash2 size={14} />
                      Delete selected
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {mode !== 'review' ? (
                  <th className="w-10">
                    <input
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all visible assessments"
                    />
                  </th>
                ) : null}
                <th>Assessment</th>
                <th>Created By</th>
                <th>Courses</th>
                <th>Students</th>
                <th>Proctors</th>
                <th>Window</th>
                <th>Duration</th>
                <th>Status</th>
                {mode === 'review' ? <th>Progress</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={10}>Loading assessments...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title="No assessments found" description="Create an assessment or adjust filters to review existing records." />
                  </td>
                </tr>
              ) : (
                items.map((assessment) => (
                  <tr key={assessment._id} className="align-top">
                    {mode !== 'review' ? (
                      <td>
                        <input
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          type="checkbox"
                          checked={selectedIds.includes(assessment._id)}
                          onChange={() => toggleAssessmentSelection(assessment._id)}
                          aria-label={`Select ${assessment.title}`}
                        />
                      </td>
                    ) : null}
                    <td>
                      <Link className="font-semibold text-slate-950 hover:text-brand-700" to={getWorkspacePath(location.pathname, assessment._id)}>
                        {assessment.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{assessment.assessmentCode}</p>
                      <p className="mt-1 text-xs text-slate-400">{assessment.type}</p>
                    </td>
                    <td>
                      <p className="text-sm font-semibold text-slate-800">
                        {assessment.createdByName || assessment.createdBy?.name || 'Unknown'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.createdByRole || assessment.createdBy?.role || '-'}</p>
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <ClipboardList size={16} className="text-brand-500" />
                        {assessment.counts?.courses || 0}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-slate-700">
                          <Users size={16} className="text-brand-500" />
                          {assessment.counts?.students || 0}
                        </div>
                        <p className={`flex items-center gap-1 text-[11px] font-semibold ${mailSummaryTone(assessment.mailSummary?.students)}`}>
                          <Mail size={12} />
                          {mailSummaryText(assessment.mailSummary?.students)}
                        </p>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-slate-700">
                          <Video size={16} className="text-brand-500" />
                          {assessment.counts?.proctors || 0}
                        </div>
                        <p className={`flex items-center gap-1 text-[11px] font-semibold ${mailSummaryTone(assessment.mailSummary?.proctors)}`}>
                          <Mail size={12} />
                          {mailSummaryText(assessment.mailSummary?.proctors)}
                        </p>
                      </div>
                    </td>
                    <td className="text-xs leading-5 text-slate-600">
                      <div className="flex items-start gap-2">
                        <CalendarDays size={16} className="mt-0.5 text-brand-500" />
                        <div>
                          <p>{formatDate(assessment.startAt)}</p>
                          <p>{formatDate(assessment.endAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-700">
                      {assessment.globalDurationMinutes ? `${assessment.globalDurationMinutes} min` : 'Not set'}
                    </td>
                    <td>
                      <span className={statusClass(assessment.operationalStatus || assessment.status)}>
                        {assessment.operationalStatus || assessment.status}
                      </span>
                    </td>
                    {mode === 'review' ? (
                      <td className="min-w-[180px]">
                        <ReviewTimelinePopover assessment={assessment} />
                      </td>
                    ) : null}
                    <td>
                      {mode === 'review' ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          {(assessment.reviewSummary?.readyToPublish || reviewProgress(assessment) === 100) ? (
                            <button
                              className="primary-button h-9 px-3 text-xs"
                              type="button"
                              onClick={() => setConfirmAction({ action: 'publish_review', assessment })}
                            >
                              <CheckCircle2 size={14} />
                              Publish
                            </button>
                          ) : null}
                          <Link className={`${assessment.reviewSummary?.readyToPublish || reviewProgress(assessment) === 100 ? 'secondary-button' : 'primary-button'} h-9 px-3 text-xs`} to={getReviewQuestionPath(location.pathname, assessment._id)}>
                            <BookOpen size={14} />
                            Edit Questions
                          </Link>
                        </div>
                      ) : (
                      <div className="relative flex justify-end">
                          <button
                            className="secondary-button h-9 w-9 px-0"
                            type="button"
                            title="More actions"
                            onClick={(event) => toggleActionMenu(event, assessment._id)}
                          >
                            <MoreHorizontal size={15} className="text-brand-500" />
                          </button>
                          {openMenuId === assessment._id ? (
                            <div
                              className="fixed z-50 max-h-[calc(100vh-16px)] w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
                              style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                            >
                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase text-slate-500">Manage</p>
                              </div>
                              <div className="p-1">
                              <Link
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                to={getEditDraftPath(location.pathname, assessment._id)}
                                onClick={() => setOpenMenuId('')}
                              >
                                <Pencil size={14} className="text-brand-500" />
                                Edit assessment
                              </Link>
                              <Link
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                to={getQuestionPath(location.pathname, assessment._id)}
                                onClick={() => setOpenMenuId('')}
                              >
                                <BookOpen size={14} className="text-brand-500" />
                                Questions
                              </Link>
                              <Link
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                to={getStudentPath(location.pathname, assessment._id)}
                                onClick={() => setOpenMenuId('')}
                              >
                                <Users size={14} className="text-brand-500" />
                                Students
                              </Link>
                              <Link
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                to={getProctorPath(location.pathname, assessment._id)}
                                onClick={() => setOpenMenuId('')}
                              >
                                <UserRoundCheck size={14} className="text-brand-500" />
                                Proctors
                              </Link>
                              </div>

                              <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase text-slate-500">Assessment actions</p>
                              </div>
                              <div className="p-1">
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                type="button"
                                onClick={() => requestAction('visibility', assessment)}
                              >
                                {assessment.visibility === 'hidden' ? <Eye size={14} className="text-brand-500" /> : <EyeOff size={14} className="text-brand-500" />}
                                {getActionLabel('visibility', assessment)}
                              </button>
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                type="button"
                                onClick={() => requestAction('duplicate', assessment)}
                              >
                                <Copy size={14} className="text-brand-500" />
                                Duplicate
                              </button>
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                type="button"
                                onClick={() => requestAction('copy_mock', assessment)}
                              >
                                <Copy size={14} className="text-brand-500" />
                                Copy as mock
                              </button>
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                type="button"
                                onClick={() => requestAction(assessment.status === 'completed' ? 'draft' : 'complete', assessment)}
                              >
                                <CheckCircle2 size={14} className="text-brand-500" />
                                {assessment.status === 'completed' ? 'Move to draft' : 'Mark complete'}
                              </button>
                              {isPublishedForMail(assessment) ? (
                                <>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"
                                    type="button"
                                    onClick={() => requestAction('send_students', assessment)}
                                    disabled={!canSendAssessmentMail(assessment, 'students')}
                                    title={canSendAssessmentMail(assessment, 'students') ? 'Send pending student credential mails' : 'No pending student mails'}
                                  >
                                    <Mail size={14} className={canSendAssessmentMail(assessment, 'students') ? 'text-brand-500' : 'text-slate-300'} />
                                    Send mail to students
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white"
                                    type="button"
                                    onClick={() => requestAction('send_proctors', assessment)}
                                    disabled={!canSendAssessmentMail(assessment, 'proctors')}
                                    title={canSendAssessmentMail(assessment, 'proctors') ? 'Send pending proctor credential mails' : 'No pending proctor mails'}
                                  >
                                    <Mail size={14} className={canSendAssessmentMail(assessment, 'proctors') ? 'text-brand-500' : 'text-slate-300'} />
                                    Send mail to proctors
                                  </button>
                                </>
                              ) : null}
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                                type="button"
                                onClick={() => requestAction('reset', assessment)}
                              >
                                <RotateCcw size={14} />
                                Reset all exam attempts
                              </button>
                              <button
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                                type="button"
                                onClick={() => requestAction('delete', assessment)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                              </div>
                            </div>
                          ) : null}
                      </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {confirmAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">{getActionLabel(confirmAction.action, confirmAction.assessment)}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{getActionDescription(confirmAction.action, confirmAction.assessment)}</p>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Assessment</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{confirmAction.assessment.title}</p>
                <p className="text-xs text-slate-500">{confirmAction.assessment.assessmentCode}</p>
              </div>

              {['send_students', 'send_proctors'].includes(confirmAction.action) ? (
                <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm md:grid-cols-3">
                  {(() => {
                    const kind = confirmAction.action === 'send_students' ? 'students' : 'proctors';
                    const summary = confirmAction.assessment.mailSummary?.[kind] || {};
                    return (
                      <>
                        <div>
                          <p className="text-xs font-semibold uppercase text-amber-700">Total</p>
                          <p className="mt-1 text-lg font-semibold text-slate-950">{Number(summary.total || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-amber-700">Already sent</p>
                          <p className="mt-1 text-lg font-semibold text-slate-950">{Number(summary.sent || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-amber-700">Pending</p>
                          <p className="mt-1 text-lg font-semibold text-slate-950">{mailPendingCount(summary)}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}

            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setConfirmAction(null)} disabled={isActing}>
                Cancel
              </button>
              <button
                className={['delete', 'reset'].includes(confirmAction.action) ? 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300' : 'primary-button'}
                type="button"
                onClick={runConfirmedAction}
                disabled={isActing}
              >
                {isActing ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">{getBulkActionLabel(bulkAction.action)}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {getBulkActionDescription(bulkAction.action, bulkAction.assessments.length)}
                </p>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto px-5 py-4">
              <div className="rounded-md border border-slate-200 bg-slate-50">
                {bulkAction.assessments.map((assessment) => (
                  <div key={assessment._id} className="border-b border-slate-200 px-3 py-2 last:border-b-0">
                    <p className="text-sm font-semibold text-slate-950">{assessment.title}</p>
                    <p className="text-xs text-slate-500">{assessment.assessmentCode}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setBulkAction(null)} disabled={isActing}>
                Cancel
              </button>
              <button
                className={bulkAction.action === 'delete' ? 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300' : 'primary-button'}
                type="button"
                onClick={runBulkAction}
                disabled={isActing}
              >
                {isActing ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AssessmentReportsPage() {
  return <AssessmentOverviewPage mode="reports" />;
}

export function MyAssessmentsPage() {
  return <AssessmentOverviewPage mode="mine" />;
}
