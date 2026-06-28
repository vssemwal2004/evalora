import { useEffect, useMemo, useState } from 'react';
import { Code2, Eye, FileText, ListChecks, RotateCcw, Save, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function canManage(user) {
  return user?.role === 'super_admin' || user?.permissions?.includes('email.template.manage');
}

function canView(user) {
  return canManage(user) || user?.permissions?.includes('email.template.view');
}

function renderPreview(value) {
  const replacements = {
    appName: 'Evalora',
    recipientName: 'Aarav Sharma',
    recipientEmail: 'student@example.com',
    assessmentTitle: 'BTech Entrance Assessment',
    assessmentCode: 'EVL-2026-DEMO',
    courseName: 'Bachelor of Technology',
    courseId: '(BTECH)',
    startAt: '28 Jun 2026, 10:00 am',
    endAt: '28 Jun 2026, 12:00 pm',
    durationMinutes: '60',
    examId: 'EVL-2026-A1B2C3',
    proctorId: 'PRC-2026-P9Q8R7',
    password: 'TcDXD9cyM4',
    assignedStudents: '42',
    assignedBy: 'Evalora Super Admin',
    reason: 'Please correct two MCQ answers before approval.',
    staffRole: 'Faculty',
    courses: 'BTech (BTECH), BBA (1002)',
    credentialRows:
      '<tr><td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#64748b;">Exam ID</td><td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">EVL-2026-A1B2C3</td></tr><tr><td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#64748b;">Password</td><td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">TcDXD9cyM4</td></tr>',
  };

  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => replacements[key] || '');
}

export function EmailTemplatePage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('html');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = items.find((item) => item.key === selectedKey) || null;
  const editable = canManage(user);

  const filteredItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return items;
    return items.filter((item) => `${item.name} ${item.audience} ${item.key}`.toLowerCase().includes(value));
  }, [items, query]);

  async function loadTemplates(nextKey = selectedKey) {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/email-templates');
      const loaded = response.data.items || [];
      setItems(loaded);
      const key = nextKey && loaded.some((item) => item.key === nextKey) ? nextKey : loaded[0]?.key || '';
      setSelectedKey(key);
      const next = loaded.find((item) => item.key === key) || null;
      setDraft(next ? { ...next } : null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load email templates.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canView(user)) {
      setError('You do not have access to email templates.');
      setIsLoading(false);
      return;
    }

    loadTemplates('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  function selectTemplate(template) {
    setSelectedKey(template.key);
    setDraft({ ...template });
    setNotice('');
    setError('');
  }

  async function saveTemplate() {
    if (!draft || !editable) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.patch(`/email-templates/${draft.key}`, {
        name: draft.name,
        description: draft.description,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        status: draft.status,
      });
      const template = response.data.template;
      setItems((current) => current.map((item) => (item.key === template.key ? template : item)));
      setDraft({ ...template });
      setNotice('Email template saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save email template.');
    } finally {
      setIsSaving(false);
    }
  }

  async function resetTemplate() {
    if (!draft || !editable) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post(`/email-templates/${draft.key}/reset`);
      const template = response.data.template;
      setItems((current) => current.map((item) => (item.key === template.key ? template : item)));
      setDraft({ ...template });
      setNotice('Email template reset to default.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to reset email template.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Email Templates"
        description="Edit the HTML and plain-text templates used for student, proctor, faculty, and moderator mail."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{notice}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="field-label text-brand-600">Template Library</p>
            <div className="search-field mt-3 h-9">
              <Search size={15} className="text-brand-500" />
              <input className="h-8 flex-1 border-0 px-2 text-xs outline-none" placeholder="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          <div className="max-h-[calc(100vh-250px)] space-y-1 overflow-y-auto p-2">
            {isLoading ? (
              <p className="px-3 py-4 text-sm font-semibold text-slate-500">Loading templates...</p>
            ) : filteredItems.length === 0 ? (
              <EmptyState title="No templates" description="No email template matches the current search." />
            ) : (
              filteredItems.map((template) => (
                <button
                  key={template.key}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    selectedKey === template.key ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                  type="button"
                  onClick={() => selectTemplate(template)}
                >
                  <p className="text-sm font-semibold">{template.name}</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase text-slate-400">{template.audience}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        {draft ? (
          <div className="space-y-4">
            <SectionPanel
              title={draft.name}
              description={draft.description}
              icon={FileText}
              actions={editable ? (
                <>
                  <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={resetTemplate} disabled={isSaving}>
                    <RotateCcw size={15} />
                    Reset
                  </button>
                  <button className="primary-button h-9 px-3 text-xs" type="button" onClick={saveTemplate} disabled={isSaving}>
                    <Save size={15} />
                    {isSaving ? 'Saving' : 'Save Template'}
                  </button>
                </>
              ) : null}
            >
              <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_180px]">
                <div>
                  <label className="field-label">Template name</label>
                  <input className="field-input mt-2" value={draft.name} disabled={!editable} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Status</label>
                  <select className="field-input mt-2" value={draft.status} disabled={!editable} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="field-label">Subject</label>
                  <input className="field-input mt-2" value={draft.subject} disabled={!editable} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} />
                </div>
                <div className="lg:col-span-2">
                  <label className="field-label">Description</label>
                  <input className="field-input mt-2" value={draft.description || ''} disabled={!editable} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                </div>
              </div>

              <div className="border-b border-slate-200 p-4">
                <p className="field-label">Available variables</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(draft.variables || []).map((variable) => (
                    <span key={variable} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-500">
                      {'{{'}{variable}{'}}'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid min-h-[520px] gap-0 lg:grid-cols-2">
                <div className="border-r border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                    <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                      {[
                        ['html', 'HTML', Code2],
                        ['text', 'Text', ListChecks],
                      ].map(([key, label, Icon]) => (
                        <button key={key} className={`h-8 rounded px-3 text-xs font-semibold ${activeTab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setActiveTab(key)}>
                          <Icon size={14} className="mr-1 inline" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className="h-[470px] w-full resize-none border-0 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none disabled:bg-slate-800"
                    value={activeTab === 'html' ? draft.html : draft.text}
                    disabled={!editable}
                    spellCheck={false}
                    onChange={(event) => setDraft((current) => ({ ...current, [activeTab]: event.target.value }))}
                  />
                </div>
                <div>
                  <div className="flex h-[49px] items-center gap-2 border-b border-slate-200 px-4">
                    <Eye size={16} className="text-brand-500" />
                    <p className="text-sm font-semibold text-slate-950">Live Preview</p>
                  </div>
                  <div className="h-[470px] overflow-auto bg-slate-100 p-4">
                    <div className="mx-auto max-w-[720px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" dangerouslySetInnerHTML={{ __html: renderPreview(draft.html) }} />
                  </div>
                </div>
              </div>
            </SectionPanel>
          </div>
        ) : (
          <SectionPanel>
            <EmptyState title="Select a template" description={selected ? 'Loading selected template.' : 'Choose an email template from the left side.'} />
          </SectionPanel>
        )}
      </div>
    </section>
  );
}

export default EmailTemplatePage;
