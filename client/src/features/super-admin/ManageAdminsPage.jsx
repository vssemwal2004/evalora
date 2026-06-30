import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MoreVertical, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users, UserX, X } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const defaultPermissions = [
  'dashboard.view',
  'assessment.view',
  'assessment.create',
  'assessment.edit',
  'assessment.review.send',
  'assessment.publish',
  'assessment.duplicate',
  'course.view',
  'course.create',
  'course.edit',
  'faculty.view',
  'faculty.view.all',
  'faculty.profile.view',
  'faculty.create',
  'faculty.edit',
  'moderator.view',
  'moderator.view.all',
  'moderator.profile.view',
  'moderator.create',
  'moderator.edit',
  'student.view',
  'student.add',
  'student.edit',
  'proctor.add',
  'proctor.edit',
  'library.view',
  'library.create',
  'library.edit',
  'mail.send',
  'email.template.view',
  'email.template.manage',
  'reports.view',
  'reports.export',
  'activity.faculty.view',
  'activity.moderator.view',
];

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

const permissionLabels = {
  'dashboard.view': 'View dashboard',
  'assessment.view': 'View assessments',
  'assessment.create': 'Create assessments',
  'assessment.edit': 'Edit assessment drafts, setup, schedule, and settings',
  'assessment.review.send': 'Send assessments to faculty/moderator review',
  'assessment.publish': 'Publish assessments for students',
  'assessment.delete': 'Delete assessments',
  'assessment.duplicate': 'Duplicate assessments',
  'assessment.hide': 'Hide or show assessments',
  'assessment.reset': 'Reset exam attempts',
  'assessment.complete': 'Mark assessments complete',
  'assessment.questions.add': 'Add assigned assessment questions',
  'assessment.questions.edit': 'Edit assigned assessment questions',
  'assessment.review': 'Approve or reject assigned assessments',
  'assessment.submit': 'Submit assigned assessment work',
  'course.view': 'View courses',
  'course.create': 'Create courses',
  'course.edit': 'Edit courses',
  'course.archive': 'Hide/archive courses',
  'faculty.view': 'View own faculty',
  'faculty.view.all': 'View all faculty',
  'faculty.profile.view': 'View faculty profile, assignments, and recent activity',
  'faculty.create': 'Create faculty',
  'faculty.edit': 'Edit faculty',
  'faculty.remove': 'Delete faculty',
  'moderator.view': 'View own moderators',
  'moderator.view.all': 'View all moderators',
  'moderator.profile.view': 'View moderator profile, assignments, and recent activity',
  'moderator.create': 'Create moderators',
  'moderator.edit': 'Edit moderators',
  'moderator.remove': 'Delete moderators',
  'student.view': 'View student directory',
  'student.add': 'Add assessment students',
  'student.edit': 'Edit, enable, disable, or bulk update students',
  'student.remove': 'Delete individual or selected students',
  'student.credential.regenerate': 'Regenerate student credentials',
  'proctor.add': 'Add assessment proctors and auto-assign students',
  'proctor.edit': 'Edit proctors and distribution',
  'proctor.remove': 'Delete proctors',
  'library.view': 'View question library',
  'library.create': 'Create library questions',
  'library.edit': 'Edit library questions',
  'library.archive': 'Archive library questions',
  'mail.send': 'Send student, proctor, faculty, and moderator emails',
  'mail.logs.view': 'View email logs',
  'email.template.view': 'View email templates',
  'email.template.manage': 'Edit email template design and content',
  'reports.view': 'View reports',
  'reports.export': 'Export reports',
  'ufm.view': 'View UFM cases',
  'ufm.reverse': 'Reverse UFM cases',
  'settings.manage': 'Manage settings',
  'audit.view': 'View audit logs',
  'activity.faculty.view': 'View faculty activity',
  'activity.moderator.view': 'View moderator activity',
};

const moduleLabels = {
  dashboard: 'Dashboard',
  assessment: 'Assessments',
  course: 'Courses',
  faculty: 'Faculty',
  moderator: 'Moderators',
  student: 'Students',
  proctor: 'Proctors',
  library: 'Question Library',
  mail: 'Mail & Credentials',
  email: 'Email Templates',
  reports: 'Reports',
  ufm: 'UFM',
  settings: 'Settings',
  audit: 'Audit Logs',
  activity: 'Activity Logs',
};

function formatPermission(permission) {
  return permissionLabels[permission] || permission
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
}

function formatModuleName(moduleName) {
  return moduleLabels[moduleName] || moduleName
    .split(/[-_.]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function groupPermissions(permissions) {
  return permissions.reduce((groups, permission) => {
    const moduleName = permission.split('.')[0] || 'general';
    return {
      ...groups,
      [moduleName]: [...(groups[moduleName] || []), permission],
    };
  }, {});
}

function mergeUniquePermissions(currentPermissions, permissionsToAdd) {
  return Array.from(new Set([...(currentPermissions || []), ...(permissionsToAdd || [])]));
}

function DeleteAdminModal({ admin, isSaving, onCancel, onConfirm }) {
  if (!admin) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-red-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-red-200 bg-white text-red-600">
            <Trash2 size={18} />
          </span>
          <div>
            <p className="text-base font-semibold text-slate-950">Delete admin permanently?</p>
            <p className="mt-1 text-sm leading-5 text-red-700">This removes {admin.name} from the database and cannot be undone.</p>
          </div>
        </div>
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p><span className="font-semibold text-slate-900">Name:</span> {admin.name}</p>
          <p><span className="font-semibold text-slate-900">Email:</span> {admin.email}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>
          <button className="primary-button bg-red-600 hover:bg-red-700 focus:ring-red-100" type="button" onClick={onConfirm} disabled={isSaving}>
            <Trash2 size={16} />
            {isSaving ? 'Deleting' : 'Delete admin'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManageAdminsPage({ mode = 'all' }) {
  const [admins, setAdmins] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editAdminId, setEditAdminId] = useState('');
  const [accessAdmin, setAccessAdmin] = useState(null);
  const [accessDraft, setAccessDraft] = useState([]);
  const [accessSearch, setAccessSearch] = useState('');
  const [activeAccessModule, setActiveAccessModule] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [deleteAdmin, setDeleteAdmin] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    permissions: defaultPermissions,
  });
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    status: 'active',
  });

  const selectedPermissionCount = useMemo(() => form.permissions.length, [form.permissions]);
  const permissionOptions = useMemo(
    () => (availablePermissions.length > 0 ? availablePermissions : defaultPermissions),
    [availablePermissions]
  );
  const groupedPermissions = useMemo(() => groupPermissions(permissionOptions), [permissionOptions]);
  const groupedPermissionEntries = useMemo(() => Object.entries(groupedPermissions), [groupedPermissions]);
  const filteredAccessGroups = useMemo(() => {
    const normalizedSearch = accessSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return groupedPermissions;
    }

    return Object.entries(groupedPermissions).reduce((groups, [moduleName, permissions]) => {
      const moduleLabel = formatModuleName(moduleName).toLowerCase();
      const matchingPermissions = permissions.filter((permission) => {
        const label = formatPermission(permission).toLowerCase();
        return permission.toLowerCase().includes(normalizedSearch)
          || label.includes(normalizedSearch)
          || moduleLabel.includes(normalizedSearch);
      });

      return matchingPermissions.length > 0
        ? { ...groups, [moduleName]: matchingPermissions }
        : groups;
    }, {});
  }, [accessSearch, groupedPermissions]);
  const accessModuleEntries = useMemo(() => Object.entries(filteredAccessGroups), [filteredAccessGroups]);
  const currentAccessModule = filteredAccessGroups[activeAccessModule]
    ? activeAccessModule
    : accessModuleEntries[0]?.[0] || '';
  const currentAccessPermissions = currentAccessModule ? filteredAccessGroups[currentAccessModule] || [] : [];
  const showCreate = mode === 'all' || mode === 'create';
  const showList = mode === 'all' || mode === 'list';
  const headerCopy = {
    all: {
      title: 'Manage Admins',
      description: 'Create admins, assign module-wise permissions, and control admin status from one secure workspace.',
    },
    create: {
      title: 'Create Admin',
      description: 'Create a new admin account and assign exact module-wise permissions before access is granted.',
    },
    list: {
      title: 'View Admins',
      description: 'Search, review, and manage existing admin access status and permission counts.',
    },
  };

  const loadAdmins = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/super-admin/admins', {
        params: {
          search: search || undefined,
          status: status || undefined,
        },
      });
      setAdmins(response.data.items);
      setAvailablePermissions(response.data.availablePermissions);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load admins.');
    } finally {
      setIsLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  function togglePermission(permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  function selectAllPermissions() {
    setForm((current) => ({
      ...current,
      permissions: [...availablePermissions],
    }));
  }

  function clearAllPermissions() {
    setForm((current) => ({
      ...current,
      permissions: [],
    }));
  }

  function toggleModulePermissions(modulePermissions) {
    setForm((current) => {
      const hasAll = modulePermissions.every((permission) => current.permissions.includes(permission));

      return {
        ...current,
        permissions: hasAll
          ? current.permissions.filter((permission) => !modulePermissions.includes(permission))
          : mergeUniquePermissions(current.permissions, modulePermissions),
      };
    });
  }

  function toggleAccessPermission(permission) {
    setAccessDraft((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  }

  function selectAllAccessPermissions() {
    setAccessDraft([...permissionOptions]);
  }

  function clearAllAccessPermissions() {
    setAccessDraft([]);
  }

  function toggleAccessModulePermissions(modulePermissions) {
    setAccessDraft((current) => {
      const hasAll = modulePermissions.every((permission) => current.includes(permission));
      return hasAll
        ? current.filter((permission) => !modulePermissions.includes(permission))
        : mergeUniquePermissions(current, modulePermissions);
    });
  }

  function startEditing(admin) {
    setEditAdminId(admin._id);
    setEditForm({
      name: admin.name || '',
      email: admin.email || '',
      status: admin.status || 'active',
    });
  }

  function cancelEditing() {
    setEditAdminId('');
    setEditForm({
      name: '',
      email: '',
      status: 'active',
    });
  }

  function openAccessManager(admin) {
    setAccessAdmin(admin);
    setAccessDraft(admin.permissions || []);
    setAccessSearch('');
    setActiveAccessModule((admin.permissions?.[0] || permissionOptions[0] || '').split('.')[0] || '');
  }

  function closeAccessManager() {
    setAccessAdmin(null);
    setAccessDraft([]);
    setAccessSearch('');
    setActiveAccessModule('');
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api.post('/super-admin/admins', form);
      setForm({
        name: '',
        email: '',
        password: '',
        permissions: defaultPermissions,
      });
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create admin.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(admin, nextStatus) {
    setError('');
    try {
      await api.patch(`/super-admin/admins/${admin._id}/status`, {
        status: nextStatus,
        reason: `Status changed to ${nextStatus}`,
      });
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update admin status.');
    }
  }

  async function deleteSelectedAdmin() {
    if (!deleteAdmin) return;
    setIsSaving(true);
    setError('');

    try {
      await api.delete(`/super-admin/admins/${deleteAdmin._id}`);
      setDeleteAdmin(null);
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete admin.');
    } finally {
      setIsSaving(false);
    }
  }

  function openActionMenu(event, admin) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 196;
    const top = Math.min(rect.bottom + 6, window.innerHeight - 206);
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    setOpenMenu((current) => (current?.id === admin._id ? null : { id: admin._id, admin, top, left }));
  }

  function closeActionMenu() {
    setOpenMenu(null);
  }

  async function handleEditAdminSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api.patch(`/super-admin/admins/${editAdminId}`, {
        name: editForm.name,
        email: editForm.email,
        status: editForm.status,
      });
      cancelEditing();
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update admin.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAccessSubmit(event) {
    event.preventDefault();

    if (!accessAdmin) return;

    setIsSaving(true);
    setError('');

    try {
      await api.patch(`/super-admin/admins/${accessAdmin._id}/permissions`, {
        permissions: accessDraft,
      });
      closeAccessManager();
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update admin access.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Super Admin"
        title={headerCopy[mode]?.title || headerCopy.all.title}
        description={headerCopy[mode]?.description || headerCopy.all.description}
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className={`grid gap-5 ${showCreate && showList ? 'xl:grid-cols-[420px_1fr]' : ''}`}>
        {showCreate ? (
        <SectionPanel title="Create Admin" description="The assigned admin must change this temporary password on first login." icon={UserPlus}>
          <form className="space-y-4 p-5" onSubmit={handleCreateAdmin}>
            <div>
              <label className="field-label" htmlFor="admin-name">
                Name
              </label>
              <input
                id="admin-name"
                className="field-input mt-2"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="admin-email">
                Email
              </label>
              <input
                id="admin-email"
                className="field-input mt-2"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="admin-password">
                Temporary password
              </label>
              <input
                id="admin-password"
                className="field-input mt-2"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                minLength={8}
                required
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="field-label">Permissions</label>
                <div className="flex items-center gap-2">
                  <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={selectAllPermissions}>
                    Select all
                  </button>
                  <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={clearAllPermissions}>
                    Clear
                  </button>
                  <span className="text-xs font-semibold text-brand-600">{selectedPermissionCount} selected</span>
                </div>
              </div>
              <div className="max-h-[360px] space-y-3 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                {groupedPermissionEntries.map(([moduleName, permissions]) => (
                  <div className="rounded-md border border-slate-200 bg-white p-2" key={moduleName}>
                    <div className="flex items-center justify-between gap-2 px-1 pb-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">{moduleName}</p>
                      <button className="secondary-button h-7 px-2 text-[11px]" type="button" onClick={() => toggleModulePermissions(permissions)}>
                        {permissions.every((permission) => form.permissions.includes(permission)) ? 'Clear module' : 'Select module'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {permissions.map((permission) => {
                        const checked = form.permissions.includes(permission);
                        return (
                          <button
                            key={permission}
                            type="button"
                            onClick={() => togglePermission(permission)}
                            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs font-semibold transition ${
                              checked
                                ? 'border-brand-300 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-slate-900'
                            }`}
                          >
                            {formatPermission(permission)}
                            {checked ? <Check size={14} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="primary-button w-full" type="submit" disabled={isSaving}>
              <ShieldCheck size={16} />
              {isSaving ? 'Creating admin' : 'Create admin'}
            </button>
          </form>
        </SectionPanel>
        ) : null}

        {showList ? (
        <SectionPanel title="Admin Directory" description="Search and review admin access status." icon={Users}>
          {editAdminId ? (
            <div className="border-b border-slate-200 bg-slate-50 p-5">
              <form className="space-y-4" onSubmit={handleEditAdminSubmit}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Edit Admin Details</p>
                    <p className="mt-1 text-xs text-slate-500">Update identity and account status. Use Manage Access for permissions.</p>
                  </div>
                  <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={cancelEditing} disabled={isSaving}>
                    <X size={14} />
                    Close
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="field-label" htmlFor="edit-admin-name">
                      Name
                    </label>
                    <input
                      id="edit-admin-name"
                      className="field-input mt-2"
                      value={editForm.name}
                      onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="edit-admin-email">
                      Email / Login ID
                    </label>
                    <input
                      id="edit-admin-email"
                      className="field-input mt-2"
                      type="email"
                      value={editForm.email}
                      onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="edit-admin-status">
                      Status
                    </label>
                    <select
                      id="edit-admin-status"
                      className="field-input mt-2"
                      value={editForm.status}
                      onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button className="secondary-button" type="button" onClick={cancelEditing} disabled={isSaving}>
                    Cancel
                  </button>
                  <button className="primary-button" type="submit" disabled={isSaving}>
                    <ShieldCheck size={16} />
                    {isSaving ? 'Saving admin' : 'Save details'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="toolbar">
            <div className="search-field">
              <Search size={16} className="text-brand-500" />
              <input
                className="h-10 flex-1 border-0 px-2 text-sm outline-none"
                placeholder="Search admins"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select className="field-input max-w-[180px]" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
            <button className="secondary-button" onClick={loadAdmins} type="button">
              Apply
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  <tr>
                    <td className="text-center text-slate-500" colSpan={5}>Loading admins...</td>
                  </tr>
                ) : admins.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="No admins found" description="Create the first admin or change the current filters." />
                    </td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin._id}>
                      <td>
                        <p className="font-semibold text-slate-950">{admin.name}</p>
                        <p className="text-xs text-slate-500">{admin.email}</p>
                      </td>
                      <td>
                        <span className={statusClass(admin.status)}>
                          {admin.status}
                        </span>
                      </td>
                      <td className="text-slate-600">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                          {admin.permissions.length} rule(s)
                        </span>
                      </td>
                      <td className="text-slate-500">
                        {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="text-right">
                        <button className="secondary-button h-8 w-8 px-0" type="button" onClick={(event) => openActionMenu(event, admin)} aria-label="Open admin actions">
                          <MoreVertical size={16} className="text-brand-500" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
        ) : null}
      </div>

      {accessAdmin ? (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-3 sm:p-5">
          <button className="absolute inset-0 cursor-default" type="button" aria-label="Close manage access" onClick={closeAccessManager} />
          <form
            className="relative ml-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            onSubmit={handleAccessSubmit}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-brand-100 bg-brand-50 text-brand-600">
                  <ShieldCheck size={19} />
                </span>
                <div className="min-w-0">
                  <p className="field-label text-brand-600">Manage Access</p>
                  <h2 className="truncate text-lg font-semibold text-slate-950">{accessAdmin.name}</h2>
                  <p className="mt-1 truncate text-sm text-slate-500">{accessAdmin.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  {accessDraft.length} selected
                </span>
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={selectAllAccessPermissions}>
                  Select all
                </button>
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={clearAllAccessPermissions}>
                  Clear
                </button>
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={closeAccessManager} disabled={isSaving}>
                  <X size={14} />
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-0 border-b border-slate-200 md:grid-cols-[260px_1fr]">
              <div className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r">
                <p className="text-xs font-bold uppercase text-slate-500">Admin Profile</p>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase text-slate-400">Status</p>
                    <span className={statusClass(accessAdmin.status)}>{accessAdmin.status}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase text-slate-400">Last Login</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">
                      {accessAdmin.lastLoginAt ? new Date(accessAdmin.lastLoginAt).toLocaleString() : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <label className="field-label" htmlFor="access-search">Search permissions</label>
                <div className="search-field mt-2">
                  <Search size={16} className="text-brand-500" />
                  <input
                    id="access-search"
                    className="h-10 flex-1 border-0 px-2 text-sm outline-none"
                    placeholder="Search module, permission, or feature"
                    value={accessSearch}
                    onChange={(event) => setAccessSearch(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
                <div className="space-y-1">
                  {accessModuleEntries.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs font-semibold text-slate-500">No permissions match the search.</p>
                  ) : (
                    accessModuleEntries.map(([moduleName, permissions]) => {
                      const modulePermissions = groupedPermissions[moduleName] || permissions;
                      const selectedInModule = modulePermissions.filter((permission) => accessDraft.includes(permission)).length;
                      const active = moduleName === currentAccessModule;

                      return (
                        <button
                          key={moduleName}
                          type="button"
                          onClick={() => setActiveAccessModule(moduleName)}
                          className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                            active
                              ? 'border-brand-200 bg-white text-slate-950 shadow-sm'
                              : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{formatModuleName(moduleName)}</span>
                            <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{permissions.length} visible rule(s)</span>
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            selectedInModule === modulePermissions.length && modulePermissions.length > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {selectedInModule}/{modulePermissions.length}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto bg-white">
                {currentAccessModule ? (
                  <div className="p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="field-label text-brand-600">{formatModuleName(currentAccessModule)}</p>
                        <h3 className="text-base font-semibold text-slate-950">Access rights</h3>
                        <p className="mt-1 text-sm text-slate-500">Select only the actions this admin should control.</p>
                      </div>
                      <button
                        className="secondary-button h-9 px-3 text-xs"
                        type="button"
                        onClick={() => toggleAccessModulePermissions(groupedPermissions[currentAccessModule] || currentAccessPermissions)}
                      >
                        {(groupedPermissions[currentAccessModule] || currentAccessPermissions).every((permission) => accessDraft.includes(permission))
                          ? 'Clear module'
                          : 'Select module'}
                      </button>
                    </div>

                    <div className="grid gap-2 lg:grid-cols-2">
                      {currentAccessPermissions.map((permission) => {
                        const checked = accessDraft.includes(permission);
                        return (
                          <button
                            key={permission}
                            type="button"
                            onClick={() => toggleAccessPermission(permission)}
                            className={`flex min-h-[58px] items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                              checked
                                ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-slate-950'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-bold">{formatPermission(permission)}</span>
                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{permission}</span>
                            </span>
                            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                              checked ? 'border-brand-300 bg-brand-500 text-white' : 'border-slate-300 bg-white text-transparent'
                            }`}>
                              <Check size={13} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No permissions available" description="Permission options will appear here after the admin access list loads." />
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold text-slate-500">
                Changes apply immediately after saving and are recorded in activity logs.
              </p>
              <div className="flex items-center gap-2">
                <button className="secondary-button" type="button" onClick={closeAccessManager} disabled={isSaving}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  <ShieldCheck size={16} />
                  {isSaving ? 'Saving access' : 'Save access'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {openMenu ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-transparent" type="button" aria-label="Close actions" onClick={closeActionMenu} />
          <div
            className="fixed z-50 rounded-md border border-slate-200 bg-white p-1 text-left shadow-xl"
            style={{ top: openMenu.top, left: openMenu.left, width: 196 }}
          >
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { startEditing(openMenu.admin); closeActionMenu(); }}>
              <Pencil size={14} /> Edit details
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { openAccessManager(openMenu.admin); closeActionMenu(); }}>
              <ShieldCheck size={14} /> Manage access
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { updateStatus(openMenu.admin, openMenu.admin.status === 'active' ? 'inactive' : 'active'); closeActionMenu(); }}>
              <UserX size={14} /> {openMenu.admin.status === 'active' ? 'Disable' : 'Activate'}
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { updateStatus(openMenu.admin, 'blocked'); closeActionMenu(); }}>
              <ShieldCheck size={14} /> Block
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => { setDeleteAdmin(openMenu.admin); closeActionMenu(); }}>
              <Trash2 size={14} /> Delete Admin
            </button>
          </div>
        </>
      ) : null}

      <DeleteAdminModal
        admin={deleteAdmin}
        isSaving={isSaving}
        onCancel={() => setDeleteAdmin(null)}
        onConfirm={deleteSelectedAdmin}
      />
    </section>
  );
}

export function CreateAdminPage() {
  return <ManageAdminsPage mode="create" />;
}

export function ViewAdminsPage() {
  return <ManageAdminsPage mode="list" />;
}
