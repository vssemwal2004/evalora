import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ecosystemStateRanges, ecosystemSteps } from './ecosystemData.js';

gsap.registerPlugin(ScrollTrigger);

const desktopCardPlacement = {
  access: 'min-[901px]:col-start-1 min-[901px]:row-start-1 min-[901px]:justify-self-end',
  create: 'min-[901px]:col-start-3 min-[901px]:row-start-2 min-[901px]:justify-self-start',
  collaborate: 'min-[901px]:col-start-1 min-[901px]:row-start-3 min-[901px]:justify-self-end',
  secure: 'min-[901px]:col-start-3 min-[901px]:row-start-4 min-[901px]:justify-self-start',
  intelligence: 'min-[901px]:col-start-1 min-[901px]:row-start-5 min-[901px]:justify-self-end',
};

const headingClass = [
  'mx-auto max-w-[920px] text-center text-[clamp(2.15rem,3.15vw,3.55rem)] font-semibold leading-[0.98]',
  'tracking-[-0.035em] text-[#F36B16] [text-wrap:balance]',
  'max-[900px]:text-[clamp(1.8rem,7vw,2.65rem)]',
  '[@media(max-height:850px)_and_(min-width:901px)]:max-w-[760px]',
  '[@media(max-height:850px)_and_(min-width:901px)]:text-[clamp(1.95rem,2.75vw,3rem)]',
  '[@media(max-height:760px)_and_(min-width:901px)]:text-[clamp(1.75rem,2.35vw,2.45rem)]',
].join(' ');

const subtitleClass = [
  'mx-auto mt-3 max-w-[620px] text-center text-[clamp(0.84rem,0.96vw,1rem)] leading-6 text-black/55',
  'max-[900px]:mt-2.5 max-[900px]:max-w-[36rem] max-[900px]:text-[0.86rem] max-[900px]:leading-6',
  '[@media(max-height:850px)_and_(min-width:901px)]:max-w-[430px]',
  '[@media(max-height:850px)_and_(min-width:901px)]:text-[0.84rem]',
  '[@media(max-height:850px)_and_(min-width:901px)]:leading-[1.55]',
  '[@media(max-height:760px)_and_(min-width:901px)]:text-[0.76rem]',
  '[@media(max-height:760px)_and_(min-width:901px)]:leading-[1.45]',
].join(' ');

const desktopGridClass = [
  'relative hidden h-full grid-cols-[minmax(230px,0.9fr)_minmax(390px,480px)_minmax(230px,0.9fr)] grid-rows-5 items-center',
  'gap-x-[clamp(22px,3vw,48px)] min-[901px]:grid',
  '[@media(max-height:850px)_and_(min-width:901px)]:gap-x-8',
  '[@media(max-height:850px)_and_(min-width:901px)]:grid-cols-[minmax(190px,0.85fr)_minmax(290px,360px)_minmax(190px,0.85fr)]',
  '[@media(max-height:760px)_and_(min-width:901px)]:grid-cols-[minmax(180px,0.82fr)_minmax(250px,320px)_minmax(180px,0.82fr)]',
].join(' ');

const cardPanelClass = [
  'group relative z-[7] w-full max-w-[330px] rounded-[6px] border border-black/[0.10] bg-white/52 px-5 py-4',
  'backdrop-blur-[3px] will-change-[opacity,transform] transition-none',
  '[&.is-active]:border-[#F36B16]/34 [&.is-active]:bg-white/72 [&.is-active]:shadow-[0_20px_50px_rgba(24,24,24,0.075)]',
  '[&.is-unified]:border-black/[0.10] [&.is-unified]:bg-white/62',
  '[@media(max-height:850px)_and_(min-width:901px)]:max-w-[300px]',
  '[@media(max-height:850px)_and_(min-width:901px)]:px-4',
  '[@media(max-height:850px)_and_(min-width:901px)]:py-3.5',
  '[@media(max-height:760px)_and_(min-width:901px)]:max-w-[276px]',
  '[@media(max-height:760px)_and_(min-width:901px)]:px-3.5',
  '[@media(max-height:760px)_and_(min-width:901px)]:py-3',
].join(' ');

const stackWidthClass = [
  'w-[clamp(230px,21vw,360px)]',
  '[@media(max-height:900px)_and_(min-width:901px)]:w-[clamp(210px,19vw,295px)]',
  '[@media(max-height:760px)_and_(min-width:901px)]:w-[clamp(185px,16vw,255px)]',
  'max-[900px]:w-[clamp(220px,62vw,300px)] max-[420px]:w-[clamp(205px,58vw,260px)]',
].join(' ');

function getStateForProgress(progress) {
  return ecosystemStateRanges.find((range) => progress >= range.start && progress < range.end)?.id ?? 'unified';
}

function getMobileCounterText(stateId) {
  if (stateId === 'unified') return '05 / 05';
  const activeId = stateId === 'intro' ? ecosystemSteps[0].id : stateId;
  const activeIndex = ecosystemSteps.findIndex((step) => step.id === activeId);
  return `${String(Math.max(0, activeIndex) + 1).padStart(2, '0')} / 05`;
}

function EcosystemHeader() {
  return (
    <header className="mx-auto w-full pt-5 pb-5 text-center max-[900px]:pt-2 max-[900px]:pb-4 [@media(max-height:850px)_and_(min-width:901px)]:pt-3 [@media(max-height:850px)_and_(min-width:901px)]:pb-3 [@media(max-height:760px)_and_(min-width:901px)]:pt-2 [@media(max-height:760px)_and_(min-width:901px)]:pb-2">
      <h2 id="elvora-ecosystem-title" className={headingClass} data-ecosystem-header-item>
        <span className="block">The Complete AI-Powered</span>
        <span className="block">Examination Ecosystem</span>
      </h2>

      <p className={subtitleClass} data-ecosystem-header-item>
        Elvora brings assessment creation, collaboration, moderation, proctoring, and academic control into one connected workflow.
      </p>
    </header>
  );
}

function EcosystemCard({ step, mobile = false }) {
  const modeClass = mobile
    ? [
      'absolute inset-x-0 top-0 !max-w-none invisible min-h-[154px] opacity-0',
      '[&.is-active]:visible [&.is-preview]:visible [&.is-unified]:visible',
      'motion-reduce:relative motion-reduce:visible motion-reduce:opacity-100',
    ].join(' ')
    : `hidden min-[901px]:block ${desktopCardPlacement[step.id]}`;

  return (
    <article
      className={`${cardPanelClass} ${modeClass}`}
      data-ecosystem-card={step.id}
      data-ecosystem-mode={mobile ? 'mobile' : 'desktop'}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-[radial-gradient(ellipse_at_bottom,rgba(243,107,22,0.14),transparent_68%)] opacity-0 group-[.is-active]:opacity-100 group-[.is-unified]:opacity-45"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 h-px w-8 bg-gradient-to-r from-[#F36B16]/55 to-transparent ${
          step.side === 'left' ? 'right-0 translate-x-[55%]' : 'left-0 -translate-x-[55%] -scale-x-100'
        } max-[900px]:hidden`}
      />
      <span className="relative block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F36B16]/82 group-[.is-active]:text-[#F36B16] group-[.is-unified]:text-[#F36B16]/90">
        {step.label}
      </span>
      <h3 className="relative mt-2 text-[clamp(1rem,1.15vw,1.28rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-black/82 group-[.is-active]:text-[#181818] [@media(max-height:850px)_and_(min-width:901px)]:text-[0.96rem] [@media(max-height:760px)_and_(min-width:901px)]:text-[0.84rem]">
        {step.title}
      </h3>
      <p className="relative mt-2 max-w-[32rem] text-[clamp(0.72rem,0.78vw,0.88rem)] leading-[1.45] text-black/62 group-[.is-active]:text-black/68 [@media(max-height:850px)_and_(min-width:901px)]:text-[0.72rem] [@media(max-height:850px)_and_(min-width:901px)]:leading-[1.38] [@media(max-height:760px)_and_(min-width:901px)]:text-[0.66rem] [@media(max-height:760px)_and_(min-width:901px)]:leading-[1.32]">
        {step.description}
      </p>
    </article>
  );
}

function EcosystemLayer({ step }) {
  return (
    <div
      className={`absolute left-1/2 origin-center will-change-[transform,opacity] ${stackWidthClass}`}
      data-ecosystem-layer={step.id}
      style={{
        top: `${step.layerPosition}%`,
        zIndex: step.zIndex,
        aspectRatio: `${step.width} / ${step.height}`,
      }}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-[12%_8%] -z-10 rounded-full bg-[radial-gradient(circle,rgba(243,107,22,0.18),transparent_72%)] opacity-0"
        data-ecosystem-layer-glow={step.id}
      />
      <img
        className="absolute inset-0 h-full w-full object-contain brightness-[0.74] contrast-[1.24] saturate-[1.04] drop-shadow-[0_16px_30px_rgba(24,24,24,0.2)] [backface-visibility:hidden]"
        src={step.inactiveImage}
        width={step.width}
        height={step.height}
        alt=""
        loading="eager"
        decoding="async"
        data-ecosystem-image="inactive"
        data-step-id={step.id}
      />
      <img
        className="absolute inset-0 h-full w-full object-contain opacity-0 brightness-[0.94] contrast-[1.16] saturate-[1.12] drop-shadow-[0_20px_34px_rgba(24,24,24,0.24)] [backface-visibility:hidden]"
        src={step.activeImage}
        width={step.width}
        height={step.height}
        alt=""
        loading={step.id === 'access' ? 'eager' : 'lazy'}
        decoding="async"
        data-ecosystem-image="active"
        data-step-id={step.id}
      />
    </div>
  );
}

function EcosystemStack() {
  return (
    <div className="absolute inset-0" data-ecosystem-stack>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(243,107,22,0.065),transparent_63%)] blur-xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-black/10 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 origin-top bg-gradient-to-b from-transparent via-[#F36B16]/80 to-transparent opacity-0"
        data-ecosystem-spine-active
      />
      {ecosystemSteps.map((step) => <EcosystemLayer key={step.id} step={step} />)}
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
      {ecosystemSteps.map((step) => (
        <g key={step.id} className="group opacity-0" data-ecosystem-connector={step.id}>
          <path
            className="fill-none stroke-black/18 [stroke-dasharray:4_8] [stroke-width:1] [vector-effect:non-scaling-stroke]"
            data-ecosystem-path-base={step.id}
            d="M 0 0"
          />
          <path
            className="fill-none stroke-[#F36B16] opacity-0 [stroke-dasharray:5_7] [stroke-width:1.4] [vector-effect:non-scaling-stroke]"
            data-ecosystem-path-active={step.id}
            d="M 0 0"
          />
          <circle
            className="fill-black/25 stroke-[#FCFAF7] [stroke-width:1.6] [vector-effect:non-scaling-stroke] group-[.is-active]:fill-[#F36B16] group-[.is-unified]:fill-[#F36B16]/80"
            data-ecosystem-source={step.id}
            r="3.6"
          />
          <circle
            className="fill-[#F36B16] opacity-0 [vector-effect:non-scaling-stroke]"
            data-ecosystem-destination-halo={step.id}
            r="8"
          />
          <circle
            className="fill-black/25 stroke-[#FCFAF7] [stroke-width:1.7] [vector-effect:non-scaling-stroke] group-[.is-active]:fill-[#F36B16] group-[.is-unified]:fill-[#F36B16]/80"
            data-ecosystem-destination={step.id}
            r="4.2"
          />
          <g data-ecosystem-signal={step.id} className="opacity-0 motion-reduce:hidden">
            <circle r="8" fill="#F36B16" fillOpacity="0.18" />
            <circle r="3.5" fill="#F36B16" fillOpacity="0.72" />
            <circle r="2" fill="#FFF8F2" />
          </g>
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

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = document.querySelector('.elvora-header');
    const composition = section.querySelector('[data-ecosystem-composition]');
    const connectorSvg = section.querySelector('[data-ecosystem-connectors]');
    const stack = section.querySelector('[data-ecosystem-stack]');
    const finalStatement = section.querySelector('[data-ecosystem-final]');
    const activeSpine = section.querySelector('[data-ecosystem-spine-active]');
    const mobileCounter = section.querySelector('[data-ecosystem-mobile-counter]');
    const headerItems = Array.from(section.querySelectorAll('[data-ecosystem-header-item]'));
    const progressDots = Array.from(section.querySelectorAll('[data-ecosystem-step-dot]'));

    const desktopCardsById = Object.fromEntries(
      ecosystemSteps.map((step) => [
        step.id,
        section.querySelector(`[data-ecosystem-card="${step.id}"][data-ecosystem-mode="desktop"]`),
      ]),
    );
    const mobileCardsById = Object.fromEntries(
      ecosystemSteps.map((step) => [
        step.id,
        section.querySelector(`[data-ecosystem-card="${step.id}"][data-ecosystem-mode="mobile"]`),
      ]),
    );
    const layersById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-layer="${step.id}"]`)]),
    );
    const glowsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-layer-glow="${step.id}"]`)]),
    );
    const activeImagesById = Object.fromEntries(
      ecosystemSteps.map((step) => [
        step.id,
        section.querySelector(`[data-ecosystem-image="active"][data-step-id="${step.id}"]`),
      ]),
    );
    const inactiveImagesById = Object.fromEntries(
      ecosystemSteps.map((step) => [
        step.id,
        section.querySelector(`[data-ecosystem-image="inactive"][data-step-id="${step.id}"]`),
      ]),
    );
    const connectorsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-connector="${step.id}"]`)]),
    );
    const basePathsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-path-base="${step.id}"]`)]),
    );
    const activePathsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-path-active="${step.id}"]`)]),
    );
    const sourceDotsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-source="${step.id}"]`)]),
    );
    const destinationDotsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-destination="${step.id}"]`)]),
    );
    const destinationHalosById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-destination-halo="${step.id}"]`)]),
    );
    const signalsById = Object.fromEntries(
      ecosystemSteps.map((step) => [step.id, section.querySelector(`[data-ecosystem-signal="${step.id}"]`)]),
    );
    const cardsById = Object.fromEntries(
      ecosystemSteps.map((step) => [
        step.id,
        [desktopCardsById[step.id], mobileCardsById[step.id]].filter(Boolean),
      ]),
    );

    const layers = Object.values(layersById).filter(Boolean);
    const cards = Object.values(cardsById).flat();
    const connectors = Object.values(connectorsById).filter(Boolean);
    const basePaths = Object.values(basePathsById).filter(Boolean);
    const activePaths = Object.values(activePathsById).filter(Boolean);
    const activeImages = Object.values(activeImagesById).filter(Boolean);
    const inactiveImages = Object.values(inactiveImagesById).filter(Boolean);
    const glows = Object.values(glowsById).filter(Boolean);
    const destinationHalos = Object.values(destinationHalosById).filter(Boolean);

    const signalAnimations = new Map();
    let connectorFrame = 0;
    let media;
    let timeline;

    const updateNavHeight = () => {
      const navHeight = header?.getBoundingClientRect().height || 72;
      section.style.setProperty('--elvora-nav-height', `${Math.round(navHeight)}px`);
    };

    const stopSignalAnimation = (stepId) => {
      signalAnimations.get(stepId)?.kill();
      signalAnimations.delete(stepId);
      const signal = signalsById[stepId];
      if (signal) {
        signal.style.opacity = '0';
        signal.setAttribute('transform', 'translate(-9999 -9999)');
      }
      const halo = destinationHalosById[stepId];
      if (halo) gsap.set(halo, { opacity: 0, scale: 1 });
    };

    const stopAllSignalAnimations = () => {
      ecosystemSteps.forEach((step) => stopSignalAnimation(step.id));
    };

    const startSignalAnimation = (stepId, force = false) => {
      if (window.innerWidth <= 900 || reducedMotionQuery.matches) return;
      if (!force && signalAnimations.has(stepId)) return;

      stopSignalAnimation(stepId);

      const path = activePathsById[stepId];
      const signal = signalsById[stepId];
      const halo = destinationHalosById[stepId];
      if (!path || !signal || !halo || !path.getTotalLength) return;

      const totalLength = path.getTotalLength();
      if (!Number.isFinite(totalLength) || totalLength <= 0) return;

      const proxy = { progress: 0 };
      const pulseTimeline = gsap.timeline({ repeat: -1, repeatDelay: 0.12 });

      pulseTimeline.to(proxy, {
        progress: 1,
        duration: 1.8,
        ease: 'none',
        onStart: () => {
          signal.style.opacity = '1';
        },
        onUpdate: () => {
          const point = path.getPointAtLength(totalLength * proxy.progress);
          const fade = Math.sin(proxy.progress * Math.PI);
          signal.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
          signal.style.opacity = String(Math.max(0, Math.min(1, fade)));
        },
      });

      pulseTimeline.fromTo(
        halo,
        { opacity: 0.08, scale: 1 },
        { opacity: 0.44, scale: 1.5, duration: 0.22, ease: 'power1.out', yoyo: true, repeat: 1 },
        '>-0.18',
      );

      signalAnimations.set(stepId, pulseTimeline);
    };

    const syncSignalAnimations = (force = false) => {
      const stateId = activeStateRef.current;
      if (stateId === 'intro' || stateId === 'unified' || reducedMotionQuery.matches || window.innerWidth <= 900) {
        stopAllSignalAnimations();
        return;
      }

      ecosystemSteps.forEach((step) => {
        if (step.id !== stateId) stopSignalAnimation(step.id);
      });
      startSignalAnimation(stateId, force);
    };

    const updateConnectors = () => {
      connectorFrame = 0;
      updateNavHeight();

      if (!composition || !connectorSvg || window.innerWidth <= 900) {
        stopAllSignalAnimations();
        return;
      }

      const compositionRect = composition.getBoundingClientRect();
      if (!compositionRect.width || !compositionRect.height) return;

      connectorSvg.setAttribute('viewBox', `0 0 ${compositionRect.width} ${compositionRect.height}`);

      ecosystemSteps.forEach((step) => {
        const card = desktopCardsById[step.id];
        const layer = layersById[step.id];
        const basePath = basePathsById[step.id];
        const activePath = activePathsById[step.id];
        const sourceDot = sourceDotsById[step.id];
        const destinationDot = destinationDotsById[step.id];
        const destinationHalo = destinationHalosById[step.id];
        if (!card || !layer || !basePath || !activePath || !sourceDot || !destinationDot || !destinationHalo) return;

        const cardRect = card.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        const sourceX = step.side === 'left'
          ? cardRect.right - compositionRect.left
          : cardRect.left - compositionRect.left;
        const sourceY = cardRect.top - compositionRect.top + (cardRect.height / 2);
        const destinationX = layerRect.left - compositionRect.left + (layerRect.width / 2);
        const destinationY = layerRect.top - compositionRect.top + (layerRect.height / 2);
        const direction = step.side === 'left' ? 1 : -1;
        const horizontalDistance = Math.max(32, Math.abs(destinationX - sourceX));
        const elbow = Math.min(58, horizontalDistance * 0.34);
        const approach = Math.min(30, horizontalDistance * 0.16);
        const controlX = sourceX + (direction * Math.min(84, horizontalDistance * 0.46));
        const controlY = sourceY + ((destinationY - sourceY) * 0.5);
        const path = [
          `M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)}`,
          `L ${(sourceX + (direction * elbow)).toFixed(2)} ${sourceY.toFixed(2)}`,
          `Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${(destinationX - (direction * approach)).toFixed(2)} ${destinationY.toFixed(2)}`,
          `L ${destinationX.toFixed(2)} ${destinationY.toFixed(2)}`,
        ].join(' ');

        basePath.setAttribute('d', path);
        activePath.setAttribute('d', path);
        sourceDot.setAttribute('cx', sourceX.toFixed(2));
        sourceDot.setAttribute('cy', sourceY.toFixed(2));
        destinationDot.setAttribute('cx', destinationX.toFixed(2));
        destinationDot.setAttribute('cy', destinationY.toFixed(2));
        destinationHalo.setAttribute('cx', destinationX.toFixed(2));
        destinationHalo.setAttribute('cy', destinationY.toFixed(2));
      });

      syncSignalAnimations(true);
    };

    const scheduleConnectorUpdate = () => {
      if (connectorFrame) return;
      connectorFrame = window.requestAnimationFrame(updateConnectors);
    };

    const setActiveState = (stateId) => {
      if (activeStateRef.current === stateId) return;
      activeStateRef.current = stateId;
      section.dataset.ecosystemState = stateId;

      const activeId = stateId === 'intro' || stateId === 'unified' ? null : stateId;
      const unified = stateId === 'unified';
      const previewId = ecosystemSteps[0].id;

      ecosystemSteps.forEach((step) => {
        const isActive = step.id === activeId;
        const isPreview = stateId === 'intro' && step.id === previewId;

        [layersById[step.id], connectorsById[step.id], ...cardsById[step.id]].filter(Boolean).forEach((element) => {
          element.classList.toggle('is-active', isActive);
          element.classList.toggle('is-unified', unified);
          element.classList.toggle('is-preview', isPreview && element.dataset.ecosystemMode === 'mobile');
        });
      });

      progressDots.forEach((dot) => {
        const dotId = dot.dataset.ecosystemStepDot;
        dot.classList.toggle('is-active', dotId === (activeId || previewId));
        dot.classList.toggle('is-unified', unified);
      });

      if (mobileCounter) mobileCounter.textContent = getMobileCounterText(stateId);
      syncSignalAnimations();
    };

    const setBase = () => {
      updateNavHeight();

      layers.forEach((layer, index) => {
        gsap.set(layer, {
          xPercent: -50,
          yPercent: -50,
          y: 0,
          scale: 0.975,
          opacity: 0.88,
          zIndex: ecosystemSteps[index].zIndex,
          force3D: true,
        });
      });

      gsap.set(headerItems, { opacity: 1, y: 0 });
      gsap.set(stack, { opacity: 0.92, scale: 0.985, y: 0, transformOrigin: '50% 50%' });
      gsap.set(composition, { y: 0 });
      gsap.set(cards, { opacity: 0, y: 10 });
      gsap.set(connectors, { opacity: 0 });
      gsap.set(basePaths, { opacity: 0.62 });
      gsap.set(activePaths, { opacity: 0 });
      gsap.set(activeImages, { opacity: 0 });
      gsap.set(inactiveImages, { opacity: 1 });
      gsap.set(glows, { opacity: 0, scale: 0.92 });
      gsap.set(destinationHalos, { opacity: 0, scale: 1, transformOrigin: '50% 50%' });
      gsap.set(finalStatement, { opacity: 0, y: 10 });
      gsap.set(activeSpine, { opacity: 0, scaleY: 0.5, transformOrigin: '50% 0%' });
      stopAllSignalAnimations();
      activeStateRef.current = '';
      setActiveState('intro');
      scheduleConnectorUpdate();
    };

    const addStepState = (tl, label, activeIndex, lift) => {
      ecosystemSteps.forEach((step, index) => {
        const distance = Math.abs(index - activeIndex);
        const isActive = index === activeIndex;
        const directionalOffset = isActive
          ? -lift
          : (index < activeIndex ? -Math.max(3, 7 - (distance * 2)) : Math.max(3, 7 - (distance * 2)));

        tl.to(layersById[step.id], {
          y: directionalOffset,
          scale: isActive ? 1.045 : distance === 1 ? 0.985 : 0.972,
          opacity: isActive ? 1 : distance === 1 ? 0.93 : 0.86,
          duration: 10,
          ease: 'power2.inOut',
        }, label);

        tl.to(activeImagesById[step.id], {
          opacity: isActive ? 1 : 0,
          duration: 9,
          ease: 'power1.inOut',
        }, label);

        tl.to(inactiveImagesById[step.id], {
          opacity: isActive ? 0.08 : 1,
          duration: 9,
          ease: 'power1.inOut',
        }, label);

        tl.to(glowsById[step.id], {
          opacity: isActive ? 0.48 : 0,
          scale: isActive ? 1 : 0.92,
          duration: 9,
          ease: 'power1.inOut',
        }, label);

        tl.to(cardsById[step.id], {
          opacity: 1,
          y: isActive ? 0 : 2,
          duration: 8,
          ease: 'power1.inOut',
        }, label);

        tl.to(activePathsById[step.id], {
          opacity: isActive ? 1 : 0,
          duration: 8,
          ease: 'power1.inOut',
        }, label);

        tl.to(basePathsById[step.id], {
          opacity: isActive ? 0.52 : 0.62,
          duration: 8,
          ease: 'power1.inOut',
        }, label);
      });

      tl.to(activeSpine, { opacity: 0, scaleY: 0.45, duration: 5, ease: 'power1.inOut' }, label);
      tl.to(finalStatement, { opacity: 0, y: 10, duration: 5, ease: 'power1.inOut' }, label);
    };

    const buildTimeline = ({ lift, scrub }) => {
      setBase();

      timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub,
          invalidateOnRefresh: true,
          markers: false,
          onRefresh: () => {
            updateNavHeight();
            scheduleConnectorUpdate();
            syncSignalAnimations(true);
          },
          onUpdate: (self) => {
            setActiveState(getStateForProgress(self.progress));
          },
        },
      });

      timeline.addLabel('intro', 0);
      timeline.set(headerItems, { opacity: 1, y: 0 }, 'intro');
      timeline.fromTo(stack, { opacity: 0.92, scale: 0.985, y: 0 }, { opacity: 1, scale: 1, y: 0, duration: 10, ease: 'power2.out' }, 'intro');
      timeline.to(cards, { opacity: 1, y: 0, duration: 8, ease: 'power1.out' }, 'intro+=1');
      timeline.to(connectors, { opacity: 1, duration: 7, ease: 'power1.out' }, 'intro+=1.4');

      timeline.addLabel('access', 9);
      timeline.to(headerItems, { opacity: 0, y: -58, duration: 8, ease: 'power2.inOut' }, 'access');
      timeline.to(composition, { y: -24, duration: 9, ease: 'power2.inOut' }, 'access');
      timeline.to(stack, { y: 0, duration: 8, ease: 'power1.inOut' }, 'access');
      addStepState(timeline, 'access', 0, lift);

      timeline.addLabel('create', 25);
      timeline.to(stack, { y: 0, duration: 8, ease: 'power1.inOut' }, 'create');
      addStepState(timeline, 'create', 1, lift);

      timeline.addLabel('collaborate', 41);
      timeline.to(stack, { y: 0, duration: 8, ease: 'power1.inOut' }, 'collaborate');
      addStepState(timeline, 'collaborate', 2, lift);

      timeline.addLabel('secure', 57);
      timeline.to(stack, { y: 0, duration: 8, ease: 'power1.inOut' }, 'secure');
      addStepState(timeline, 'secure', 3, lift);

      timeline.addLabel('intelligence', 73);
      timeline.to(stack, { y: 0, duration: 8, ease: 'power1.inOut' }, 'intelligence');
      addStepState(timeline, 'intelligence', 4, lift);

      timeline.addLabel('unified', 89);
      timeline.to(stack, { y: -58, duration: 10, ease: 'power1.inOut' }, 'unified');
      ecosystemSteps.forEach((step) => {
        timeline.to(layersById[step.id], {
          y: 0,
          scale: 1,
          opacity: 0.98,
          duration: 10,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(activeImagesById[step.id], {
          opacity: 0.2,
          duration: 10,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(inactiveImagesById[step.id], {
          opacity: 0.96,
          duration: 10,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(glowsById[step.id], {
          opacity: 0.1,
          scale: 1,
          duration: 10,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(cardsById[step.id], {
          opacity: 1,
          y: 0,
          duration: 9,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(activePathsById[step.id], {
          opacity: 0.28,
          duration: 9,
          ease: 'power1.inOut',
        }, 'unified');
        timeline.to(basePathsById[step.id], {
          opacity: 0.7,
          duration: 9,
          ease: 'power1.inOut',
        }, 'unified');
      });
      timeline.to(activeSpine, { opacity: 1, scaleY: 1, duration: 8, ease: 'power1.inOut' }, 'unified');
      timeline.to(finalStatement, { opacity: 1, y: 0, duration: 8, ease: 'power1.inOut' }, 'unified+=1');
      timeline.to({}, { duration: 4 });

      return timeline;
    };

    updateNavHeight();

    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new window.ResizeObserver(() => {
        updateNavHeight();
        scheduleConnectorUpdate();
      });
      if (header) resizeObserver.observe(header);
      if (composition) resizeObserver.observe(composition);
      ecosystemSteps.forEach((step) => {
        const layer = layersById[step.id];
        const desktopCard = desktopCardsById[step.id];
        if (layer) resizeObserver.observe(layer);
        if (desktopCard) resizeObserver.observe(desktopCard);
      });
    }

    window.addEventListener('resize', scheduleConnectorUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleConnectorUpdate, { passive: true });
    ScrollTrigger.addEventListener('refresh', scheduleConnectorUpdate);

    const context = gsap.context(() => {
      media = gsap.matchMedia();

      media.add('(prefers-reduced-motion: reduce)', () => {
        setBase();
        setActiveState('unified');
        gsap.set(headerItems, { opacity: 1, y: 0 });
        gsap.set(composition, { y: 0 });
        gsap.set(stack, { opacity: 1, scale: 1, y: -42 });
        gsap.set(layers, { opacity: 0.98, scale: 1, y: 0 });
        gsap.set(activeImages, { opacity: 0.2 });
        gsap.set(inactiveImages, { opacity: 0.96 });
        gsap.set(cards, { opacity: 1, y: 0 });
        gsap.set(connectors, { opacity: 1 });
        gsap.set(basePaths, { opacity: 0.7 });
        gsap.set(activePaths, { opacity: 0.26 });
        gsap.set(activeSpine, { opacity: 1, scaleY: 1 });
        gsap.set(finalStatement, { opacity: 1, y: 0 });
        stopAllSignalAnimations();
        scheduleConnectorUpdate();
      });

      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 1201px) and (min-height: 901px)',
        () => buildTimeline({ lift: 12, scrub: 0.85 }),
      );

      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 901px) and (max-height: 900px)',
        () => buildTimeline({ lift: 9, scrub: 0.82 }),
      );

      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 901px) and (max-width: 1200px) and (min-height: 901px)',
        () => buildTimeline({ lift: 10, scrub: 0.84 }),
      );

      media.add(
        '(prefers-reduced-motion: no-preference) and (min-width: 601px) and (max-width: 900px)',
        () => buildTimeline({ lift: 8, scrub: 0.78 }),
      );

      media.add(
        '(prefers-reduced-motion: no-preference) and (max-width: 600px)',
        () => buildTimeline({ lift: 7, scrub: 0.74 }),
      );

      const imageDecodes = Array.from(section.querySelectorAll('[data-ecosystem-image]'))
        .map((image) => image.decode?.().catch(() => undefined));
      const fontsReady = document.fonts?.ready ?? Promise.resolve();

      Promise.all([Promise.all(imageDecodes), fontsReady]).then(() => {
        if (!section.isConnected) return;
        updateNavHeight();
        scheduleConnectorUpdate();
        ScrollTrigger.refresh();
      });
    }, section);

    return () => {
      if (connectorFrame) window.cancelAnimationFrame(connectorFrame);
      stopAllSignalAnimations();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleConnectorUpdate);
      window.removeEventListener('orientationchange', scheduleConnectorUpdate);
      ScrollTrigger.removeEventListener('refresh', scheduleConnectorUpdate);
      timeline?.kill();
      media?.revert();
      context.revert();
      activeStateRef.current = 'intro';
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{ '--elvora-nav-height': '72px' }}
      className={[
        'relative isolate min-h-[620svh] overflow-clip bg-[#FCFAF7] text-[#181818] lg:min-h-[700svh]',
        'bg-[radial-gradient(circle_at_50%_58%,rgba(243,107,22,0.08),transparent_30%),linear-gradient(rgba(24,24,24,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(24,24,24,0.04)_1px,transparent_1px)]',
        'bg-[size:auto,190px_190px,190px_190px] max-[900px]:min-h-[460svh] max-[900px]:bg-[size:auto,120px_120px,120px_120px]',
        'motion-reduce:min-h-0',
        '[@media(max-height:760px)_and_(min-width:901px)]:min-h-[540svh]',
      ].join(' ')}
      aria-labelledby="elvora-ecosystem-title"
      data-ecosystem-state="intro"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(252,250,247,0.96),rgba(252,250,247,0.88)_12%,rgba(252,250,247,0.88)_88%,rgba(252,250,247,0.96)),radial-gradient(circle_at_50%_58%,rgba(243,107,22,0.06),transparent_42%)]"
      />

      <div className="sticky top-[var(--elvora-nav-height)] h-[calc(100svh-var(--elvora-nav-height))] overflow-clip motion-reduce:relative motion-reduce:top-0 motion-reduce:h-auto">
        <div className="mx-auto flex h-full w-[min(100%-24px,760px)] flex-col xl:w-[min(100%-48px,1500px)] min-[901px]:w-[min(100%-32px,1220px)]">
          <EcosystemHeader />

          <div
            className="relative mx-auto h-[min(82svh,820px)] min-h-[650px] w-full max-w-[1500px] overflow-visible max-[900px]:h-auto max-[900px]:min-h-0 [@media(max-height:850px)_and_(min-width:901px)]:h-[calc(100svh-var(--elvora-nav-height)-94px)] [@media(max-height:850px)_and_(min-width:901px)]:min-h-0 [@media(max-height:760px)_and_(min-width:901px)]:h-[calc(100svh-var(--elvora-nav-height)-78px)]"
            data-ecosystem-composition
          >
            <EcosystemConnectors />

            <div className={desktopGridClass}>
              {ecosystemSteps.map((step) => <EcosystemCard key={step.id} step={step} />)}
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[4] w-[min(100%,480px)] -translate-x-1/2 max-[900px]:relative max-[900px]:left-auto max-[900px]:mx-auto max-[900px]:h-[clamp(470px,58vh,560px)] max-[900px]:w-full max-[900px]:max-w-[420px] max-[900px]:translate-x-0 max-[420px]:h-[clamp(430px,56vh,500px)]">
              <EcosystemStack />
            </div>

            <div className="relative z-[8] hidden pt-4 max-[900px]:block">
              <div className="mx-auto flex max-w-[420px] items-center justify-between pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                <span>Connected capabilities</span>
                <span data-ecosystem-mobile-counter>01 / 05</span>
              </div>

              <div className="relative mx-auto min-h-[164px] max-w-[420px] pl-5">
                <div aria-hidden="true" className="absolute left-[7px] top-3 bottom-3 w-px bg-[#F36B16]/16" />
                <div aria-hidden="true" className="absolute left-[4px] top-3 bottom-3 flex w-[7px] flex-col justify-between">
                  {ecosystemSteps.map((step) => (
                    <i
                      key={step.id}
                      className="block h-[7px] w-[7px] rounded-full border border-[#FCFAF7] bg-black/18 transition duration-300 [&.is-active]:scale-110 [&.is-active]:bg-[#F36B16] [&.is-active]:shadow-[0_0_0_4px_rgba(243,107,22,0.14)] [&.is-unified]:bg-[#F36B16]"
                      data-ecosystem-step-dot={step.id}
                    />
                  ))}
                </div>
                {ecosystemSteps.map((step) => <EcosystemCard key={`mobile-${step.id}`} step={step} mobile />)}
              </div>
            </div>

            <div
              className="pointer-events-none absolute bottom-[clamp(8px,1.4vh,16px)] left-1/2 z-[9] flex -translate-x-1/2 items-center gap-3 whitespace-nowrap bg-[#FCFAF7]/90 px-3 py-1 text-sm font-medium text-black/70 opacity-0 backdrop-blur-[2px] max-[900px]:relative max-[900px]:bottom-auto max-[900px]:left-auto max-[900px]:mt-8 max-[900px]:justify-center max-[900px]:gap-2 max-[900px]:whitespace-normal max-[900px]:bg-transparent max-[900px]:px-0 max-[900px]:py-0 max-[900px]:translate-x-0 max-[900px]:text-center max-[900px]:text-[0.8rem]"
              data-ecosystem-final
            >
              <span className="h-px w-10 bg-[#F36B16]/60 max-[900px]:w-7" />
              <span>One platform. Every examination workflow. Fully connected.</span>
              <span className="h-px w-10 bg-[#F36B16]/60 max-[900px]:w-7" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
