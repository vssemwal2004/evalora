import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 44;
const DESKTOP_SEQUENCE_SCROLL_VH = 1.2;
const DESKTOP_HANDOFF_SCROLL_VH = 1;
const CRITICAL_FRAME_INDEXES = [0, 10, 21, 32, 43];
const DESKTOP_FRAME_BATCH_SIZE = 3;
const MOBILE_FRAME_BATCH_SIZE = 2;
const statusStates = [
  'Exam Ready',
  'AI Proctoring Active',
  'Live Monitoring',
  'Smart Report Ready',
];

const frameUrl = (index) => `/hero/laptop-animation/frame_${String(index + 1).padStart(3, '0')}.png`;

function readStatusIndex(progress) {
  if (progress < 0.25) return 0;
  if (progress < 0.5) return 1;
  if (progress < 0.75) return 2;
  return 3;
}

function getFrameWidth(image) {
  return image.naturalWidth || image.width || 1;
}

function getFrameHeight(image) {
  return image.naturalHeight || image.height || 1;
}

function isFrameReady(image) {
  return Boolean(image?.__elvoraReady || (image?.complete && getFrameWidth(image)));
}

function getFrameLoadQueue() {
  const priorityFrames = CRITICAL_FRAME_INDEXES.filter((index) => index > 0 && index < FRAME_COUNT);
  const prioritySet = new Set(priorityFrames);
  const remainingFrames = Array.from({ length: FRAME_COUNT }, (_, index) => index)
    .filter((index) => index > 0 && !prioritySet.has(index));

  return [...priorityFrames, ...remainingFrames];
}

function getNearestReadyFrame(images, targetIndex, lastDrawnIndex) {
  if (isFrameReady(images[targetIndex])) return targetIndex;

  for (let offset = 1; offset < FRAME_COUNT; offset += 1) {
    const previousIndex = targetIndex - offset;
    const nextIndex = targetIndex + offset;

    if (previousIndex >= 0 && isFrameReady(images[previousIndex])) return previousIndex;
    if (nextIndex < FRAME_COUNT && isFrameReady(images[nextIndex])) return nextIndex;
  }

  if (lastDrawnIndex >= 0 && isFrameReady(images[lastDrawnIndex])) return lastDrawnIndex;
  return isFrameReady(images[0]) ? 0 : -1;
}

function removeWhiteFrameBackground(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const bufferContext = buffer.getContext('2d', { willReadFrequently: true });
  if (!bufferContext) return image;

  bufferContext.drawImage(image, 0, 0);
  const imageData = bufferContext.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red > 248 && green > 248 && blue > 248) {
      data[index + 3] = 0;
    }
  }

  bufferContext.putImageData(imageData, 0, 0);
  buffer.__elvoraReady = true;
  buffer.__elvoraWidth = width;
  buffer.__elvoraHeight = height;
  return buffer;
}

function drawContain(context, image, width, height) {
  const imageWidth = image.__elvoraWidth || getFrameWidth(image);
  const imageHeight = image.__elvoraHeight || getFrameHeight(image);
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  context.clearRect(0, 0, width, height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export function ElvoraSequence() {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const heroStageRef = useRef(null);
  const imageWrapRef = useRef(null);
  const progressRef = useRef(null);
  const statusCardRef = useRef(null);
  const statusTextRef = useRef(null);
  const liquidFieldRef = useRef(null);
  const torchRef = useRef(null);
  const imagesRef = useRef([]);
  const requestedFrameRef = useRef(0);
  const lastDrawnFrameRef = useRef(-1);
  const currentStatusRef = useRef(0);
  const [frameLoadState, setFrameLoadState] = useState({ ready: false, loaded: 0 });
  const frameUrls = useMemo(() => Array.from({ length: FRAME_COUNT }, (_, index) => frameUrl(index)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return undefined;

    let cancelled = false;
    let rafId = 0;
    let canvasWidth = 1;
    let canvasHeight = 1;
    const completedFrames = new Set();
    const idleTasks = new Set();

    const drawFrame = (requestedIndex) => {
      if (cancelled) return;
      const clampedIndex = Math.max(0, Math.min(FRAME_COUNT - 1, requestedIndex));
      requestedFrameRef.current = clampedIndex;
      const resolvedIndex = getNearestReadyFrame(imagesRef.current, clampedIndex, lastDrawnFrameRef.current);
      if (resolvedIndex < 0 || resolvedIndex === lastDrawnFrameRef.current) return;

      const image = imagesRef.current[resolvedIndex];

      drawContain(context, image, canvasWidth, canvasHeight);
      canvas.dataset.frameIndex = String(resolvedIndex + 1);
      lastDrawnFrameRef.current = resolvedIndex;
    };

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvasWidth = Math.max(1, Math.round(bounds.width * dpr));
      canvasHeight = Math.max(1, Math.round(bounds.height * dpr));

      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        const redrawIndex = Math.max(0, lastDrawnFrameRef.current);
        lastDrawnFrameRef.current = -1;
        drawFrame(redrawIndex);
      }
    };

    const publishFrameLoadState = (force = false) => {
      if (cancelled) return;
      const loaded = completedFrames.size;
      canvas.dataset.loadedFrames = String(loaded);
      if (force || loaded === 1 || loaded % 4 === 0 || loaded === FRAME_COUNT) {
        setFrameLoadState({ ready: isFrameReady(imagesRef.current[0]), loaded });
      }
    };

    const scheduleIdleTask = (callback, timeout = 1200) => {
      let task;
      const run = (deadline) => {
        idleTasks.delete(task);
        callback(deadline);
      };

      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(run, { timeout });
        task = { id, type: 'idle' };
      } else {
        const id = window.setTimeout(() => run({ didTimeout: true, timeRemaining: () => 16 }), Math.min(timeout, 180));
        task = { id, type: 'timeout' };
      }

      idleTasks.add(task);
      return task;
    };

    const cancelIdleTasks = () => {
      idleTasks.forEach((task) => {
        if (task.type === 'idle') window.cancelIdleCallback?.(task.id);
        else window.clearTimeout(task.id);
      });
      idleTasks.clear();
    };

    const preloadFrame = async (src, index) => new Promise((resolve) => {
      if (completedFrames.has(index) || isFrameReady(imagesRef.current[index])) {
        completedFrames.add(index);
        publishFrameLoadState();
        resolve({ index, ok: true, cached: true });
        return;
      }

      const image = new window.Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.fetchPriority = index === 0 ? 'high' : 'low';
      image.onload = async () => {
        try {
          await image.decode?.();
        } catch {
          // Decoding can fail after onload in some browsers; the loaded bitmap is still usable.
        }
        imagesRef.current[index] = removeWhiteFrameBackground(image);
        completedFrames.add(index);
        publishFrameLoadState(index === 0);
        if (!cancelled && index === 0) resizeCanvas();
        if (!cancelled) drawFrame(requestedFrameRef.current);
        resolve({ index, ok: true });
      };
      image.onerror = () => {
        if (import.meta.env.DEV) console.warn(`Elvora hero frame failed to load: ${src}`);
        completedFrames.add(index);
        publishFrameLoadState();
        resolve({ index, ok: false });
      };
      image.src = src;
    });

    const frameQueue = getFrameLoadQueue();
    let loadingFrameBatch = false;
    const loadNextFrameBatch = async () => {
      if (cancelled || loadingFrameBatch || !frameQueue.length) return;
      loadingFrameBatch = true;
      const batchSize = window.innerWidth < 1024 ? MOBILE_FRAME_BATCH_SIZE : DESKTOP_FRAME_BATCH_SIZE;
      const batch = frameQueue.splice(0, batchSize);

      await Promise.all(batch.map((index) => preloadFrame(frameUrls[index], index)));
      loadingFrameBatch = false;
      if (cancelled) return;
      drawFrame(requestedFrameRef.current);
      if (frameQueue.length) scheduleIdleTask(loadNextFrameBatch, 1000);
    };

    const resizeObserver = new window.ResizeObserver(() => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(resizeCanvas);
    });

    resizeObserver.observe(canvas);
    resizeCanvas();

    preloadFrame(frameUrls[0], 0).then(() => {
      if (!cancelled) scheduleIdleTask(loadNextFrameBatch, 800);
    });

    canvas.__elvoraDrawFrame = drawFrame;

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      cancelIdleTasks();
      resizeObserver.disconnect();
      delete canvas.__elvoraDrawFrame;
    };
  }, [frameUrls]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return undefined;
    const statusCard = statusCardRef.current;
    const liquidField = liquidFieldRef.current;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pointerFrame = 0;
    let pointerActive = false;
    const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0 };

    const setDefaultPointer = () => {
      const bounds = section.getBoundingClientRect();
      const visibleHeight = Math.min(bounds.height, window.innerHeight || bounds.height);
      pointer.targetX = bounds.width * 0.28;
      pointer.targetY = visibleHeight * 0.45;
      if (!pointer.currentX && !pointer.currentY) {
        pointer.currentX = pointer.targetX;
        pointer.currentY = pointer.targetY;
        section.style.setProperty('--mx', `${pointer.currentX.toFixed(1)}px`);
        section.style.setProperty('--my', `${pointer.currentY.toFixed(1)}px`);
      }
    };

    const ensurePointerLoop = () => {
      if (pointerFrame) return;
      const tick = () => {
        pointer.currentX += (pointer.targetX - pointer.currentX) * 0.12;
        pointer.currentY += (pointer.targetY - pointer.currentY) * 0.12;
        section.style.setProperty('--mx', `${pointer.currentX.toFixed(1)}px`);
        section.style.setProperty('--my', `${pointer.currentY.toFixed(1)}px`);
        section.style.setProperty('--liquid-active', pointerActive ? '1' : '0');
        if (imageWrapRef.current) {
          const sectionBounds = section.getBoundingClientRect();
          const visualBounds = imageWrapRef.current.getBoundingClientRect();
          const visualX = pointer.currentX - (visualBounds.left - sectionBounds.left);
          const visualY = pointer.currentY - (visualBounds.top - sectionBounds.top);
          imageWrapRef.current.style.setProperty('--vmx', `${visualX.toFixed(1)}px`);
          imageWrapRef.current.style.setProperty('--vmy', `${visualY.toFixed(1)}px`);
          imageWrapRef.current.style.setProperty('--visual-liquid-active', pointerActive ? '1' : '0');
        }
        const moving = Math.abs(pointer.targetX - pointer.currentX) + Math.abs(pointer.targetY - pointer.currentY) > 0.35;
        pointerFrame = moving || pointerActive ? window.requestAnimationFrame(tick) : 0;
      };
      pointerFrame = window.requestAnimationFrame(tick);
    };

    const updateStatus = (progress) => {
      const statusIndex = readStatusIndex(progress);
      if (statusIndex === currentStatusRef.current || !statusTextRef.current) return;

      currentStatusRef.current = statusIndex;
      gsap.to(statusTextRef.current, {
        opacity: 0,
        y: -5,
        duration: 0.14,
        ease: 'power2.out',
        onComplete: () => {
          if (!statusTextRef.current) return;
          statusTextRef.current.textContent = statusStates[statusIndex];
          gsap.fromTo(statusTextRef.current, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' });
        },
      });
    };

    const applyProgress = (progress) => {
      const safeProgress = Math.max(0, Math.min(1, progress));
      const targetFrame = Math.round(safeProgress * (FRAME_COUNT - 1));
      canvas.__elvoraDrawFrame?.(targetFrame);
      updateStatus(safeProgress);
      if (progressRef.current) gsap.set(progressRef.current, { scaleX: 0.08 + (safeProgress * 0.92) });
    };

    const syncStatusShine = (event) => {
      if (!statusCard) return;
      const bounds = statusCard.getBoundingClientRect();
      statusCard.style.setProperty('--mouse-x', `${event.clientX - bounds.left}px`);
      statusCard.style.setProperty('--mouse-y', `${event.clientY - bounds.top}px`);
    };

    const syncLiquidCursor = (event) => {
      if (reducedMotionQuery.matches || window.innerWidth < 1024) return;
      const bounds = section.getBoundingClientRect();
      pointer.targetX = event.clientX - bounds.left;
      pointer.targetY = event.clientY - bounds.top;
      ensurePointerLoop();
    };

    const activateLiquidCursor = () => {
      if (reducedMotionQuery.matches || window.innerWidth < 1024) return;
      pointerActive = true;
      section.style.setProperty('--liquid-active', '1');
      ensurePointerLoop();
    };

    const deactivateLiquidCursor = () => {
      pointerActive = false;
      section.style.setProperty('--liquid-active', '0');
      setDefaultPointer();
      ensurePointerLoop();
    };

    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      applyProgress(0);
      setDefaultPointer();

      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.landing-header', { opacity: 0, y: -16, duration: 0.55 }, 0)
        .from('[data-hero-copy-item]', { opacity: 0, y: 24, duration: 0.78, stagger: 0.1 }, 0.08)
        .from(imageWrapRef.current, { scale: 0.965, x: 22, duration: 0.95 }, 0.18)
        .from(liquidField, { x: -12, duration: 0.9 }, 0.12);

      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        let lenisRafId = 0;
        let lenis;
        let disposed = false;
        const sequenceScroll = () => Math.round(window.innerHeight * DESKTOP_SEQUENCE_SCROLL_VH);
        const handoffScroll = () => Math.round(window.innerHeight * DESKTOP_HANDOFF_SCROLL_VH);
        const raf = (time) => {
          if (!lenis || disposed) return;
          lenis.raf(time);
          lenisRafId = window.requestAnimationFrame(raf);
        };

        import('lenis').then(({ default: Lenis }) => {
          if (disposed) return;
          lenis = new Lenis({
            lerp: 0.075,
            smoothWheel: true,
            wheelMultiplier: 0.82,
            touchMultiplier: 1,
            syncTouch: false,
          });
          lenis.on('scroll', ScrollTrigger.update);
          lenisRafId = window.requestAnimationFrame(raf);
        });

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${sequenceScroll()}`,
            scrub: 0.95,
            invalidateOnRefresh: true,
            onUpdate: ({ progress }) => applyProgress(progress),
          },
        });

        timeline
          .fromTo(imageWrapRef.current, {
            scale: 0.97,
            x: 24,
            y: 14,
            rotateZ: 0,
          }, {
            scale: 1.035,
            x: 0,
            y: -8,
            rotateZ: -0.25,
            ease: 'none',
          }, 0)
          .fromTo(torchRef.current, {
            opacity: 0.12,
            scale: 0.95,
            x: -20,
            y: 30,
            rotate: -8,
            filter: 'blur(35px)',
          }, {
            opacity: 0.28,
            scale: 1.18,
            x: 28,
            y: -42,
            rotate: 7,
            filter: 'blur(60px)',
            ease: 'none',
          }, 0)
          .fromTo(liquidField, {
            x: -10,
            y: 20,
            scale: 1,
            opacity: 0.92,
            '--wave-shift': '0px',
            '--wave-shift-neg': '0px',
            '--wave-shift-soft': '0px',
          }, {
            x: 20,
            y: -30,
            scale: 1.04,
            opacity: 1,
            '--wave-shift': '34px',
            '--wave-shift-neg': '-34px',
            '--wave-shift-soft': '17px',
            ease: 'none',
          }, 0);

        gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: section,
            start: () => `top+=${sequenceScroll()} top`,
            end: () => `+=${handoffScroll()}`,
            scrub: 0.9,
            invalidateOnRefresh: true,
          },
        }).to(heroStageRef.current, {
          y: () => -Math.round(window.innerHeight * 0.07),
          scale: 0.982,
          opacity: 0.42,
          force3D: true,
        }, 0);

        return () => {
          disposed = true;
          window.cancelAnimationFrame(lenisRafId);
          lenis?.destroy();
        };
      });

      mm.add('(max-width: 1023px), (prefers-reduced-motion: reduce)', () => {
        applyProgress(0);
        gsap.set(progressRef.current, { scaleX: 0.08 });
      });

      return () => mm.revert();
    }, section);

    statusCard?.addEventListener('pointermove', syncStatusShine, { passive: true });
    section.addEventListener('pointerenter', activateLiquidCursor, { passive: true });
    section.addEventListener('pointermove', syncLiquidCursor, { passive: true });
    section.addEventListener('pointerleave', deactivateLiquidCursor, { passive: true });

    return () => {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      statusCard?.removeEventListener('pointermove', syncStatusShine);
      section.removeEventListener('pointerenter', activateLiquidCursor);
      section.removeEventListener('pointermove', syncLiquidCursor);
      section.removeEventListener('pointerleave', deactivateLiquidCursor);
      context.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="elvora-hero"
      className="relative isolate min-h-screen overflow-x-clip bg-white lg:h-[320svh]"
      aria-labelledby="elvora-title"
      style={{ '--mx': '28%', '--my': '45%', '--liquid-active': '0', '--wave-shift': '0px', '--wave-shift-neg': '0px', '--wave-shift-soft': '0px' }}
    >
      <style>
        {`
          .hero-liquid-bg {
            position: absolute;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            overflow: hidden;
            opacity: 1;
          }

          .hero-liquid-bg::before {
            content: "";
            position: absolute;
            inset: -18%;
            background:
              radial-gradient(
                620px circle at var(--mx) var(--my),
                rgba(255, 122, 0, calc(0.18 + (var(--liquid-active) * 0.10))),
                rgba(255, 153, 51, 0.14) 28%,
                rgba(255, 255, 255, 0) 64%
              );
            opacity: 0.95;
            filter: blur(18px);
            transform: translateZ(0);
          }

          .hero-liquid-glow {
            position: absolute;
            left: -14%;
            top: 7%;
            width: 48%;
            height: 88%;
            background:
              radial-gradient(
                ellipse at 20% 46%,
                rgba(255, 122, 0, 0.24),
                rgba(255, 153, 51, 0.12) 38%,
                transparent 74%
              );
            filter: blur(34px);
            opacity: 0.9;
            transform: translate3d(calc(var(--wave-shift-soft) * -0.2), 0, 0);
          }

          .hero-liquid-lines {
            position: absolute;
            top: 8%;
            height: 88%;
            opacity: 0.98;
            filter: blur(0.15px);
            transform: translate3d(var(--wave-shift-soft), 0, 0);
            -webkit-mask-image:
              radial-gradient(
                680px circle at var(--mx) var(--my),
                rgba(0, 0, 0, 1) 0%,
                rgba(0, 0, 0, 0.92) 28%,
                rgba(0, 0, 0, 0.52) 54%,
                transparent 82%
              );
            mask-image:
              radial-gradient(
                680px circle at var(--mx) var(--my),
                rgba(0, 0, 0, 1) 0%,
                rgba(0, 0, 0, 0.92) 28%,
                rgba(0, 0, 0, 0.52) 54%,
                transparent 82%
              );
          }

          .hero-liquid-lines-left {
            left: -8%;
            width: 58%;
          }

          .hero-liquid-lines-right {
            right: -13%;
            width: 40%;
            opacity: 0.68;
            transform: translate3d(var(--wave-shift-neg), 0, 0) scaleX(-1);
            -webkit-mask-image:
              linear-gradient(270deg, #000 0%, rgba(0,0,0,0.86) 45%, transparent 86%),
              radial-gradient(
                580px circle at var(--mx) var(--my),
                rgba(0, 0, 0, 0.95) 0%,
                rgba(0, 0, 0, 0.54) 45%,
                transparent 78%
              );
            mask-image:
              linear-gradient(270deg, #000 0%, rgba(0,0,0,0.86) 45%, transparent 86%),
              radial-gradient(
                580px circle at var(--mx) var(--my),
                rgba(0, 0, 0, 0.95) 0%,
                rgba(0, 0, 0, 0.54) 45%,
                transparent 78%
              );
          }

          .hero-liquid-lines span {
            position: absolute;
            top: -8%;
            left: calc(var(--i) * 2.15%);
            width: var(--w);
            height: 112%;
            border-right: 2px solid rgba(255, 122, 0, 0.24);
            border-top-right-radius: 78% 50%;
            border-bottom-right-radius: 78% 50%;
            border-left: 0;
            opacity: 0;
            transform-origin: center;
            animation: elvora-liquid-line 6.5s ease-in-out infinite;
            animation-delay: var(--delay);
            box-shadow: 10px 0 26px rgba(255, 122, 0, 0.055);
          }

          .hero-liquid-lines span:nth-child(3n) {
            border-right-color: rgba(255, 153, 51, 0.20);
          }

          .hero-liquid-lines span:nth-child(4n) {
            border-right-width: 1px;
          }

          .hero-liquid-lines span:nth-child(5n) {
            border-right-color: rgba(255, 255, 255, 0.62);
            box-shadow: 8px 0 20px rgba(255, 122, 0, 0.08);
          }

          .hero-liquid-lines-right span {
            border-right-color: rgba(255, 122, 0, 0.14);
          }

          @keyframes elvora-liquid-line {
            0% {
              opacity: 0.08;
              transform: translateY(22px) scaleX(0.94) scaleY(0.96);
            }
            32% {
              opacity: calc(0.34 + (var(--liquid-active) * 0.18));
              transform: translateY(-4px) scaleX(1.05) scaleY(1.02);
            }
            68% {
              opacity: calc(0.22 + (var(--liquid-active) * 0.10));
              transform: translateY(-18px) scaleX(0.98) scaleY(1.06);
            }
            100% {
              opacity: 0.08;
              transform: translateY(-34px) scaleX(0.92) scaleY(0.98);
            }
          }

          @media (max-width: 1023px) {
            .hero-liquid-bg {
              opacity: 0.58;
            }
            .hero-liquid-bg::before {
              display: none;
            }
            .hero-liquid-glow {
              left: -32%;
              width: 86%;
              opacity: 0.52;
            }
            .hero-liquid-lines {
              left: -22%;
              top: 5%;
              width: 92%;
              opacity: 0.44;
              -webkit-mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.72) 46%, transparent 88%);
              mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.72) 46%, transparent 88%);
            }
            .hero-liquid-lines-right {
              display: none;
            }
            .hero-liquid-lines span:nth-child(n + 15) {
              display: none;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .hero-liquid-bg::before {
              background:
                radial-gradient(
                  560px circle at 28% 45%,
                  rgba(255, 122, 0, 0.16),
                  rgba(255, 153, 51, 0.10) 32%,
                  rgba(255, 255, 255, 0) 66%
                );
            }
            .hero-liquid-lines,
            .hero-liquid-glow {
              transform: none;
            }
            .hero-liquid-lines span {
              animation: none;
              opacity: 0.22;
            }
          }

          .hero-visual-liquid-overlay {
            position: absolute;
            inset: -12% -8%;
            z-index: 2;
            pointer-events: none;
            overflow: hidden;
            opacity: calc(0.16 + (var(--visual-liquid-active, 0) * 0.22));
            mix-blend-mode: multiply;
            background:
              radial-gradient(
                420px circle at var(--vmx, 18%) var(--vmy, 48%),
                rgba(255, 122, 0, 0.08),
                rgba(255, 153, 51, 0.035) 34%,
                transparent 68%
              );
            -webkit-mask-image:
              linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.72) 13%, rgba(0,0,0,0.95) 46%, rgba(0,0,0,0.55) 76%, transparent 100%),
              radial-gradient(
                460px circle at var(--vmx, 18%) var(--vmy, 48%),
                rgba(0,0,0,0.96) 0%,
                rgba(0,0,0,0.72) 34%,
                rgba(0,0,0,0.22) 58%,
                transparent 78%
              );
            mask-image:
              linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.72) 13%, rgba(0,0,0,0.95) 46%, rgba(0,0,0,0.55) 76%, transparent 100%),
              radial-gradient(
                460px circle at var(--vmx, 18%) var(--vmy, 48%),
                rgba(0,0,0,0.96) 0%,
                rgba(0,0,0,0.72) 34%,
                rgba(0,0,0,0.22) 58%,
                transparent 78%
              );
          }

          .hero-visual-liquid-overlay span {
            position: absolute;
            top: -14%;
            left: calc(-8% + (var(--i) * 5.8%));
            width: var(--w);
            height: 128%;
            border-right: 1.6px solid rgba(255, 122, 0, 0.18);
            border-top-right-radius: 74% 48%;
            border-bottom-right-radius: 74% 48%;
            opacity: 0;
            animation: elvora-visual-liquid-line 6.8s ease-in-out infinite;
            animation-delay: var(--delay);
            transform-origin: center;
            box-shadow: 8px 0 22px rgba(255, 122, 0, 0.08);
          }

          .hero-visual-liquid-overlay span:nth-child(3n) {
            border-right-color: rgba(255, 153, 51, 0.14);
          }

          .hero-visual-liquid-overlay span:nth-child(4n) {
            border-right-color: rgba(255, 255, 255, 0.55);
            border-right-width: 1px;
          }

          @keyframes elvora-visual-liquid-line {
            0% {
              opacity: 0.05;
              transform: translateY(18px) scaleX(0.95) scaleY(0.97);
            }
            34% {
              opacity: calc(0.28 + (var(--visual-liquid-active, 0) * 0.18));
              transform: translateY(-4px) scaleX(1.05) scaleY(1.025);
            }
            70% {
              opacity: calc(0.16 + (var(--visual-liquid-active, 0) * 0.12));
              transform: translateY(-16px) scaleX(0.98) scaleY(1.06);
            }
            100% {
              opacity: 0.05;
              transform: translateY(-30px) scaleX(0.93) scaleY(0.98);
            }
          }

          @media (max-width: 1023px), (prefers-reduced-motion: reduce) {
            .hero-visual-liquid-overlay {
              opacity: 0.16;
              mix-blend-mode: multiply;
              -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.36), transparent);
              mask-image: linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.36), transparent);
            }
            .hero-visual-liquid-overlay span {
              animation: none;
              opacity: 0.16;
            }
            .hero-visual-liquid-overlay span:nth-child(n + 9) {
              display: none;
            }
          }
        `}
      </style>
      <div ref={heroStageRef} className="relative flex min-h-screen items-center bg-white pb-16 pt-28 will-change-[opacity,transform] lg:sticky lg:top-0 lg:h-screen lg:pb-0 lg:pt-24">
        <div
          ref={liquidFieldRef}
          className="hero-liquid-bg"
          aria-hidden="true"
        >
          <div className="hero-liquid-glow" />
          <div className="hero-liquid-lines hero-liquid-lines-left">
            {Array.from({ length: 28 }).map((_, index) => (
              <span
                key={index}
                style={{
                  '--i': index,
                  '--w': `${70 + (index * 12)}px`,
                  '--delay': `${index * -0.18}s`,
                }}
              />
            ))}
          </div>
          <div className="hero-liquid-lines hero-liquid-lines-right">
            {Array.from({ length: 18 }).map((_, index) => (
              <span
                key={index}
                style={{
                  '--i': index,
                  '--w': `${82 + (index * 14)}px`,
                  '--delay': `${(index * -0.21) - 0.8}s`,
                }}
              />
            ))}
          </div>
        </div>
        <div ref={torchRef} className="pointer-events-none absolute -left-36 bottom-0 z-0 hidden h-[460px] w-[620px] rotate-[-8deg] rounded-full bg-[radial-gradient(ellipse_at_16%_78%,rgba(255,122,0,0.22),rgba(255,153,51,0.10)_32%,transparent_68%)] opacity-80 blur-[48px] lg:block" aria-hidden="true" />

        <div className="relative z-10 mx-auto grid w-full max-w-[1360px] grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-[40fr_60fr] lg:gap-6 xl:px-10">
          <div className="relative z-20 max-w-[620px]">
            <div data-hero-copy-item className="mb-6 flex h-1 w-16 rounded-full bg-[#FF7A00] shadow-[0_0_26px_rgba(255,122,0,0.26)]" aria-hidden="true" />
            <h1 id="elvora-title" data-hero-copy-item className="max-w-[620px] text-[clamp(40px,11vw,56px)] font-extrabold leading-[1.01] tracking-[-0.045em] text-[#111827] sm:text-[clamp(48px,7vw,68px)] lg:text-[clamp(48px,5vw,76px)]">
              <span className="text-[#FF7A00]">AI-Powered</span> Online Examination Platform
            </h1>
            <p data-hero-copy-item className="mt-6 max-w-[520px] text-base leading-[1.65] text-[#6B7280] sm:text-lg lg:text-[19px]">
              Secure online exams with AI proctoring, live monitoring, and smart reports.
            </p>

            <div
              ref={statusCardRef}
              data-hero-copy-item
              style={{
                '--mouse-x': '50%',
                '--mouse-y': '50%',
                backgroundImage: 'radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255,122,0,0.18), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.58))',
              }}
              className="mt-8 w-fit min-w-[232px] overflow-hidden rounded-2xl border border-orange-200/70 px-4 py-3 shadow-[0_18px_48px_rgba(255,122,0,0.12)] backdrop-blur-2xl"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#FF7A00] opacity-30" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-[#FF7A00]" />
                </span>
                <span ref={statusTextRef} data-hero-status className="inline-block whitespace-nowrap text-sm font-bold text-[#111827]">
                  Exam Ready
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-orange-100">
                <div ref={progressRef} className="h-full origin-left rounded-full bg-[#FF7A00] [transform:scaleX(0.08)]" />
              </div>
            </div>
          </div>

          <div
            ref={imageWrapRef}
            data-hero-visual
            style={{ '--vmx': '18%', '--vmy': '48%', '--visual-liquid-active': '0' }}
            className="relative z-10 mx-auto w-full max-w-[760px] overflow-visible lg:ml-auto lg:mr-0"
          >
            <div className="relative aspect-[16/9] w-full origin-center overflow-visible bg-transparent lg:scale-[1.16] xl:scale-[1.2]">
              <canvas
                ref={canvasRef}
                data-hero-canvas
                className="relative z-[1] block h-full w-full select-none bg-transparent object-contain"
                role="img"
                aria-label="Elvora animated online examination platform interface"
              />
              <div
                className={`pointer-events-none absolute left-1/2 top-1/2 z-[4] flex w-[min(54%,210px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 transition duration-500 ${
                  frameLoadState.ready ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
                }`}
                aria-hidden="true"
              >
                <div className="grid size-20 place-items-center rounded-[24px] bg-white/88 shadow-[0_22px_70px_rgba(255,122,0,0.16)] ring-1 ring-orange-100/80 backdrop-blur-xl">
                  <img src="/logo.webp" alt="" className="w-16 object-contain" />
                </div>
                <div className="h-1.5 w-36 overflow-hidden rounded-full bg-orange-100">
                  <div
                    className="h-full rounded-full bg-[#FF7A00] shadow-[0_0_20px_rgba(255,122,0,0.35)] transition-[width] duration-300"
                    style={{ width: `${Math.max(8, Math.round((frameLoadState.loaded / FRAME_COUNT) * 100))}%` }}
                  />
                </div>
              </div>
              <div className="hero-visual-liquid-overlay" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, index) => (
                  <span
                    key={index}
                    style={{
                      '--i': index,
                      '--w': `${58 + (index * 10)}px`,
                      '--delay': `${(index * -0.2) - 0.35}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
