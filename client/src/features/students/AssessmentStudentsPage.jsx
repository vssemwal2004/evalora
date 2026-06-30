import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { readSheet } from 'read-excel-file/browser';
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, KeyRound, ListFilter, Mail, MoreHorizontal, Plus, Search, Trash2, UploadCloud, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const initialForm = {
  name: '',
  email: '',
  applicationNumber: '',
  courseName: '',
  courseId: '',
};

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function reviewStatus(row) {
  if (row.issues?.length > 0) return { key: 'error', label: 'Needs Fix' };
  if (row.assignmentStatus === 'already_assigned') return { key: 'duplicate', label: 'Duplicate' };
  if (row.canSave && row.decision !== 'skip') return { key: 'ready', label: 'Ready' };
  return { key: 'skip', label: 'Skipped' };
}

function reviewStatusClass(status) {
  if (status === 'ready') return statusClass('active');
  if (status === 'duplicate') return statusClass('pending');
  if (status === 'error') return statusClass('failed');
  return statusClass('draft');
}

function readImportValue(row, names) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value])
  );

  const match = names.find((name) => normalized[name.toLowerCase()] !== undefined);
  return match ? normalized[match.toLowerCase()] : '';
}

function normalizeImportRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    name: String(readImportValue(row, ['Student Name', 'Name', 'student name']) || '').trim(),
    email: String(readImportValue(row, ['Student Email', 'Email', 'student email']) || '').trim(),
    applicationNumber: String(readImportValue(row, ['Application Number', 'Application No', 'application number']) || '').trim(),
    courseName: String(readImportValue(row, ['Course Name', 'Student Course', 'Course']) || '').trim(),
    courseId: String(readImportValue(row, ['Course ID', 'Course Code', 'course id']) || '').trim(),
  }));
}

function sheetRowsToObjects(rows) {
  const [headers = [], ...bodyRows] = rows;
  const normalizedHeaders = headers.map((header, index) => String(header || `Column ${index + 1}`).trim());

  return bodyRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
    .map((row) =>
      Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? '']))
    );
}

function getReviewStorageKey(assessmentId) {
  return `evalora:assessment:${assessmentId}:student-review`;
}

function readStoredReview(assessmentId) {
  if (!assessmentId) return null;
  try {
    return JSON.parse(globalThis.sessionStorage?.getItem(getReviewStorageKey(assessmentId)) || 'null');
  } catch {
    return null;
  }
}

function writeStoredReview(assessmentId, payload) {
  if (!assessmentId) return;
  globalThis.sessionStorage?.setItem(getReviewStorageKey(assessmentId), JSON.stringify(payload));
}

function clearStoredReview(assessmentId) {
  if (!assessmentId) return;
  globalThis.sessionStorage?.removeItem(getReviewStorageKey(assessmentId));
}

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

export function AssessmentStudentsPage({ assessmentId: assessmentIdProp, embedded = false, initialView } = {}) {
  const { user } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const assessmentId = assessmentIdProp || params.assessmentId;
  const storedReview = readStoredReview(assessmentId);
  const requestedView = initialView || location.state?.activeView;
  const roleBase = getRoleBase(location.pathname);
  const studentsPath = `${roleBase}/assessments/${assessmentId}/students`;
  const reviewPath = `${studentsPath}/review`;
  const [assessment, setAssessment] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ search: '', course: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '' });
  const [createdCredential, setCreatedCredential] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(storedReview?.items || []);
  const [bulkSummary, setBulkSummary] = useState(storedReview?.summary || null);
  const [bulkResult, setBulkResult] = useState(null);
  const [reviewSource, setReviewSource] = useState(storedReview?.source || '');
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingMailId, setSendingMailId] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState('');
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState(requestedView || (embedded ? 'add' : 'directory'));
  const readyBulkRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;
  const canDeleteStudents = user?.role === 'super_admin' || user?.permissions?.includes('student.remove');
  const allStudentsSelected = students.length > 0 && students.every((student) => selectedStudentIds.includes(student._id));
  const reviewCounts = bulkPreview.reduce(
    (acc, row) => {
      const status = reviewStatus(row).key;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { ready: 0, duplicate: 0, error: 0, skip: 0 }
  );

  const loadAssessment = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}`);
    setAssessment(response.data.assessment);
    const firstCourse = response.data.assessment.courses?.[0];
    if (firstCourse) {
      setForm((current) => ({
        ...current,
        courseName: current.courseName || firstCourse.courseName,
        courseId: current.courseId || firstCourse.courseId || '',
      }));
    }
  }, [assessmentId]);

  const loadStudents = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}/students`, {
      params: {
        search: appliedFilters.search || undefined,
        course: appliedFilters.course || undefined,
      },
    });
    setStudents(response.data.items);
  }, [appliedFilters, assessmentId]);

  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((id) => students.some((student) => student._id === id)));
  }, [students]);

  useEffect(() => {
    if (initialView === 'review') {
      const review = readStoredReview(assessmentId);
      setBulkPreview(review?.items || []);
      setBulkSummary(review?.summary || null);
      setReviewSource(review?.source || '');
      setActiveView('review');
    }
  }, [assessmentId, initialView]);

  function changeView(view) {
    if (view === 'review') {
      if (embedded) {
        setActiveView('review');
        return;
      }
      navigate(reviewPath);
      return;
    }

    if (location.pathname.endsWith('/review')) {
      navigate(studentsPath, { state: { activeView: view } });
      return;
    }

    setActiveView(view);
  }

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [assessmentResponse, studentsResponse] = await Promise.all([
          api.get(`/assessments/${assessmentId}`),
          api.get(`/assessments/${assessmentId}/students`),
        ]);
        if (!ignore) {
          setAssessment(assessmentResponse.data.assessment);
          setStudents(studentsResponse.data.items);
          const firstCourse = assessmentResponse.data.assessment.courses?.[0];
          if (firstCourse) {
            setForm((current) => ({
              ...current,
              courseName: firstCourse.courseName,
              courseId: firstCourse.courseId || '',
            }));
          }
        }
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load assessment students.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [assessmentId]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectCourse(courseKey) {
    const course = (assessment?.courses || []).find((item) => `${item.courseName}|${item.courseId || ''}` === courseKey);
    if (!course) return;
    setForm((current) => ({ ...current, courseName: course.courseName, courseId: course.courseId || '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    setCreatedCredential(null);

    try {
      await validateStudentRows([{ ...form, rowNumber: 1 }], 'manual');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to review student.');
    } finally {
      setIsSaving(false);
    }
  }

  async function applyFilters() {
    setAppliedFilters(filters);
  }

  async function sendMail(student) {
    if (['sent', 'resent'].includes(student.mailStatus)) {
      return;
    }

    setSendingMailId(student._id);
    setError('');
    setOpenActionMenu('');

    try {
      await api.post(`/assessments/${assessmentId}/students/${student._id}/send-mail`);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send student mail.');
    } finally {
      setSendingMailId('');
    }
  }

  async function copyText(value, label) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setError('');
    } catch {
      setError(`Unable to copy ${label}.`);
    }
    setOpenActionMenu('');
  }

  function toggleActionMenu(event, studentId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 176;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setActionMenuPosition({ top, left });
    setOpenActionMenu((current) => (current === studentId ? '' : studentId));
  }

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
    setOpenActionMenu('');
  }

  function toggleAllStudents() {
    setSelectedStudentIds((current) => {
      const visibleIds = students.map((student) => student._id);
      const selectedAll = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
      return selectedAll ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds]));
    });
    setOpenActionMenu('');
  }

  async function deleteStudents(ids) {
    if (!ids.length) return;
    setIsSaving(true);
    setError('');
    setOpenActionMenu('');

    try {
      if (ids.length === 1) {
        await api.delete(`/assessments/${assessmentId}/students/${ids[0]}`);
      } else {
        await api.delete(`/assessments/${assessmentId}/students/bulk`, { data: { ids } });
      }
      setDeleteTarget(null);
      setSelectedStudentIds((current) => current.filter((id) => !ids.includes(id)));
      await Promise.all([loadStudents(), loadAssessment()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete student.');
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTemplate() {
    const firstCourse = assessment?.courses?.[0] || {};
    await downloadXlsx(
      [
        [
          { value: 'Student Name', fontWeight: 'bold' },
          { value: 'Student Email', fontWeight: 'bold' },
          { value: 'Application Number', fontWeight: 'bold' },
          { value: 'Course Name', fontWeight: 'bold' },
          { value: 'Course ID', fontWeight: 'bold' },
        ],
        [
          { value: 'Aarav Sharma' },
          { value: 'aarav@example.com' },
          { value: 'APP-001' },
          { value: firstCourse.courseName || 'BCA' },
          { value: firstCourse.courseId || 'BCA-101' },
        ],
      ],
      `evalora-student-template-${assessment?.assessmentCode || 'assessment'}.xlsx`
    );
  }

  async function downloadStudentData() {
    await downloadXlsx(
      [
        [
          { value: 'Student Name', fontWeight: 'bold' },
          { value: 'Student Email', fontWeight: 'bold' },
          { value: 'Application Number', fontWeight: 'bold' },
          { value: 'Course Name', fontWeight: 'bold' },
          { value: 'Course ID', fontWeight: 'bold' },
          { value: 'Exam ID', fontWeight: 'bold' },
          { value: 'Password', fontWeight: 'bold' },
          { value: 'Mail Status', fontWeight: 'bold' },
          { value: 'Exam Status', fontWeight: 'bold' },
          { value: 'Added At', fontWeight: 'bold' },
        ],
        ...students.map((student) => [
          { value: student.name || '' },
          { value: student.email || '' },
          { value: student.applicationNumber || '' },
          { value: student.courseName || '' },
          { value: student.courseId || '' },
          { value: student.generatedExamId || '' },
          { value: student.passwordPreview || '' },
          { value: String(student.mailStatus || '').replace('_', ' ') },
          { value: String(student.examStatus || '').replace('_', ' ') },
          { value: student.createdAt ? new Date(student.createdAt).toLocaleString() : '' },
        ]),
      ],
      `evalora-student-credentials-${assessment?.assessmentCode || assessmentId}.xlsx`
    );
  }

  async function validateStudentRows(rows, source = 'excel') {
    setIsBulkValidating(true);
    setBulkResult(null);
    setCreatedCredential(null);
    setError('');

    try {
      const response = await api.post(`/assessments/${assessmentId}/students/bulk-validate`, { rows });
      const reviewPayload = {
        items: response.data.items,
        summary: response.data.summary,
        source,
      };
      writeStoredReview(assessmentId, reviewPayload);
      setBulkPreview(response.data.items);
      setBulkSummary(response.data.summary);
      setReviewSource(source);
      if (embedded) {
        setActiveView('review');
      } else {
        navigate(reviewPath);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to validate student data.');
    } finally {
      setIsBulkValidating(false);
    }
  }

  async function handleBulkFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const rows = await readSheet(file);
      await validateStudentRows(normalizeImportRows(sheetRowsToObjects(rows)), 'excel');
    } catch {
      setError('Unable to read Excel file. Please use the provided template.');
    }
  }

  function updateBulkDecision(rowNumber, decision) {
    setBulkPreview((current) =>
      current.map((row) => (row.rowNumber === rowNumber ? { ...row, decision } : row))
    );
  }

  async function saveBulkRows() {
    setIsBulkSaving(true);
    setError('');

    try {
      const response = await api.post(`/assessments/${assessmentId}/students/bulk-save`, { rows: bulkPreview });
      setBulkResult(response.data);
      setCreatedCredential(response.data.credentials?.length === 1 ? response.data.credentials[0] : null);
      setIsBulkConfirmOpen(false);
      setBulkPreview([]);
      setBulkSummary(null);
      setReviewSource('');
      clearStoredReview(assessmentId);
      const selectedCourse = { courseName: form.courseName, courseId: form.courseId };
      setForm({ ...initialForm, courseName: selectedCourse.courseName, courseId: selectedCourse.courseId });
      await Promise.all([loadStudents(), loadAssessment()]);
      if (embedded) {
        setActiveView('directory');
      } else {
        navigate(studentsPath, { state: { activeView: 'directory' } });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save imported students.');
    } finally {
      setIsBulkSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      {!embedded ? (
        <PageHeader
          eyebrow="Assessment Students"
          title={assessment?.title || 'Students'}
          description="Manage students, exam credentials, and mail delivery from one dedicated page."
        />
      ) : null}

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {bulkResult ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          Students updated successfully: {bulkResult.summary?.created || 0} created, {bulkResult.summary?.replaced || 0} replaced, {bulkResult.summary?.skipped || 0} skipped.
        </div>
      ) : null}

      {createdCredential ? (
        <div className="border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-slate-800">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <KeyRound size={16} className="text-brand-600" />
            Generated credential
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <p>
              Exam ID: <span className="font-semibold">{createdCredential.generatedExamId}</span>
            </p>
            <p>
              Password: <span className="font-semibold">{createdCredential.passwordPreview}</span>
            </p>
            <p>
              Course: <span className="font-semibold">{createdCredential.courseName}</span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div>
          <p className="field-label text-brand-600">Student Phase</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            {activeView === 'add'
              ? 'Add students manually or by Excel import.'
              : activeView === 'review'
                ? 'Review validated student data before adding it to the assessment.'
                : 'View added students, credentials, and mail status.'}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
          {[
            ['add', 'Add Student'],
            ['directory', 'Student Directory'],
            ...(bulkPreview.length > 0 ? [['review', `Review ${bulkPreview.length}`]] : []),
          ].map(([view, label]) => (
            <button
              key={view}
              className={`h-8 rounded px-3 text-xs font-semibold transition ${activeView === view ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              type="button"
              onClick={() => changeView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={embedded ? 'space-y-4' : 'space-y-5'}>
        {activeView === 'add' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionPanel title="Add Student" description="Creates one unique assessment credential." icon={UserPlus}>
              <form className="space-y-3 p-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="field-label">Student name</label>
                  <input className="field-input mt-2" value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Email</label>
                  <input
                    className="field-input mt-2"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Application number</label>
                <input
                  className="field-input mt-2"
                  value={form.applicationNumber}
                  onChange={(event) => updateForm('applicationNumber', event.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Course</label>
                <select
                  className="field-input mt-2"
                  value={`${form.courseName}|${form.courseId || ''}`}
                  onChange={(event) => selectCourse(event.target.value)}
                  required
                >
                  <option value="|">Select course</option>
                  {(assessment?.courses || []).map((course) => (
                    <option key={`${course.courseName}|${course.courseId || ''}`} value={`${course.courseName}|${course.courseId || ''}`}>
                      {course.courseName}
                      {course.courseId ? ` (${course.courseId})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button className="primary-button w-full" type="submit" disabled={isSaving}>
                <Plus size={16} />
                {isSaving ? 'Reviewing student' : 'Review Student'}
              </button>
              </form>
            </SectionPanel>

            <SectionPanel title="Excel Import" description="Upload, review, then save." icon={FileSpreadsheet}>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
                <button className="secondary-button justify-start" type="button" onClick={downloadTemplate}>
                  <Download size={16} className="text-brand-500" />
                  Download Template
                </button>
                <label className="secondary-button cursor-pointer justify-start">
                  <UploadCloud size={16} className="text-brand-500" />
                  {isBulkValidating ? 'Reading File...' : 'Upload Excel'}
                  <input className="hidden" type="file" accept=".xlsx" onChange={handleBulkFile} />
                </label>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-2 xl:col-span-1">
                  Required columns: Student Name, Student Email, Course Name or Course ID. Application number is optional.
                </p>
              </div>
            </SectionPanel>
          </div>
        ) : null}

        {activeView === 'directory' ? (
          <SectionPanel
            title="Student Directory"
            description={embedded ? 'Compact candidate list with credentials and mail status.' : 'Students for this assessment, with credential visibility and mail actions.'}
            actions={
              <div className="flex flex-wrap justify-end gap-2">
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={downloadStudentData} disabled={!students.length}>
                  <Download size={14} className="text-brand-500" />
                  Download Data
                </button>
                <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={() => setActiveView('add')}>
                  <Plus size={14} className="text-brand-500" />
                  Add Student
                </button>
              </div>
            }
          >
          <div className="grid gap-2 border-b border-slate-200 px-3 py-2.5 md:grid-cols-[1fr_170px_auto]">
            <div className="search-field">
              <Search size={16} className="text-brand-500" />
              <input
                className="h-10 flex-1 border-0 px-2 text-sm outline-none"
                placeholder="Search name, email, exam ID"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </div>
            <input
              className="field-input"
              placeholder="Course"
              value={filters.course}
              onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
            />
            <button className="secondary-button" type="button" onClick={applyFilters}>
              <ListFilter size={16} className="text-brand-500" />
              Apply
            </button>
          </div>

          {selectedStudentIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-orange-50/70 px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">{selectedStudentIds.length} student(s) selected</p>
              <button
                className="secondary-button h-8 px-3 text-xs text-red-700"
                type="button"
                disabled={!canDeleteStudents || isSaving}
                onClick={() => setDeleteTarget({ type: 'bulk', ids: selectedStudentIds })}
              >
                <Trash2 size={14} />
                Delete selected
              </button>
            </div>
          ) : null}

          <div className="table-popover-safe">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      className="h-4 w-4 accent-orange-500"
                      type="checkbox"
                      checked={allStudentsSelected}
                      onChange={toggleAllStudents}
                      aria-label="Select all students"
                    />
                  </th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Exam ID</th>
                  <th>Password</th>
                  <th>Mail</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                      Loading students...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState title="No students found" description={embedded ? 'Add students manually first; Excel import review will extend this flow later.' : 'No students have been added to this assessment yet.'} />
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student._id}>
                      <td>
                        <input
                          className="h-4 w-4 accent-orange-500"
                          type="checkbox"
                          checked={selectedStudentIds.includes(student._id)}
                          onChange={() => toggleStudentSelection(student._id)}
                          aria-label={`Select ${student.name}`}
                        />
                      </td>
                      <td>
                        <p className="font-semibold text-slate-950">{student.name}</p>
                        <p className="text-xs text-slate-500">{student.email}</p>
                        {student.applicationNumber ? <p className="text-xs text-slate-400">{student.applicationNumber}</p> : null}
                      </td>
                      <td className="text-slate-600">
                        {student.courseName}
                        {student.courseId ? <span className="block text-xs text-slate-400">{student.courseId}</span> : null}
                      </td>
                      <td className="font-semibold text-slate-800">{student.generatedExamId}</td>
                      <td className="font-semibold text-slate-800">{student.passwordPreview || '-'}</td>
                      <td><span className={statusClass(student.mailStatus)}>{student.mailStatus.replace('_', ' ')}</span></td>
                      <td><span className={statusClass(student.examStatus)}>{student.examStatus.replace('_', ' ')}</span></td>
                      <td className="relative text-right">
                        <button
                          className="secondary-button h-8 w-8 px-0"
                          type="button"
                          onClick={(event) => toggleActionMenu(event, student._id)}
                          aria-label={`Actions for ${student.name}`}
                        >
                          <MoreHorizontal size={15} className="text-brand-500" />
                        </button>
                        {openActionMenu === student._id ? (
                          <div
                            className="fixed z-50 w-44 rounded-md border border-slate-200 bg-white py-1 text-left shadow-xl"
                            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                          >
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => sendMail(student)}
                              disabled={sendingMailId === student._id || ['sent', 'resent'].includes(student.mailStatus)}
                            >
                              <Mail size={14} className="text-brand-500" />
                              {sendingMailId === student._id ? 'Sending...' : ['sent', 'resent'].includes(student.mailStatus) ? 'Mail sent' : 'Send mail'}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => copyText(student.generatedExamId, 'exam ID')}
                            >
                              <Copy size={14} className="text-brand-500" />
                              Copy exam ID
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => copyText(student.passwordPreview, 'password')}
                              disabled={!student.passwordPreview}
                            >
                              <KeyRound size={14} className="text-brand-500" />
                              Copy password
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                              type="button"
                              disabled={!canDeleteStudents || isSaving}
                              onClick={() => {
                                setDeleteTarget({ type: 'single', ids: [student._id], name: student.name });
                                setOpenActionMenu('');
                              }}
                            >
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
          </SectionPanel>
        ) : null}
      </div>

      {activeView === 'review' ? (
        <SectionPanel
          title={reviewSource === 'manual' ? 'Student Review' : 'Import Review'}
          description={reviewSource === 'manual' ? 'Check the student details, course match, and duplicate status before adding to the assessment.' : 'Resolve duplicate and invalid rows before saving. Nothing is added until you confirm.'}
          icon={FileSpreadsheet}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button className="secondary-button" type="button" onClick={() => {
                setBulkPreview([]);
                setBulkSummary(null);
                setReviewSource('');
                clearStoredReview(assessmentId);
                if (embedded) {
                  setActiveView('add');
                } else {
                  navigate(studentsPath, { state: { activeView: 'add' } });
                }
              }}>
                Clear Review
              </button>
              <button className="primary-button" type="button" onClick={() => setIsBulkConfirmOpen(true)} disabled={readyBulkRows === 0}>
                <CheckCircle2 size={16} />
                {reviewSource === 'manual' ? 'Add To Assessment' : `Add ${readyBulkRows} Students`}
              </button>
            </div>
          }
        >
          {bulkPreview.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No student review pending" description="Click Add Student or upload Excel data to validate students before adding them to this assessment." />
            </div>
          ) : (
            <>
          <div className="grid gap-2 border-b border-slate-200 bg-slate-50/70 p-3 md:grid-cols-5">
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="field-label">Rows</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{bulkSummary?.total || 0}</p>
            </div>
            <div className="rounded-md border border-green-200 bg-white p-2">
              <p className="field-label">Ready</p>
              <p className="mt-1 text-lg font-semibold text-green-700">{reviewCounts.ready || 0}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-white p-2">
              <p className="field-label">Duplicates</p>
              <p className="mt-1 text-lg font-semibold text-amber-700">{reviewCounts.duplicate || 0}</p>
            </div>
            <div className="rounded-md border border-red-200 bg-white p-2">
              <p className="field-label">Errors</p>
              <p className="mt-1 text-lg font-semibold text-red-700">{reviewCounts.error || 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="field-label">Course matched</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{bulkSummary?.courseMatched || 0}</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Review</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Profile</th>
                  <th>Assignment</th>
                  <th>Decision</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bulkPreview.map((row) => {
                  const status = reviewStatus(row);
                  return (
                    <tr key={`${row.rowNumber}-${row.email || row.name}`}>
                      <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                      <td>
                        <span className={reviewStatusClass(status.key)}>{status.label}</span>
                      </td>
                      <td>
                        <p className="font-semibold text-slate-950">{row.name || '-'}</p>
                        <p className="text-xs text-slate-500">{row.email || '-'}</p>
                        {row.applicationNumber ? <p className="text-xs text-slate-400">{row.applicationNumber}</p> : null}
                      </td>
                      <td>
                        <p className="font-medium text-slate-800">{row.matchedCourseName || row.inputCourseName || '-'}</p>
                        <p className="text-xs text-slate-500">{row.matchedCourseId || row.inputCourseId || '-'}</p>
                        <span className={statusClass(row.courseMatchStatus === 'not_matched' ? 'failed' : 'eligible')}>
                          {row.courseMatchStatus.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td><span className={statusClass(row.profileStatus === 'existing_profile' ? 'resent' : 'active')}>{row.profileStatus.replaceAll('_', ' ')}</span></td>
                      <td><span className={statusClass(row.assignmentStatus === 'already_assigned' ? 'pending' : 'active')}>{row.assignmentStatus.replaceAll('_', ' ')}</span></td>
                      <td>
                        <select
                          className="field-input min-w-[140px]"
                          value={row.decision}
                          onChange={(event) => updateBulkDecision(row.rowNumber, event.target.value)}
                          disabled={!row.canSave}
                        >
                          {row.allowedDecisions.map((decision) => (
                            decision === 'not_eligible' ? null : (
                              <option key={decision} value={decision}>
                                {decision.replace('_', ' ')}
                              </option>
                            )
                          ))}
                        </select>
                      </td>
                      <td className="max-w-[280px] text-xs leading-5 text-slate-500">
                        {row.issues.length > 0 ? row.issues.join(' ') : status.key === 'duplicate' ? 'Already exists in this assessment. Choose replace if you want to regenerate credentials.' : 'Ready to add.'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            </>
          )}
        </SectionPanel>
      ) : null}

      {bulkResult?.credentials?.length > 0 ? (
        <SectionPanel title="Generated Credentials" description="These credentials were created by the latest bulk import." icon={KeyRound}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Exam ID</th>
                  <th>Password</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bulkResult.credentials.map((credential) => (
                  <tr key={`${credential.email}-${credential.generatedExamId}`}>
                    <td>
                      <p className="font-semibold text-slate-950">{credential.name}</p>
                      <p className="text-xs text-slate-500">{credential.email}</p>
                    </td>
                    <td className="text-slate-700">{credential.courseName}</td>
                    <td className="font-semibold text-slate-900">{credential.generatedExamId}</td>
                    <td className="font-semibold text-slate-900">{credential.passwordPreview}</td>
                    <td><span className={statusClass(credential.action === 'replaced' ? 'resent' : 'active')}>{credential.action}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ) : null}

      {isBulkConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Confirm bulk student import</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  This will create or replace credentials for {readyBulkRows} reviewed students. Skipped and invalid rows will not be added.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setIsBulkConfirmOpen(false)} disabled={isBulkSaving}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={saveBulkRows} disabled={isBulkSaving || readyBulkRows === 0}>
                {isBulkSaving ? 'Saving...' : 'Confirm Import'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700">
                <Trash2 size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-950">Delete student from assessment</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {deleteTarget.type === 'bulk'
                    ? `This will remove ${deleteTarget.ids.length} selected student(s) from this assessment.`
                    : `This will remove ${deleteTarget.name || 'this student'} from this assessment.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)} disabled={isSaving}>
                Cancel
              </button>
              <button className="primary-button bg-red-600 hover:bg-red-700 focus:ring-red-100" type="button" onClick={() => deleteStudents(deleteTarget.ids)} disabled={isSaving}>
                {isSaving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AssessmentStudentReviewPage() {
  return <AssessmentStudentsPage initialView="review" />;
}
