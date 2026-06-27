import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, KeyRound, Mail, MoreHorizontal, Plus, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  department: '',
};

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

export function AssessmentProctorsPage({ assessmentId: assessmentIdProp, embedded = false } = {}) {
  const params = useParams();
  const assessmentId = assessmentIdProp || params.assessmentId;
  const [assessment, setAssessment] = useState(null);
  const [proctors, setProctors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [capacity, setCapacity] = useState(50);
  const [plan, setPlan] = useState(null);
  const [createdCredential, setCreatedCredential] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [sendingMailId, setSendingMailId] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState('');
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState(embedded ? 'add' : 'directory');

  const loadAssessment = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}`);
    setAssessment(response.data.assessment);
  }, [assessmentId]);

  const loadProctors = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}/proctors`);
    setProctors(response.data.items);
    setSummary(response.data.summary);
  }, [assessmentId]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [assessmentResponse, proctorResponse] = await Promise.all([
          api.get(`/assessments/${assessmentId}`),
          api.get(`/assessments/${assessmentId}/proctors`),
        ]);
        if (!ignore) {
          setAssessment(assessmentResponse.data.assessment);
          setProctors(proctorResponse.data.items);
          setSummary(proctorResponse.data.summary);
        }
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load proctors.');
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

  function toggleActionMenu(event, proctorId) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 132;
    const gap = 8;
    const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + gap;
    const top = hasRoomBelow ? rect.bottom + gap : Math.max(gap, rect.top - menuHeight - gap);
    const left = Math.min(Math.max(gap, rect.right - menuWidth), window.innerWidth - menuWidth - gap);

    setActionMenuPosition({ top, left });
    setOpenActionMenu((current) => (current === proctorId ? '' : proctorId));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    setCreatedCredential(null);

    try {
      const response = await api.post(`/assessments/${assessmentId}/proctors`, form);
      setCreatedCredential(response.data.proctor);
      setForm(initialForm);
      await Promise.all([loadProctors(), loadAssessment()]);
      setActiveView('directory');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to add proctor.');
    } finally {
      setIsSaving(false);
    }
  }

  async function calculatePlan() {
    setError('');
    try {
      const response = await api.post(`/assessments/${assessmentId}/proctors/distribution-plan`, { capacity });
      setPlan(response.data.plan);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to calculate distribution plan.');
    }
  }

  async function autoAssign() {
    setError('');
    setIsAssigning(true);
    try {
      const response = await api.post(`/assessments/${assessmentId}/proctors/auto-assign`, { capacity });
      setPlan(response.data.plan);
      await loadProctors();
      setActiveView('directory');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to auto-assign students.');
      if (requestError.response?.data?.plan) setPlan(requestError.response.data.plan);
    } finally {
      setIsAssigning(false);
    }
  }

  async function sendMail(proctor) {
    if (['sent', 'resent'].includes(proctor.mailStatus)) {
      return;
    }

    setSendingMailId(proctor._id);
    setError('');
    setOpenActionMenu('');
    try {
      await api.post(`/assessments/${assessmentId}/proctors/${proctor._id}/send-mail`);
      await loadProctors();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send proctor mail.');
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

  return (
    <section className="space-y-5">
      {!embedded ? (
        <PageHeader
          eyebrow="Assessment Proctors"
          title={assessment?.title || 'Proctors'}
          description="Manage proctor credentials, assignment capacity, mail delivery, and student load from one dedicated page."
        />
      ) : null}

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {createdCredential ? (
        <div className="border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-slate-800">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <KeyRound size={16} className="text-brand-600" />
            Generated proctor credential
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <p>
              Proctor ID: <span className="font-semibold">{createdCredential.generatedProctorId}</span>
            </p>
            <p>
              Password: <span className="font-semibold">{createdCredential.passwordPreview}</span>
            </p>
            <p>
              Email: <span className="font-semibold">{createdCredential.email}</span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div>
          <p className="field-label text-brand-600">Proctor Phase</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            {activeView === 'add' ? 'Add proctors and plan student distribution.' : 'View proctors, credentials, assigned students, and mail status.'}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
          {[
            ['add', 'Add Proctor'],
            ['directory', 'Proctor Directory'],
          ].map(([view, label]) => (
            <button
              key={view}
              className={`h-8 rounded px-3 text-xs font-semibold transition ${activeView === view ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              type="button"
              onClick={() => setActiveView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={embedded ? 'space-y-4' : 'space-y-5'}>
        {activeView === 'add' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionPanel title="Add Proctor" description="Creates one unique proctor credential." icon={UserRoundCheck}>
              <form className="space-y-3 p-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="field-label">Proctor name</label>
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
                <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="field-label">Phone</label>
                  <input className="field-input mt-2" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} />
                </div>
                <div>
                  <label className="field-label">Department</label>
                  <input
                    className="field-input mt-2"
                    value={form.department}
                    onChange={(event) => updateForm('department', event.target.value)}
                  />
                </div>
                </div>
                <button className="primary-button w-full" type="submit" disabled={isSaving}>
                  <Plus size={16} />
                  {isSaving ? 'Adding proctor' : 'Add Proctor'}
                </button>
              </form>
            </SectionPanel>

            <SectionPanel title="Auto Assignment" description="Plan student distribution before committing." icon={ShieldCheck}>
              <div className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="field-label">Students per proctor</label>
                  <input
                    className="field-input mt-2"
                    type="number"
                    min="1"
                    max="50"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                  <p className="mt-2 text-xs text-slate-500">Recommended maximum is 50 students per proctor.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 self-end">
                  <button className="secondary-button px-3" type="button" onClick={calculatePlan}>
                    Plan
                  </button>
                  <button className="primary-button px-3" type="button" onClick={autoAssign} disabled={isAssigning}>
                    <RefreshCw size={16} />
                    {isAssigning ? 'Assigning' : 'Assign'}
                  </button>
                </div>
                </div>
                {plan ? (
                  <div className="border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                    <p>Total eligible students: {plan.totalStudents}</p>
                    <p>Total proctors: {plan.totalProctors}</p>
                    <p>Required proctors: {plan.requiredProctors}</p>
                    <p>Available capacity: {plan.availableCapacity}</p>
                    {plan.warning ? <p className="mt-1 font-semibold text-red-700">{plan.warning}</p> : null}
                  </div>
                ) : null}
              </div>
            </SectionPanel>
          </div>
        ) : null}

        {activeView === 'directory' ? (
          <SectionPanel
            title="Proctor Directory"
            description="Compact credential, mail, and load tracking."
            actions={
            <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={() => setActiveView('add')}>
              <Plus size={14} className="text-brand-500" />
              Add Proctor
            </button>
            }
          >
          <div className="grid gap-2 border-b border-slate-200 bg-slate-50/60 p-3 md:grid-cols-4">
            <MetricCard label="Eligible students" value={summary?.totalEligibleStudents ?? 0} />
            <MetricCard label="Assigned" value={summary?.assignedStudents ?? 0} />
            <MetricCard label="Unassigned" value={summary?.unassignedStudents ?? 0} tone="warning" />
            <MetricCard label="Proctors" value={summary?.totalProctors ?? 0} />
          </div>

          <div className="table-popover-safe">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proctor</th>
                  <th>Proctor ID</th>
                  <th>Password</th>
                  <th>Assigned Students</th>
                  <th>Mail</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Loading proctors...
                    </td>
                  </tr>
                ) : proctors.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title="No proctors added yet" description="Add proctors, then calculate capacity and auto-assign students." />
                    </td>
                  </tr>
                ) : (
                  proctors.map((proctor) => (
                    <tr key={proctor._id}>
                      <td>
                        <p className="font-semibold text-slate-950">{proctor.name}</p>
                        <p className="text-xs text-slate-500">{proctor.email}</p>
                      </td>
                      <td className="font-semibold text-slate-800">{proctor.generatedProctorId}</td>
                      <td className="font-semibold text-slate-800">{proctor.passwordPreview || '-'}</td>
                      <td className="text-slate-700">{proctor.assignedStudentCount || 0}</td>
                      <td><span className={statusClass(proctor.mailStatus)}>{proctor.mailStatus.replace('_', ' ')}</span></td>
                      <td><span className={statusClass(proctor.activeStatus)}>{proctor.activeStatus}</span></td>
                      <td className="relative text-right">
                        <button
                          className="secondary-button h-8 w-8 px-0"
                          type="button"
                          onClick={(event) => toggleActionMenu(event, proctor._id)}
                          aria-label={`Actions for ${proctor.name}`}
                        >
                          <MoreHorizontal size={15} className="text-brand-500" />
                        </button>
                        {openActionMenu === proctor._id ? (
                          <div
                            className="fixed z-50 w-44 rounded-md border border-slate-200 bg-white py-1 text-left shadow-xl"
                            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                          >
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => sendMail(proctor)}
                              disabled={sendingMailId === proctor._id || ['sent', 'resent'].includes(proctor.mailStatus)}
                            >
                              <Mail size={14} className="text-brand-500" />
                              {sendingMailId === proctor._id ? 'Sending...' : ['sent', 'resent'].includes(proctor.mailStatus) ? 'Mail sent' : 'Send mail'}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => copyText(proctor.generatedProctorId, 'proctor ID')}
                            >
                              <Copy size={14} className="text-brand-500" />
                              Copy proctor ID
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              type="button"
                              onClick={() => copyText(proctor.passwordPreview, 'password')}
                              disabled={!proctor.passwordPreview}
                            >
                              <KeyRound size={14} className="text-brand-500" />
                              Copy password
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
    </section>
  );
}
