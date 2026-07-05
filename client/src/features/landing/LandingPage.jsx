import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpenCheck, Building2, GraduationCap } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import { useAuth } from '../auth/AuthContext.jsx';
import { BrandLoader } from '../../ui/BrandLoader.jsx';
import { ElvoraSequence } from './ScrollSequenceHero.jsx';

const LazyEcosystemSection = lazy(() => import('./EcosystemSection.jsx').then((module) => ({ default: module.EcosystemSection })));

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
      <div className="sticky top-[72px] grid h-[calc(100svh-72px)] place-items-center px-5">
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
  const loaderRef = useRef(null);

  useEffect(() => {
    let idleId = 0;
    let timeoutId = 0;
    let delayId = 0;
    let observer;
    const loadSection = () => setShouldLoad(true);

    if ('IntersectionObserver' in window && loaderRef.current) {
      observer = new window.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadSection();
      }, { rootMargin: '650px 0px' });
      observer.observe(loaderRef.current);
    }

    delayId = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(loadSection, { timeout: 2200 });
      } else {
        timeoutId = window.setTimeout(loadSection, 800);
      }
    }, 2200);

    return () => {
      observer?.disconnect();
      if (delayId) window.clearTimeout(delayId);
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
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
  const headerRef = useRef(null);
  const loginButtonRef = useRef(null);

  useEffect(() => {
    const syncHeader = () => setIsHeaderScrolled(window.scrollY > 8);
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = headerRef.current;
    const loginButton = loginButtonRef.current;
    const syncHeaderGlow = (event) => {
      if (reducedMotionQuery.matches || window.innerWidth < 1024) return;
      if (!header) return;
      const bounds = header.getBoundingClientRect();
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

    const cards = [...document.querySelectorAll('.elvora-3d-card')];
    const cardListeners = cards.map((card) => {
      const move = (event) => {
        const bounds = card.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = (event.clientY - bounds.top) / bounds.height;
        card.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`);
        card.style.setProperty('--tilt-y', `${(x - 0.5) * 8}deg`);
        card.style.setProperty('--glow-x', `${x * 100}%`);
        card.style.setProperty('--glow-y', `${y * 100}%`);
      };
      const leave = () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      };
      card.addEventListener('pointermove', move, { passive: true });
      card.addEventListener('pointerleave', leave, { passive: true });
      return { card, move, leave };
    });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', syncHeader);
      header?.removeEventListener('pointermove', syncHeaderGlow);
      loginButton?.removeEventListener('pointermove', syncPointerGlow);
      cardListeners.forEach(({ card, move, leave }) => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
      });
    };
  }, []);

  if (isBootstrapping) return <BrandLoader />;
  if (isAuthenticated && user) return <Navigate to={roleHome[user.role] || '/login'} replace />;

  return (
    <div className="elvora-landing bg-white">
      <header
        ref={headerRef}
        style={{
          '--header-mouse-x': '50%',
          '--header-mouse-y': '50%',
          backgroundImage: isHeaderScrolled
            ? 'radial-gradient(circle at var(--header-mouse-x) var(--header-mouse-y), rgba(255,122,0,0.09), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0.22))'
            : 'radial-gradient(circle at var(--header-mouse-x) var(--header-mouse-y), rgba(255,122,0,0.065), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
        }}
        className={`landing-header fixed inset-x-0 top-0 z-[70] flex h-[84px] items-center transition-all duration-300 md:h-24 ${
          isHeaderScrolled
            ? 'border-b border-orange-200/35 shadow-[0_18px_48px_rgba(255,122,0,0.08)] backdrop-blur-xl'
            : 'border-b border-transparent shadow-none backdrop-blur-[10px]'
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between px-5 sm:px-8 xl:px-10">
          <a href="#elvora-hero" className="inline-flex h-12 items-center rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-200" aria-label="Elvora home">
            <img src="/logo.webp" alt="Elvora" className="h-auto w-[118px] object-contain sm:w-[136px]" />
          </a>
          <Link
            ref={loginButtonRef}
            to="/login"
            style={{
              '--mouse-x': '50%',
              '--mouse-y': '50%',
              backgroundImage: 'radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255,122,0,0.22), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.58))',
            }}
            className="relative inline-flex h-11 min-w-[90px] overflow-hidden rounded-2xl border border-orange-200/70 px-5 text-sm font-bold text-[#111827] shadow-[0_12px_32px_rgba(255,122,0,0.08)] backdrop-blur-2xl transition before:pointer-events-none before:absolute before:inset-px before:rounded-[15px] before:bg-[linear-gradient(135deg,rgba(255,255,255,0.78),transparent_34%,rgba(255,122,0,0.12))] hover:border-orange-300 hover:text-[#FF7A00] hover:shadow-[0_18px_42px_rgba(255,122,0,0.16)] focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <span className="relative z-10 m-auto">Login</span>
          </Link>
        </div>
      </header>

      <main>
        <ElvoraSequence />

        <DeferredEcosystemSection />

        <section className="elvora-workflow-section" aria-labelledby="workflow-title">
          <div className="elvora-workflow-glow" aria-hidden="true" />
          <div className="elvora-workflow-layout">
            <div className="elvora-workflow-copy" data-elvora-reveal>
              <span>Connected from end to end</span>
              <h2 id="workflow-title">One flow. Every academic role.</h2>
              <p>Move from planning to protected delivery without breaking context.</p>
            </div>
            <ol className="elvora-workflow-steps">
              {workflowSteps.map(([title, text], index) => (
                <li key={title} data-elvora-reveal style={{ '--reveal-delay': `${index * 80}ms` }}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="elvora-page-section elvora-roles-section" aria-labelledby="roles-title">
          <div className="elvora-role-visual" data-elvora-reveal aria-hidden="true">
            <div className="elvora-role-orbit"><i /><i /><i /></div>
            <div className="elvora-role-core"><img src="/logo.webp" alt="" /></div>
          </div>
          <div className="elvora-roles-copy">
            <div className="elvora-section-heading" data-elvora-reveal>
              <span>Built for the whole institution</span>
              <h2 id="roles-title">Different workspaces. One standard.</h2>
            </div>
            <div className="elvora-role-list">
              {roles.map(({ icon: Icon, title, text }, index) => (
                <article key={title} data-elvora-reveal style={{ '--reveal-delay': `${index * 90}ms` }}>
                  <Icon size={22} /><div><h3>{title}</h3><p>{text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="elvora-cta-section" data-elvora-reveal aria-labelledby="cta-title">
          <div className="elvora-cta-grid" aria-hidden="true" />
          <div className="elvora-cta-content">
            <span>Ready when you are</span>
            <h2 id="cta-title">Elevate your academic workflow.</h2>
            <p>Bring creation, review, and secure delivery into one intelligent platform.</p>
            <Link to="/login" className="elvora-cta-button">Get Started <ArrowRight size={18} /></Link>
          </div>
        </section>

        <section className="elvora-faq-section" aria-labelledby="faq-title">
          <div className="elvora-faq-heading" data-elvora-reveal>
            <span>Questions, answered</span>
            <h2 id="faq-title">Frequently asked questions.</h2>
          </div>
          <div className="elvora-faq-list">
            {faqs.map(([question, answer], index) => (
              <details key={question} data-elvora-reveal style={{ '--reveal-delay': `${index * 55}ms` }}>
                <summary>{question}<i aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <footer className="elvora-footer">
            <img src="/logo.webp" alt="Elvora" />
            <p>AI-powered academic workflow.</p>
            <Link to="/login">Login</Link>
          </footer>
        </section>
      </main>
    </div>
  );
}
