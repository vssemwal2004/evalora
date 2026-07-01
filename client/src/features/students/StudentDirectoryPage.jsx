import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, EyeOff, ListFilter, Mail, MoreHorizontal, Power, Search, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, SectionPanel } from '../../ui/Surface.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

function canUse(user, permission) {
  return user?.role === 'super_admin' || user?.permissions?.includes(permission);
}

export function StudentDirectoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [statusCounts, setStatusCounts] = useState({ all: 0, enabled: 0, disabled: 0 });
  const [filters, setFilters] = useState({ search: '', course: '', assessment: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '', assessment: '', status: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [openMenuId, setOpenMenuId] = useState('');
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [editStudent, setEditStudent] = useState(null);
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [sendingMailId, setSendingMailId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item._id)), [items, selectedIds]);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item._id));
  const canEdit = canUse(user, 'student.edit');
  const canDelete = canUse(user, 'student.remove');
  const canMail = canUse(user, 'mail.send');

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/students', {
        params: {
          ...appliedFilters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setItems(response.data.items || []);
      setPagination(response.data.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
      setStatusCounts(response.data.statusCounts || { all: 0, enabled: 0, disabled: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load students.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, pagination.limit, pagination.page]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item._id === id)));
  }, [items]);

  function applyFilters() {
    setPagination((current) => ({ ...current, page: 1 }));
    setAppliedFilters(filters);
  }

  function toggleSelect(id) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setOpenMenuId('');
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = items.map((item) => item._id);
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
    setOpenMenuId('');
  }

  function toggleActionMenu(event, studentId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 176;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setActionMenuPosition({ top, left });
    setOpenMenuId((current) => (current === studentId ? '' : studentId));
  }

  async function runStatusAction(student, action) {
    if (!canEdit) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    setOpenMenuId('');

    try {
      await api.patch(`/students/${student._id}/status`, { action });
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update student status.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editStudent || !canEdit) return;
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      await api.patch(`/students/${editStudent._id}`, {
        name: editStudent.name,
        email: editStudent.email,
        applicationNumber: editStudent.applicationNumber,
      });
      setEditStudent(null);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update student.');
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteStudent || !canDelete) return;
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      await api.delete(`/students/${deleteStudent._id}`);
      setDeleteStudent(null);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete student.');
    } finally {
      setIsSaving(false);
    }
  }

  async function runBulkAction(action) {
    if (selectedIds.length === 0) return;
    if (action === 'delete' && !canDelete) return;
    if (action !== 'delete' && !canEdit) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    setOpenMenuId('');

    try {
      await api.post('/students/bulk-action', { action, ids: selectedIds });
      setSelectedIds([]);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update selected students.');
    } finally {
      setIsSaving(false);
    }
  }

  async function sendStudentMail(student) {
    if (!canMail || !student?._id) return;
    setSendingMailId(student._id);
    setError('');
    setNotice('');
    setOpenMenuId('');

    try {
      const response = await api.post(`/students/${student._id}/send-mail`);
      setNotice(response.data.message || 'Student credential mail sent successfully.');
      await loadStudents();
    } catch (requestError) {
      await loadStudents();
      setError(requestError.response?.data?.message || 'Unable to send student credential mail.');
    } finally {
      setSendingMailId('');
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="field-label text-brand-600">Students</p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">Student Directory</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">High-volume student assignments with assessment, course, exam, mail, and registration status.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Loaded</p>
          <p className="text-sm font-semibold text-slate-950">{items.length} of {pagination.total}</p>
        </div>
      </div>

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{notice}</div> : null}

      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['All students', statusCounts.all || 0],
          ['Enabled', statusCounts.enabled || 0],
          ['Disabled', statusCounts.disabled || 0],
          ['Currently giving exam', statusCounts.in_progress || 0],
        ].map(([label, value], index) => (
          <div className={`px-3 py-2.5 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`} key={label}>
            <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold leading-none text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <SectionPanel title="View Students" icon={Users}>
        <div className="grid gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:grid-cols-[minmax(260px,1fr)_190px_160px_160px_auto]">
          <div className="search-field h-9 min-w-0">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-8 flex-1 border-0 px-2 text-[13px] outline-none"
              placeholder="Search name, email, application, exam ID"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </div>
          <input
            className="field-input h-9"
            placeholder="Assessment"
            value={filters.assessment}
            onChange={(event) => setFilters((current) => ({ ...current, assessment: event.target.value }))}
          />
          <input
            className="field-input h-9"
            placeholder="Course"
            value={filters.course}
            onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
          />
          <select className="field-input h-9" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">Giving exam</option>
            <option value="submitted">Submitted</option>
            <option value="ufm">UFM</option>
          </select>
          <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={applyFilters}>
            <ListFilter size={16} className="text-brand-500" />
            Apply
          </button>
        </div>

        {selectedItems.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-brand-50 px-3 py-1.5">
            <p className="text-xs font-semibold text-brand-700">{selectedItems.length} student(s) selected</p>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button h-8 px-3 text-xs" type="button" disabled={!canEdit || isSaving} onClick={() => runBulkAction('enable')}>
                <Power size={14} className="text-brand-500" />
                Enable selected
              </button>
              <button className="secondary-button h-8 px-3 text-xs" type="button" disabled={!canEdit || isSaving} onClick={() => runBulkAction('disable')}>
                <EyeOff size={14} className="text-brand-500" />
                Disable selected
              </button>
              <button className="secondary-button h-8 px-3 text-xs text-red-700" type="button" disabled={!canDelete || isSaving} onClick={() => runBulkAction('delete')}>
                <Trash2 size={14} />
                Delete selected
              </button>
            </div>
          </div>
        ) : null}

        <div className="max-h-[calc(100vh-360px)] min-h-[360px] overflow-auto">
          <table className="min-w-[1280px] w-full text-left text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
                  <input className="h-4 w-4 accent-orange-500" type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <th className="w-[270px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Student</th>
                <th className="w-[260px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Assessment</th>
                <th className="w-[180px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Course</th>
                <th className="w-[170px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Exam</th>
                <th className="w-[120px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Taking Exam</th>
                <th className="w-[130px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Mail</th>
                <th className="w-[170px] whitespace-nowrap bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">Registered</th>
                <th className="w-[80px] whitespace-nowrap bg-slate-50 px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>Loading students...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-3 py-10" colSpan={9}>
                    <EmptyState title="No students found" description="Add students to assessments or adjust the current filters." />
                  </td>
                </tr>
              ) : (
                items.map((student) => (
                  <tr key={student._id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 align-middle">
                      <input className="h-4 w-4 accent-orange-500" type="checkbox" checked={selectedIds.includes(student._id)} onChange={() => toggleSelect(student._id)} />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <p className="truncate font-semibold text-slate-950">{student.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{student.email}</p>
                      {student.applicationNumber ? <p className="text-xs text-slate-400">{student.applicationNumber}</p> : null}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <p className="truncate font-semibold text-slate-800">{student.assessment?.title || 'Assessment removed'}</p>
                      <p className="text-[11px] text-slate-500">{student.assessment?.assessmentCode || '-'}</p>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <p className="truncate font-semibold text-slate-700">{student.courseName}</p>
                      <p className="text-[11px] text-slate-500">{student.courseId || '-'}</p>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <p className="font-semibold text-slate-800">{student.generatedExamId}</p>
                      <span className={statusClass(student.examStatus)}>{student.examStatus.replace('_', ' ')}</span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {student.isGivingExam ? (
                        <span className="status-badge status-active">Yes</span>
                      ) : (
                        <span className="status-badge status-inactive">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle"><span className={statusClass(student.mailStatus)}>{student.mailStatus.replace('_', ' ')}</span></td>
                    <td className="px-3 py-2 align-middle text-[11px] leading-5 text-slate-500">{formatDate(student.registeredAt)}</td>
                    <td className="relative px-3 py-2 text-right align-middle">
                      <button className="secondary-button h-8 w-8 px-0" type="button" onClick={(event) => toggleActionMenu(event, student._id)}>
                        <MoreHorizontal size={15} className="text-brand-500" />
                      </button>
                      {openMenuId === student._id ? (
                        <div
                          className="fixed z-50 w-48 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-xl"
                          style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                        >
                          <button
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                            type="button"
                            disabled={!canMail || sendingMailId === student._id}
                            onClick={() => sendStudentMail(student)}
                          >
                            <Mail size={14} className="text-brand-500" />
                            {sendingMailId === student._id ? 'Sending mail...' : ['sent', 'resent'].includes(student.mailStatus) ? 'Resend mail' : 'Send mail'}
                          </button>
                          <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" disabled={!canEdit} onClick={() => { setEditStudent(student); setOpenMenuId(''); }}>
                            <Edit3 size={14} className="text-brand-500" />
                            Edit student
                          </button>
                          <button
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            type="button"
                            disabled={!canEdit}
                            onClick={() => runStatusAction(student, student.status === 'disabled' ? 'enable' : 'disable')}
                          >
                            {student.status === 'disabled' ? <Power size={14} className="text-brand-500" /> : <EyeOff size={14} className="text-brand-500" />}
                            {student.status === 'disabled' ? 'Enable student' : 'Disable student'}
                          </button>
                          <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" type="button" disabled={!canDelete} onClick={() => { setDeleteStudent(student); setOpenMenuId(''); }}>
                            <Trash2 size={14} />
                            Delete student
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">
            Showing page {pagination.page} of {pagination.pages} / {pagination.total} student(s)
          </p>
          <div className="flex gap-2">
            <button className="secondary-button h-8 px-3 text-xs" type="button" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>
              Previous
            </button>
            <button className="secondary-button h-8 px-3 text-xs" type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>
              Next
            </button>
          </div>
        </div>
      </SectionPanel>

      {editStudent ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
          <form className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onSubmit={saveEdit}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-slate-950">Edit student</p>
                <p className="mt-1 text-xs text-slate-500">{editStudent.assessment?.title || 'Assessment'}</p>
              </div>
              <button className="secondary-button h-8 w-8 px-0" type="button" onClick={() => setEditStudent(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="field-label">Student name</label>
                <input className="field-input mt-2" value={editStudent.name} onChange={(event) => setEditStudent((current) => ({ ...current, name: event.target.value }))} required />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input className="field-input mt-2" type="email" value={editStudent.email} onChange={(event) => setEditStudent((current) => ({ ...current, email: event.target.value }))} required />
              </div>
              <div>
                <label className="field-label">Application number</label>
                <input className="field-input mt-2" value={editStudent.applicationNumber || ''} onChange={(event) => setEditStudent((current) => ({ ...current, applicationNumber: event.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setEditStudent(null)} disabled={isSaving}>Cancel</button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                <CheckCircle2 size={16} />
                {isSaving ? 'Saving' : 'Save student'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteStudent ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-red-200 bg-white shadow-2xl">
            <div className="border-b border-red-100 bg-red-50 px-5 py-4">
              <p className="text-base font-semibold text-slate-950">Delete student?</p>
              <p className="mt-1 text-sm text-red-700">This removes the student from this assessment permanently.</p>
            </div>
            <div className="p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{deleteStudent.name}</p>
              <p>{deleteStudent.email}</p>
              <p className="mt-2 text-xs">{deleteStudent.assessment?.title}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setDeleteStudent(null)} disabled={isSaving}>Cancel</button>
              <button className="primary-button bg-red-600 hover:bg-red-700 focus:ring-red-100" type="button" onClick={confirmDelete} disabled={isSaving}>
                <Trash2 size={16} />
                {isSaving ? 'Deleting' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
