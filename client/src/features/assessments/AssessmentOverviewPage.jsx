import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  RotateCcw,
  UserRoundCheck,
  Users,
  Video,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const statusTabs = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
];

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return `status-badge status-${String(status || 'draft').replace(/\s+/g, '_')}`;
}

function getCreatePath(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin/assessments/create' : '/admin/assessments/create';
}

function getEditDraftPath(pathname, assessmentId) {
  return `${getCreatePath(pathname)}?draftId=${assessmentId}`;
}

function getQuestionPath(pathname, assessmentId) {
  return `${getEditDraftPath(pathname, assessmentId)}&step=questions`;
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

function getActionLabel(action, assessment) {
  const labels = {
    visibility: assessment?.visibility === 'hidden' ? 'Show assessment' : 'Hide assessment',
    password: 'Edit password',
    duplicate: 'Duplicate assessment',
    complete: 'Mark as complete',
    draft: 'Move to draft',
    delete: 'Delete assessment',
    reset: 'Reset all exam attempts',
  };

  return labels[action] || 'Confirm action';
}

function getActionDescription(action, assessment) {
  if (action === 'visibility') {
    return assessment?.visibility === 'hidden'
      ? 'This assessment will become visible where visibility is checked.'
      : 'This assessment will be hidden from normal operational visibility.';
  }

  if (action === 'password') {
    return 'Set a new common assessment password. Students will need the latest password before starting the exam.';
  }

  if (action === 'duplicate') {
    return 'A new draft copy will be created with courses, settings, and questions. Students and proctors will not be copied.';
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

  return 'Please confirm before continuing.';
}

const pageCopy = {
  overview: {
    eyebrow: 'Assessment',
    title: 'Assessment Overview',
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
    description: 'View assessments available in your workspace with course, schedule, and assignment counts.',
    showCreate: true,
  },
};

export function AssessmentOverviewPage({ mode = 'overview' }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [statusCounts, setStatusCounts] = useState({ all: 0 });
  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [passwordValue, setPasswordValue] = useState('');

  const createPath = useMemo(() => getCreatePath(location.pathname), [location.pathname]);
  const copy = pageCopy[mode] || pageCopy.overview;

  const loadAssessments = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/assessments', {
        params: {
          status: activeStatus,
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
  }, [activeStatus, appliedFilters]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  function requestAction(action, assessment) {
    setOpenMenuId('');
    setPasswordValue('');
    setConfirmAction({ action, assessment });
  }

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

      if (action === 'password') {
        await api.patch(`/assessments/${assessment._id}/password`, {
          password: passwordValue,
        });
      }

      if (action === 'duplicate') {
        await api.post(`/assessments/${assessment._id}/duplicate`);
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

      setConfirmAction(null);
      setPasswordValue('');
      await loadAssessments();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to complete assessment action.');
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
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Courses</th>
                <th>Students</th>
                <th>Proctors</th>
                <th>Window</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={8}>Loading assessments...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="No assessments found" description="Create an assessment or adjust filters to review existing records." />
                  </td>
                </tr>
              ) : (
                items.map((assessment) => (
                  <tr key={assessment._id} className="align-top">
                    <td>
                      <Link className="font-semibold text-slate-950 hover:text-brand-700" to={getWorkspacePath(location.pathname, assessment._id)}>
                        {assessment.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{assessment.assessmentCode}</p>
                      <p className="mt-1 text-xs text-slate-400">{assessment.type}</p>
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <ClipboardList size={16} className="text-brand-500" />
                        {assessment.counts?.courses || 0}
                      </div>
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <Users size={16} className="text-brand-500" />
                        {assessment.counts?.students || 0}
                      </div>
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <Video size={16} className="text-brand-500" />
                        {assessment.counts?.proctors || 0}
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
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link className="secondary-button h-8 px-2 text-xs" to={getStudentPath(location.pathname, assessment._id)}>
                          <Users size={15} className="text-brand-500" />
                          Students
                        </Link>
                        <Link className="secondary-button h-8 px-2 text-xs" to={getProctorPath(location.pathname, assessment._id)}>
                          <UserRoundCheck size={15} className="text-brand-500" />
                          Proctors
                        </Link>
                        <Link className="secondary-button h-8 px-2 text-xs" to={getQuestionPath(location.pathname, assessment._id)}>
                          <BookOpen size={15} className="text-brand-500" />
                          Questions
                        </Link>
                        <div className="relative flex gap-2">
                          {(assessment.operationalStatus || assessment.status) === 'draft' ? (
                            <Link className="secondary-button h-8 px-2 text-xs" to={getEditDraftPath(location.pathname, assessment._id)}>
                              <Pencil size={15} className="text-brand-500" />
                              Edit
                            </Link>
                          ) : null}
                          <button
                            className="secondary-button h-8 w-8 px-0"
                            type="button"
                            title="More actions"
                            onClick={() => setOpenMenuId((current) => (current === assessment._id ? '' : assessment._id))}
                          >
                            <MoreHorizontal size={15} className="text-brand-500" />
                          </button>
                          {openMenuId === assessment._id ? (
                            <div className="absolute right-0 top-9 z-30 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                              <Link
                                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                to={getWorkspacePath(location.pathname, assessment._id)}
                              >
                                <ClipboardList size={14} className="text-brand-500" />
                                Edit assessment
                              </Link>
                              {(assessment.operationalStatus || assessment.status) === 'draft' ? (
                                <Link
                                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  to={getEditDraftPath(location.pathname, assessment._id)}
                                >
                                  <Pencil size={14} className="text-brand-500" />
                                  Edit draft
                                </Link>
                              ) : null}
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
                                onClick={() => requestAction('password', assessment)}
                              >
                                <KeyRound size={14} className="text-brand-500" />
                                Edit password
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
                                onClick={() => requestAction(assessment.status === 'completed' ? 'draft' : 'complete', assessment)}
                              >
                                <CheckCircle2 size={14} className="text-brand-500" />
                                {assessment.status === 'completed' ? 'Move to draft' : 'Mark complete'}
                              </button>
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
                          ) : null}
                        </div>
                      </div>
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

              {confirmAction.action === 'password' ? (
                <div>
                  <label className="field-label">New common assessment password</label>
                  <input
                    className="field-input mt-2"
                    value={passwordValue}
                    onChange={(event) => setPasswordValue(event.target.value)}
                    placeholder="Enter new password"
                  />
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
                disabled={isActing || (confirmAction.action === 'password' && passwordValue.trim().length < 4)}
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
