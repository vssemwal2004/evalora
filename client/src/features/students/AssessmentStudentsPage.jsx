import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, KeyRound, ListFilter, Mail, Plus, Search, UploadCloud, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const initialForm = {
  name: '',
  email: '',
  applicationNumber: '',
  courseName: '',
  courseId: '',
  eligibilityStatus: 'eligible',
  eligibilityReason: '',
};

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
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
    eligibilityStatus: String(readImportValue(row, ['Eligibility Status']) || 'eligible').trim().toLowerCase(),
    eligibilityReason: String(readImportValue(row, ['Eligibility Reason']) || '').trim(),
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

export function AssessmentStudentsPage({ assessmentId: assessmentIdProp, embedded = false } = {}) {
  const params = useParams();
  const assessmentId = assessmentIdProp || params.assessmentId;
  const defaultEligibility = embedded ? '' : 'eligible';
  const [assessment, setAssessment] = useState(null);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ search: '', course: '', eligibility: defaultEligibility });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '', eligibility: defaultEligibility });
  const [createdCredential, setCreatedCredential] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingMailId, setSendingMailId] = useState('');
  const [error, setError] = useState('');
  const readyBulkRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;

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
        eligibility: appliedFilters.eligibility || undefined,
      },
    });
    setStudents(response.data.items);
  }, [appliedFilters, assessmentId]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [assessmentResponse, studentsResponse] = await Promise.all([
          api.get(`/assessments/${assessmentId}`),
          api.get(`/assessments/${assessmentId}/students`, {
            params: {
              eligibility: defaultEligibility || undefined,
            },
          }),
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
  }, [assessmentId, defaultEligibility]);

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
      const response = await api.post(`/assessments/${assessmentId}/students`, form);
      setCreatedCredential(response.data.student);
      const selectedCourse = { courseName: form.courseName, courseId: form.courseId };
      setForm({ ...initialForm, courseName: selectedCourse.courseName, courseId: selectedCourse.courseId });
      await Promise.all([loadStudents(), loadAssessment()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to add student.');
    } finally {
      setIsSaving(false);
    }
  }

  async function applyFilters() {
    setAppliedFilters(filters);
  }

  async function sendMail(student) {
    setSendingMailId(student._id);
    setError('');

    try {
      await api.post(`/assessments/${assessmentId}/students/${student._id}/send-mail`);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send student mail.');
    } finally {
      setSendingMailId('');
    }
  }

  async function downloadTemplate() {
    const firstCourse = assessment?.courses?.[0] || {};
    await writeXlsxFile(
      [
        [
          { value: 'Student Name', fontWeight: 'bold' },
          { value: 'Student Email', fontWeight: 'bold' },
          { value: 'Application Number', fontWeight: 'bold' },
          { value: 'Course Name', fontWeight: 'bold' },
          { value: 'Course ID', fontWeight: 'bold' },
          { value: 'Eligibility Status', fontWeight: 'bold' },
          { value: 'Eligibility Reason', fontWeight: 'bold' },
        ],
        [
          { value: 'Aarav Sharma' },
          { value: 'aarav@example.com' },
          { value: 'APP-001' },
          { value: firstCourse.courseName || 'BCA' },
          { value: firstCourse.courseId || 'BCA-101' },
          { value: 'eligible' },
          { value: '' },
        ],
      ],
      { fileName: `evalora-student-template-${assessment?.assessmentCode || 'assessment'}.xlsx` }
    );
  }

  async function validateBulkRows(rows) {
    setIsBulkValidating(true);
    setBulkResult(null);
    setError('');

    try {
      const response = await api.post(`/assessments/${assessmentId}/students/bulk-validate`, { rows });
      setBulkPreview(response.data.items);
      setBulkSummary(response.data.summary);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to validate import file.');
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
      const rows = await readXlsxFile(file);
      await validateBulkRows(normalizeImportRows(sheetRowsToObjects(rows)));
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
      setIsBulkConfirmOpen(false);
      await Promise.all([loadStudents(), loadAssessment()]);
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
          description="Manage eligible students, exam credentials, and mail delivery from one dedicated page."
        />
      ) : null}

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

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

      <div className={embedded ? 'grid gap-5 xl:grid-cols-[430px_1fr]' : 'space-y-5'}>
        {embedded ? (
          <div className="space-y-5">
            <SectionPanel title="Add Student" description="A new Exam ID and password is generated for this assessment only." icon={UserPlus}>
              <form className="space-y-4 p-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
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

              <div>
                <label className="field-label">Eligibility</label>
                <select
                  className="field-input mt-2"
                  value={form.eligibilityStatus}
                  onChange={(event) => updateForm('eligibilityStatus', event.target.value)}
                >
                  <option value="eligible">Eligible</option>
                  <option value="needs_review">Needs review</option>
                  <option value="not_eligible">Not eligible</option>
                </select>
              </div>

              <div>
                <label className="field-label">Eligibility reason</label>
                <textarea
                  className="field-input mt-2 h-20 py-3"
                  value={form.eligibilityReason}
                  onChange={(event) => updateForm('eligibilityReason', event.target.value)}
                />
              </div>

              <button className="primary-button w-full" type="submit" disabled={isSaving}>
                <Plus size={16} />
                {isSaving ? 'Adding student' : 'Add Student'}
              </button>
              </form>
            </SectionPanel>

            <SectionPanel title="Excel Import" description="Download template, upload Excel, review conflicts, then save." icon={FileSpreadsheet}>
              <div className="space-y-3 p-5">
                <button className="secondary-button w-full justify-start" type="button" onClick={downloadTemplate}>
                  <Download size={16} className="text-brand-500" />
                  Download Template
                </button>
                <label className="secondary-button w-full cursor-pointer justify-start">
                  <UploadCloud size={16} className="text-brand-500" />
                  {isBulkValidating ? 'Reading File...' : 'Upload Excel'}
                  <input className="hidden" type="file" accept=".xlsx" onChange={handleBulkFile} />
                </label>
                <p className="text-xs leading-5 text-slate-500">
                  Required columns: Student Name, Student Email, Course Name or Course ID. Application number is optional.
                </p>
              </div>
            </SectionPanel>
          </div>
        ) : null}

        <SectionPanel
          title="Student Directory"
          description={embedded ? 'Filter assigned candidates by course, credential, and eligibility.' : 'Eligible students for this assessment, with credential visibility and mail actions.'}
        >
          <div className="grid gap-3 border-b border-slate-200 px-4 py-3 md:grid-cols-[1fr_180px_190px_auto]">
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
            <select
              className="field-input"
              value={filters.eligibility}
              onChange={(event) => setFilters((current) => ({ ...current, eligibility: event.target.value }))}
            >
              <option value="">All eligibility</option>
              <option value="eligible">Eligible</option>
              <option value="needs_review">Needs review</option>
              <option value="not_eligible">Not eligible</option>
            </select>
            <button className="secondary-button" type="button" onClick={applyFilters}>
              <ListFilter size={16} className="text-brand-500" />
              Apply
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Exam ID</th>
                  <th>Password</th>
                  <th>Eligibility</th>
                  <th>Mail</th>
                  <th>Status</th>
                  <th>Action</th>
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
                      <EmptyState title="No students found" description={embedded ? 'Add students manually first; Excel import review will extend this flow later.' : 'Only eligible students for this assessment are shown on this page.'} />
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student._id}>
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
                      <td>
                        <span className={statusClass(student.eligibilityStatus)}>
                          {student.eligibilityStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td><span className={statusClass(student.mailStatus)}>{student.mailStatus.replace('_', ' ')}</span></td>
                      <td><span className={statusClass(student.examStatus)}>{student.examStatus.replace('_', ' ')}</span></td>
                      <td>
                        <button
                          className="secondary-button h-8 px-2 text-xs"
                          type="button"
                          onClick={() => sendMail(student)}
                          disabled={sendingMailId === student._id}
                        >
                          <Mail size={13} />
                          {sendingMailId === student._id ? 'Sending' : ['sent', 'resent'].includes(student.mailStatus) ? 'Resend' : 'Send Mail'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      </div>

      {bulkPreview.length > 0 ? (
        <SectionPanel
          title="Import Review"
          description="Resolve duplicate and eligibility decisions before saving. Nothing is added until you confirm."
          icon={FileSpreadsheet}
          actions={<button className="primary-button" type="button" onClick={() => setIsBulkConfirmOpen(true)} disabled={readyBulkRows === 0}>
            <CheckCircle2 size={16} />
            Save {readyBulkRows} Students
          </button>}
        >
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-5">
            <div>
              <p className="field-label">Rows</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{bulkSummary?.total || 0}</p>
            </div>
            <div>
              <p className="field-label">Ready</p>
              <p className="mt-1 text-xl font-semibold text-green-700">{readyBulkRows}</p>
            </div>
            <div>
              <p className="field-label">Conflicts</p>
              <p className="mt-1 text-xl font-semibold text-amber-700">{bulkSummary?.conflicts || 0}</p>
            </div>
            <div>
              <p className="field-label">Errors</p>
              <p className="mt-1 text-xl font-semibold text-red-700">{bulkSummary?.errors || 0}</p>
            </div>
            <div>
              <p className="field-label">Course matched</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{bulkSummary?.courseMatched || 0}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Profile</th>
                  <th>Assignment</th>
                  <th>Decision</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bulkPreview.map((row) => (
                  <tr key={`${row.rowNumber}-${row.email || row.name}`}>
                    <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                    <td>
                      <p className="font-semibold text-slate-950">{row.name || '-'}</p>
                      <p className="text-xs text-slate-500">{row.email || '-'}</p>
                      {row.applicationNumber ? <p className="text-xs text-slate-400">{row.applicationNumber}</p> : null}
                    </td>
                    <td>
                      <p className="text-sm font-medium text-slate-800">{row.matchedCourseName || row.inputCourseName || '-'}</p>
                      <p className="text-xs text-slate-500">{row.matchedCourseId || row.inputCourseId || '-'}</p>
                      <span className={statusClass(row.courseMatchStatus === 'not_matched' ? 'failed' : 'eligible')}>
                        {row.courseMatchStatus.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td><span className={statusClass(row.profileStatus === 'existing_profile' ? 'resent' : 'active')}>{row.profileStatus.replaceAll('_', ' ')}</span></td>
                    <td><span className={statusClass(row.assignmentStatus === 'already_assigned' ? 'pending' : 'active')}>{row.assignmentStatus.replaceAll('_', ' ')}</span></td>
                    <td>
                      <select
                        className="field-input min-w-[150px]"
                        value={row.decision}
                        onChange={(event) => updateBulkDecision(row.rowNumber, event.target.value)}
                        disabled={!row.canSave}
                      >
                        {row.allowedDecisions.map((decision) => (
                          <option key={decision} value={decision}>
                            {decision.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="max-w-[260px] text-xs leading-5 text-slate-500">
                      {row.issues.length > 0 ? row.issues.join(' ') : 'Ready'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </section>
  );
}
