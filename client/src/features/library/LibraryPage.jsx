import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { readSheet } from 'read-excel-file/browser';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsxDownload';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const defaultQuestion = {
  type: 'mcq',
  questionText: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
  expectedAnswer: '',
  positiveMarks: 1,
  difficulty: 'medium',
};

function getRoleBase(pathname) {
  if (pathname.startsWith('/faculty')) return '/faculty';
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
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

function normalizeImportRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    type: String(readImportValue(row, ['Question Type', 'Type']) || 'mcq').trim(),
    questionText: String(readImportValue(row, ['Question Text', 'Question']) || '').trim(),
    optionA: String(readImportValue(row, ['Option A']) || '').trim(),
    optionB: String(readImportValue(row, ['Option B']) || '').trim(),
    optionC: String(readImportValue(row, ['Option C']) || '').trim(),
    optionD: String(readImportValue(row, ['Option D']) || '').trim(),
    correctOption: String(readImportValue(row, ['Correct Option']) || '').trim(),
    expectedAnswer: String(readImportValue(row, ['Expected Answer', 'Answer']) || '').trim(),
    positiveMarks: Number(readImportValue(row, ['Marks', 'Positive Marks']) || 1),
    difficulty: String(readImportValue(row, ['Difficulty']) || 'medium').trim(),
  }));
}

function updateOption(options, index, field, value) {
  return options.map((option, optionIndex) =>
    optionIndex === index
      ? { ...option, [field]: value }
      : field === 'isCorrect' && value
        ? { ...option, isCorrect: false }
        : option
  );
}

function makeEditableQuestion(question = {}) {
  return {
    paperHeading: question.paperHeading || '',
    type: question.type || 'mcq',
    questionText: question.questionText || '',
    options: question.options?.length ? question.options.map((option) => ({ text: option.text || '', isCorrect: Boolean(option.isCorrect) })) : defaultQuestion.options,
    expectedAnswer: question.expectedAnswer || '',
    positiveMarks: question.positiveMarks || 1,
    difficulty: question.difficulty || 'medium',
  };
}

function ModalShell({ title, description, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-base font-semibold text-slate-950">{title}</p>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AddLibraryQuestionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get('assessmentId') || '';
  const source = searchParams.get('source') || 'both';
  const workId = searchParams.get('workId') || '';
  const roleBase = getRoleBase(location.pathname);
  const [paperHeading, setPaperHeading] = useState('');
  const [mode, setMode] = useState('single');
  const [question, setQuestion] = useState(defaultQuestion);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkValidating, setIsBulkValidating] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const readyRows = bulkPreview.filter((row) => row.canSave && row.decision !== 'skip').length;
  const canContinueToAssessment = Boolean(assessmentId && paperHeading.trim() && bulkResult);

  function updateQuestion(field, value) {
    setQuestion((current) => ({ ...current, [field]: value }));
  }

  function updateQuestionOption(index, field, value) {
    setQuestion((current) => ({
      ...current,
      options: updateOption(current.options, index, field, value),
    }));
  }

  async function saveSingleQuestion(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api.post('/library/questions', {
        ...question,
        paperHeading,
        negativeMarks: 0,
      });
      setQuestion(defaultQuestion);
      setBulkResult({ summary: { created: 1, skipped: 0 }, items: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save library question.');
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTemplate() {
    await downloadXlsx(
      [
        [
          { value: 'Question Type', fontWeight: 'bold' },
          { value: 'Question Text', fontWeight: 'bold' },
          { value: 'Option A', fontWeight: 'bold' },
          { value: 'Option B', fontWeight: 'bold' },
          { value: 'Option C', fontWeight: 'bold' },
          { value: 'Option D', fontWeight: 'bold' },
          { value: 'Correct Option', fontWeight: 'bold' },
          { value: 'Expected Answer', fontWeight: 'bold' },
          { value: 'Marks', fontWeight: 'bold' },
          { value: 'Difficulty', fontWeight: 'bold' },
        ],
        [
          { value: 'mcq' },
          { value: 'Which option is correct?' },
          { value: 'Option one' },
          { value: 'Option two' },
          { value: 'Option three' },
          { value: 'Option four' },
          { value: 'A' },
          { value: '' },
          { value: 1 },
          { value: 'medium' },
        ],
        [
          { value: 'one_word' },
          { value: 'Enter the short answer' },
          { value: '' },
          { value: '' },
          { value: '' },
          { value: '' },
          { value: '' },
          { value: 'Answer' },
          { value: 1 },
          { value: 'easy' },
        ],
      ],
      `evalora-question-template-${paperHeading || 'paper'}.xlsx`
    );
  }

  async function validateRows(rows) {
    setIsBulkValidating(true);
    setError('');
    setBulkResult(null);

    try {
      const response = await api.post('/library/questions/validate', { paperHeading, rows });
      setBulkPreview(response.data.items);
      setBulkSummary(response.data.summary);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to validate question file.');
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
      await validateRows(normalizeImportRows(sheetRowsToObjects(rows)));
    } catch {
      setError('Unable to read Excel file. Please use the provided template.');
    }
  }

  async function saveBulkRows() {
    setIsBulkSaving(true);
    setError('');

    try {
      const response = await api.post('/library/questions/bulk', { paperHeading, rows: bulkPreview });
      setBulkResult(response.data);
      setBulkPreview([]);
      setBulkSummary(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save imported questions.');
    } finally {
      setIsBulkSaving(false);
    }
  }

  function continueToAssessmentMapping() {
    if (!assessmentId || !paperHeading.trim()) return;
    navigate(
      `${roleBase}/assessments/create?draftId=${assessmentId}&step=questions&source=${source}&folders=${encodeURIComponent(paperHeading.trim())}`,
      { replace: true }
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Question Library"
        title="Add Questions"
        description="Create a paper heading first, then add MCQ or one-word questions manually or from Excel."
        actions={
          workId ? (
            <button className="secondary-button" type="button" onClick={() => navigate(`/faculty/work/${workId}`)}>
              <CheckCircle2 size={16} className="text-brand-500" />
              Back to Assessment
            </button>
          ) : assessmentId ? (
            <button className="secondary-button" type="button" onClick={continueToAssessmentMapping} disabled={!canContinueToAssessment}>
              <CheckCircle2 size={16} className="text-brand-500" />
              Continue to Course Mapping
            </button>
          ) : null
        }
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <SectionPanel title="Paper Heading" description="This heading becomes the folder shown in View Library." icon={BookOpen}>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_260px]">
          <div>
            <label className="field-label">Question paper heading</label>
            <input
              className="field-input mt-2"
              value={paperHeading}
              onChange={(event) => setPaperHeading(event.target.value)}
              placeholder="Example: BTech Phase 10"
            />
          </div>
          <div>
            <label className="field-label">Add method</label>
            <select className="field-input mt-2" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="single">Add single question</option>
              <option value="excel">Add from Excel</option>
            </select>
          </div>
        </div>
      </SectionPanel>

      {mode === 'single' ? (
        <SectionPanel title="Single Question" description="Library stores per-question marks only. Negative marking is controlled from assessment settings." icon={Plus}>
          <form className="space-y-4 p-5" onSubmit={saveSingleQuestion}>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="field-label">Question type</label>
                <select className="field-input mt-2" value={question.type} onChange={(event) => updateQuestion('type', event.target.value)}>
                  <option value="mcq">MCQ</option>
                  <option value="one_word">One-word</option>
                </select>
              </div>
              <div>
                <label className="field-label">Marks</label>
                <input className="field-input mt-2" type="number" min="0" value={question.positiveMarks} onChange={(event) => updateQuestion('positiveMarks', event.target.value)} />
              </div>
              <div>
                <label className="field-label">Difficulty</label>
                <select className="field-input mt-2" value={question.difficulty} onChange={(event) => updateQuestion('difficulty', event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">Question</label>
              <textarea className="field-input mt-2 h-28 py-3" value={question.questionText} onChange={(event) => updateQuestion('questionText', event.target.value)} />
            </div>

            {question.type === 'mcq' ? (
              <div className="space-y-2">
                <label className="field-label">Options and correct solution</label>
                {question.options.map((option, index) => (
                  <div className="grid gap-2 md:grid-cols-[42px_1fr]" key={index}>
                    <label className="grid h-10 place-items-center rounded-md border border-slate-300 bg-slate-50">
                      <input type="radio" checked={option.isCorrect} onChange={() => updateQuestionOption(index, 'isCorrect', true)} />
                    </label>
                    <input className="field-input" value={option.text} onChange={(event) => updateQuestionOption(index, 'text', event.target.value)} placeholder={`Option ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <label className="field-label">Expected answer</label>
                <input className="field-input mt-2" value={question.expectedAnswer} onChange={(event) => updateQuestion('expectedAnswer', event.target.value)} />
              </div>
            )}

            <button className="primary-button" type="submit" disabled={isSaving || !paperHeading.trim()}>
              <Plus size={16} />
              {isSaving ? 'Saving' : 'Save Question'}
            </button>
          </form>
        </SectionPanel>
      ) : (
        <SectionPanel title="Excel Questions" description="Use the template for MCQ and one-word questions under the selected heading." icon={FileSpreadsheet}>
          <div className="flex flex-wrap gap-3 p-5">
            <button className="secondary-button" type="button" onClick={downloadTemplate} disabled={!paperHeading.trim()}>
              <Download size={16} className="text-brand-500" />
              Download Template
            </button>
            <label className={`secondary-button ${!paperHeading.trim() ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <UploadCloud size={16} className="text-brand-500" />
              {isBulkValidating ? 'Reading File...' : 'Upload Excel'}
              <input className="hidden" type="file" accept=".xlsx" onChange={handleFile} disabled={!paperHeading.trim()} />
            </label>
          </div>
        </SectionPanel>
      )}

      {bulkPreview.length > 0 ? (
        <SectionPanel
          title="Import Review"
          description="Review question rows before saving into the library folder."
          icon={FileSpreadsheet}
          actions={<button className="primary-button" type="button" onClick={saveBulkRows} disabled={readyRows === 0 || isBulkSaving}>
            <CheckCircle2 size={16} />
            {isBulkSaving ? 'Saving...' : `Save ${readyRows} Questions`}
          </button>}
        >
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-4">
            <div><p className="field-label">Rows</p><p className="mt-1 text-xl font-semibold text-slate-950">{bulkSummary?.total || 0}</p></div>
            <div><p className="field-label">Ready</p><p className="mt-1 text-xl font-semibold text-green-700">{readyRows}</p></div>
            <div><p className="field-label">MCQ</p><p className="mt-1 text-xl font-semibold text-slate-950">{bulkSummary?.mcq || 0}</p></div>
            <div><p className="field-label">Errors</p><p className="mt-1 text-xl font-semibold text-red-700">{bulkSummary?.errors || 0}</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Marks</th>
                  <th>Decision</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bulkPreview.map((row) => (
                  <tr key={`${row.rowNumber}-${row.questionText}`}>
                    <td className="font-semibold text-slate-700">{row.rowNumber}</td>
                    <td className="max-w-[420px]"><p className="line-clamp-2 font-semibold text-slate-950">{row.questionText || '-'}</p></td>
                    <td>{row.type === 'one_word' ? 'One-word' : 'MCQ'}</td>
                    <td>{row.positiveMarks}</td>
                    <td>
                      <select className="field-input min-w-[120px]" value={row.decision} onChange={(event) => setBulkPreview((current) => current.map((item) => item.rowNumber === row.rowNumber ? { ...item, decision: event.target.value } : item))} disabled={!row.canSave}>
                        {row.allowedDecisions.map((decision) => <option key={decision} value={decision}>{decision}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[260px] text-xs leading-5 text-slate-500">{row.issues.length > 0 ? row.issues.join(' ') : 'Ready'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ) : null}

      {bulkResult ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          <span>Saved {bulkResult.summary?.created || 0} question(s). Skipped {bulkResult.summary?.skipped || 0}.</span>
          {assessmentId ? (
            <button className="primary-button h-9 px-3 text-xs" type="button" onClick={continueToAssessmentMapping}>
              Continue to Course Mapping
            </button>
          ) : workId ? (
            <button className="primary-button h-9 px-3 text-xs" type="button" onClick={() => navigate(`/faculty/work/${workId}`)}>
              Return to Assessment & Import
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ViewLibraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get('assessmentId') || '';
  const source = searchParams.get('source') || 'both';
  const roleBase = getRoleBase(location.pathname);
  const isAssessmentSelectMode = Boolean(assessmentId);
  const [selectedHeadings, setSelectedHeadings] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [appliedGroupSearch, setAppliedGroupSearch] = useState('');
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [error, setError] = useState('');
  const [openFolderMenu, setOpenFolderMenu] = useState('');
  const [folderMenuPosition, setFolderMenuPosition] = useState({ top: 0, left: 0 });
  const [folderAction, setFolderAction] = useState(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [isActing, setIsActing] = useState(false);

  function beginFolderEdit(group) {
    setFolderDraft(group.paperHeading);
    setFolderAction({ type: 'edit', group });
    setOpenFolderMenu('');
    setError('');
  }

  function beginFolderDelete(group) {
    setFolderAction({ type: 'delete', group });
    setOpenFolderMenu('');
    setError('');
  }

  function toggleFolderMenu(event, folderKey) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 96;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setFolderMenuPosition({ top, left });
    setOpenFolderMenu((current) => (current === folderKey ? '' : folderKey));
  }

  const loadGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    setError('');
    try {
      const response = await api.get('/library/groups', { params: { search: appliedGroupSearch || undefined, source } });
      setGroups(response.data.items);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load library folders.');
    } finally {
      setIsLoadingGroups(false);
    }
  }, [appliedGroupSearch, source]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function renameFolder(event) {
    event.preventDefault();
    if (!folderAction?.group || !folderDraft.trim()) return;

    setIsActing(true);
    setError('');

    try {
      const response = await api.patch('/library/groups', {
        currentHeading: folderAction.group.paperHeading,
        nextHeading: folderDraft,
      });
      const renamedGroup = {
        ...folderAction.group,
        paperHeading: response.data.paperHeading,
      };
      setGroups((current) => current.map((group) => (group.paperHeading === folderAction.group.paperHeading ? renamedGroup : group)));
      setFolderAction(null);
      setFolderDraft('');
      await loadGroups();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to rename library folder.');
    } finally {
      setIsActing(false);
    }
  }

  async function deleteFolder() {
    if (!folderAction?.group) return;

    setIsActing(true);
    setError('');

    try {
      await api.delete('/library/groups', { data: { paperHeading: folderAction.group.paperHeading } });
      setGroups((current) => current.filter((group) => group.paperHeading !== folderAction.group.paperHeading));
      setFolderAction(null);
      await loadGroups();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete library folder.');
    } finally {
      setIsActing(false);
    }
  }

  function openFolder(group) {
    setOpenFolderMenu('');
    if (isAssessmentSelectMode) {
      setSelectedHeadings((current) =>
        current.includes(group.paperHeading)
          ? current.filter((heading) => heading !== group.paperHeading)
          : [...current, group.paperHeading]
      );
      return;
    }

    navigate(`questions?heading=${encodeURIComponent(group.paperHeading)}`, { relative: 'path' });
  }

  function continueWithSelectedFolders() {
    if (!assessmentId || selectedHeadings.length === 0) return;
    navigate(
      `${roleBase}/assessments/create?draftId=${assessmentId}&step=questions&source=${source}&folders=${encodeURIComponent(selectedHeadings.join('||'))}`,
      { replace: true }
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Question Library"
        title={isAssessmentSelectMode ? 'Select Library Folders' : 'View Library'}
        description={
          isAssessmentSelectMode
            ? 'Select one or more paper folders. Evalora will return to the assessment builder with those folders ready for course mapping.'
            : 'Library is organized as scalable heading folders. Open any heading to manage its questions on a separate table page.'
        }
        actions={
          isAssessmentSelectMode ? (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={() => navigate(`${roleBase}/library/add?assessmentId=${assessmentId}&source=${source}`)}
              >
                <Plus size={16} className="text-brand-500" />
                Create New Heading
              </button>
              <button className="primary-button" type="button" onClick={continueWithSelectedFolders} disabled={selectedHeadings.length === 0}>
                <CheckCircle2 size={16} />
                Add {selectedHeadings.length || ''} Folder{selectedHeadings.length === 1 ? '' : 's'}
              </button>
            </>
          ) : null
        }
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <SectionPanel
        title="Paper Folders"
        description={
          isAssessmentSelectMode
            ? 'Search and select folders. Course mapping will happen back inside Create Assessment.'
            : 'Search, scan, and open paper headings without loading question rows on this page.'
        }
        icon={BookOpen}
      >
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input className="h-10 flex-1 border-0 px-2 text-sm outline-none" placeholder="Search heading" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} />
          </div>
          <button className="secondary-button" type="button" onClick={() => setAppliedGroupSearch(groupSearch)}>
            <ListFilter size={16} className="text-brand-500" />
            Apply
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Heading</th>
                <th>Questions</th>
                <th>MCQ</th>
                <th>One-word</th>
                <th>Marks</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoadingGroups ? (
                <tr><td className="text-center text-slate-500" colSpan={7}>Loading library headings...</td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No library folders found" description="Add questions under a paper heading to create folders." /></td></tr>
              ) : (
                groups.map((group) => (
                  <tr key={group.paperHeading}>
                    <td className="min-w-[320px]">
                      <button className="text-left text-sm font-semibold text-slate-950 hover:text-brand-600" type="button" onClick={() => openFolder(group)}>
                        {group.paperHeading}
                      </button>
                      {isAssessmentSelectMode && selectedHeadings.includes(group.paperHeading) ? (
                        <span className="ml-3 status-badge status-active">Selected</span>
                      ) : null}
                    </td>
                    <td><span className="status-badge status-active">{group.count}</span></td>
                    <td>{group.mcqCount || 0}</td>
                    <td>{group.oneWordCount || 0}</td>
                    <td>{group.totalMarks || 0}</td>
                    <td className="text-slate-500">{new Date(group.lastUpdatedAt).toLocaleString()}</td>
                    <td className="relative">
                      {isAssessmentSelectMode ? (
                        <button
                          className={selectedHeadings.includes(group.paperHeading) ? 'secondary-button h-9 px-3 text-xs' : 'primary-button h-9 px-3 text-xs'}
                          type="button"
                          onClick={() => openFolder(group)}
                        >
                          {selectedHeadings.includes(group.paperHeading) ? 'Remove' : 'Select'}
                        </button>
                      ) : (
                        <>
                          <button
                            className="secondary-button h-8 w-8 px-0"
                            type="button"
                            aria-label={`Actions for ${group.paperHeading}`}
                            onClick={(event) => toggleFolderMenu(event, group.paperHeading)}
                          >
                            <MoreHorizontal size={15} className="text-brand-500" />
                          </button>
                          {openFolderMenu === group.paperHeading ? (
                            <div
                              className="fixed z-50 w-36 rounded-md border border-slate-200 bg-white py-1 shadow-xl"
                              style={{ top: folderMenuPosition.top, left: folderMenuPosition.left }}
                            >
                              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50" type="button" onClick={() => beginFolderEdit(group)}>
                                <Pencil size={14} className="text-brand-500" />
                                Edit
                              </button>
                              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50" type="button" onClick={() => beginFolderDelete(group)}>
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {folderAction?.type === 'edit' ? (
        <ModalShell title="Edit Folder Heading" description="Heading names must be unique inside the library. Existing questions will stay inside the renamed folder.">
          <form className="space-y-4 p-5" onSubmit={renameFolder}>
            <div>
              <label className="field-label">Folder heading</label>
              <input className="field-input mt-2" value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} autoFocus />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="secondary-button" type="button" onClick={() => setFolderAction(null)} disabled={isActing}>Cancel</button>
              <button className="primary-button" type="submit" disabled={isActing || !folderDraft.trim()}>
                <Pencil size={16} />
                {isActing ? 'Saving...' : 'Save Heading'}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {folderAction?.type === 'delete' ? (
        <ModalShell title="Delete Library Folder" description="This will archive every active question inside this folder and remove it from View Library.">
          <div className="space-y-4 p-5">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Are you sure you want to delete "{folderAction.group.paperHeading}"?
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="secondary-button" type="button" onClick={() => setFolderAction(null)} disabled={isActing}>Cancel</button>
              <button className="flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={deleteFolder} disabled={isActing}>
                <Trash2 size={16} />
                {isActing ? 'Deleting...' : 'Delete Folder'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

export function LibraryFolderQuestionsPage() {
  const [searchParams] = useSearchParams();
  const paperHeading = searchParams.get('heading') || '';
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ search: '', type: '', difficulty: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [expandedQuestionId, setExpandedQuestionId] = useState('');
  const [expandedDetailId, setExpandedDetailId] = useState('');
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [error, setError] = useState('');
  const [openQuestionMenu, setOpenQuestionMenu] = useState('');
  const [questionMenuPosition, setQuestionMenuPosition] = useState({ top: 0, left: 0 });
  const [questionAction, setQuestionAction] = useState(null);
  const [questionDraft, setQuestionDraft] = useState(makeEditableQuestion());
  const [isActing, setIsActing] = useState(false);

  const visibleMarks = questions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0);
  const visibleMcq = questions.filter((question) => question.type === 'mcq').length;
  const visibleOneWord = questions.filter((question) => question.type === 'one_word').length;

  function beginQuestionEdit(question) {
    setQuestionDraft(makeEditableQuestion(question));
    setQuestionAction({ type: 'edit', question });
    setOpenQuestionMenu('');
    setError('');
  }

  function beginQuestionDelete(question) {
    setQuestionAction({ type: 'delete', question });
    setOpenQuestionMenu('');
    setError('');
  }

  function toggleQuestionMenu(event, questionId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 96;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setQuestionMenuPosition({ top, left });
    setOpenQuestionMenu((current) => (current === questionId ? '' : questionId));
  }

  function updateQuestionDraft(field, value) {
    setQuestionDraft((current) => ({
      ...current,
      [field]: value,
      options: field === 'type' && value === 'mcq' && current.options.length === 0 ? defaultQuestion.options : current.options,
    }));
  }

  function updateQuestionDraftOption(index, field, value) {
    setQuestionDraft((current) => ({
      ...current,
      options: updateOption(current.options, index, field, value),
    }));
  }

  const loadQuestions = useCallback(async () => {
    if (!paperHeading) {
      setQuestions([]);
      return;
    }

    setIsLoadingQuestions(true);
    setError('');
    try {
      const response = await api.get('/library/questions', {
        params: {
          paperHeading,
          search: appliedFilters.search || undefined,
          type: appliedFilters.type || undefined,
          difficulty: appliedFilters.difficulty || undefined,
          limit: 500,
        },
      });
      setQuestions(response.data.items);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load folder questions.');
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [appliedFilters, paperHeading]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  async function updateQuestion(event) {
    event.preventDefault();
    if (!questionAction?.question) return;

    setIsActing(true);
    setError('');

    try {
      await api.patch(`/library/questions/${questionAction.question._id}`, questionDraft);
      setQuestionAction(null);
      setQuestionDraft(makeEditableQuestion());
      await loadQuestions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update library question.');
    } finally {
      setIsActing(false);
    }
  }

  async function deleteQuestion() {
    if (!questionAction?.question) return;

    setIsActing(true);
    setError('');

    try {
      await api.delete(`/library/questions/${questionAction.question._id}`);
      setExpandedQuestionId((current) => (current === questionAction.question._id ? '' : current));
      setExpandedDetailId((current) => (current === questionAction.question._id ? '' : current));
      setQuestionAction(null);
      await loadQuestions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete library question.');
    } finally {
      setIsActing(false);
    }
  }

  return (
    <section className="space-y-5">
      <Link className="secondary-button w-fit" to=".." relative="path">
        <ArrowLeft size={16} className="text-brand-500" />
        Back to Library
      </Link>

      <PageHeader
        eyebrow="Question Library"
        title={paperHeading || 'Questions'}
        description="Manage this heading on a dedicated table page built for large question sets."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {!paperHeading ? (
        <SectionPanel title="Missing Heading" description="Open a paper heading from View Library to manage questions." icon={BookOpen}>
          <div className="p-5">
            <EmptyState title="No heading selected" description="Return to View Library and open a question paper heading." />
          </div>
        </SectionPanel>
      ) : (
        <SectionPanel title="Question Table" description="Search and edit questions for this heading without mixing folder navigation on the same page." icon={BookOpen}>
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-4">
            <div><p className="field-label">Visible Questions</p><p className="mt-1 text-xl font-semibold text-slate-950">{questions.length}</p></div>
            <div><p className="field-label">MCQ</p><p className="mt-1 text-xl font-semibold text-slate-950">{visibleMcq}</p></div>
            <div><p className="field-label">One-word</p><p className="mt-1 text-xl font-semibold text-slate-950">{visibleOneWord}</p></div>
            <div><p className="field-label">Visible Marks</p><p className="mt-1 text-xl font-semibold text-slate-950">{visibleMarks}</p></div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 px-4 py-3 md:grid-cols-[1fr_180px_180px_auto]">
            <div className="search-field">
              <Search size={16} className="text-brand-500" />
              <input className="h-10 flex-1 border-0 px-2 text-sm outline-none" placeholder="Search question" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </div>
            <select className="field-input" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
              <option value="">All types</option>
              <option value="mcq">MCQ</option>
              <option value="one_word">One-word</option>
            </select>
            <select className="field-input" value={filters.difficulty} onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}>
              <option value="">All difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => setAppliedFilters(filters)}>
              Apply
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Marks</th>
                  <th>Difficulty</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoadingQuestions ? (
                  <tr><td className="text-center text-slate-500" colSpan={7}>Loading questions...</td></tr>
                ) : questions.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No questions found" description="Adjust filters or add questions to this heading." /></td></tr>
                ) : (
                  questions.map((question) => (
                    <tr key={question._id}>
                      <td>
                        <button className="secondary-button h-8 w-8 px-0" type="button" onClick={() => setExpandedQuestionId((current) => current === question._id ? '' : question._id)}>
                          {expandedQuestionId === question._id ? <ChevronDown size={15} className="text-brand-500" /> : <ChevronRight size={15} className="text-brand-500" />}
                        </button>
                      </td>
                      <td className="max-w-[640px]">
                        <p className="line-clamp-2 font-semibold text-slate-950">{question.questionText}</p>
                        {expandedQuestionId === question._id ? (
                          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm leading-6 text-slate-700">{question.questionText}</p>
                            <button className="secondary-button mt-3 h-8 px-2 text-xs" type="button" onClick={() => setExpandedDetailId((current) => current === question._id ? '' : question._id)}>
                              {expandedDetailId === question._id ? 'Hide deep details' : 'Show deep details'}
                            </button>
                            {expandedDetailId === question._id ? (
                              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                                {question.type === 'mcq' ? (
                                  <div className="space-y-1">
                                    {question.options.map((option, index) => (
                                      <p key={option._id || index} className={option.isCorrect ? 'font-semibold text-green-700' : ''}>
                                        {index + 1}. {option.text} {option.isCorrect ? '(correct)' : ''}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p><span className="font-semibold">Expected answer:</span> {question.expectedAnswer}</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td>{question.type === 'one_word' ? 'One-word' : 'MCQ'}</td>
                      <td>{question.positiveMarks}</td>
                      <td className="capitalize">{question.difficulty}</td>
                      <td className="text-slate-500">{new Date(question.createdAt).toLocaleString()}</td>
                      <td className="relative">
                        <button
                          className="secondary-button h-8 w-8 px-0"
                          type="button"
                          aria-label={`Actions for question ${question._id}`}
                          onClick={(event) => toggleQuestionMenu(event, question._id)}
                        >
                          <MoreHorizontal size={15} className="text-brand-500" />
                        </button>
                        {openQuestionMenu === question._id ? (
                          <div
                            className="fixed z-50 w-36 rounded-md border border-slate-200 bg-white py-1 shadow-xl"
                            style={{ top: questionMenuPosition.top, left: questionMenuPosition.left }}
                          >
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50" type="button" onClick={() => beginQuestionEdit(question)}>
                              <Pencil size={14} className="text-brand-500" />
                              Edit
                            </button>
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50" type="button" onClick={() => beginQuestionDelete(question)}>
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
      )}

      {questionAction?.type === 'edit' ? (
        <ModalShell title="Edit Question" description="Question text must be unique inside the selected folder.">
          <form className="max-h-[82vh] space-y-4 overflow-y-auto p-5" onSubmit={updateQuestion}>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="field-label">Question type</label>
                <select className="field-input mt-2" value={questionDraft.type} onChange={(event) => updateQuestionDraft('type', event.target.value)}>
                  <option value="mcq">MCQ</option>
                  <option value="one_word">One-word</option>
                </select>
              </div>
              <div>
                <label className="field-label">Marks</label>
                <input className="field-input mt-2" type="number" min="0" value={questionDraft.positiveMarks} onChange={(event) => updateQuestionDraft('positiveMarks', event.target.value)} />
              </div>
              <div>
                <label className="field-label">Difficulty</label>
                <select className="field-input mt-2" value={questionDraft.difficulty} onChange={(event) => updateQuestionDraft('difficulty', event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">Question</label>
              <textarea className="field-input mt-2 h-28 py-3" value={questionDraft.questionText} onChange={(event) => updateQuestionDraft('questionText', event.target.value)} />
            </div>

            {questionDraft.type === 'mcq' ? (
              <div className="space-y-2">
                <label className="field-label">Options and correct solution</label>
                {questionDraft.options.map((option, index) => (
                  <div className="grid gap-2 md:grid-cols-[42px_1fr]" key={index}>
                    <label className="grid h-10 place-items-center rounded-md border border-slate-300 bg-slate-50">
                      <input type="radio" checked={option.isCorrect} onChange={() => updateQuestionDraftOption(index, 'isCorrect', true)} />
                    </label>
                    <input className="field-input" value={option.text} onChange={(event) => updateQuestionDraftOption(index, 'text', event.target.value)} placeholder={`Option ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <label className="field-label">Expected answer</label>
                <input className="field-input mt-2" value={questionDraft.expectedAnswer} onChange={(event) => updateQuestionDraft('expectedAnswer', event.target.value)} />
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="secondary-button" type="button" onClick={() => setQuestionAction(null)} disabled={isActing}>Cancel</button>
              <button className="primary-button" type="submit" disabled={isActing}>
                <Pencil size={16} />
                {isActing ? 'Saving...' : 'Save Question'}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {questionAction?.type === 'delete' ? (
        <ModalShell title="Delete Question" description="This question will be archived and removed from the active library folder.">
          <div className="space-y-4 p-5">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Are you sure you want to delete this question?
            </div>
            <p className="line-clamp-3 text-sm font-semibold text-slate-800">{questionAction.question.questionText}</p>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="secondary-button" type="button" onClick={() => setQuestionAction(null)} disabled={isActing}>Cancel</button>
              <button className="flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={deleteQuestion} disabled={isActing}>
                <Trash2 size={16} />
                {isActing ? 'Deleting...' : 'Delete Question'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

export function LibraryPage() {
  return <ViewLibraryPage />;
}
