import { lazy, Suspense, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowRight, BookOpenCheck, Building2, GraduationCap, LogIn } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import { useAuth } from '../auth/AuthContext.jsx';
import { BrandLoader } from '../../ui/BrandLoader.jsx';
import { ElvoraSequence } from './ScrollSequenceHero.jsx';

let ecosystemSectionPromise;

function preloadEcosystemSection() {
  ecosystemSectionPromise ??= import('./EcosystemSection.jsx');
  return ecosystemSectionPromise;
}

const LazyEcosystemSection = lazy(() => preloadEcosystemSection().then((module) => ({ default: module.EcosystemSection })));

const roleHome = {
  super_admin: '/super-admin',
  admin: '/admin',
  faculty: '/faculty',
  moderator: '/moderator',
  proctor: '/proctor',
  student: '/student',
};

const workflowSteps = [
  ['Create', 'Build assessments and reusable question libraries.'],
  ['Collaborate', 'Route work between admins, faculty, and moderators.'],
  ['Verify', 'Review quality, permissions, and examination readiness.'],
  ['Deliver', 'Launch secure assessments with intelligent oversight.'],
];

const roles = [
  { icon: Building2, title: 'Administration', text: 'Control assessments, people, permissions, and delivery.' },
  { icon: BookOpenCheck, title: 'Faculty & Review', text: 'Author questions and complete structured moderation.' },
  { icon: GraduationCap, title: 'Students', text: 'Take focused, secure, and accessible examinations.' },
];

const faqs = [
  ['What is Elvora?', 'Elvora is an AI-powered platform for assessment creation, collaboration, moderation, and secure examination delivery.'],
  ['Who can use the platform?', 'Elvora provides dedicated workspaces for administrators, faculty, moderators, proctors, and students.'],
  ['Does Elvora support question libraries?', 'Yes. Teams can organize reusable questions and import them into assigned assessments.'],
  ['How does moderation work?', 'Faculty submissions can move through password-protected moderator review, approval, or rejection with feedback.'],
  ['How do I get started?', 'Use the Get Started or Login button to access the existing secure workspace.'],
];

const revealClass = [
  'translate-y-7 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
  '[&.is-visible]:translate-y-0 [&.is-visible]:opacity-100',
  'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
].join(' ');

const eyebrowClass = 'text-xs font-extrabold uppercase tracking-[0.16em] text-orange-600';
const sectionTitleClass = 'mt-3 text-4xl font-black leading-none text-[#181818] sm:text-5xl lg:text-6xl';
const mutedCopyClass = 'text-[#706964] leading-7';

function LandingSectionLoader() {
  return (
    <section
      className={[
        'relative z-20 isolate min-h-[620svh] overflow-clip rounded-t-[clamp(1.4rem,3vw,2.75rem)] bg-[#FCFAF7] text-[#181818]',
        'shadow-[0_-34px_90px_rgba(24,24,24,0.12)] lg:-mt-[100svh] lg:min-h-[700svh]',
        'bg-[radial-gradient(circle_at_50%_58%,rgba(243,107,22,0.08),transparent_30%),linear-gradient(rgba(243,107,22,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(243,107,22,0.045)_1px,transparent_1px)]',
        'bg-[size:auto,170px_170px,170px_170px] max-[900px]:min-h-[460svh] max-[900px]:bg-[size:auto,115px_115px,115px_115px]',
      ].join(' ')}
      aria-label="Loading examination ecosystem"
    >
      <div className="sticky top-[72px] grid h-[calc(100svh_-_72px)] place-items-center px-5">
        <div className="relative flex flex-col items-center gap-5">
          <div className="grid size-24 place-items-center rounded-[28px] bg-white/88 shadow-[0_22px_70px_rgba(255,122,0,0.14)] ring-1 ring-orange-100/80 backdrop-blur-xl">
            <img src="/logo.webp" alt="" className="w-20 object-contain" />
          </div>
          <div className="h-1.5 w-44 overflow-hidden rounded-full bg-orange-100" aria-hidden="true">
            <div className="h-full w-2/3 rounded-full bg-[#FF7A00] shadow-[0_0_20px_rgba(255,122,0,0.35)] animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}

function DeferredEcosystemSection() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [, startTransition] = useTransition();
  const loaderRef = useRef(null);

  useEffect(() => {
    let preloadIdleId = 0;
    let prepareIdleId = 0;
    let preloadTimerId = 0;
    let prepareTimerId = 0;
    let fallbackTimerId = 0;
    let observer;
    let didLoad = false;
    const preloadSection = () => {
      preloadEcosystemSection().catch(() => undefined);
    };
    const loadSection = () => {
      if (didLoad) return;
      didLoad = true;
      preloadSection();
      startTransition(() => setShouldLoad(true));
    };
    const prepareSectionIfIdle = () => {
      if (window.scrollY > 80) return;
      loadSection();
    };

    if ('IntersectionObserver' in window && loaderRef.current) {
      observer = new window.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadSection();
      }, { rootMargin: '900px 0px' });
      observer.observe(loaderRef.current);
    } else {
      fallbackTimerId = window.setTimeout(loadSection, 1200);
    }

    preloadTimerId = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        preloadIdleId = window.requestIdleCallback(preloadSection, { timeout: 1000 });
      } else {
        preloadSection();
      }
    }, 650);

    prepareTimerId = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        prepareIdleId = window.requestIdleCallback(prepareSectionIfIdle, { timeout: 1300 });
      } else {
        fallbackTimerId = window.setTimeout(prepareSectionIfIdle, 350);
      }
    }, 900);

    return () => {
      observer?.disconnect();
      if (preloadIdleId) window.cancelIdleCallback?.(preloadIdleId);
      if (prepareIdleId) window.cancelIdleCallback?.(prepareIdleId);
      if (preloadTimerId) window.clearTimeout(preloadTimerId);
      if (prepareTimerId) window.clearTimeout(prepareTimerId);
      if (fallbackTimerId) window.clearTimeout(fallbackTimerId);
    };
  }, []);

  if (!shouldLoad) {
    return (
      <div ref={loaderRef}>
        <LandingSectionLoader />
      </div>
    );
  }

  return (
    <Suspense fallback={<LandingSectionLoader />}>
      <LazyEcosystemSection />
    </Suspense>
  );
}

export function LandingPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const isHeaderScrolledRef = useRef(false);
  const headerRef = useRef(null);
  const loginButtonRef = useRef(null);

  useEffect(() => {
    const syncHeader = () => {
      const nextScrolled = window.scrollY > 8;
      if (nextScrolled === isHeaderScrolledRef.current) return;
      isHeaderScrolledRef.current = nextScrolled;
      setIsHeaderScrolled(nextScrolled);
    };
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = headerRef.current;
    const loginButton = loginButtonRef.current;
    const syncHeaderGlow = (event) => {
      if (reducedMotionQuery.matches || window.innerWidth < 1024) return;
      if (!header) return;
      const headerSurface = header.querySelector('.landing-header-shell');
      const bounds = (headerSurface || header).getBoundingClientRect();
      header.style.setProperty('--header-mouse-x', `${event.clientX - bounds.left}px`);
      header.style.setProperty('--header-mouse-y', `${event.clientY - bounds.top}px`);
    };
    const syncPointerGlow = (event) => {
      if (reducedMotionQuery.matches || window.innerWidth < 1024) return;
      if (!loginButton) return;
      const bounds = loginButton.getBoundingClientRect();
      loginButton.style.setProperty('--mouse-x', `${event.clientX - bounds.left}px`);
      loginButton.style.setProperty('--mouse-y', `${event.clientY - bounds.top}px`);
    };
    const elements = document.querySelectorAll('[data-elvora-reveal]');
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    elements.forEach((element) => observer.observe(element));
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
    header?.addEventListener('pointermove', syncHeaderGlow, { passive: true });
    loginButton?.addEventListener('pointermove', syncPointerGlow, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', syncHeader);
      header?.removeEventListener('pointermove', syncHeaderGlow);
      loginButton?.removeEventListener('pointermove', syncPointerGlow);
    };
  }, []);

  if (isBootstrapping) return <BrandLoader />;
  if (isAuthenticated && user) return <Navigate to={roleHome[user.role] || '/login'} replace />;

  return (
    <div className="min-h-screen overflow-x-clip bg-white font-['Manrope',Inter,ui-sans-serif,system-ui,sans-serif] text-[#262626]">
      <header
        ref={headerRef}
        style={{
          '--header-mouse-x': '50%',
          '--header-mouse-y': '50%',
        }}
        className={[
          'landing-header pointer-events-none fixed inset-x-0 top-0 z-[70] flex h-20 items-start justify-center px-3 pt-3 sm:px-5 lg:h-24 lg:pt-4',
          'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-[linear-gradient(180deg,rgba(255,250,245,0.78),rgba(255,255,255,0.38)_54%,transparent),radial-gradient(circle_at_50%_0%,rgba(255,122,0,0.075),transparent_54%)] before:transition-opacity before:duration-300 lg:before:h-28',
          isHeaderScrolled ? 'before:opacity-55' : 'before:opacity-82',
        ].join(' ')}
      >
        <div
          className={[
            'landing-header-shell group relative isolate grid min-h-[3.35rem] w-[min(calc(100vw_-_1rem),28rem)] grid-cols-[auto_auto] items-center justify-between gap-3 overflow-hidden rounded-full border border-orange-300/22 px-3 py-1.5 text-[#111827]',
            'pointer-events-auto touch-pan-y shadow-[0_18px_42px_rgba(94,52,22,0.105),0_6px_18px_rgba(255,122,0,0.075),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-150',
            'animate-notch-arrive transition-[width,min-height,border-color,box-shadow,transform] duration-300 ease-out sm:w-[min(calc(100vw_-_2rem),38rem)] sm:px-4 lg:min-h-[4.15rem] lg:w-[min(calc(100vw_-_12rem),60rem)] lg:px-6',
            'hover:border-orange-300/34 hover:shadow-[0_22px_52px_rgba(94,52,22,0.12),0_8px_22px_rgba(255,122,0,0.1),inset_0_1px_0_rgba(255,255,255,0.94)] focus-within:border-orange-300/38 motion-reduce:animate-none motion-reduce:transition-none',
            isHeaderScrolled ? 'lg:!w-[min(calc(100vw_-_18rem),50rem)] lg:!min-h-[3.75rem]' : '',
          ].join(' ')}
          style={{
            '--notch-y': isHeaderScrolled ? '-2px' : '0px',
            '--notch-scale': isHeaderScrolled ? '0.986' : '1',
            backgroundImage: 'radial-gradient(13rem circle at var(--header-mouse-x) var(--header-mouse-y), rgba(255,122,0,0.12), transparent 68%), linear-gradient(135deg, rgba(255,255,255,0.84), rgba(255,255,255,0.5) 54%, rgba(255,247,239,0.58))',
          }}
        >
          <span className="pointer-events-none absolute inset-px -z-10 rounded-full bg-[linear-gradient(120deg,rgba(255,255,255,0.9),transparent_30%,rgba(255,122,0,0.055)_68%,rgba(255,255,255,0.48))] opacity-90" aria-hidden="true" />
          <span className="pointer-events-none absolute left-1/2 top-2 z-10 h-px w-9 -translate-x-1/2 rounded-full bg-slate-900/14 opacity-45 animate-notch-liquid motion-reduce:animate-none" aria-hidden="true" />

          <a href="#elvora-hero" className="relative z-10 inline-flex h-9 w-[5.5rem] items-center overflow-hidden rounded-full outline-none transition hover:-translate-y-px hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-orange-300/40 motion-reduce:transition-none sm:w-[6.4rem] lg:h-11 lg:w-[7.7rem]" aria-label="Elvora home">
            <img src="/logo.webp" alt="Elvora" className="h-full w-full object-cover object-left" />
          </a>

          <Link
            ref={loginButtonRef}
            to="/login"
            style={{
              '--mouse-x': '50%',
              '--mouse-y': '50%',
              backgroundImage: 'radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255,122,0,0.22), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.58))',
            }}
            className="relative z-10 inline-flex h-9 min-w-[5rem] items-center justify-center gap-1.5 overflow-hidden rounded-full border border-orange-300/28 px-3 text-sm font-extrabold leading-none text-[#111827] no-underline shadow-[0_10px_24px_rgba(255,122,0,0.095),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-xl transition hover:-translate-y-px hover:border-orange-300/42 hover:text-[#ff7a00] hover:shadow-[0_13px_30px_rgba(255,122,0,0.14),inset_0_1px_0_rgba(255,255,255,0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/40 motion-reduce:transition-none sm:min-w-[5.75rem] sm:px-4 lg:h-11 lg:min-w-[7.35rem] lg:gap-2 lg:text-base before:pointer-events-none before:absolute before:inset-px before:rounded-full before:bg-[linear-gradient(135deg,rgba(255,255,255,0.72),transparent_34%,rgba(255,122,0,0.11))]"
          >
            <LogIn className="relative z-10 size-4 shrink-0 lg:size-5" strokeWidth={2.4} aria-hidden="true" />
            <span className="relative z-10">Login</span>
          </Link>
        </div>
      </header>

      <main>
        <ElvoraSequence />

        <DeferredEcosystemSection />

        <section className="relative isolate overflow-hidden bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 text-white before:absolute before:inset-0 before:-z-10 before:bg-[linear-gradient(rgba(255,255,255,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px)] before:bg-[size:58px_58px] before:opacity-30 before:[mask-image:radial-gradient(circle_at_75%_45%,#000,transparent_68%)]" aria-labelledby="workflow-title">
          <div className="pointer-events-none absolute -right-40 top-1/4 size-[34rem] rounded-full bg-white/25 blur-md" aria-hidden="true" />
          <div className="mx-auto grid w-[min(calc(100%_-_2rem),76rem)] gap-12 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-28 lg:py-36">
            <div className={`${revealClass} self-start lg:sticky lg:top-32`} data-elvora-reveal>
              <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange-100">Connected from end to end</span>
              <h2 id="workflow-title" className="mt-3 max-w-[12ch] text-4xl font-black leading-none text-white sm:text-5xl lg:text-6xl">One flow. Every academic role.</h2>
              <p className="mt-6 max-w-md text-lg leading-8 text-white/85">Move from planning to protected delivery without breaking context.</p>
            </div>
            <ol className="grid gap-4">
              {workflowSteps.map(([title, text], index) => (
                <li
                  key={title}
                  data-elvora-reveal
                  className={`${revealClass} grid min-h-32 grid-cols-[3rem_1fr] items-center gap-5 rounded-3xl border border-white/55 bg-white/95 p-5 text-[#292524] shadow-[0_22px_50px_rgba(124,45,18,0.16)] backdrop-blur-lg transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[0_28px_62px_rgba(124,45,18,0.24)] motion-reduce:transition-none`}
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-orange-500/15 text-xs font-extrabold text-orange-600">{String(index + 1).padStart(2, '0')}</span>
                  <div><h3 className="text-lg font-extrabold">{title}</h3><p className={`mt-1 ${mutedCopyClass}`}>{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid min-h-screen w-[min(calc(100%_-_2rem),76rem)] items-center gap-14 py-24 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)] lg:gap-28" aria-labelledby="roles-title">
          <div className={`${revealClass} relative grid aspect-square place-items-center rounded-[3rem] bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.16),transparent_45%),linear-gradient(145deg,rgba(255,255,255,0.96),rgba(238,232,224,0.7))] shadow-[0_40px_100px_rgba(82,56,38,0.13)] max-lg:mx-auto max-lg:w-[min(100%,31rem)] max-sm:rounded-[2rem]`} data-elvora-reveal aria-hidden="true">
            <div className="absolute aspect-square w-[72%] rounded-full border border-orange-500/30 animate-spin [animation-duration:24s] motion-reduce:animate-none">
              <span className="absolute left-[10%] top-[18%] size-4 rounded-full border-[3px] border-white bg-orange-500 shadow-[0_8px_22px_rgba(234,88,12,0.35)]" />
              <span className="absolute right-[-0.5rem] top-[48%] size-4 rounded-full border-[3px] border-white bg-orange-500 shadow-[0_8px_22px_rgba(234,88,12,0.35)]" />
              <span className="absolute bottom-[-0.3rem] left-[30%] size-4 rounded-full border-[3px] border-white bg-orange-500 shadow-[0_8px_22px_rgba(234,88,12,0.35)]" />
              <span className="absolute inset-[14%] rounded-full border border-dashed border-stone-500/25" />
            </div>
            <div className="relative z-10 grid aspect-square w-[38%] rotate-[-4deg] place-items-center rounded-[2rem] border border-orange-500/20 bg-white/80 shadow-[0_28px_50px_rgba(91,61,40,0.14),inset_0_1px_0_#fff] [transform:rotateX(10deg)_rotateZ(-4deg)]">
              <img src="/logo.webp" alt="" className="w-2/3" />
            </div>
          </div>
          <div>
            <div className={`${revealClass} max-w-3xl`} data-elvora-reveal>
              <span className={eyebrowClass}>Built for the whole institution</span>
              <h2 id="roles-title" className={sectionTitleClass}>Different workspaces. One standard.</h2>
            </div>
            <div className="mt-10 grid gap-3">
              {roles.map(({ icon: Icon, title, text }, index) => (
                <article
                  key={title}
                  data-elvora-reveal
                  className={`${revealClass} grid grid-cols-[3.2rem_1fr] items-center gap-4 border-b border-stone-500/15 p-4`}
                  style={{ transitionDelay: `${index * 90}ms` }}
                >
                  <Icon className="text-orange-500" size={22} /><div><h3 className="text-lg font-extrabold">{title}</h3><p className={`mt-1 text-sm ${mutedCopyClass}`}>{text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${revealClass} relative isolate mx-auto mb-24 grid min-h-[34rem] w-[min(calc(100%_-_2rem),76rem)] place-items-center overflow-hidden rounded-[clamp(2rem,5vw,4rem)] bg-gradient-to-br from-orange-500 via-orange-600 to-orange-900 text-white shadow-[0_36px_90px_rgba(194,65,12,0.27)] max-sm:w-[calc(100%_-_1rem)] max-sm:rounded-[2rem]`} data-elvora-reveal aria-labelledby="cta-title">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] bg-[size:54px_54px] opacity-25 [mask-image:radial-gradient(circle,#000,transparent_75%)]" aria-hidden="true" />
          <div className="max-w-3xl px-6 py-12 text-center">
            <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange-100">Ready when you are</span>
            <h2 id="cta-title" className="mt-3 text-4xl font-black leading-none text-white sm:text-5xl lg:text-6xl">Elevate your academic workflow.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/85">Bring creation, review, and secure delivery into one intelligent platform.</p>
            <Link to="/login" className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-6 font-extrabold text-orange-700 no-underline shadow-[0_18px_38px_rgba(124,45,18,0.24)] transition hover:-translate-y-1 hover:shadow-[0_24px_46px_rgba(124,45,18,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none">Get Started <ArrowRight size={18} /></Link>
          </div>
        </section>

        <section className="mx-auto w-[min(calc(100%_-_2rem),68rem)] pb-8 max-sm:w-[calc(100%_-_1.5rem)]" aria-labelledby="faq-title">
          <div className={`${revealClass} mb-12 max-w-3xl`} data-elvora-reveal>
            <span className={eyebrowClass}>Questions, answered</span>
            <h2 id="faq-title" className={sectionTitleClass}>Frequently asked questions.</h2>
          </div>
          <div className="border-t border-stone-500/20">
            {faqs.map(([question, answer], index) => (
              <details
                key={question}
                data-elvora-reveal
                className={`${revealClass} group border-b border-stone-500/20`}
                style={{ transitionDelay: `${index * 55}ms` }}
              >
                <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 pr-2 text-lg font-extrabold [&::-webkit-details-marker]:hidden">
                  {question}
                  <i className="relative size-5 shrink-0 before:absolute before:left-1/2 before:top-1/2 before:h-0.5 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-orange-500 after:absolute after:left-1/2 after:top-1/2 after:h-0.5 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-90 after:rounded-full after:bg-orange-500 after:transition-transform group-open:after:rotate-0" aria-hidden="true" />
                </summary>
                <p className={`max-w-3xl pb-7 pr-10 ${mutedCopyClass}`}>{answer}</p>
              </details>
            ))}
          </div>
          <footer className="mt-24 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-stone-500/15 py-6 text-sm text-stone-500 max-sm:grid-cols-[1fr_auto]">
            <img src="/logo.webp" alt="Elvora" className="w-28" />
            <p className="text-center max-sm:hidden">AI-powered academic workflow.</p>
            <Link to="/login" className="justify-self-end font-bold text-orange-600 no-underline">Login</Link>
          </footer>
        </section>
      </main>
    </div>
  );
}
