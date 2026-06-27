import { useCallback, useEffect, useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ListFilter,
  Mail,
  MoreVertical,
  Pencil,
  Eye,
  EyeOff,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserPlus,
  UserRoundCheck,
  UserRoundCog,
  UserX,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const staffPermissionOptions = {
  faculty: [
    ['work.view', 'View assigned work'], ['assessment.questions.add', 'Add assessment questions'],
    ['assessment.questions.edit', 'Edit assessment questions'], ['assessment.submit', 'Submit to moderator'],
    ['library.view', 'View personal library'], ['library.create', 'Create library questions'],
    ['library.edit', 'Edit library questions'], ['library.archive', 'Archive library questions'],
  ],
  moderator: [
    ['work.view', 'View review queue'], ['assessment.review', 'Approve or reject assessments'],
    ['assessment.questions.edit', 'Edit assessment questions'],
  ],
};

const roleMeta = {
  faculty: {
    kind: 'faculty',
    singular: 'Faculty',
    plural: 'Faculty',
    templateName: 'evalora-faculty-template.xlsx',
    icon: UserRoundCog,
    createTitle: 'Create Faculty',
    viewTitle: 'View Faculty',
    description: 'Create faculty accounts, assign one or more master courses, and review generated credentials before sending mail.',
  },
  moderator: {
    kind: 'moderators',
    singular: 'Moderator',
    plural: 'Moderators',
    templateName: 'evalora-moderator-template.xlsx',
    icon: UserRoundCheck,
    createTitle: 'Create Moderator',
    viewTitle: 'View Moderators',
    description: 'Create moderator accounts, assign their course scope, and keep review access aligned with uploaded master courses.',
  },
};

const initialForm = {
  name: '',
  email: '',
  courseCodes: [],
};

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function sheetRowsToObjects(rows) {
  const [headers = [], ...bodyRows] = rows;
  const normalizedHeaders = headers.map((header, index) => String(header || `Column ${index + 1}`).trim());

  return bodyRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
    .map((row) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? ''])));
}

function readImportValue(row, names) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
  const match = names.find((name) => normalized[name.toLowerCase()] !== undefined);
  return match ? normalized[match.toLowerCase()] : '';
}

function normalizeRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    name: String(readImportValue(row, ['Name']) || '').trim(),
    email: String(readImportValue(row, ['Email']) || '').trim(),
    assignedCourses: String(readImportValue(row, ['Assigned Courses', 'Course Codes']) || '')
      .split(/[;,|]/)
      .map((courseCode) => ({ courseCode: courseCode.trim().toUpperCase() }))
      .filter((course) => course.courseCode),
  }));
}

function courseLabel(course) {
  return `${course.courseName} (${course.courseCode})`;
}

function courseCodesToCourses(codes, courses) {
  const courseByCode = new Map(courses.map((course) => [course.courseCode, course]));
  return codes
    .map((code) => courseByCode.get(code))
    .filter(Boolean)
    .map((course) => ({ courseName: course.courseName, courseCode: course.courseCode }));
}

function formatCourses(courses) {
  return (courses || []).map(courseLabel).join(', ');
}

function Alert({ type = 'error', children }) {
  const classes =
    type === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-red-200 bg-red-50 text-red-700';
  return <div className={`border px-4 py-3 text-sm font-semibold ${classes}`}>{children}</div>;
}

function MetricStrip({ items }) {
  return (
    <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="field-label">{item.label}</p>
          <p className={`mt-1 text-xl font-semibold ${item.className || 'text-slate-950'}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function CourseMultiSelect({ courses, selectedCodes, onChange }) {
  const [query, setQuery] = useState('');
  const selectedSet = new Set(selectedCodes);
  const filteredCourses = courses.filter((course) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${course.courseName} ${course.courseCode}`.toLowerCase().includes(needle);
  });

  function toggle(code) {
    onChange(selectedSet.has(code) ? selectedCodes.filter((item) => item !== code) : [...selectedCodes, code]);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-2">
        <div className="search-field h-9">
          <Search size={15} className="text-brand-500" />
          <input
            className="h-8 flex-1 border-0 px-2 text-sm outline-none"
            placeholder="Search course name or code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto p-2">
        {courses.length === 0 ? (
          <p className="px-2 py-3 text-sm font-semibold text-slate-500">No master courses found.</p>
        ) : filteredCourses.length === 0 ? (
          <p className="px-2 py-3 text-sm font-semibold text-slate-500">No course matches this search.</p>
        ) : (
          filteredCourses.map((course) => (
            <label key={course._id || course.courseCode} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-brand-50">
              <input
                className="h-4 w-4 accent-orange-500"
                type="checkbox"
                checked={selectedSet.has(course.courseCode)}
                onChange={() => toggle(course.courseCode)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{course.courseName}</span>
                <span className="text-xs text-slate-500">{course.courseCode}</span>
              </span>
            </label>
          ))
        )}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
        {selectedCodes.length} selected
      </div>
    </div>
  );
}

function CredentialsTable({ rows, onSendMail }) {
  if (rows.length === 0) return null;

  return (
    <SectionPanel title="Generated Credentials" description="Mail is not sent automatically. Review credentials, then send manually." icon={Mail}>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Password</th>
              <th>Assigned Courses</th>
              <th>Mail</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((person) => (
              <tr key={person._id}>
                <td className="font-semibold text-slate-950">{person.name}</td>
                <td className="text-slate-700">{person.email}</td>
                <td className="font-mono text-xs font-semibold text-slate-800">{person.password || '-'}</td>
                <td className="max-w-[420px] text-xs leading-5 text-slate-600">{formatCourses(person.assignedCourses)}</td>
                <td>
                  <span className={statusClass(person.mailStatus === 'sent' ? 'active' : person.mailStatus === 'failed' ? 'blocked' : 'pending')}>
                    {person.mailStatus || 'not sent'}
                  </span>
                  {person.mailError ? <p className="mt-1 max-w-[220px] text-xs text-red-600">{person.mailError}</p> : null}
                </td>
                <td className="text-right">
                  <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={() => onSendMail(person)}>
                    <Mail size={14} />
                    Send Mail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

function MaskedPassword({ value, visible, onToggle }) {
  const password = value || '';
  return (
    <span className="inline-flex min-w-[150px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="font-mono text-xs font-semibold text-slate-800">
        {visible ? password || '-' : password ? '••••••••••' : '-'}
      </span>
      {password ? (
        <button className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-white hover:text-brand-600" type="button" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      ) : null}
    </span>
  );
}

function EditPersonModal({ meta, courses, person, isSaving, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    ...person,
    courseCodes: (person.assignedCourses || []).map((course) => course.courseCode),
  }));

  function submit(event) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6">
      <form className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl" onSubmit={submit}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
            <Pencil size={18} />
          </span>
          <div>
            <p className="text-base font-semibold text-slate-950">Edit {meta.singular}</p>
            <p className="mt-1 text-sm text-slate-500">Update account details and assigned course scope.</p>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <label className="field-label">Name</label>
            <input className="field-input mt-2" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input className="field-input mt-2" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} required />
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Assigned courses</label>
            <div className="mt-2">
              <CourseMultiSelect courses={courses} selectedCodes={draft.courseCodes} onChange={(codes) => setDraft((current) => ({ ...current, courseCodes: codes }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving || draft.courseCodes.length === 0}>
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

function ManageAccessModal({ meta, type, person, isSaving, onCancel, onSave }) {
  const options = staffPermissionOptions[type] || [];
  const [permissions, setPermissions] = useState(person.permissions || []);
  const selectedCount = options.filter(([permission]) => permissions.includes(permission)).length;

  function toggle(permission) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600"><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Super Admin Control</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Manage Access — {person.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Choose exactly which {meta.singular.toLowerCase()} features this account can use.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{selectedCount}/{options.length} enabled</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div><p className="text-sm font-bold text-slate-800">All access rights</p><p className="text-xs text-slate-500">Changes apply after Save Access.</p></div>
            <div className="flex gap-2"><button className="secondary-button h-8 text-xs" type="button" onClick={() => setPermissions(options.map(([permission]) => permission))}>Enable all</button><button className="secondary-button h-8 text-xs text-red-700" type="button" onClick={() => setPermissions([])}>Revoke all</button></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map(([permission, label]) => {
              const enabled = permissions.includes(permission);
              return <button key={permission} type="button" onClick={() => toggle(permission)} className={`flex min-h-20 items-center gap-3 rounded-lg border p-4 text-left transition ${enabled ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs font-bold ${enabled ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>✓</span>
                <span><b className="block text-sm text-slate-900">{label}</b><small className="mt-1 block font-mono text-[10px] text-slate-400">{permission}</small></span>
              </button>;
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="button" disabled={isSaving} onClick={() => onSave(person, permissions)}><ShieldCheck size={16} />{isSaving ? 'Saving access...' : 'Save Access'}</button>
        </div>
      </div>
    </div>
  );
}

function usePeopleData(meta) {
  const [courses, setCourses] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadCourses = useCallback(async () => {
    const response = await api.get('/courses', { params: { status: 'active', limit: 1000 } });
    setCourses(response.data.items || []);
  }, []);

  const loadItems = useCallback(
    async (search = '') => {
      setIsLoading(true);
      setError('');

      try {
        const response = await api.get(`/people/${meta.kind}`, {
          params: { search: search || undefined, status: 'all', limit: 1000 },
        });
        setItems(response.data.items || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || `Unable to load ${meta.plural.toLowerCase()}.`);
      } finally {
        setIsLoading(false);
      }
    },
    [meta.kind, meta.plural]
  );

  useEffect(() => {
    loadCourses().catch(() => setError('Unable to load master courses.'));
  }, [loadCourses]);

  return {
    courses,
    items,
    setItems,
    error,
    setError,
    notice,
    setNotice,
    isLoading,
    loadItems,
  };
}

function CreatePeoplePage({ type }) {
  const meta = roleMeta[type];
  const Icon = meta.icon;
  const { courses, error, setError, notice, setNotice } = usePeopleData(meta);
  const [form, setForm] = useState(initialForm);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const readyRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;
  const credentialRows = useMemo(() => [...(bulkResult?.created || []), ...(bulkResult?.person ? [bulkResult.person] : [])], [bulkResult]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');

    try {
      const response = await api.post(`/people/${meta.kind}/bulk-validate`, {
        rows: [
          ...bulkPreview.map((row) => ({
            rowNumber: row.rowNumber,
            name: row.name,
            email: row.email,
            assignedCourses: row.assignedCourses,
            decision: row.decision,
          })),
          {
            rowNumber: bulkPreview.length + 1,
            name: form.name,
            email: form.email,
            assignedCourses: courseCodesToCourses(form.courseCodes, courses),
          },
        ],
      });
      setBulkPreview(response.data.items || []);
      setBulkSummary(response.data.summary || null);
      setBulkResult(null);
      setForm(initialForm);
      setNotice(`${meta.singular} added to review. Click Upload & Send Mail after checking the table.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to validate ${meta.singular.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTemplate() {
    await downloadXlsx(
      [
        [
          { value: 'Name', fontWeight: 'bold' },
          { value: 'Email', fontWeight: 'bold' },
          { value: 'Assigned Courses', fontWeight: 'bold' },
        ],
        [
          { value: `${meta.singular} One` },
          { value: `${meta.singular.toLowerCase()}@example.com` },
          { value: 'BCA; MCA; CS101' },
        ],
      ],
      meta.templateName
    );
  }

  async function validateRows(rows) {
    setIsBulkValidating(true);
    setError('');
    setNotice('');
    setBulkResult(null);

    try {
      const response = await api.post(`/people/${meta.kind}/bulk-validate`, { rows });
      setBulkPreview(response.data.items || []);
      setBulkSummary(response.data.summary || null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to validate Excel file.');
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
      await validateRows(normalizeRows(sheetRowsToObjects(rows)));
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
    setNotice('');

    try {
      const response = await api.post(`/people/${meta.kind}/bulk-save`, { rows: bulkPreview, sendMail: true });
      setBulkResult(response.data);
      setBulkPreview([]);
      setBulkSummary(null);
      setNotice(`${response.data.summary?.created || 0} ${meta.plural.toLowerCase()} uploaded. Mail was attempted automatically.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to save ${meta.plural.toLowerCase()}.`);
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function sendMail(person) {
    setError('');
    setNotice('');

    try {
      const response = await api.post(`/people/${meta.kind}/${person._id}/send-mail`);
      setNotice(response.data.message || 'Mail sent.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send mail.');
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader eyebrow={meta.plural} title={meta.createTitle} description={meta.description} />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert type="success">{notice}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
        <div className="space-y-5">
          <SectionPanel title={`Single ${meta.singular}`} description="Create one account and assign course access." icon={Icon}>
            <form className="space-y-4 p-5" onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div>
                  <label className="field-label">Name</label>
                  <input className="field-input mt-2" value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Email</label>
                  <input className="field-input mt-2" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Assigned courses</label>
                  <div className="mt-2">
                    <CourseMultiSelect courses={courses} selectedCodes={form.courseCodes} onChange={(codes) => updateForm('courseCodes', codes)} />
                  </div>
                </div>
              </div>
              <button className="primary-button w-full" type="submit" disabled={isSaving || form.courseCodes.length === 0}>
                <UserPlus size={16} />
                {isSaving ? 'Creating' : `Create ${meta.singular}`}
              </button>
            </form>
          </SectionPanel>

          <SectionPanel title="Excel Template" description="Use uploaded master course codes in Assigned Courses." icon={FileSpreadsheet}>
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
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Format: <span className="font-semibold text-slate-900">Name</span>, <span className="font-semibold text-slate-900">Email</span>,{' '}
                <span className="font-semibold text-slate-900">Assigned Courses</span>. Multiple courses: <span className="font-semibold">BCA; MCA; CS101</span>.
              </div>
            </div>
          </SectionPanel>
        </div>

        <SectionPanel
          title="Import Review"
          description="Preview every row before saving. Duplicate emails and unknown course codes are blocked."
          icon={FileSpreadsheet}
          actions={
            bulkPreview.length > 0 ? (
              <button className="primary-button" type="button" onClick={saveBulkRows} disabled={readyRows === 0 || isBulkSaving}>
                <CheckCircle2 size={16} />
                {isBulkSaving ? 'Uploading...' : `Upload & Send Mail (${readyRows})`}
              </button>
            ) : null
          }
        >
          {bulkPreview.length === 0 ? (
            <EmptyState title="No import preview" description="Upload the Excel template to review rows before saving." />
          ) : (
            <>
              <MetricStrip
                items={[
                  { label: 'Rows', value: bulkSummary?.total || 0 },
                  { label: 'Ready', value: readyRows, className: 'text-green-700' },
                  { label: 'Failed', value: bulkSummary?.failed || 0, className: 'text-red-700' },
                  { label: 'Course Matches', value: bulkSummary?.coursesMatched || 0 },
                ]}
              />
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Person</th>
                      <th>Courses</th>
                      <th>Decision</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bulkPreview.map((row) => (
                      <tr key={`${row.rowNumber}-${row.email}`}>
                        <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                        <td>
                          <p className="font-semibold text-slate-950">{row.name || '-'}</p>
                          <p className="text-xs text-slate-500">{row.email || '-'}</p>
                        </td>
                        <td className="max-w-[360px] text-xs leading-5 text-slate-600">{formatCourses(row.assignedCourses) || '-'}</td>
                        <td>
                          <select className="field-input min-w-[110px]" value={row.decision} onChange={(event) => updateDecision(row.rowNumber, event.target.value)} disabled={!row.canSave}>
                            {row.allowedDecisions.map((decision) => (
                              <option key={decision} value={decision}>
                                {decision}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="max-w-[300px] text-xs leading-5 text-slate-500">{row.issues.length > 0 ? row.issues.join(' ') : 'Ready'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionPanel>
      </div>

      <CredentialsTable rows={credentialRows} onSendMail={sendMail} />
    </section>
  );
}

function ViewPeoplePage({ type }) {
  const meta = roleMeta[type];
  const { user } = useAuth();
  const Icon = meta.icon;
  const { courses, items, error, setError, notice, setNotice, isLoading, loadItems } = usePeopleData(meta);
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [editPerson, setEditPerson] = useState(null);
  const [accessPerson, setAccessPerson] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      inactive: items.filter((item) => item.status === 'inactive').length,
      courses: new Set(items.flatMap((item) => (item.assignedCourses || []).map((course) => course.courseCode))).size,
    }),
    [items]
  );

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function sendMail(person) {
    setError('');
    setNotice('');

    try {
      const response = await api.post(`/people/${meta.kind}/${person._id}/send-mail`);
      setNotice(response.data.message || 'Mail sent.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send mail.');
    }
  }

  async function saveEdit(draft) {
    setIsSaving(true);
    setError('');

    try {
      await api.patch(`/people/${meta.kind}/${draft._id}`, {
        name: draft.name,
        email: draft.email,
        assignedCourses: courseCodesToCourses(draft.courseCodes, courses),
      });
      setEditPerson(null);
      await loadItems(search);
      setNotice(`${meta.singular} updated.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to update ${meta.singular.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAccess(person, permissions) {
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      await api.patch(`/people/${meta.kind}/${person._id}`, { permissions });
      setAccessPerson(null);
      await loadItems(search);
      setNotice(`Access rights updated for ${person.name}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update access rights.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(person, status) {
    if (!window.confirm(`Mark ${person.name} as ${status}?`)) return;
    setError('');
    setNotice('');

    try {
      await api.patch(`/people/${meta.kind}/${person._id}/status`, { status });
      await loadItems(search);
      setNotice(`${person.name} marked as ${status}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update status.');
    }
  }

  async function deletePerson(person) {
    if (!window.confirm(`Delete ${person.name}? This action cannot be undone.`)) return;
    setError('');
    setNotice('');

    try {
      await api.delete(`/people/${meta.kind}/${person._id}`);
      await loadItems(search);
      setNotice(`${person.name} deleted.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to delete ${meta.singular.toLowerCase()}.`);
    }
  }

  function applySearch() {
    loadItems(search);
  }

  function openActionMenu(event, person) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const top = Math.min(rect.bottom + 6, window.innerHeight - 190);
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    setOpenMenu((current) => (current?.id === person._id ? null : { id: person._id, person, top, left }));
  }

  function closeActionMenu() {
    setOpenMenu(null);
  }

  function togglePassword(personId) {
    setVisiblePasswords((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader eyebrow={meta.plural} title={meta.viewTitle} />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert type="success">{notice}</Alert> : null}

      <SectionPanel
        title={`${meta.singular} Directory`}
        icon={Icon}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">Total {stats.total}</span>
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">Active {stats.active}</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">Inactive {stats.inactive}</span>
            <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-brand-700">Courses {stats.courses}</span>
          </div>
        }
      >
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search name, email, or course"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch();
              }}
            />
          </div>
          <button className="secondary-button" type="button" onClick={applySearch}>
            <ListFilter size={16} className="text-brand-500" />
            Apply
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Password</th>
                <th>Assigned Courses</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title={`No ${meta.plural.toLowerCase()} found`} description="Create a single user or upload the Excel template from the create page." />
                  </td>
                </tr>
              ) : (
                items.map((person) => (
                  <tr key={person._id}>
                    <td className="font-semibold text-slate-950">{person.name}</td>
                    <td className="text-slate-700">{person.email}</td>
                    <td>
                      <MaskedPassword
                        value={person.password}
                        visible={visiblePasswords.includes(person._id)}
                        onToggle={() => togglePassword(person._id)}
                      />
                    </td>
                    <td className="max-w-[460px] text-xs leading-5 text-slate-600">{formatCourses(person.assignedCourses)}</td>
                    <td>
                      <span className={statusClass(person.status)}>{person.status}</span>
                    </td>
                    <td className="relative text-right">
                      <button className="secondary-button h-8 w-8 px-0" type="button" onClick={(event) => openActionMenu(event, person)} aria-label="Open actions">
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

      {editPerson ? (
        <EditPersonModal
          meta={meta}
          courses={courses}
          person={editPerson}
          isSaving={isSaving}
          onCancel={() => setEditPerson(null)}
          onSave={saveEdit}
        />
      ) : null}

      {accessPerson ? <ManageAccessModal meta={meta} type={type} person={accessPerson} isSaving={isSaving} onCancel={() => setAccessPerson(null)} onSave={saveAccess} /> : null}

      {openMenu ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-transparent" type="button" aria-label="Close actions" onClick={closeActionMenu} />
          <div
            className="fixed z-50 w-48 rounded-md border border-slate-200 bg-white p-1 text-left shadow-xl"
            style={{ top: openMenu.top, left: openMenu.left }}
          >
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { setEditPerson(openMenu.person); closeActionMenu(); }}>
              <Pencil size={14} /> Edit
            </button>
            {user.role === 'super_admin' ? <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50" type="button" onClick={() => { setAccessPerson(openMenu.person); closeActionMenu(); }}>
              <ShieldCheck size={14} /> Manage Access
            </button> : null}
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { sendMail(openMenu.person); closeActionMenu(); }}>
              <Mail size={14} /> Send Mail
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { updateStatus(openMenu.person, 'inactive'); closeActionMenu(); }}>
              <UserX size={14} /> Inactive
            </button>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" type="button" onClick={() => { deletePerson(openMenu.person); closeActionMenu(); }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function CreateFacultyPage() {
  return <CreatePeoplePage type="faculty" />;
}

export function ViewFacultyPage() {
  return <ViewPeoplePage type="faculty" />;
}

export function CreateModeratorPage() {
  return <CreatePeoplePage type="moderator" />;
}

export function ViewModeratorPage() {
  return <ViewPeoplePage type="moderator" />;
}
