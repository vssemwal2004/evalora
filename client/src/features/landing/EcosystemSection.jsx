import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const ASSET_BASE = '/assets/elvora-ecosystem';

const ecosystemSteps = [
  {
    id: 'access',
    label: 'ELVORA-ACCESS',
    title: 'Role-Based Workspaces',
    description: 'Dedicated dashboards for admin, faculty, moderator, proctor and student, with precise permissions for every role.',
    side: 'left',
    z: 50,
    activeImage: `${ASSET_BASE}/elvora-access-active.webp`,
    inactiveImage: `${ASSET_BASE}/elvora-access-inactive.webp`,
    width: 2400,
    height: 1610,
  },
  {
    id: 'create',
    label: 'ELVORA-CREATE',
    title: 'Assessment & Question Builder',
    description: 'Create assessments, manage question banks, import content and assign academic work through one structured workspace.',
    side: 'right',
    z: 40,
    activeImage: `${ASSET_BASE}/elvora-create-active.webp`,
    inactiveImage: `${ASSET_BASE}/elvora-create-inactive.webp`,
    width: 1024,
    height: 687,
  },
  {
    id: 'collaborate',
    label: 'ELVORA-COLLABORATE',
    title: 'Faculty & Moderator Workflow',
    description: 'Faculty prepare and submit assessments while moderators review, approve or return them with controlled feedback.',
    side: 'left',
    z: 30,
    activeImage: `${ASSET_BASE}/elvora-collaborate-active.webp`,
    inactiveImage: `${ASSET_BASE}/elvora-collaborate-inactive.webp`,
    width: 1024,
    height: 687,
  },
  {
    id: 'secure',
    label: 'ELVORA-SECURE',
    title: 'Secure Exams & Proctoring',
    description: 'Protect every exam with password access, role controls, AI-assisted monitoring and live proctor oversight.',
    side: 'right',
    z: 20,
    activeImage: `${ASSET_BASE}/elvora-secure-active.webp`,
    inactiveImage: `${ASSET_BASE}/elvora-secure-inactive.webp`,
    width: 1024,
    height: 687,
  },
  {
    id: 'intelligence',
    label: 'ELVORA-INTELLIGENCE',
    title: 'Reports & Academic Oversight',
    description: 'Track readiness, submissions, approvals, student activity and academic performance from one intelligent view.',
    side: 'left',
    z: 10,
    activeImage: `${ASSET_BASE}/elvora-intelligence-active.webp`,
    inactiveImage: `${ASSET_BASE}/elvora-intelligence-inactive.webp`,
    width: 1024,
    height: 687,
  },
];

const desktopCardPlacement = {
  access: 'min-[901px]:col-start-1 min-[901px]:row-start-1 min-[901px]:justify-self-end',
  create: 'min-[901px]:col-start-3 min-[901px]:row-start-2 min-[901px]:justify-self-start',
  collaborate: 'min-[901px]:col-start-1 min-[901px]:row-start-3 min-[901px]:justify-self-end',
  secure: 'min-[901px]:col-start-3 min-[901px]:row-start-4 min-[901px]:justify-self-start',
  intelligence: 'min-[901px]:col-start-1 min-[901px]:row-start-5 min-[901px]:justify-self-end',
};

const layerPlacement = {
  access: 'top-[13%] min-[901px]:top-[10%]',
  create: 'top-[31.5%] min-[901px]:top-[30%]',
  collaborate: 'top-1/2',
  secure: 'top-[68.5%] min-[901px]:top-[70%]',
  intelligence: 'top-[87%] min-[901px]:top-[88%]',
};

const layerWidth = {
  access: 'w-[clamp(142px,min(64vw,18vh),220px)] min-[901px]:w-[clamp(170px,min(22vw,23vh),330px)] [@media(max-height:850px)_and_(min-width:1024px)]:w-[clamp(145px,20vh,240px)] [@media(max-height:650px)_and_(min-width:1024px)]:w-[clamp(115px,17vh,160px)]',
  default: 'w-[clamp(168px,min(74vw,21vh),280px)] min-[901px]:w-[clamp(200px,min(26vw,26vh),390px)] [@media(max-height:850px)_and_(min-width:1024px)]:w-[clamp(170px,24vh,292px)] [@media(max-height:650px)_and_(min-width:1024px)]:w-[clamp(138px,20vh,190px)]',
};

const cardBaseClass = [
  'group relative z-[7] w-full max-w-[350px] origin-center rounded-2xl border border-black/10',
  'bg-white/75 p-[clamp(14px,1.25vw,20px)] shadow-[0_16px_45px_rgba(23,23,23,0.05)]',
  'backdrop-blur-xl will-change-[opacity,transform]',
  '[&.is-active]:border-brand-500/40 [&.is-active]:bg-white',
  '[&.is-active]:shadow-[0_18px_55px_rgba(23,23,23,0.08),0_10px_30px_rgba(249,115,22,0.10)]',
  '[&.is-unified]:border-brand-500/20 [&.is-unified]:bg-white/85',
  '[@media(max-height:850px)_and_(min-width:1024px)]:rounded-[13px]',
  '[@media(max-height:850px)_and_(min-width:1024px)]:px-3.5',
  '[@media(max-height:850px)_and_(min-width:1024px)]:py-2.5',
  '[@media(max-height:650px)_and_(min-width:1024px)]:rounded-[10px]',
  '[@media(max-height:650px)_and_(min-width:1024px)]:px-[11px]',
  '[@media(max-height:650px)_and_(min-width:1024px)]:py-[7px]',
].join(' ');

function EcosystemCard({ step, mobile = false }) {
  const modeClass = mobile
    ? [
      '!absolute inset-y-0 left-3.5 !w-[calc(100%-14px)] !max-w-none invisible opacity-0',
      '[&.is-active]:visible [&.is-preview]:visible [&.is-unified]:visible',
      'motion-reduce:!relative motion-reduce:left-auto motion-reduce:visible motion-reduce:opacity-100',
    ].join(' ')
    : `hidden min-[901px]:block ${desktopCardPlacement[step.id]}`;

  return (
    <article
      className={`${cardBaseClass} ${modeClass}`}
      data-ecosystem-card={step.id}
      data-ecosystem-mode={mobile ? 'mobile' : 'desktop'}
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-[inherit] bg-[radial-gradient(circle_at_50%_100%,rgba(249,115,22,0.16),transparent_58%)] opacity-0 transition-opacity group-[.is-active]:opacity-100"
        aria-hidden="true"
      />
      <span className="relative block text-[0.68rem] font-extrabold leading-none tracking-[0.08em] text-brand-600/60 group-[.is-active]:text-brand-600">
        {step.label}
      </span>
      <h3 className="relative mt-2.5 text-[clamp(1rem,1.25vw,1.32rem)] font-extrabold leading-[1.08] tracking-[-0.025em] text-[#171717] [@media(max-height:850px)_and_(min-width:1024px)]:mt-1.5 [@media(max-height:850px)_and_(min-width:1024px)]:text-[0.92rem] [@media(max-height:650px)_and_(min-width:1024px)]:mt-1 [@media(max-height:650px)_and_(min-width:1024px)]:text-[0.78rem]">
        {step.title}
      </h3>
      <p className="relative mt-2 text-[clamp(0.74rem,0.8vw,0.9rem)] leading-[1.42] text-black/65 group-[.is-active]:text-black/75 [@media(max-height:850px)_and_(min-width:1024px)]:mt-1.5 [@media(max-height:850px)_and_(min-width:1024px)]:text-[0.69rem] [@media(max-height:850px)_and_(min-width:1024px)]:leading-[1.32] [@media(max-height:650px)_and_(min-width:1024px)]:mt-1 [@media(max-height:650px)_and_(min-width:1024px)]:text-[0.59rem] [@media(max-height:650px)_and_(min-width:1024px)]:leading-[1.24]">
        {step.description}
      </p>
      <i
        className={`absolute bottom-2.5 h-px w-9 bg-gradient-to-r from-transparent to-brand-500/60 [@media(max-height:650px)_and_(min-width:1024px)]:hidden ${
          step.side === 'left' ? 'right-3.5' : 'left-3.5 -scale-x-100'
        }`}
        aria-hidden="true"
      />
    </article>
  );
}

function EcosystemStack() {
  return (
    <div className="absolute inset-0 min-[901px]:bottom-[30px]" data-ecosystem-stack>
      <div
        className="absolute left-1/2 top-[10%] z-0 h-[80%] w-px origin-center bg-gradient-to-b from-transparent via-brand-500/60 to-transparent opacity-0 min-[901px]:top-[7%] min-[901px]:h-[86%]"
        data-ecosystem-unified-line
        aria-hidden="true"
      />
      {ecosystemSteps.map((step) => (
        <div
          key={step.id}
          className={`absolute left-1/2 aspect-[2400/1610] origin-center will-change-[transform,opacity] ${layerPlacement[step.id]} ${
            step.id === 'access' ? layerWidth.access : layerWidth.default
          }`}
          data-ecosystem-layer={step.id}
          style={{ zIndex: step.z }}
          aria-hidden="true"
        >
          <div
            className="absolute -z-10 inset-[11%_3%] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.20),transparent_66%)] opacity-0"
            data-ecosystem-layer-glow={step.id}
          />
          <img
            className="absolute inset-0 h-full w-full object-contain [backface-visibility:hidden]"
            src={step.inactiveImage}
            width={step.width}
            height={step.height}
            alt=""
            loading="eager"
            decoding="async"
            data-ecosystem-image="inactive"
          />
          <img
            className="absolute inset-0 h-full w-full object-contain opacity-0 [backface-visibility:hidden]"
            src={step.activeImage}
            width={step.width}
            height={step.height}
            alt=""
            loading={step.id === 'access' ? 'eager' : 'lazy'}
            decoding="async"
            data-ecosystem-image="active"
          />
        </div>
      ))}
    </div>
  );
}

function EcosystemConnectors() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] hidden h-full w-full overflow-visible min-[901px]:block"
      preserveAspectRatio="none"
      data-ecosystem-connectors
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ecosystemSignalGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffaf6" stopOpacity="1" />
          <stop offset="42%" stopColor="#f97316" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
      </defs>
      {ecosystemSteps.map((step) => (
        <g
          key={step.id}
          className="group"
          data-ecosystem-connector={step.id}
        >
          <path
            id={`ecosystem-path-${step.id}`}
            className="fill-none stroke-black/20 [stroke-dasharray:5_9] [stroke-width:1] [vector-effect:non-scaling-stroke]"
            data-ecosystem-path-base
            d="M 0 0"
          />
          <path
            className="fill-none stroke-brand-500 opacity-0 drop-shadow-[0_0_4px_rgba(249,115,22,0.28)] [stroke-dasharray:6_8] [stroke-width:1.5] [vector-effect:non-scaling-stroke]"
            data-ecosystem-path-active
            d="M 0 0"
          />
          <circle
            className="fill-black/35 stroke-[#fffaf6] [stroke-width:2] [vector-effect:non-scaling-stroke] group-[.is-active]:fill-brand-500 group-[.is-unified]:fill-brand-500"
            data-ecosystem-source
            r="4"
          />
          <circle
            className="fill-black/35 stroke-[#fffaf6] [stroke-width:2] [vector-effect:non-scaling-stroke] group-[.is-active]:fill-brand-500 group-[.is-unified]:fill-brand-500"
            data-ecosystem-destination
            r="4.5"
          />
          <circle
            className="opacity-0 group-[.is-active]:opacity-100 motion-reduce:hidden"
            r="10"
            fill="url(#ecosystemSignalGlow)"
          >
            <animateMotion dur="1.7s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#ecosystem-path-${step.id}`} />
            </animateMotion>
          </circle>
          <circle
            className="fill-[#fffaf6] stroke-brand-500 opacity-0 [stroke-width:0.75] group-[.is-active]:opacity-100 motion-reduce:hidden"
            r="3"
          >
            <animateMotion dur="1.7s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#ecosystem-path-${step.id}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function EcosystemSection() {
  const sectionRef = useRef(null);
  const activeStateRef = useRef('intro');

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    const getElements = (selector) => Array.from(section.querySelectorAll(selector));
    const layers = getElements('[data-ecosystem-layer]');
    const cards = getElements('[data-ecosystem-card]');
    const progressDots = getElements('[data-ecosystem-step-dot]');
    const cardsByStep = ecosystemSteps.map((step) => getElements(`[data-ecosystem-card="${step.id}"]`));
    const connectors = getElements('[data-ecosystem-connector]');
    const activeImages = getElements('[data-ecosystem-image="active"]');
    const inactiveImages = getElements('[data-ecosystem-image="inactive"]');
    const glows = getElements('[data-ecosystem-layer-glow]');
    const activePaths = getElements('[data-ecosystem-path-active]');
    const headerItems = getElements('[data-ecosystem-header-item]');
    const finalStatement = section.querySelector('[data-ecosystem-final]');
    const unifiedLine = section.querySelector('[data-ecosystem-unified-line]');
    const stack = section.querySelector('[data-ecosystem-stack]');
    const composition = section.querySelector('[data-ecosystem-composition]');
    const connectorSvg = section.querySelector('[data-ecosystem-connectors]');

    let connectorFrame = 0;

    const updateConnectors = () => {
      connectorFrame = 0;
      if (!composition || !connectorSvg || window.innerWidth <= 900) return;

      const compositionRect = composition.getBoundingClientRect();
      if (!compositionRect.width || !compositionRect.height) return;

      connectorSvg.setAttribute('viewBox', `0 0 ${compositionRect.width} ${compositionRect.height}`);

      ecosystemSteps.forEach((step) => {
        const card = section.querySelector(`[data-ecosystem-mode="desktop"][data-ecosystem-card="${step.id}"]`);
        const layer = section.querySelector(`[data-ecosystem-layer="${step.id}"]`);
        const connector = section.querySelector(`[data-ecosystem-connector="${step.id}"]`);
        if (!card || !layer || !connector) return;

        const cardRect = card.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        const sourceX = step.side === 'left'
          ? cardRect.right - compositionRect.left
          : cardRect.left - compositionRect.left;
        const sourceY = cardRect.top - compositionRect.top + cardRect.height / 2;
        const destinationX = layerRect.left - compositionRect.left + layerRect.width / 2;
        const destinationY = layerRect.top - compositionRect.top + layerRect.height / 2;
        const direction = step.side === 'left' ? 1 : -1;
        const horizontalDistance = Math.abs(destinationX - sourceX);
        const controlDistance = Math.max(36, horizontalDistance * 0.48);
        const path = [
          `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)}`,
          `C ${(sourceX + direction * controlDistance).toFixed(2)} ${sourceY.toFixed(2)}`,
          `${(destinationX - direction * controlDistance * 0.55).toFixed(2)} ${destinationY.toFixed(2)}`,
          `${destinationX.toFixed(2)} ${destinationY.toFixed(2)}`,
        ].join(' ');

        connector.querySelector('[data-ecosystem-path-base]')?.setAttribute('d', path);
        connector.querySelector('[data-ecosystem-path-active]')?.setAttribute('d', path);

        const source = connector.querySelector('[data-ecosystem-source]');
        const destination = connector.querySelector('[data-ecosystem-destination]');
        source?.setAttribute('cx', sourceX);
        source?.setAttribute('cy', sourceY);
        destination?.setAttribute('cx', destinationX);
        destination?.setAttribute('cy', destinationY);
      });
    };

    const scheduleConnectorUpdate = () => {
      if (connectorFrame) return;
      connectorFrame = window.requestAnimationFrame(updateConnectors);
    };

    const getHeaderHeight = () => {
      const value = window.getComputedStyle(section).getPropertyValue('--elvora-header-height');
      return Number.parseFloat(value) || 0;
    };

    const setActiveState = (nextState) => {
      if (activeStateRef.current === nextState) return;
      activeStateRef.current = nextState;
      section.dataset.ecosystemState = nextState;
      const activeIndex = ecosystemSteps.findIndex((step) => step.id === nextState);
      const unified = nextState === 'unified';

      [...layers, ...cards, ...connectors].forEach((element) => {
        const id = element.dataset.ecosystemLayer || element.dataset.ecosystemCard || element.dataset.ecosystemConnector;
        element.classList.toggle('is-active', activeIndex >= 0 && id === ecosystemSteps[activeIndex].id);
        element.classList.toggle('is-unified', unified);
        element.classList.toggle(
          'is-preview',
          nextState === 'intro' && element.dataset.ecosystemMode === 'mobile' && id === ecosystemSteps[0].id,
        );
      });
      progressDots.forEach((dot) => {
        dot.classList.toggle('is-active', dot.dataset.ecosystemStepDot === nextState);
        dot.classList.toggle('is-unified', unified);
      });
    };

    const setBase = () => {
      layers.forEach((layer, index) => {
        gsap.set(layer, {
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          scale: index === 0 ? 1 : 0.99,
          opacity: 0.64,
          zIndex: ecosystemSteps[index].z,
          force3D: true,
        });
      });
      gsap.set(activeImages, { opacity: 0 });
      gsap.set(inactiveImages, { opacity: 1 });
      gsap.set(glows, { opacity: 0, scale: 0.92 });
      gsap.set(cards, { opacity: 0.58, scale: 0.99, y: 0 });
      gsap.set(activePaths, { opacity: 0 });
      gsap.set(finalStatement, { opacity: 0, y: 8 });
      gsap.set(unifiedLine, { opacity: 0, scaleY: 0.35 });
      gsap.set(stack, { opacity: 1, scale: 1 });
      gsap.set(headerItems, { opacity: 1, y: 0 });
      activeStateRef.current = '';
      setActiveState('intro');
      scheduleConnectorUpdate();
    };

    const addStep = (timeline, activeIndex, at, lift) => {
      ecosystemSteps.forEach((step, index) => {
        const distance = Math.abs(index - activeIndex);
        const neighbourShift = index === activeIndex ? -lift : Math.sign(index - activeIndex) * Math.max(2, 7 - distance * 2);

        timeline.to(layers[index], {
          y: neighbourShift,
          scale: index === activeIndex ? 1.035 : distance === 1 ? 0.995 : 0.982,
          opacity: index === activeIndex ? 1 : 0.6,
          duration: 11,
        }, at);
        timeline.to(activeImages[index], { opacity: index === activeIndex ? 1 : 0, duration: 8 }, at);
        timeline.to(inactiveImages[index], { opacity: index === activeIndex ? 0.26 : 1, duration: 8 }, at);
        timeline.to(glows[index], {
          opacity: index === activeIndex ? 0.72 : 0,
          scale: index === activeIndex ? 1 : 0.92,
          duration: 8,
        }, at);
        timeline.to(cardsByStep[index], {
          opacity: index === activeIndex ? 1 : 0.58,
          scale: index === activeIndex ? 1 : 0.99,
          duration: 8,
        }, at);
        timeline.to(activePaths[index], { opacity: index === activeIndex ? 1 : 0, duration: 7 }, at);
      });
      timeline.to(finalStatement, { opacity: 0, y: 8, duration: 5 }, at);
      timeline.to(unifiedLine, { opacity: 0, scaleY: 0.4, duration: 5 }, at);
    };

    const buildTimeline = (lift, scrub = 0.68) => {
      setBase();

      const timeline = gsap.timeline({
        defaults: { ease: 'power1.inOut' },
        scrollTrigger: {
          trigger: section,
          start: () => `top top+=${getHeaderHeight()}`,
          end: 'bottom bottom',
          scrub,
          invalidateOnRefresh: true,
          onRefresh: scheduleConnectorUpdate,
          onUpdate: (self) => {
            const progress = self.progress;
            if (progress < 0.1) setActiveState('intro');
            else if (progress >= 0.86) setActiveState('unified');
            else {
              const activeIndex = Math.min(4, Math.max(0, Math.floor((progress - 0.1) / 0.152)));
              setActiveState(ecosystemSteps[activeIndex].id);
            }
            scheduleConnectorUpdate();
          },
        },
      });

      timeline.addLabel('intro', 0);
      timeline.to(headerItems, { opacity: 1, y: 0, duration: 8 }, 0);
      timeline.to(stack, { opacity: 1, scale: 1, duration: 8 }, 0);
      timeline.to(cards, { opacity: 0.6, duration: 7 }, 1);

      ecosystemSteps.forEach((step, index) => {
        const at = 12 + index * 15;
        timeline.addLabel(step.id, at);
        addStep(timeline, index, at, lift);
      });

      timeline.addLabel('unified', 88);
      ecosystemSteps.forEach((step, index) => {
        timeline.to(layers[index], { y: 0, scale: 1, opacity: 0.9, duration: 10 }, 88);
        timeline.to(activeImages[index], { opacity: 0.42, duration: 10 }, 88);
        timeline.to(inactiveImages[index], { opacity: 0.84, duration: 10 }, 88);
        timeline.to(glows[index], { opacity: 0.18, scale: 1, duration: 10 }, 88);
        timeline.to(cardsByStep[index], { opacity: 0.78, scale: 1, duration: 10 }, 88);
        timeline.to(activePaths[index], { opacity: 0.46, duration: 10 }, 88);
      });
      timeline.to(unifiedLine, { opacity: 1, scaleY: 1, duration: 9 }, 88);
      timeline.to(finalStatement, { opacity: 1, y: 0, duration: 8 }, 90);
      timeline.to({}, { duration: 4 });

      return timeline;
    };

    const resizeObserver = new window.ResizeObserver(scheduleConnectorUpdate);
    if (composition) resizeObserver.observe(composition);
    layers.forEach((layer) => resizeObserver.observe(layer));
    cards.filter((card) => card.dataset.ecosystemMode === 'desktop')
      .forEach((card) => resizeObserver.observe(card));

    window.addEventListener('resize', scheduleConnectorUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleConnectorUpdate, { passive: true });
    ScrollTrigger.addEventListener('refresh', scheduleConnectorUpdate);

    let media;
    const context = gsap.context(() => {
      media = gsap.matchMedia();

      media.add('(prefers-reduced-motion: reduce)', () => {
        setBase();
        setActiveState('unified');
        gsap.set(headerItems, { opacity: 1, y: 0 });
        gsap.set(stack, { opacity: 1, scale: 1 });
        gsap.set(layers, { opacity: 0.92, scale: 1, y: 0 });
        gsap.set(activeImages, { opacity: 0.4 });
        gsap.set(inactiveImages, { opacity: 0.86 });
        gsap.set(cards, { opacity: 1, scale: 1, y: 0 });
        gsap.set(activePaths, { opacity: 0.3 });
        gsap.set(finalStatement, { opacity: 1, y: 0 });
        gsap.set(unifiedLine, { opacity: 0.66, scaleY: 1 });
        scheduleConnectorUpdate();
      });

      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 1201px) and (min-height: 851px)',
        () => buildTimeline(16, 0.7),
      );
      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 1024px) and (max-height: 850px)',
        () => buildTimeline(11, 0.62),
      );
      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 901px) and (max-width: 1200px) and (min-height: 851px)',
        () => buildTimeline(13, 0.66),
      );
      media.add(
        '(prefers-reduced-motion: no-preference) and (max-width: 900px)',
        () => buildTimeline(10, 0.58),
      );

      const imageDecodes = getElements('[data-ecosystem-image]')
        .map((image) => image.decode?.().catch(() => undefined));
      const fontsReady = document.fonts?.ready ?? Promise.resolve();

      Promise.all([Promise.all(imageDecodes), fontsReady]).then(() => {
        if (!section.isConnected) return;
        scheduleConnectorUpdate();
        ScrollTrigger.refresh();
      });
    }, section);

    return () => {
      if (connectorFrame) window.cancelAnimationFrame(connectorFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleConnectorUpdate);
      window.removeEventListener('orientationchange', scheduleConnectorUpdate);
      ScrollTrigger.removeEventListener('refresh', scheduleConnectorUpdate);
      media?.revert();
      context.revert();
      activeStateRef.current = 'intro';
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={[
        'relative isolate h-[600vh] overflow-clip bg-[#fffaf6] text-[#171717]',
        'bg-[radial-gradient(circle_at_50%_58%,rgba(249,115,22,0.10),transparent_32%),linear-gradient(rgba(23,23,23,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(23,23,23,0.045)_1px,transparent_1px)]',
        'bg-[length:auto,180px_180px,180px_180px] max-[900px]:h-[430vh]',
        'max-[900px]:bg-[length:auto,120px_120px,120px_120px]',
        'motion-reduce:h-auto',
        '[@media(max-height:650px)_and_(min-width:1024px)]:h-[420vh]',
      ].join(' ')}
      aria-labelledby="elvora-ecosystem-title"
      data-ecosystem-state="intro"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),transparent_11%,transparent_88%,rgba(255,255,255,0.90)),radial-gradient(ellipse_at_50%_58%,rgba(249,115,22,0.08),transparent_42%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-[14%_25%] -z-10 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12),rgba(255,255,255,0.60)_34%,transparent_69%)] blur-[18px]"
        aria-hidden="true"
      />

      <div className="sticky top-[72px] h-[calc(100svh-72px)] w-full min-[901px]:top-[84px] min-[901px]:h-[calc(100svh-84px)] motion-reduce:relative motion-reduce:top-0 motion-reduce:h-auto">
        <div className="mx-auto grid h-full min-h-0 w-[min(100%-24px,720px)] grid-rows-[auto_minmax(0,1fr)] py-3 min-[901px]:w-[min(100%-32px,1160px)] min-[901px]:py-[clamp(18px,3vh,42px)] min-[1201px]:w-[min(100%-48px,1500px)] [@media(max-height:850px)_and_(min-width:1024px)]:py-3.5 [@media(max-height:650px)_and_(min-width:1024px)]:py-2 motion-reduce:h-auto motion-reduce:min-h-[760px] motion-reduce:py-12 max-[900px]:motion-reduce:min-h-0">
          <header className="grid items-end gap-[clamp(32px,6vw,96px)] pb-[clamp(16px,2.5vh,34px)] min-[901px]:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] max-[900px]:block max-[900px]:pb-3 [@media(max-height:850px)_and_(min-width:1024px)]:gap-7 [@media(max-height:850px)_and_(min-width:1024px)]:pb-3.5 [@media(max-height:650px)_and_(min-width:1024px)]:pb-2">
            <h2
              id="elvora-ecosystem-title"
              className="m-0 max-w-[760px] text-[clamp(2.5rem,4.2vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-[#f26a13] [text-wrap:balance] max-[900px]:text-[clamp(1.85rem,7.5vw,3rem)] max-[560px]:text-[clamp(1.62rem,7.8vw,2.25rem)] [@media(max-height:850px)_and_(min-width:1024px)]:max-w-[620px] [@media(max-height:850px)_and_(min-width:1024px)]:text-[clamp(2.2rem,3.4vw,3.8rem)] [@media(max-height:650px)_and_(min-width:1024px)]:text-[clamp(1.75rem,3vw,2.6rem)]"
              data-ecosystem-header-item
            >
              <span className="block">The Complete AI-Powered</span>
              <span className="block">Examination Ecosystem</span>
            </h2>
            <p
              className="mb-0.5 max-w-[500px] text-[clamp(0.9rem,1vw,1.02rem)] leading-[1.55] text-black/65 max-[900px]:mt-2.5 max-[900px]:max-w-[580px] max-[900px]:text-[clamp(0.78rem,2.3vw,0.94rem)] max-[560px]:mt-2 max-[560px]:text-[0.78rem] [@media(max-height:850px)_and_(min-width:1024px)]:max-w-[440px] [@media(max-height:850px)_and_(min-width:1024px)]:text-[0.88rem] [@media(max-height:850px)_and_(min-width:1024px)]:leading-[1.45] [@media(max-height:650px)_and_(min-width:1024px)]:text-[0.72rem] [@media(max-height:650px)_and_(min-width:1024px)]:leading-[1.35]"
              data-ecosystem-header-item
            >
              Elvora brings assessment creation, collaboration, moderation, proctoring, and academic control into one connected workflow.
            </p>
          </header>

          <div
            className="relative grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] items-center min-[901px]:grid-cols-[minmax(220px,1fr)_minmax(300px,390px)_minmax(220px,1fr)] min-[901px]:grid-rows-5 min-[901px]:gap-x-6 min-[1201px]:grid-cols-[minmax(250px,1fr)_minmax(340px,500px)_minmax(250px,1fr)] min-[1201px]:gap-x-[clamp(28px,4vw,72px)] [@media(max-height:850px)_and_(min-width:1024px)]:gap-x-7 motion-reduce:min-h-[620px] max-[900px]:motion-reduce:block max-[900px]:motion-reduce:min-h-0"
            data-ecosystem-composition
          >
            <EcosystemConnectors />

            {ecosystemSteps.map((step) => <EcosystemCard key={step.id} step={step} />)}

            <div className="relative z-[4] col-start-1 row-start-1 h-full min-h-0 min-[901px]:col-start-2 min-[901px]:row-span-5 min-[901px]:row-start-1 max-[900px]:motion-reduce:h-[420px]">
              <EcosystemStack />
              <p
                className="absolute bottom-0 left-1/2 z-50 m-0 w-[min(90%,520px)] -translate-x-1/2 rounded-full border border-brand-500/15 bg-[#fffaf6]/90 px-2.5 py-1 text-center text-[clamp(0.68rem,0.8vw,0.88rem)] font-bold leading-[1.35] text-black/75 opacity-0 shadow-[0_8px_24px_rgba(23,23,23,0.06)] [@media(max-height:650px)_and_(min-width:1024px)]:text-[0.62rem]"
                data-ecosystem-final
              >
                One platform. Every examination workflow. Fully connected.
              </p>
            </div>

            <div className="relative col-start-1 row-start-2 mt-2 hidden min-h-[clamp(132px,18vh,158px)] pl-3.5 max-[900px]:block max-[560px]:min-h-[142px] max-[900px]:motion-reduce:mt-[18px] max-[900px]:motion-reduce:grid max-[900px]:motion-reduce:min-h-0 max-[900px]:motion-reduce:gap-3 max-[900px]:motion-reduce:pl-0">
              <div className="absolute bottom-2 left-0 top-2 z-[9] flex w-0.5 flex-col justify-around bg-black/10 motion-reduce:hidden" aria-hidden="true">
                {ecosystemSteps.map((step) => (
                  <i
                    key={step.id}
                    className="-ml-0.5 block h-1.5 w-1.5 rounded-full border border-[#fffaf6] bg-black/20 transition [&.is-active]:scale-110 [&.is-active]:bg-brand-500 [&.is-active]:shadow-[0_0_0_4px_rgba(249,115,22,0.12)] [&.is-unified]:bg-brand-500"
                    data-ecosystem-step-dot={step.id}
                  />
                ))}
              </div>
              {ecosystemSteps.map((step) => <EcosystemCard key={`mobile-${step.id}`} step={step} mobile />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
