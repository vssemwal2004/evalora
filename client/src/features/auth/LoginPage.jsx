import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

const roleRoutes = {
  super_admin: '/super-admin',
  admin: '/admin',
  student: '/student',
  proctor: '/proctor',
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(() => {
    const message = window.sessionStorage.getItem('evalora_auth_message') || '';
    window.sessionStorage.removeItem('evalora_auth_message');
    return message;
  });

  const canSubmit = useMemo(() => identifier.trim() && password.trim(), [identifier, password]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const user = await login({
        identifier,
        password,
      });

      navigate(roleRoutes[user.role] || '/login', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to sign in. Check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-grid-bg grid h-screen overflow-hidden px-5 py-5 text-slate-900 sm:px-8">
      <div className="relative m-auto h-full max-h-[700px] w-full max-w-[1280px] overflow-hidden border border-orange-200 bg-white/90 shadow-[0_28px_90px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_84%_76%,rgba(249,115,22,0.08),transparent_28%)]" />
        <div className="relative grid h-full lg:grid-cols-2">
          <section className="hidden items-center justify-center px-8 pb-6 pt-10 lg:flex xl:px-12">
            <img
              src="/login-img.webp"
              alt="Evalora exam workspace"
              className="h-auto max-h-[min(690px,84vh)] w-[120%] max-w-[960px] translate-y-5 object-contain"
            />
          </section>

          <section className="flex min-h-0 items-center justify-center px-5 py-5 sm:px-8 lg:px-12">
            <div className="w-full max-w-[420px]">
            <div className="mb-5 lg:hidden">
              <img src="/login-img.webp" alt="Evalora" className="mx-auto max-h-[28vh] w-full object-contain" />
            </div>

            <div className="p-0">
              <div className="relative mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="inline-flex h-10 w-10 items-center justify-center border border-orange-200 bg-orange-50">
                    <ShieldCheck size={19} className="text-brand-600" />
                  </div>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Secure access</p>
                <h1 className="login-title mt-3 text-[34px] font-bold leading-[1.04] text-slate-950">Login to Evalora</h1>
                <div className="mt-3 h-1 w-24 overflow-hidden rounded-full bg-orange-100">
                  <div className="h-full w-14 rounded-full bg-brand-500" />
                </div>
              </div>

              <form className="relative space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="field-label" htmlFor="identifier">
                    Email, Exam ID, or Login ID
                  </label>
                  <input
                    id="identifier"
                    className="field-input mt-2 border-orange-100 bg-white/86 focus:bg-white"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="EVL-2026-8F92K or name@example.com"
                    autoComplete="username"
                    required
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="password">
                    Password
                  </label>
                  <div className="relative mt-2">
                    <input
                      id="password"
                      className="field-input border-orange-100 bg-white/86 pr-11 focus:bg-white"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-brand-600"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  className="primary-button login-progress-button w-full rounded-[14px_4px_14px_4px] shadow-[0_12px_24px_rgba(249,115,22,0.24)]"
                  type="submit"
                  disabled={isSubmitting || !canSubmit}
                  data-loading={isSubmitting ? 'true' : 'false'}
                >
                  <span className="relative z-10">{isSubmitting ? 'Authenticating...' : 'Continue'}</span>
                  <ArrowRight size={17} />
                </button>
              </form>

            </div>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}
