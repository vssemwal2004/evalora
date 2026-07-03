import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Lock, ShieldCheck, UserRound, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { PageHeader, SectionPanel } from '../../ui/Surface.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const roleHome = {
  super_admin: '/super-admin',
  admin: '/admin',
  faculty: '/faculty',
  moderator: '/moderator',
};

function passwordChecks(password, confirmPassword) {
  return [
    { id: 'length', label: 'More than 8 characters', passed: password.length > 8 },
    { id: 'capital', label: 'At least 1 capital letter', passed: /[A-Z]/.test(password) },
    { id: 'special', label: 'At least 1 special character', passed: /[^A-Za-z0-9]/.test(password) },
    { id: 'match', label: 'Confirm password matches', passed: Boolean(confirmPassword) && password === confirmPassword },
  ];
}

function ChangePasswordDrawer({ required, open, onClose }) {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const checks = useMemo(() => passwordChecks(form.newPassword, form.confirmPassword), [form.newPassword, form.confirmPassword]);
  const isStrong = checks.every((check) => check.passed);

  useEffect(() => {
    if (open) {
      setError('');
      setNotice('');
    }
  }, [open]);

  if (!open) return null;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!isStrong) {
      setError('Use a strong password before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.patch('/auth/password', form);
      updateUser(response.data.user, response.data.token, response.data.csrfToken);
      setNotice(response.data.message || 'Password changed successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });

      if (required) {
        window.setTimeout(() => navigate(roleHome[user.role] || '/', { replace: true }), 700);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to change password.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      {!required ? <button className="absolute inset-0 cursor-default" type="button" aria-label="Close password panel" onClick={onClose} /> : null}
      <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-brand-100 bg-brand-50 text-brand-600">
              <KeyRound size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Change Password</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {required ? 'Password change is required before continuing.' : 'Update your account password securely.'}
              </p>
            </div>
          </div>
          {!required ? (
            <button className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900" type="button" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          ) : null}
        </div>

        <form className="space-y-4 p-5" onSubmit={submit}>
          {required ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              Change the default password to unlock the workspace.
            </div>
          ) : null}

          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
          {notice ? <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{notice}</div> : null}

          <div>
            <label className="field-label" htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              className="field-input mt-2"
              type="password"
              value={form.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="new-password">Enter new password</label>
            <input
              id="new-password"
              className={`field-input mt-2 ${form.newPassword && !isStrong ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : form.newPassword && isStrong ? 'border-green-300 focus:border-green-500 focus:ring-green-100' : ''}`}
              type="password"
              value={form.newPassword}
              onChange={(event) => updateField('newPassword', event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              className="field-input mt-2"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              required
            />
          </div>

          <div className={`rounded-md border p-3 ${isStrong ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <p className={`text-sm font-semibold ${isStrong ? 'text-green-700' : 'text-red-700'}`}>
              {isStrong ? 'Strong password' : 'Use strong password'}
            </p>
            <div className="mt-3 space-y-2">
              {checks.map((check) => (
                <div key={check.id} className={`flex items-center gap-2 text-xs font-semibold ${check.passed ? 'text-green-700' : 'text-red-700'}`}>
                  <CheckCircle2 size={14} />
                  {check.label}
                </div>
              ))}
            </div>
          </div>

          <button className="primary-button w-full" type="submit" disabled={isSaving || !isStrong}>
            <ShieldCheck size={16} />
            {isSaving ? 'Changing password' : 'Change password'}
          </button>
        </form>
      </aside>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const required = searchParams.get('required') === '1' || Boolean(user?.mustChangePassword);
  const [isPasswordOpen, setIsPasswordOpen] = useState(required);

  useEffect(() => {
    if (required) setIsPasswordOpen(true);
  }, [required]);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Settings"
        description="Manage your account identity and security controls from one clean workspace."
      />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel title="Profile" description="Signed-in account details." icon={UserRound}>
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-md border border-brand-100 bg-brand-50 text-base font-semibold text-brand-700">
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-950">{user?.name || 'User'}</p>
                <p className="truncate text-sm text-slate-500">{user?.email || user?.loginId || '-'}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="field-label">Role</p>
                <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{String(user?.role || '').replace('_', ' ')}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="field-label">Login ID</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{user?.loginId || '-'}</p>
              </div>
            </div>
          </div>
        </SectionPanel>

        <SectionPanel title="Account Security" description="Keep access protected with a strong password." icon={Lock}>
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className={`status-badge ${required ? 'status-pending' : 'status-active'}`}>
                  {required ? 'Required' : 'Protected'}
                </span>
                <span className="text-xs font-semibold text-slate-500">Strong password policy</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-950">Password</p>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">
                Use more than 8 characters with 1 capital letter and 1 special character.
              </p>
            </div>
            <button className="primary-button" type="button" onClick={() => setIsPasswordOpen(true)}>
              <KeyRound size={16} />
              Change password
            </button>
          </div>
        </SectionPanel>
      </div>

      <ChangePasswordDrawer required={required} open={isPasswordOpen} onClose={() => setIsPasswordOpen(false)} />
    </section>
  );
}
