import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const FRAME_COUNT = 50;
const INITIAL_BUFFER = 12;
const frameUrls = Array.from(
  { length: FRAME_COUNT },
  (_, index) => `/assets/elvora-hero-sequence/frame-${String(index + 1).padStart(3, '0')}.webp`,
);

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

gsap.registerPlugin(ScrollTrigger);

export function ElvoraSequence() {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef(new Map());
  const requestsRef = useRef(new Map());
  const targetFrameRef = useRef(0);
  const displayedFrameRef = useRef(0);
  const renderedFrameRef = useRef(-1);
  const renderRafRef = useRef(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return undefined;

    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) return undefined;

    const loadedImages = imagesRef.current;
    const pendingRequests = requestsRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let backgroundTimer = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;

    const closestLoaded = (requested) => {
      if (loadedImages.has(requested)) return requested;
      for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
        if (loadedImages.has(requested - distance)) return requested - distance;
        if (loadedImages.has(requested + distance)) return requested + distance;
      }
      return -1;
    };

    const drawImageCover = (image) => {
      const scale = Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const drawX = (viewportWidth - drawWidth) / 2;
      const drawY = (viewportHeight - drawHeight) / 2;

      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    };

    const drawFrame = (requestedIndex) => {
      const frameIndex = closestLoaded(clamp(requestedIndex, 0, FRAME_COUNT - 1));
      const image = loadedImages.get(frameIndex);
      if (!image || renderedFrameRef.current === frameIndex) return;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.save();
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'copy';
      drawImageCover(image);
      context.restore();
      renderedFrameRef.current = frameIndex;
    };

    const render = () => {
      const targetFrame = targetFrameRef.current;
      const currentFrame = displayedFrameRef.current;
      const distance = targetFrame - currentFrame;
      const nextFrame = Math.abs(distance) < 0.035 ? targetFrame : currentFrame + distance * 0.24;

      displayedFrameRef.current = nextFrame;
      drawFrame(Math.round(nextFrame));

      if (Math.abs(targetFrame - nextFrame) > 0.035) {
        renderRafRef.current = window.requestAnimationFrame(render);
        return;
      }

      renderRafRef.current = 0;
    };

    function requestRender() {
      if (!renderRafRef.current) renderRafRef.current = window.requestAnimationFrame(render);
    }

    const applyProgress = (progressValue) => {
      const progress = clamp(progressValue, 0, 1);
      const frame = progress * (FRAME_COUNT - 1);
      targetFrameRef.current = frame;
      section.style.setProperty('--elvora-progress', String(progress));
      prioritize(frame);
      requestRender();
    };

    const updateFromNativeScroll = () => {
      const totalScrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);
      const sectionTop = section.getBoundingClientRect().top;
      applyProgress(clamp(-sectionTop / totalScrollableDistance, 0, 1));
    };

    const loadFrame = (index) => {
      if (index < 0 || index >= FRAME_COUNT) return Promise.resolve(null);
      if (loadedImages.has(index)) return Promise.resolve(loadedImages.get(index));
      if (pendingRequests.has(index)) return pendingRequests.get(index);

      const request = new Promise((resolve) => {
        const image = new window.Image();
        image.decoding = 'async';
        image.onload = () => {
          pendingRequests.delete(index);
          if (!cancelled) {
            loadedImages.set(index, image);
            requestRender();
            image.decode?.().catch(() => undefined);
          }
          resolve(image);
        };
        image.onerror = () => {
          pendingRequests.delete(index);
          if (import.meta.env.DEV) console.warn(`Elvora hero frame ${index + 1} could not be loaded.`);
          resolve(null);
        };
        image.src = frameUrls[index];
      });

      pendingRequests.set(index, request);
      return request;
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const mobile = bounds.width < 768;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      viewportWidth = Math.max(1, Math.round(bounds.width * dpr));
      viewportHeight = Math.max(1, Math.round(bounds.height * dpr));

      if (canvas.width !== viewportWidth || canvas.height !== viewportHeight) {
        canvas.width = viewportWidth;
        canvas.height = viewportHeight;
        renderedFrameRef.current = -1;
      }
      requestRender();
    };

    const prioritize = (position) => {
      const target = Math.round(position);
      [Math.floor(position), Math.ceil(position), target - 1, target + 1, target - 2, target + 2]
        .forEach((index) => loadFrame(index));
    };

    const loadSequence = async () => {
      await loadFrame(0);
      if (cancelled) return;
      drawFrame(0);
      setLoadProgress(8);

      const initialIndexes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 24, FRAME_COUNT - 1];
      for (let start = 0; start < initialIndexes.length; start += 4) {
        const batch = initialIndexes.slice(start, start + 4);
        await Promise.all(batch.map(loadFrame));
        if (cancelled) return;
        setLoadProgress(Math.min(100, Math.round(((start + batch.length + 1) / (INITIAL_BUFFER + 1)) * 100)));
      }
      setIsReady(true);

      if (reducedMotion.matches) return;
      const remaining = Array.from({ length: FRAME_COUNT }, (_, index) => index)
        .filter((index) => !loadedImages.has(index));
      for (let start = 0; start < remaining.length && !cancelled; start += 8) {
        await Promise.all(remaining.slice(start, start + 8).map(loadFrame));
        await new Promise((resolve) => {
          backgroundTimer = window.setTimeout(resolve, 40);
        });
      }
    };

    const sequenceTrigger = reducedMotion.matches ? null : ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      invalidateOnRefresh: true,
      onUpdate: (self) => applyProgress(self.progress),
    });

    const resizeObserver = new window.ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const onResize = () => {
      resize();
      updateFromNativeScroll();
      ScrollTrigger.refresh();
    };
    const onScroll = () => updateFromNativeScroll();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });

    resize();
    loadSequence();
    window.requestAnimationFrame(() => {
      updateFromNativeScroll();
      ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(renderRafRef.current);
      window.clearTimeout(backgroundTimer);
      sequenceTrigger?.kill();
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onResize);
      pendingRequests.clear();
      loadedImages.clear();
    };
  }, []);

  return (
    <section ref={sectionRef} id="elvora-hero" className="elvora-sequence" aria-labelledby="elvora-title">
      <div className="elvora-sequence-sticky">
        <h1 id="elvora-title" className="sr-only">Elvora AI-powered examination and academic workflow platform</h1>
        <canvas
          ref={canvasRef}
          className="elvora-sequence-canvas"
          aria-label="Scroll-controlled 3D visualization of the Elvora AI examination platform"
        >
          Elvora provides AI-powered examination, proctoring, and secure academic workflows.
        </canvas>

        <div className={`elvora-sequence-loader${isReady ? ' is-ready' : ''}`} role="status" aria-live="polite">
          <img src="/logo.webp" alt="" aria-hidden="true" />
          <span>Loading experience {loadProgress}%</span>
          <div><i style={{ transform: `scaleX(${loadProgress / 100})` }} /></div>
        </div>

        <div className="elvora-scroll-progress" aria-hidden="true"><i /></div>
        <div className="elvora-sequence-fade" aria-hidden="true" />

        <noscript>
          <img src="/assets/elvora-hero-sequence/frame-001.webp" alt="Elvora AI proctoring platform" />
        </noscript>
      </div>
    </section>
  );
}
