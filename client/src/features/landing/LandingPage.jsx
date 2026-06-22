import { useEffect } from 'react';
import { ArrowRight, BookOpenCheck, Building2, GraduationCap, ScanFace, ShieldCheck, Workflow } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import { useAuth } from '../auth/AuthContext.jsx';
import { BrandLoader } from '../../ui/BrandLoader.jsx';
import { ElvoraSequence } from './ScrollSequenceHero.jsx';

const roleHome = {
  super_admin: '/super-admin',
  admin: '/admin',
  faculty: '/faculty',
  moderator: '/moderator',
  proctor: '/proctor',
  student: '/student',
};

const capabilities = [
  { icon: ScanFace, number: '01', title: 'AI Proctoring', text: 'Live integrity signals with a focused exam experience.' },
  { icon: Workflow, number: '02', title: 'Connected Workflow', text: 'Create, assign, review, and publish from one platform.' },
  { icon: ShieldCheck, number: '03', title: 'Secure by Design', text: 'Role-based access and controlled assessment delivery.' },
];

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

export function LandingPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();

  useEffect(() => {
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
      cardListeners.forEach(({ card, move, leave }) => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
      });
    };
  }, []);

  if (isBootstrapping) return <BrandLoader />;
  if (isAuthenticated && user) return <Navigate to={roleHome[user.role] || '/login'} replace />;

  return (
    <div className="elvora-landing">
      <header className="elvora-header">
        <a href="#elvora-hero" className="elvora-header-logo" aria-label="Elvora home">
          <img src="/logo.webp" alt="Elvora" />
        </a>
        <Link to="/login" className="elvora-header-login">Login</Link>
      </header>

      <main>
        <ElvoraSequence />

        <section className="elvora-page-section elvora-capabilities" aria-labelledby="capabilities-title">
          <div className="elvora-section-heading" data-elvora-reveal>
            <span>One intelligent platform</span>
            <h2 id="capabilities-title">Everything behind a trusted assessment.</h2>
          </div>
          <div className="elvora-capability-grid">
            {capabilities.map(({ icon: Icon, number, title, text }, index) => (
              <article key={title} className="elvora-3d-card" data-elvora-reveal style={{ '--reveal-delay': `${index * 90}ms` }}>
                <div className="elvora-card-topline"><Icon size={23} /><span>{number}</span></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

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
