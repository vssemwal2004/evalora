import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronDown, ClipboardCheck, Clock3, FileQuestion, KeyRound, Plus, Search, Send, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { QuestionForm } from '../questions/QuestionForm.jsx';

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not scheduled';
}

function statusClass(status) { return `status-badge status-${status || 'pending'}`; }

function PasswordModal({ item, onClose, onUnlocked }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function unlock(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const response = await api.post(`/work/${item._id}/unlock`, { password }); onUnlocked(response.data.token); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to unlock assigned work.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
    <form className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onSubmit={unlock}>
      <div className="border-b border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-brand-600">Secure assignment</p><h2 className="mt-1 text-xl font-bold text-slate-950">{item.assessmentId.title}</h2></div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 text-sm"><span className="text-slate-500">Course</span><b>{item.courseName}</b><span className="text-slate-500">Code</span><b>{item.assessmentId.assessmentCode}</b><span className="text-slate-500">Deadline</span><b>{formatDate(item.assessmentId.endAt)}</b></div>
        {item.rejectionReason ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Review note: {item.rejectionReason}</div> : null}
        <div><label className="field-label">Assignment password</label><div className="relative mt-2"><KeyRound className="absolute left-3 top-3 text-slate-400" size={17}/><input className="field-input pl-10" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required placeholder="Enter password from email"/></div></div>
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Verifying...' : 'Open assignment'}</button></div>
    </form>
  </div>;
}

export function AssignedWorkPage() {
  const { user } = useAuth(); const navigate = useNavigate(); const [items, setItems] = useState([]); const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { api.get('/work').then((r) => setItems(r.data.items || [])).catch((e) => setError(e.response?.data?.message || 'Unable to load assigned work.')).finally(() => setLoading(false)); }, []);
  const counts = useMemo(() => ({ total: items.length, pending: items.filter((x) => ['assigned','in_progress','rejected','submitted'].includes(x.status)).length, completed: items.filter((x) => x.status === 'approved').length }), [items]);
  const isModerator = user.role === 'moderator';
  function opened(token) { window.sessionStorage.setItem(`evalora_work_${selected._id}`, token); navigate(`/${user.role}/work/${selected._id}`); }
  return <section className="space-y-5">
    <PageHeader eyebrow={isModerator ? 'Moderation' : 'Faculty workspace'} title={isModerator ? 'Assessment Review Queue' : 'Assigned Work'} description={isModerator ? 'Review question sets submitted by faculty and return precise feedback.' : 'Build and submit only the assessment content assigned to you.'}/>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
    <div className="grid gap-3 sm:grid-cols-3">{[['Assigned', counts.total, ClipboardCheck], ['Needs action', counts.pending, Clock3], ['Approved', counts.completed, CheckCircle2]].map(([label,value,Icon]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Icon size={19} className="text-brand-600"/><p className="mt-3 text-2xl font-bold text-slate-950">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>)}</div>
    {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading assigned work...</p> : items.length === 0 ? <EmptyState title="No assigned work" description={isModerator ? 'Faculty submissions will appear here.' : 'New assessment assignments will appear here after an admin publishes them.'}/> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={item._id} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><span className={statusClass(item.status)}>{item.status.replace('_',' ')}</span><span className="text-xs font-bold text-slate-400">{item.assessmentId.assessmentCode}</span></div>
      <h2 className="mt-4 text-lg font-bold text-slate-950">{item.assessmentId.title}</h2><p className="mt-1 text-sm font-semibold text-brand-700">{item.courseName}{item.courseId ? ` · ${item.courseId}` : ''}</p>
      <div className="mt-4 space-y-2 border-y border-slate-100 py-3 text-xs text-slate-500"><p>Starts: <b className="text-slate-700">{formatDate(item.assessmentId.startAt)}</b></p><p>Deadline: <b className="text-slate-700">{formatDate(item.assessmentId.endAt)}</b></p><p>{isModerator ? 'Submitted by' : 'Moderator'}: <b className="text-slate-700">{isModerator ? item.facultyId?.name : item.moderatorId?.name}</b></p></div>
      {item.rejectionReason ? <p className="mt-3 rounded-md bg-red-50 p-2 text-xs font-semibold text-red-700">Rejected: {item.rejectionReason}</p> : null}
      <button className="primary-button mt-4 w-full" type="button" onClick={() => setSelected(item)}><KeyRound size={16}/> {isModerator ? 'Open review' : item.status === 'rejected' ? 'Correct & resubmit' : 'Open workspace'}</button>
    </article>)}</div>}
    {selected ? <PasswordModal item={selected} onClose={() => setSelected(null)} onUnlocked={opened}/> : null}
  </section>;
}

function ImportLibraryModal({ assignmentId, token, onClose, onImported }) {
  const [items, setItems] = useState([]); const [selected, setSelected] = useState([]); const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/library/questions', { params: { limit: 500 } }).then((r) => setItems(r.data.items || [])); }, []);
  const visible = items.filter((q) => `${q.paperHeading} ${q.questionText}`.toLowerCase().includes(search.toLowerCase()));
  async function importItems() { setBusy(true); await api.post(`/work/${assignmentId}/questions/import`, { questionIds: selected }, { headers: { 'x-assignment-token': token } }); setBusy(false); onImported(); }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl"><div className="border-b p-5"><h2 className="text-lg font-bold">Import from my library</h2><div className="relative mt-3"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input className="field-input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search folders or questions"/></div></div><div className="overflow-y-auto p-5"><div className="space-y-2">{visible.map((q) => <label key={q._id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(q._id)} onChange={() => setSelected((x) => x.includes(q._id) ? x.filter((id) => id !== q._id) : [...x,q._id])}/><span><b className="text-sm text-slate-900">{q.questionText}</b><small className="mt-1 block text-slate-500">{q.paperHeading} · {q.type} · {q.difficulty}</small></span></label>)}</div></div><div className="flex justify-end gap-2 border-t bg-slate-50 p-4"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!selected.length || busy} onClick={importItems}>Import {selected.length || ''} question{selected.length === 1 ? '' : 's'}</button></div></div></div>;
}

export function WorkWorkspacePage() {
  const { user } = useAuth(); const { assignmentId } = useParams(); const navigate = useNavigate();
  const token = window.sessionStorage.getItem(`evalora_work_${assignmentId}`); const [data, setData] = useState(null); const [error, setError] = useState(''); const [editing, setEditing] = useState(null); const [importOpen, setImportOpen] = useState(false); const [filters, setFilters] = useState({ type: '', difficulty: '' }); const [expanded, setExpanded] = useState(''); const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const headers = token ? { 'x-assignment-token': token } : {};
  async function load() { if (!token) return navigate(`/${user.role}`, { replace: true }); try { const r = await api.get(`/work/${assignmentId}/details`, { headers }); setData(r.data); } catch (e) { setError(e.response?.data?.message || 'Unable to open assignment.'); } }
  // The assignment id is the lifecycle boundary; load is intentionally recreated with the current unlock token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [assignmentId]);
  const visibleQuestions = (data?.questions || []).filter((q) => (!filters.type || q.type === filters.type) && (!filters.difficulty || q.difficulty === filters.difficulty));
  async function saveQuestion(event) { event.preventDefault(); setBusy(true); try { await api.patch(`/work/${assignmentId}/questions/${editing._id}`, editing, { headers }); setEditing(null); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to update question.'); } finally { setBusy(false); } }
  async function submit() { if (!window.confirm('Send this question set to the moderator for review?')) return; setBusy(true); try { await api.post(`/work/${assignmentId}/submit`, {}, { headers }); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to submit.'); } finally { setBusy(false); } }
  async function decide(decision) { setBusy(true); try { await api.post(`/work/${assignmentId}/decision`, { decision, reason }, { headers }); setRejecting(false); await load(); } catch(e) { setError(e.response?.data?.message || 'Unable to save decision.'); } finally { setBusy(false); } }
  if (!data) return <div className="p-8 text-center text-sm text-slate-500">{error || 'Opening secure workspace...'}</div>;
  const { assignment, assessment, canEdit } = data; const moderator = user.role === 'moderator';
  return <section className="space-y-5">
    <PageHeader eyebrow={moderator ? 'Moderator review' : 'Question authoring'} title={assessment.title} description={`${assignment.courseName}${assignment.courseId ? ` (${assignment.courseId})` : ''} · ${assessment.assessmentCode}`} actions={<button className="secondary-button" onClick={() => navigate(`/${user.role}`)}>Back to assigned work</button>}/>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
    <div className="grid gap-4 lg:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3"><p className="text-xs font-bold uppercase text-slate-400">Instructions</p><p className="mt-2 text-sm leading-6 text-slate-700">{assessment.instructions || assessment.description || 'Prepare a complete, accurate question set for the assigned course.'}</p></div><div className="rounded-xl border border-brand-100 bg-brand-50 p-4"><p className="text-xs font-bold uppercase text-brand-600">Workflow status</p><p className="mt-2 text-lg font-bold capitalize text-slate-950">{assignment.status.replace('_',' ')}</p><p className="mt-1 text-xs text-slate-500">{data.questions.length} questions · {data.questions.reduce((n,q) => n + Number(q.positiveMarks || 0),0)} marks</p></div></div>
    {assignment.rejectionReason ? <div className="rounded-lg border border-red-200 bg-red-50 p-4"><b className="text-red-800">Corrections requested</b><p className="mt-1 text-sm text-red-700">{assignment.rejectionReason}</p></div> : null}
    <SectionPanel title={moderator ? 'Assessment questions' : 'Question set'} description={moderator ? 'Use filters and expand rows to verify answers and options.' : 'Questions can only be created in your personal library and imported here.'} icon={FileQuestion} actions={<div className="flex flex-wrap gap-2">{!moderator && user.permissions.includes('library.create') ? <button className="secondary-button" onClick={() => navigate(`/faculty/library/add?workId=${assignmentId}`)}><Plus size={16}/> Create in Library</button> : null}{!moderator && data.canAdd && user.permissions.includes('library.view') ? <button className="primary-button" onClick={() => setImportOpen(true)}><BookOpen size={16}/> Import from Library</button> : null}<select className="field-input h-9 w-auto" value={filters.type} onChange={(e) => setFilters({...filters,type:e.target.value})}><option value="">All types</option><option value="mcq">MCQ</option><option value="one_word">One word</option></select><select className="field-input h-9 w-auto" value={filters.difficulty} onChange={(e) => setFilters({...filters,difficulty:e.target.value})}><option value="">All difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>}>
      <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>#</th><th>Question</th><th>Type</th><th>Difficulty</th><th>Marks</th><th></th></tr></thead><tbody>{visibleQuestions.map((q,i) => <Fragment key={q._id}>{<tr><td>{i+1}</td><td className="max-w-xl font-semibold text-slate-800">{q.questionText}</td><td className="uppercase">{q.type.replace('_',' ')}</td><td><span className={statusClass(q.difficulty)}>{q.difficulty}</span></td><td>{q.positiveMarks}</td><td><div className="flex gap-1">{canEdit && assignment.status !== 'approved' ? <button className="secondary-button h-8 px-2 text-xs" onClick={() => setEditing({ ...q, alternateAnswers: (q.alternateAnswers || []).join(', '), saveToLibrary: false })}>Edit</button> : null}<button className="secondary-button h-8 w-8 p-0" onClick={() => setExpanded(expanded === q._id ? '' : q._id)}><ChevronDown size={15}/></button></div></td></tr>}{expanded === q._id ? <tr><td colSpan="6"><div className="rounded-lg bg-slate-50 p-4 text-sm">{q.type === 'mcq' ? <div className="grid gap-2 md:grid-cols-2">{q.options.map((o,j) => <p key={o._id || j} className={`rounded border p-2 ${o.isCorrect ? 'border-green-300 bg-green-50 font-semibold text-green-800' : 'border-slate-200'}`}>{String.fromCharCode(65+j)}. {o.text}</p>)}</div> : <p><b>Expected answer:</b> {q.expectedAnswer}</p>}{q.explanation ? <p className="mt-3 text-slate-600"><b>Explanation:</b> {q.explanation}</p> : null}</div></td></tr> : null}</Fragment>)}</tbody></table>{!visibleQuestions.length ? <EmptyState title="No questions found" description="Add questions or change the filters."/> : null}</div>
    </SectionPanel>
    <div className="flex justify-end gap-3">{moderator && assignment.status === 'submitted' ? <><button className="secondary-button border-red-200 text-red-700" onClick={() => setRejecting(true)}><XCircle size={17}/> Reject with reason</button><button className="primary-button bg-green-600 hover:bg-green-700" disabled={busy} onClick={() => decide('approve')}><ShieldCheck size={17}/> Approve assessment</button></> : !moderator && ['assigned','in_progress','rejected'].includes(assignment.status) ? <button className="primary-button" disabled={busy || !data.questions.length} onClick={submit}><Send size={17}/> Submit to moderator</button> : null}</div>
    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 max-w-4xl rounded-xl bg-white p-5 shadow-2xl"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">Edit assessment question</h2><button onClick={() => setEditing(null)}>×</button></div><QuestionForm courses={[{courseName:assignment.courseName,courseId:assignment.courseId}]} value={editing} onChange={setEditing} onSubmit={saveQuestion} isSaving={busy} submitLabel="Update Question"/></div></div> : null}
    {importOpen ? <ImportLibraryModal assignmentId={assignmentId} token={token} onClose={() => setImportOpen(false)} onImported={async () => {setImportOpen(false); await load();}}/> : null}
    {rejecting ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><h2 className="text-lg font-bold">Return for correction</h2><p className="mt-1 text-sm text-slate-500">Give faculty a specific, actionable reason.</p><textarea className="field-input mt-4 min-h-32" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Example: Questions 4 and 8 have duplicate correct options..."/><div className="mt-4 flex justify-end gap-2"><button className="secondary-button" onClick={() => setRejecting(false)}>Cancel</button><button className="primary-button bg-red-600 hover:bg-red-700" disabled={reason.trim().length < 5 || busy} onClick={() => decide('reject')}>Send rejection</button></div></div></div> : null}
  </section>;
}
