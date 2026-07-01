import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListFilter,
  Search,
  Shield,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const roleIcons = {
  admin: Users,
  faculty: UserRoundCog,
  moderator: Shield,
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pluralCount(count, singular, plural = `${singular}s`) {
  const number = Number(count || 0);
  return `${number} ${number === 1 ? singular : plural}`;
}

function compactList(items) {
  return items.filter(Boolean).slice(0, 3).join(', ');
}

function formatChangedFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const labels = {
    title: 'title',
    assessmentCode: 'assessment code',
    status: 'status',
    visibility: 'visibility',
    name: 'name',
    email: 'email',
    permissions: 'permissions',
    assignedCourses: 'assigned courses',
    courseName: 'course',
    courseCode: 'course code',
    type: 'type',
    difficulty: 'difficulty',
  };
  const fields = Object.keys(value)
    .filter((key) => value[key] !== undefined && value[key] !== null && key !== 'assessmentId')
    .map((key) => labels[key] || titleCase(key).toLowerCase());
  return fields.length ? `Updated ${compactList(fields)}${fields.length > 3 ? ' and more' : ''}.` : '';
}

function personLabel(action) {
  const kind = String(action || '').split('.')[0];
  if (kind === 'admin') return 'admin';
  if (kind === 'faculty') return 'faculty';
  if (kind === 'moderators' || kind === 'moderator') return 'moderator';
  return 'user';
}

function activitySummary(log) {
  const action = String(log.action || '');
  const next = log.newValue || {};
  const previous = log.oldValue || {};
  const course = compactList([next.courseName || previous.courseName, next.courseId || previous.courseId]);
  const assessmentName = compactList([next.title || previous.title, next.assessmentCode || previous.assessmentCode]);
  const userName = compactList([next.name || previous.name, next.email || previous.email]);

  const fallback = {
    title: titleCase(action.replace(/\./g, ' ')) || 'Activity recorded',
    detail: formatChangedFields(next) || log.reason || 'System activity was recorded.',
    category: titleCase(log.targetType || 'Activity'),
  };

  const map = {
    'auth.login': { title: 'Logged in', detail: 'User signed in to Evalora.', category: 'Security' },
    'password.change': { title: 'Changed password', detail: 'Account password was updated.', category: 'Security' },
    'assessment.create': {
      title: 'Created assessment',
      detail: assessmentName || 'New assessment draft was created.',
      category: 'Assessment',
    },
    'assessment.update': {
      title: next.status === 'review' ? 'Moved assessment to review' : 'Edited assessment',
      detail: compactList([assessmentName, formatChangedFields(next)]) || 'Assessment details were updated.',
      category: 'Assessment',
    },
    'assessment.visibility.update': {
      title: next.visibility === 'visible' ? 'Made assessment visible' : 'Hid assessment',
      detail: `Visibility changed from ${previous.visibility || 'previous'} to ${next.visibility || 'new'}.`,
      category: 'Assessment',
    },
    'assessment.status.update': {
      title: next.status === 'review' ? 'Sent assessment for review' : next.status === 'pending' ? 'Published assessment' : 'Changed assessment status',
      detail: `Status changed from ${previous.status || 'previous'} to ${next.status || 'new'}.`,
      category: 'Assessment',
    },
    'assessment.duplicate': {
      title: 'Duplicated assessment',
      detail: assessmentName || 'Created a copy of an assessment.',
      category: 'Assessment',
    },
    'assessment.attempts.reset': {
      title: 'Reset assessment attempts',
      detail: pluralCount(next.deleted || 0, 'attempt'),
      category: 'Assessment',
    },
    'assessment.delete': {
      title: 'Deleted assessment',
      detail: assessmentName || 'Assessment was permanently deleted.',
      category: 'Assessment',
    },
    'assessment.question.create': {
      title: 'Added assessment question',
      detail: compactList([next.type && titleCase(next.type), next.courseName]) || 'Question was added.',
      category: 'Questions',
    },
    'assessment.question.add_from_library': {
      title: 'Added questions from library',
      detail: pluralCount(next.imported || next.questionCount || 0, 'question'),
      category: 'Questions',
    },
    'assessment.question.import_library_heading': {
      title: 'Mapped library folder to course',
      detail: compactList([next.paperHeading, next.courseName, pluralCount(next.imported || 0, 'question')]),
      category: 'Questions',
    },
    'assessment.student.bulk_import': {
      title: 'Imported students',
      detail: `${pluralCount(next.created || 0, 'student')} added, ${pluralCount(next.skipped || 0, 'row')} skipped.`,
      category: 'Students',
    },
    'assessment.student.add': {
      title: 'Added student',
      detail: compactList([next.name, next.email, next.courseName]),
      category: 'Students',
    },
    'assessment.student.send_mail': {
      title: 'Sent student credential mail',
      detail: compactList([next.name, next.email]) || 'Student mail was sent.',
      category: 'Mail',
    },
    'assessment.student.bulk_send_mail': {
      title: 'Sent student credential mails',
      detail: `${pluralCount(next.sent || 0, 'mail')} sent, ${pluralCount(next.skipped || 0, 'recipient')} skipped, ${pluralCount(next.failed || 0, 'failure')}.`,
      category: 'Mail',
    },
    'assessment.proctor.add': {
      title: 'Added proctor',
      detail: compactList([next.name, next.email, next.assessmentTitle]),
      category: 'Proctors',
    },
    'assessment.proctor.auto_assign': {
      title: 'Auto assigned proctors',
      detail: pluralCount(next.assigned || 0, 'proctor'),
      category: 'Proctors',
    },
    'assessment.proctor.send_mail': {
      title: 'Sent proctor credential mail',
      detail: compactList([next.name, next.email]) || 'Proctor mail was sent.',
      category: 'Mail',
    },
    'assessment.proctor.bulk_send_mail': {
      title: 'Sent proctor credential mails',
      detail: `${pluralCount(next.sent || 0, 'mail')} sent, ${pluralCount(next.skipped || 0, 'recipient')} skipped, ${pluralCount(next.failed || 0, 'failure')}.`,
      category: 'Mail',
    },
    'assessment.proctor.delete': {
      title: 'Deleted proctor',
      detail: userName || compactList([next.generatedProctorId, previous.generatedProctorId]) || 'Proctor was removed from an assessment.',
      category: 'Proctors',
    },
    'email.template.update': {
      title: 'Updated email template',
      detail: compactList([next.name, next.subject, next.status && `status ${next.status}`]) || 'Email template content was updated.',
      category: 'Email Templates',
    },
    'email.template.reset': {
      title: 'Reset email template',
      detail: compactList([next.name, next.key]) || 'Email template was reset to the default design.',
      category: 'Email Templates',
    },
    'course.create': {
      title: 'Created course',
      detail: compactList([next.courseName, next.courseCode]),
      category: 'Courses',
    },
    'course.bulk_import': {
      title: 'Imported courses',
      detail: `${pluralCount(next.created || 0, 'course')} created, ${pluralCount(next.replaced || 0, 'course')} replaced.`,
      category: 'Courses',
    },
    'library.group.rename': {
      title: 'Renamed question folder',
      detail: `${previous.paperHeading || 'Folder'} to ${next.paperHeading || 'new folder'}.`,
      category: 'Library',
    },
    'library.group.archive': {
      title: 'Deleted question folder',
      detail: compactList([previous.paperHeading, pluralCount(next.archived || 0, 'question')]),
      category: 'Library',
    },
    'library.question.create': {
      title: 'Created library question',
      detail: compactList([next.paperHeading, next.type && titleCase(next.type), next.difficulty && titleCase(next.difficulty)]),
      category: 'Library',
    },
    'library.question.bulk_create': {
      title: 'Bulk uploaded library questions',
      detail: `${pluralCount(next.created || 0, 'question')} created, ${pluralCount(next.skipped || 0, 'row')} skipped.`,
      category: 'Library',
    },
    'library.question.update': {
      title: 'Edited library question',
      detail: compactList([next.paperHeading, formatChangedFields(next)]) || 'Question was updated.',
      category: 'Library',
    },
    'library.question.archive': {
      title: 'Deleted library question',
      detail: previous.paperHeading || 'Question was archived.',
      category: 'Library',
    },
    'reports.export': {
      title: 'Exported report',
      detail: compactList([next.assessmentTitle, next.format && titleCase(next.format)]) || 'Report was exported.',
      category: 'Reports',
    },
    'work.opened': {
      title: 'Opened assigned assessment work',
      detail: course || 'Faculty started assigned work.',
      category: 'Review Work',
    },
    'work.question.import': {
      title: 'Imported questions into assigned work',
      detail: compactList([course, pluralCount(next.imported || 0, 'question')]),
      category: 'Review Work',
    },
    'work.question.update': {
      title: 'Edited assigned question',
      detail: compactList([course, next.type && titleCase(next.type), next.difficulty && titleCase(next.difficulty)]),
      category: 'Review Work',
    },
    'work.submit': {
      title: 'Submitted questions to moderator',
      detail: compactList([course, pluralCount(next.questionCount || 0, 'question'), next.moderatorMailStatus && `mail ${next.moderatorMailStatus}`]),
      category: 'Review Work',
    },
    'work.approve': {
      title: 'Approved faculty submission',
      detail: course || 'Moderator approved the submitted questions.',
      category: 'Review Work',
    },
    'work.reject': {
      title: 'Rejected faculty submission',
      detail: compactList([course, log.reason && `Reason: ${log.reason}`]) || 'Moderator rejected the submitted questions.',
      category: 'Review Work',
    },
  };

  if (action.startsWith('admin.') || action.startsWith('faculty.') || action.startsWith('moderators.') || action.startsWith('moderator.')) {
    const type = personLabel(action);
    const event = action.split('.').slice(1).join('.');
    const peopleMessages = {
      create: { title: `Created ${type}`, detail: userName || `${titleCase(type)} account was created.` },
      bulk_create: { title: `Bulk created ${type} accounts`, detail: `${pluralCount(next.created || 0, type)} created, ${pluralCount(next.skipped || 0, 'row')} skipped.` },
      update: { title: `Edited ${type}`, detail: compactList([userName, formatChangedFields(next)]) || `${titleCase(type)} details were updated.` },
      delete: { title: `Deleted ${type}`, detail: userName || `${titleCase(type)} account was deleted.` },
      'permissions.update': { title: `Updated ${type} permissions`, detail: `${pluralCount((next.permissions || []).length, 'permission')} enabled.` },
      'status.update': { title: `Changed ${type} status`, detail: `Status changed from ${previous.status || 'previous'} to ${next.status || 'new'}.` },
    };
    return { ...(peopleMessages[event] || fallback), category: titleCase(type) };
  }

  return map[action] || fallback;
}

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function Pagination({ page, pages, total, onPage }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">
        Page {page} of {Math.max(pages || 1, 1)} · {total} records
      </p>
      <div className="flex items-center gap-2">
        <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={14} />
          Prev
        </button>
        <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function RoleSidebar({ roles, selectedRole, onSelect }) {
  return (
    <aside className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="field-label text-brand-600">Credentials</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">Activity Scope</p>
      </div>
      <div className="space-y-1 p-2">
        {roles.map((role) => {
          const Icon = roleIcons[role.role] || Activity;
          const active = selectedRole === role.role;
          return (
            <button
              key={role.role}
              className={`flex h-11 w-full items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition ${
                active
                  ? 'border-brand-100 bg-brand-50 text-brand-700'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950'
              }`}
              type="button"
              onClick={() => onSelect(role.role)}
            >
              <Icon size={16} className="shrink-0 text-brand-500" />
              <span className="truncate">{role.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function ActivityLogPage() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [actionSearch, setActionSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [userMeta, setUserMeta] = useState({ total: 0, pages: 1, retentionDays: 10 });
  const [logMeta, setLogMeta] = useState({ total: 0, pages: 1, retentionDays: 10 });
  const [activeTab, setActiveTab] = useState('activity');
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedRoleLabel = useMemo(() => roles.find((role) => role.role === selectedRole)?.label || 'Users', [roles, selectedRole]);

  useEffect(() => {
    let ignore = false;
    async function loadRoles() {
      try {
        const response = await api.get('/activity/roles');
        if (ignore) return;
        const nextRoles = response.data.roles || [];
        setRoles(nextRoles);
        setSelectedRole((current) => current || nextRoles[0]?.role || '');
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load activity roles.');
      }
    }
    loadRoles();
    return () => {
      ignore = true;
    };
  }, []);

  const loadUsers = useCallback(
    async (page = 1) => {
      if (!selectedRole) return;
      setIsUsersLoading(true);
      setError('');
      try {
        const response = await api.get('/activity/users', {
          params: {
            role: selectedRole,
            search: appliedSearch || undefined,
            page,
            limit: 25,
          },
        });
        setUsers(response.data.items || []);
        setUserMeta({
          total: response.data.total || 0,
          pages: response.data.pages || 1,
          retentionDays: response.data.retentionDays || 10,
        });
        setUserPage(response.data.page || page);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load users.');
      } finally {
        setIsUsersLoading(false);
      }
    },
    [appliedSearch, selectedRole]
  );

  const loadLogs = useCallback(
    async (user, page = 1) => {
      if (!user?._id) return;
      setIsLogsLoading(true);
      setError('');
      try {
        const response = await api.get(`/activity/users/${user._id}/logs`, {
          params: {
            action: actionSearch || undefined,
            page,
            limit: 25,
          },
        });
        setSelectedUser(response.data.user);
        setLogs(response.data.items || []);
        setLogMeta({
          total: response.data.total || 0,
          pages: response.data.pages || 1,
          retentionDays: response.data.retentionDays || 10,
        });
        setLogPage(response.data.page || page);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load activity.');
      } finally {
        setIsLogsLoading(false);
      }
    },
    [actionSearch]
  );

  useEffect(() => {
    if (selectedRole) {
      setSelectedUser(null);
      setLogs([]);
      setUserPage(1);
      loadUsers(1);
    }
  }, [loadUsers, selectedRole]);

  function selectRole(role) {
    setSelectedRole(role);
    setSearch('');
    setAppliedSearch('');
    setActionSearch('');
  }

  function applyUserSearch() {
    setUserPage(1);
    if (appliedSearch === search) {
      loadUsers(1);
    } else {
      setAppliedSearch(search);
    }
  }

  function selectUser(user) {
    setSelectedUser(user);
    setLogs([]);
    setActionSearch('');
    setLogPage(1);
    setActiveTab('activity');
    loadLogs(user, 1);
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Log Activity"
        description={`Showing activity captured in the last ${userMeta.retentionDays || 10} days.`}
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
        <RoleSidebar roles={roles} selectedRole={selectedRole} onSelect={selectRole} />

        <div className="space-y-5">
          {!selectedUser ? (
            <SectionPanel
              title={selectedRoleLabel}
              description="Search and open a user to inspect their recent activity timeline."
              icon={Activity}
              actions={<span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">10 days only</span>}
            >
              <div className="toolbar">
                <div className="search-field">
                  <Search size={16} className="text-brand-500" />
                  <input
                    className="h-10 flex-1 border-0 px-2 text-sm outline-none"
                    placeholder="Search name, email, or login ID"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyUserSearch();
                    }}
                  />
                </div>
                <button className="secondary-button" type="button" onClick={applyUserSearch}>
                  <ListFilter size={16} className="text-brand-500" />
                  Apply
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Last login</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isUsersLoading ? (
                      <tr>
                        <td className="text-center text-slate-500" colSpan={6}>Loading users...</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState title="No users found" description="Change the role or search filter." />
                        </td>
                      </tr>
                    ) : (
                      users.map((item) => (
                        <tr key={item._id}>
                          <td>
                            <p className="font-semibold text-slate-950">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.email || item.loginId}</p>
                          </td>
                          <td><span className={statusClass(item.status)}>{item.status}</span></td>
                          <td className="text-slate-600">{item.role}</td>
                          <td className="text-slate-500">{formatDate(item.lastLoginAt)}</td>
                          <td className="text-slate-500">{formatDate(item.createdAt)}</td>
                          <td className="text-right">
                            <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => selectUser(item)}>
                              <Activity size={14} />
                              View Activity
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={userPage} pages={userMeta.pages} total={userMeta.total} onPage={loadUsers} />
            </SectionPanel>
          ) : (
            <SectionPanel
              title={selectedUser.name}
              description={selectedUser.email || selectedUser.loginId}
              icon={Activity}
              actions={
                <button className="secondary-button" type="button" onClick={() => setSelectedUser(null)}>
                  <ArrowLeft size={16} className="text-brand-500" />
                  Back
                </button>
              }
            >
              <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
                <div>
                  <p className="field-label">Role</p>
                  <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{selectedUser.role}</p>
                </div>
                <div>
                  <p className="field-label">Status</p>
                  <p className="mt-1"><span className={statusClass(selectedUser.status)}>{selectedUser.status}</span></p>
                </div>
                <div>
                  <p className="field-label">Last Login</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(selectedUser.lastLoginAt)}</p>
                </div>
                <div>
                  <p className="field-label">Activity Window</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{logMeta.retentionDays} days</p>
                </div>
              </div>

              <div className="flex gap-2 border-b border-slate-200 bg-white px-4 pt-3">
                {['activity', 'profile'].map((tab) => (
                  <button
                    key={tab}
                    className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${
                      activeTab === tab ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === 'profile' ? (
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <div>
                    <p className="field-label">Login ID</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{selectedUser.loginId || '-'}</p>
                  </div>
                  <div>
                    <p className="field-label">Created</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="field-label">Assigned Courses</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {(selectedUser.assignedCourses || []).map((course) => `${course.courseName} (${course.courseCode})`).join(', ') || 'No assigned courses'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="toolbar">
                    <div className="search-field">
                      <Clock3 size={16} className="text-brand-500" />
                      <input
                        className="h-10 flex-1 border-0 px-2 text-sm outline-none"
                        placeholder="Filter activity, e.g. assessment, faculty, login"
                        value={actionSearch}
                        onChange={(event) => setActionSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') loadLogs(selectedUser, 1);
                        }}
                      />
                    </div>
                    <button className="secondary-button" type="button" onClick={() => loadLogs(selectedUser, 1)}>
                      <ListFilter size={16} className="text-brand-500" />
                      Apply
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Activity</th>
                          <th>Details</th>
                          <th>Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {isLogsLoading ? (
                          <tr>
                            <td className="text-center text-slate-500" colSpan={4}>Loading activity...</td>
                          </tr>
                        ) : logs.length === 0 ? (
                          <tr>
                            <td colSpan={4}>
                              <EmptyState title="No activity found" description="Only the latest 10 days are retained." />
                            </td>
                          </tr>
                        ) : (
                          logs.map((log) => {
                            const summary = activitySummary(log);
                            return (
                              <tr key={log.id}>
                                <td className="whitespace-nowrap text-slate-500">{formatDate(log.createdAt)}</td>
                                <td>
                                  <p className="font-semibold text-slate-950">{summary.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{log.actorName || selectedUser.name}</p>
                                </td>
                                <td className="max-w-xl text-sm leading-6 text-slate-600">{summary.detail || 'Activity was recorded.'}</td>
                                <td>
                                  <span className="status-badge status-active">{summary.category}</span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={logPage} pages={logMeta.pages} total={logMeta.total} onPage={(page) => loadLogs(selectedUser, page)} />
                </>
              )}
            </SectionPanel>
          )}
        </div>
      </div>
    </section>
  );
}
