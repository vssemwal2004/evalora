import { useCallback, useEffect, useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const initialForm = {
  courseName: '',
  courseCode: '',
};

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function readImportValue(row, names) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
  const match = names.find((name) => normalized[name.toLowerCase()] !== undefined);
  return match ? normalized[match.toLowerCase()] : '';
}

function sheetRowsToObjects(rows) {
  const [headers = [], ...bodyRows] = rows;
  const normalizedHeaders = headers.map((header, index) => String(header || `Column ${index + 1}`).trim());

  return bodyRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
    .map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? ''])));
}

function normalizeCourseRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    courseName: String(readImportValue(row, ['Course Name', 'Course']) || '').trim(),
    courseCode: String(readImportValue(row, ['Course Code', 'Course ID', 'Code']) || '').trim(),
  }));
}

function buildCourseTemplateRows() {
  return [
    [
      { value: 'Course Name', fontWeight: 'bold' },
      { value: 'Course Code', fontWeight: 'bold' },
    ],
    [
      { value: 'Bachelor of Computer Applications' },
      { value: 'BCA' },
    ],
    [
      { value: 'Bachelor of Technology' },
      { value: 'BTECH' },
    ],
  ];
}

function buildCourseExportRows(courses) {
  return [
    [
      { value: 'Course Name', fontWeight: 'bold' },
      { value: 'Course Code', fontWeight: 'bold' },
      { value: 'Status', fontWeight: 'bold' },
      { value: 'Created At', fontWeight: 'bold' },
    ],
    ...courses.map((course) => [
      { value: course.courseName || '' },
      { value: course.courseCode || '' },
      { value: course.status || '' },
      { value: course.createdAt ? new Date(course.createdAt).toLocaleString() : '' },
    ]),
  ];
}

function CourseModeTabs({ activeView, onChange, viewLabel = 'View Added Courses' }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div>
        <p className="field-label text-brand-600">Course Workspace</p>
        <p className="mt-1 text-xs font-semibold text-slate-700">
          {activeView === 'add' ? 'Add one course or upload an Excel course list.' : viewLabel}
        </p>
      </div>
      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
        {[
          ['add', 'Add Course'],
          ['view', viewLabel],
        ].map(([view, label]) => (
          <button
            key={view}
            className={`h-8 rounded px-3 text-xs font-semibold transition ${
              activeView === view ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
            type="button"
            onClick={() => onChange(view)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CourseDirectoryPanel({ onAddCourse } = {}) {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedIds, setSelectedIds] = useState([]);
  const [openMenuId, setOpenMenuId] = useState('');
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editForm, setEditForm] = useState({ courseName: '', courseCode: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState('');
  const selectedCourses = useMemo(() => courses.filter((course) => selectedIds.includes(course._id)), [courses, selectedIds]);
  const allVisibleSelected = courses.length > 0 && courses.every((course) => selectedIds.includes(course._id));

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/courses', {
        params: { search: appliedSearch || undefined, status: statusFilter, limit: 1000 },
      });
      setCourses(response.data.items);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load courses.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, statusFilter]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => courses.some((course) => course._id === id)));
  }, [courses]);

  function toggleCourseSelection(courseId) {
    setSelectedIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    );
    setOpenMenuId('');
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const visibleIds = courses.map((course) => course._id);
      const selectedAll = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
      return selectedAll ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds]));
    });
    setOpenMenuId('');
  }

  function toggleActionMenu(event, courseId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 132;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setActionMenuPosition({ top, left });
    setOpenMenuId((current) => (current === courseId ? '' : courseId));
  }

  function requestAction(action, actionCourses) {
    setConfirmAction({ action, courses: actionCourses });
    setOpenMenuId('');
    setBulkMenuOpen(false);
  }

  function startEdit(course) {
    setEditingCourse(course);
    setEditForm({ courseName: course.courseName || '', courseCode: course.courseCode || '' });
    setOpenMenuId('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingCourse?._id) return;

    setIsActing(true);
    setError('');

    try {
      await api.patch(`/courses/${editingCourse._id}`, editForm);
      setEditingCourse(null);
      await loadCourses();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update course.');
    } finally {
      setIsActing(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction?.courses?.length) return;

    setIsActing(true);
    setError('');

    try {
      await api.post('/courses/bulk-action', {
        action: confirmAction.action,
        courseIds: confirmAction.courses.map((course) => course._id),
      });
      setConfirmAction(null);
      setSelectedIds([]);
      await loadCourses();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to complete course action.');
    } finally {
      setIsActing(false);
    }
  }

  async function downloadCurrentCourses() {
    setError('');

    try {
      if (courses.length === 0) {
        setError('No courses are available to download.');
        return;
      }

      await downloadXlsx(buildCourseExportRows(courses), 'evalora-active-courses.xlsx');
    } catch {
      setError('Unable to download courses. Please try again or check browser download permissions.');
    }
  }

  return (
    <>
      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <SectionPanel
        title="Course Directory"
        description="Search by course name or course code. These courses are reused during assessment creation."
        icon={FileSpreadsheet}
        actions={(
          <>
            {selectedCourses.length > 0 ? (
              <div className="relative">
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={() => setBulkMenuOpen((current) => !current)}>
                  <MoreHorizontal size={14} className="text-brand-500" />
                  {selectedCourses.length} Selected
                </button>
                {bulkMenuOpen ? (
                  <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                    <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => requestAction('hide', selectedCourses)}>
                      <EyeOff size={14} className="text-brand-500" />
                      Hide selected
                    </button>
                    <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => requestAction('show', selectedCourses)}>
                      <Eye size={14} className="text-brand-500" />
                      Show selected
                    </button>
                    <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => requestAction('delete', selectedCourses)}>
                      <Trash2 size={14} />
                      Delete selected
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={downloadCurrentCourses} disabled={isLoading || courses.length === 0}>
              <Download size={14} className="text-brand-500" />
              Download Courses
            </button>
            {onAddCourse ? (
              <button className="primary-button h-9 px-3 text-xs" type="button" onClick={onAddCourse}>
                <Plus size={14} />
                Add Course
              </button>
            ) : null}
          </>
        )}
      >
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search course name or code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button className="secondary-button" type="button" onClick={() => setAppliedSearch(search)}>
            <ListFilter size={16} className="text-brand-500" />
            Apply
          </button>
          <select className="field-input max-w-[150px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="active">Active</option>
            <option value="archived">Hidden</option>
            <option value="all">All</option>
          </select>
        </div>

        <div className="table-popover-safe">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all courses"
                  />
                </th>
                <th>Course Name</th>
                <th>Course Code</th>
                <th>Status</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={6}>Loading courses...</td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td colSpan={6}><EmptyState title="No courses found" description="Add courses manually or import them from Excel." /></td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course._id}>
                    <td>
                      <input
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        type="checkbox"
                        checked={selectedIds.includes(course._id)}
                        onChange={() => toggleCourseSelection(course._id)}
                        aria-label={`Select ${course.courseName}`}
                      />
                    </td>
                    <td className="font-semibold text-slate-950">{course.courseName}</td>
                    <td className="text-slate-700">{course.courseCode}</td>
                    <td><span className={statusClass(course.status)}>{course.status}</span></td>
                    <td className="text-slate-500">{new Date(course.createdAt).toLocaleString()}</td>
                    <td className="relative text-right">
                      <button
                        className="secondary-button h-8 w-8 px-0"
                        type="button"
                        onClick={(event) => toggleActionMenu(event, course._id)}
                        aria-label={`Actions for ${course.courseName}`}
                      >
                        <MoreHorizontal size={15} className="text-brand-500" />
                      </button>
                      {openMenuId === course._id ? (
                        <div
                          className="fixed z-50 w-44 rounded-md border border-slate-200 bg-white py-1 text-left shadow-xl"
                          style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                        >
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => startEdit(course)}>
                            <Edit3 size={14} className="text-brand-500" />
                            Edit
                          </button>
                          {course.status === 'archived' ? (
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => requestAction('show', [course])}>
                              <Eye size={14} className="text-brand-500" />
                              Show
                            </button>
                          ) : (
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => requestAction('hide', [course])}>
                              <EyeOff size={14} className="text-brand-500" />
                              Hide
                            </button>
                          )}
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => requestAction('delete', [course])}>
                            <Trash2 size={14} />
                            Delete
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
      </SectionPanel>

      {editingCourse ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl" onSubmit={saveEdit}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-950">Edit Course</h3>
              <p className="mt-1 text-sm text-slate-500">Course name and code must stay unique.</p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="field-label">Course name</label>
                <input className="field-input mt-2" value={editForm.courseName} onChange={(event) => setEditForm((current) => ({ ...current, courseName: event.target.value }))} required />
              </div>
              <div>
                <label className="field-label">Course code</label>
                <input className="field-input mt-2" value={editForm.courseCode} onChange={(event) => setEditForm((current) => ({ ...current, courseCode: event.target.value.toUpperCase() }))} required />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setEditingCourse(null)} disabled={isActing}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={isActing}>
                {isActing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  {confirmAction.action === 'delete' ? 'Delete course' : confirmAction.action === 'hide' ? 'Hide course' : 'Show course'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {confirmAction.action === 'delete'
                    ? 'Selected course records will be permanently deleted.'
                    : confirmAction.action === 'hide'
                      ? 'Selected courses will be moved to Hidden status.'
                      : 'Selected courses will become active again.'}
                </p>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto px-5 py-4">
              <div className="rounded-md border border-slate-200 bg-slate-50">
                {confirmAction.courses.map((course) => (
                  <div key={course._id} className="border-b border-slate-200 px-3 py-2 last:border-b-0">
                    <p className="text-sm font-semibold text-slate-950">{course.courseName}</p>
                    <p className="text-xs text-slate-500">{course.courseCode}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setConfirmAction(null)} disabled={isActing}>
                Cancel
              </button>
              <button
                className={confirmAction.action === 'delete' ? 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300' : 'primary-button'}
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
    </>
  );
}

function CurrentAddedCoursesPanel({ courses, onAddCourse }) {
  return (
    <SectionPanel
      title="Current Added Courses"
      description="Only courses added in this current add session are shown here. Use the sidebar View Courses page for the full master directory."
      icon={CheckCircle2}
      actions={(
        <button className="primary-button h-9 px-3 text-xs" type="button" onClick={onAddCourse}>
          <Plus size={14} />
          Add More
        </button>
      )}
    >
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Course Name</th>
              <th>Course Code</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {courses.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState title="No courses added in this session" description="Add a single course or save reviewed Excel rows, then they will appear here." />
                </td>
              </tr>
            ) : (
              courses.map((course, index) => (
                <tr key={`${course.courseCode}-${index}`}>
                  <td className="font-semibold text-slate-950">{course.courseName}</td>
                  <td className="text-slate-700">{course.courseCode}</td>
                  <td><span className={statusClass(course.action === 'created' ? 'active' : 'pending')}>{course.action || 'created'}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

function CourseManagerPage({ initialView = 'add' } = {}) {
  const [form, setForm] = useState(initialForm);
  const [activeView, setActiveView] = useState(initialView);
  const [entryMode, setEntryMode] = useState('single');
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const currentAddedCourses = bulkResult?.saved || [];
  const duplicateRows = useMemo(
    () => bulkPreview.filter((row) => row.issues?.length > 0 || row.courseStatus === 'duplicate_course'),
    [bulkPreview]
  );
  const readyRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const response = await api.post('/courses', form);
      const savedCourse = response.data.course || form;
      setForm(initialForm);
      setBulkResult({ saved: [{ action: 'created', ...savedCourse }], summary: { created: 1, replaced: 0, skipped: 0 } });
      setActiveView('view');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save course.');
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTemplate() {
    setError('');

    try {
      await downloadXlsx(buildCourseTemplateRows(), 'evalora-course-template.xlsx');
    } catch {
      setError('Unable to download course template. Please try again or check browser download permissions.');
    }
  }

  async function validateRows(rows) {
    setIsBulkValidating(true);
    setError('');
    setBulkResult(null);

    try {
      const response = await api.post('/courses/bulk-validate', { rows });
      setBulkPreview(response.data.items);
      setBulkSummary(response.data.summary);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to validate course file.');
    } finally {
      setIsBulkValidating(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      const rows = await readSheet(file);
      await validateRows(normalizeCourseRows(sheetRowsToObjects(rows)));
    } catch {
      setError('Unable to read Excel file. Please use the provided template.');
    }
  }

  function updateDecision(rowNumber, decision) {
    setBulkPreview((current) => current.map((row) => (row.rowNumber === rowNumber ? { ...row, decision } : row)));
  }

  async function saveBulkRows() {
    setIsBulkSaving(true);
    setError('');

    try {
      const response = await api.post('/courses/bulk-save', { rows: bulkPreview });
      setBulkResult(response.data);
      setBulkPreview([]);
      setBulkSummary(null);
      setActiveView('view');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save imported courses.');
    } finally {
      setIsBulkSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Courses"
        title={activeView === 'add' ? 'Add Courses' : 'View Added Courses'}
        description="Create master courses once, then reuse them while creating assessments."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <CourseModeTabs
        activeView={activeView}
        onChange={setActiveView}
        viewLabel={initialView === 'add' ? 'Current Added Courses' : 'View Added Courses'}
      />

      {activeView === 'view' ? (
        initialView === 'add' ? (
          <CurrentAddedCoursesPanel courses={currentAddedCourses} onAddCourse={() => setActiveView('add')} />
        ) : (
          <CourseDirectoryPanel onAddCourse={() => setActiveView('add')} />
        )
      ) : (
        <>
          <div className="mx-auto max-w-2xl">
            <SectionPanel
              title="Add Course"
              description="Choose manual entry for one course or Excel upload for many courses."
              icon={entryMode === 'single' ? Plus : FileSpreadsheet}
              actions={(
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={downloadTemplate}>
                  <Download size={14} className="text-brand-500" />
                  Download Template
                </button>
              )}
            >
              <div className="border-b border-slate-200 bg-slate-50/70 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['single', 'Single Course', 'Create one course manually.'],
                    ['import', 'Excel Upload', 'Upload multiple courses together.'],
                  ].map(([mode, title, description]) => (
                    <button
                      key={mode}
                      className={`rounded-md border p-3 text-left transition ${
                        entryMode === mode ? 'border-brand-200 bg-white text-slate-950 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                      }`}
                      type="button"
                      onClick={() => setEntryMode(mode)}
                    >
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {entryMode === 'single' ? (
                <form className="space-y-4 p-5" onSubmit={handleSubmit}>
                  <div>
                    <label className="field-label">Course name</label>
                    <input className="field-input mt-2" value={form.courseName} onChange={(event) => updateForm('courseName', event.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label">Course code</label>
                    <input className="field-input mt-2" value={form.courseCode} onChange={(event) => updateForm('courseCode', event.target.value.toUpperCase())} required />
                  </div>
                  <button className="primary-button w-full" type="submit" disabled={isSaving}>
                    <Plus size={16} />
                    {isSaving ? 'Saving course' : 'Save Course'}
                  </button>
                </form>
              ) : (
                <div className="space-y-3 p-5">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    Download the template from the card header, fill Course Name and Course Code, then upload it here.
                  </div>
                  <label className="secondary-button w-full cursor-pointer justify-start">
                    <UploadCloud size={16} className="text-brand-500" />
                    {isBulkValidating ? 'Reading File...' : 'Upload Excel'}
                    <input className="hidden" type="file" accept=".xlsx" onChange={handleFile} />
                  </label>
                  <p className="text-xs leading-5 text-slate-500">Template requires Course Name and Course Code only. You can review duplicate course codes before saving.</p>
                </div>
              )}
            </SectionPanel>
          </div>

          {entryMode === 'import' || bulkPreview.length > 0 ? (
            <SectionPanel
              title="Import Review"
              description="Review duplicate course names and codes before adding. Duplicates are skipped and cannot be saved."
              icon={FileSpreadsheet}
              actions={bulkPreview.length > 0 ? <button className="primary-button" type="button" onClick={saveBulkRows} disabled={readyRows === 0 || isBulkSaving}>
                <CheckCircle2 size={16} />
                {isBulkSaving ? 'Adding...' : `Add ${readyRows} Courses`}
              </button> : null}
            >
              {bulkPreview.length === 0 ? (
                <EmptyState title="No import preview" description="Upload the course Excel template to review rows before saving." />
              ) : (
                <>
                  <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-4">
                    <div>
                      <p className="field-label">Rows</p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">{bulkSummary?.total || 0}</p>
                    </div>
                    <div>
                      <p className="field-label">Ready</p>
                      <p className="mt-1 text-xl font-semibold text-green-700">{readyRows}</p>
                    </div>
                    <div>
                      <p className="field-label">Conflicts</p>
                      <p className="mt-1 text-xl font-semibold text-amber-700">{duplicateRows.length}</p>
                    </div>
                    <div>
                      <p className="field-label">Errors</p>
                      <p className="mt-1 text-xl font-semibold text-red-700">{bulkSummary?.errors || 0}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Course</th>
                          <th>Status</th>
                          <th>Decision</th>
                          <th>Issues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {bulkPreview.map((row) => (
                          <tr key={`${row.rowNumber}-${row.courseCode}`}>
                            <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                            <td>
                              <p className="font-semibold text-slate-950">{row.courseName || '-'}</p>
                              <p className="text-xs text-slate-500">{row.courseCode || '-'}</p>
                            </td>
                            <td><span className={statusClass(row.courseStatus === 'duplicate_course' ? 'pending' : 'active')}>{row.courseStatus.replaceAll('_', ' ')}</span></td>
                            <td>
                              <select className="field-input min-w-[140px]" value={row.decision} onChange={(event) => updateDecision(row.rowNumber, event.target.value)} disabled={!row.canSave}>
                                {row.allowedDecisions.map((decision) => (
                                  <option key={decision} value={decision}>{decision}</option>
                                ))}
                              </select>
                            </td>
                            <td className="max-w-[260px] text-xs leading-5 text-slate-500">{row.issues.length > 0 ? row.issues.join(' ') : 'Ready'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {duplicateRows.length > 0 ? (
                    <div className="border-t border-amber-200 bg-amber-50/70 p-4">
                      <p className="text-xs font-semibold uppercase text-amber-700">Duplicate rows</p>
                      <div className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Course</th>
                              <th>Duplicate Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {duplicateRows.map((row) => (
                              <tr key={`duplicate-${row.rowNumber}-${row.courseCode}`}>
                                <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                                <td>
                                  <p className="font-semibold text-slate-950">{row.courseName || '-'}</p>
                                  <p className="text-xs text-slate-500">{row.courseCode || '-'}</p>
                                </td>
                                <td className="max-w-xl text-xs leading-5 text-amber-800">{row.issues.join(' ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </SectionPanel>
          ) : null}
        </>
      )}

      {activeView === 'add' && bulkResult?.saved?.length > 0 ? (
        <SectionPanel title="Saved Courses" description="Latest saved course records." icon={CheckCircle2}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Code</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bulkResult.saved.map((course) => (
                  <tr key={`${course.courseCode}-${course.action}`}>
                    <td className="font-semibold text-slate-950">{course.courseName}</td>
                    <td className="text-slate-700">{course.courseCode}</td>
                    <td><span className={statusClass(course.action === 'replaced' ? 'resent' : 'active')}>{course.action}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ) : null}
    </section>
  );
}

export function ViewCoursesPage() {
  return <CourseManagerPage initialView="view" />;
}

export function AddCoursesPage() {
  return <CourseManagerPage initialView="add" />;
}
