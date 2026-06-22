import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const defaultPermissions = [
  'dashboard.view',
  'assessment.view',
  'assessment.create',
  'assessment.edit',
  'student.add',
  'proctor.add',
  'library.view',
  'mail.send',
  'reports.view',
  'reports.export',
];

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function formatPermission(permission) {
  return permission
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
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

export function ManageAdminsPage({ mode = 'all' }) {
  const [admins, setAdmins] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editAdminId, setEditAdminId] = useState('');
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
    permissions: [],
  });

  const selectedPermissionCount = useMemo(() => form.permissions.length, [form.permissions]);
  const groupedPermissions = useMemo(() => groupPermissions(availablePermissions), [availablePermissions]);
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

  function toggleEditPermission(permission) {
    setEditForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  function selectAllEditPermissions() {
    setEditForm((current) => ({
      ...current,
      permissions: [...availablePermissions],
    }));
  }

  function clearAllEditPermissions() {
    setEditForm((current) => ({
      ...current,
      permissions: [],
    }));
  }

  function toggleEditModulePermissions(modulePermissions) {
    setEditForm((current) => {
      const hasAll = modulePermissions.every((permission) => current.permissions.includes(permission));

      return {
        ...current,
        permissions: hasAll
          ? current.permissions.filter((permission) => !modulePermissions.includes(permission))
          : mergeUniquePermissions(current.permissions, modulePermissions),
      };
    });
  }

  function startEditing(admin) {
    setEditAdminId(admin._id);
    setEditForm({
      name: admin.name || '',
      email: admin.email || '',
      status: admin.status || 'active',
      permissions: admin.permissions || [],
    });
  }

  function cancelEditing() {
    setEditAdminId('');
    setEditForm({
      name: '',
      email: '',
      status: 'active',
      permissions: [],
    });
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
    await api.patch(`/super-admin/admins/${admin._id}/status`, {
      status: nextStatus,
      reason: `Status changed to ${nextStatus}`,
    });
    await loadAdmins();
  }

  async function handleEditAdminSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api.patch(`/super-admin/admins/${editAdminId}`, editForm);
      cancelEditing();
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update admin.');
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
        <SectionPanel title="Create Admin" description="Temporary password can be changed later by the assigned admin." icon={UserPlus}>
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
                {Object.entries(groupedPermissions).map(([moduleName, permissions]) => (
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
                    <p className="text-sm font-semibold text-slate-950">Edit Admin Access</p>
                    <p className="mt-1 text-xs text-slate-500">Update admin identity, status, and module permissions from one place.</p>
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

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="field-label">Permissions</label>
                    <div className="flex items-center gap-2">
                      <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={selectAllEditPermissions}>
                        Select all
                      </button>
                      <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={clearAllEditPermissions}>
                        Clear
                      </button>
                      <span className="text-xs font-semibold text-brand-600">{editForm.permissions.length} selected</span>
                    </div>
                  </div>
                  <div className="max-h-[320px] space-y-3 overflow-auto rounded-md border border-slate-200 bg-white p-3">
                    {Object.entries(groupedPermissions).map(([moduleName, permissions]) => (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2" key={moduleName}>
                        <div className="flex items-center justify-between gap-2 px-1 pb-2">
                          <p className="text-xs font-semibold uppercase text-slate-500">{moduleName}</p>
                          <button className="secondary-button h-7 px-2 text-[11px]" type="button" onClick={() => toggleEditModulePermissions(permissions)}>
                            {permissions.every((permission) => editForm.permissions.includes(permission)) ? 'Clear module' : 'Select module'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {permissions.map((permission) => {
                            const checked = editForm.permissions.includes(permission);
                            return (
                              <button
                                key={permission}
                                type="button"
                                onClick={() => toggleEditPermission(permission)}
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

                <div className="flex justify-end gap-2">
                  <button className="secondary-button" type="button" onClick={cancelEditing} disabled={isSaving}>
                    Cancel
                  </button>
                  <button className="primary-button" type="submit" disabled={isSaving}>
                    <ShieldCheck size={16} />
                    {isSaving ? 'Saving access' : 'Save changes'}
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
                      <td className="text-slate-600">{admin.permissions.length}</td>
                      <td className="text-slate-500">
                        {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => startEditing(admin)}>
                            <Pencil size={13} />
                            Edit
                          </button>
                          <button
                            className="secondary-button h-8 px-2 text-xs"
                            type="button"
                            onClick={() => updateStatus(admin, admin.status === 'active' ? 'inactive' : 'active')}
                          >
                            {admin.status === 'active' ? 'Disable' : 'Activate'}
                          </button>
                          <button
                            className="secondary-button h-8 px-2 text-xs"
                            type="button"
                            onClick={() => updateStatus(admin, 'blocked')}
                          >
                            Block
                          </button>
                        </div>
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
    </section>
  );
}

export function CreateAdminPage() {
  return <ManageAdminsPage mode="create" />;
}

export function ViewAdminsPage() {
  return <ManageAdminsPage mode="list" />;
}
