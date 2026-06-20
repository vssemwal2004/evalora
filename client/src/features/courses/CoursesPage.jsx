import { useCallback, useEffect, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { CheckCircle2, Download, FileSpreadsheet, ListFilter, Plus, Search, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
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

export function AddCoursesPage() {
  const [form, setForm] = useState(initialForm);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const readyRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api.post('/courses', form);
      setForm(initialForm);
      setBulkResult({ saved: [{ action: 'created', ...form }], summary: { created: 1, replaced: 0, skipped: 0 } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save course.');
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTemplate() {
    await writeXlsxFile(
      [
        [
          { value: 'Course Name', fontWeight: 'bold' },
          { value: 'Course Code', fontWeight: 'bold' },
        ],
        [
          { value: 'Bachelor of Computer Applications' },
          { value: 'BCA' },
        ],
      ],
      { fileName: 'evalora-course-template.xlsx' }
    );
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
      const rows = await readXlsxFile(file);
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
        title="Add Courses"
        description="Create master courses once, then reuse them while creating assessments."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
        <div className="space-y-5">
          <SectionPanel title="Single Course" description="Add one course manually." icon={Plus}>
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
          </SectionPanel>

          <SectionPanel title="Excel Import" description="Template requires Course Name and Course Code only." icon={FileSpreadsheet}>
            <div className="space-y-3 p-5">
              <button className="secondary-button w-full justify-start" type="button" onClick={downloadTemplate}>
                <Download size={16} className="text-brand-500" />
                Download Template
              </button>
              <label className="secondary-button w-full cursor-pointer justify-start">
                <UploadCloud size={16} className="text-brand-500" />
                {isBulkValidating ? 'Reading File...' : 'Upload Excel'}
                <input className="hidden" type="file" accept=".xlsx" onChange={handleFile} />
              </label>
            </div>
          </SectionPanel>
        </div>

        <SectionPanel
          title="Import Review"
          description="Review duplicate course codes before saving."
          icon={FileSpreadsheet}
          actions={bulkPreview.length > 0 ? <button className="primary-button" type="button" onClick={saveBulkRows} disabled={readyRows === 0 || isBulkSaving}>
            <CheckCircle2 size={16} />
            {isBulkSaving ? 'Saving...' : `Save ${readyRows} Courses`}
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
                  <p className="mt-1 text-xl font-semibold text-amber-700">{bulkSummary?.conflicts || 0}</p>
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
                        <td><span className={statusClass(row.courseStatus === 'existing_course' ? 'pending' : 'active')}>{row.courseStatus.replaceAll('_', ' ')}</span></td>
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
            </>
          )}
        </SectionPanel>
      </div>

      {bulkResult?.saved?.length > 0 ? (
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
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/courses', {
        params: { search: appliedSearch || undefined, status: 'active', limit: 1000 },
      });
      setCourses(response.data.items);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load courses.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Courses"
        title="View Courses"
        description="Master course directory used during assessment creation."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <SectionPanel title="Course Directory" description="Search by course name or course code." icon={FileSpreadsheet}>
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
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Course Code</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={4}>Loading courses...</td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState title="No courses found" description="Add courses manually or import them from Excel." /></td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course._id}>
                    <td className="font-semibold text-slate-950">{course.courseName}</td>
                    <td className="text-slate-700">{course.courseCode}</td>
                    <td><span className={statusClass(course.status)}>{course.status}</span></td>
                    <td className="text-slate-500">{new Date(course.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </section>
  );
}
