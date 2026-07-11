import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  FileImage,
  Gauge,
  IdCard,
  ImagePlus,
  Loader2,
  LocateFixed,
  LockKeyhole,
  MapPin,
  Maximize,
  Mic,
  MonitorCheck,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { uploadEvidenceDataUrl } from '../../lib/storage';

const FACE_API_MODEL_URL = `${import.meta.env.BASE_URL}models/face-api/1.7.15`;
const OCR_ASSET_URL = `${import.meta.env.BASE_URL}ocr/tesseract/7.0.0`;
const MAX_CARD_FACE_HEIGHT_RATIO = 0.32;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IDENTITY_EVIDENCE_BYTES = 1.8 * 1024 * 1024;
const MAX_NETWORK_LATENCY_MS = 3000;
const MIN_NETWORK_DOWNLINK_MBPS = 0.5;

const SECURITY_PHASES = [
  { key: 'environment', label: 'Environment', caption: 'Browser and connection', icon: MonitorCheck },
  { key: 'location', label: 'Location', caption: 'Permission and accuracy', icon: MapPin },
  { key: 'camera', label: 'Camera', caption: 'Live camera check', icon: Camera },
  { key: 'identity', label: 'Identity', caption: 'Face and ID match', icon: IdCard },
  { key: 'fullscreen', label: 'Full screen', caption: 'Distraction-free mode', icon: Maximize },
  { key: 'review', label: 'Final review', caption: 'Ready to begin', icon: ShieldCheck },
];

const INITIAL_ENVIRONMENT_CHECKS = [
  { key: 'session', label: 'Secure browser session', detail: 'Waiting to check', status: 'idle', icon: LockKeyhole },
  { key: 'privacy', label: 'Private-mode protection', detail: 'Waiting to check', status: 'idle', icon: ShieldCheck },
  { key: 'connection', label: 'Internet and server speed', detail: 'Waiting to check', status: 'idle', icon: Wifi },
  { key: 'integrity', label: 'Exam window integrity', detail: 'Waiting to check', status: 'idle', icon: MonitorCheck },
  { key: 'permissions', label: 'Microphone and device access', detail: 'Waiting to check', status: 'idle', icon: Mic },
];

const IDENTITY_STAGE_ERRORS = {
  inputs: {
    title: 'Both identity photos are required',
    fallback: 'Add a student photo and a clear identity-card photo, then try again.',
  },
  models: {
    title: 'Face matching could not start',
    fallback: 'The face-matching tools could not start. Keep this page open and try again.',
  },
  camera: {
    title: 'Camera needs to stay on',
    fallback: 'Allow camera access, face the camera clearly, then try again.',
  },
  selfie: {
    title: 'Student face was not detected',
    fallback: 'Retake the student photo in clear, even lighting.',
  },
  idFace: {
    title: 'ID-card portrait was not detected',
    fallback: 'Move the card closer while keeping all four edges visible.',
  },
  idText: {
    title: 'ID-card details were not readable',
    fallback: 'Retake the ID photo without glare or blur, then try again.',
  },
  upload: {
    title: 'Photos could not be uploaded',
    fallback: 'Your photos are still selected. Check your connection, then try again.',
  },
  submit: {
    title: 'Verification could not be saved',
    fallback: 'Your photos are still selected. Keep this page open and try again.',
  },
};

let faceApiLoadPromise = null;
let faceMatchingModelsPromise = null;
let ssdFaceDetectorLoadPromise = null;
let ocrLoadPromise = null;
let ocrWorkerPromise = null;

function hasLiveCameraStream(stream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
}

function getExamMediaHandoff() {
  if (typeof window === 'undefined') return null;
  window.__evaloraExamMedia = window.__evaloraExamMedia || {};
  return window.__evaloraExamMedia;
}

function getStudentFriendlyError(requestError, fallback) {
  const responseMessage = String(requestError?.response?.data?.message || '').trim();
  const rawMessage = String(requestError?.message || '').trim();
  const errorName = String(requestError?.name || '');
  const errorCode = String(requestError?.code || '');
  const status = Number(requestError?.response?.status || 0);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Reconnect to the internet, then try again.';
  }
  if (status === 429) {
    return 'Too many attempts were made. Wait a moment, then try again.';
  }
  if (status === 413) {
    return 'One photo is too large to upload. Retake it or choose a smaller image, then try again.';
  }
  if (status >= 500) {
    return 'Evalora is temporarily unavailable. Your progress is safe; try again shortly.';
  }
  if (responseMessage) return responseMessage;

  if (errorName === 'NotAllowedError' || errorCode === 'PERMISSION_DENIED') {
    return 'Permission was blocked. Allow access in your browser settings, then try again.';
  }
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return 'No available camera was found. Connect a camera and try again.';
  }
  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    return 'Your camera is busy in another app. Close that app, then try again.';
  }
  if (
    errorCode === 'ERR_NETWORK'
    || errorCode === 'ECONNABORTED'
    || /failed to fetch|network error|load failed|network request failed/i.test(rawMessage)
  ) {
    return 'We could not connect to the verification service. Check your internet connection, then try again.';
  }
  if (/request failed with status code|cloudflare|\br2\b|cors|presign|unexpected token/i.test(rawMessage)) {
    return fallback;
  }

  return rawMessage || fallback;
}

function isRetryableTransportError(requestError) {
  const errorCode = String(requestError?.code || '');
  const rawMessage = String(requestError?.message || '');
  const status = Number(requestError?.response?.status || 0);
  return [
    'ERR_NETWORK',
    'ECONNABORTED',
    'FACE_MODEL_LOAD_FAILED',
    'OCR_LOAD_FAILED',
    'EVIDENCE_UPLOAD_FAILED',
  ].includes(errorCode)
    || status >= 500
    || /failed to fetch|network error|load failed|network request failed/i.test(rawMessage);
}

async function loadFaceApi() {
  if (!faceApiLoadPromise) {
    faceApiLoadPromise = import('@vladmandic/face-api')
      .then(async (module) => {
        const faceapi = module.default || module;
        await faceapi.tf.ready();
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        return faceapi;
      })
      .catch((error) => {
        faceApiLoadPromise = null;
        console.error('Face verification models could not be loaded.', error);
        const modelError = new Error('Face verification tools could not load. Check your connection, then try again.');
        modelError.code = 'FACE_MODEL_LOAD_FAILED';
        throw modelError;
      });
  }
  return faceApiLoadPromise;
}

async function loadFaceMatchingModels(faceapi) {
  if (faceapi.nets.faceLandmark68Net.isLoaded && faceapi.nets.faceRecognitionNet.isLoaded) return;
  if (!faceMatchingModelsPromise) {
    faceMatchingModelsPromise = Promise.all([
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
    ]).catch((error) => {
      faceMatchingModelsPromise = null;
      throw error;
    });
  }
  await faceMatchingModelsPromise;
}

async function loadSsdFaceDetector(faceapi) {
  if (faceapi.nets.ssdMobilenetv1.isLoaded) return;
  if (!ssdFaceDetectorLoadPromise) {
    ssdFaceDetectorLoadPromise = faceapi.nets.ssdMobilenetv1
      .loadFromUri(FACE_API_MODEL_URL)
      .catch((error) => {
        ssdFaceDetectorLoadPromise = null;
        console.error('The detailed face detector could not be loaded.', error);
        const modelError = new Error('The detailed face check could not start. Check your connection, then try again.');
        modelError.code = 'FACE_MODEL_LOAD_FAILED';
        throw modelError;
      });
  }
  await ssdFaceDetectorLoadPromise;
}

async function loadOcr() {
  if (!ocrLoadPromise) {
    ocrLoadPromise = import('tesseract.js')
      .then((module) => module.default || module)
      .catch((error) => {
        ocrLoadPromise = null;
        throw error;
      });
  }
  return ocrLoadPromise;
}

async function loadOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = loadOcr()
      .then((tesseract) => tesseract.createWorker('eng', tesseract.OEM?.LSTM_ONLY ?? 1, {
        workerPath: `${OCR_ASSET_URL}/worker.min.js`,
        corePath: `${OCR_ASSET_URL}/core`,
        langPath: `${OCR_ASSET_URL}/lang`,
        gzip: true,
      }))
      .catch((error) => {
        ocrWorkerPromise = null;
        throw error;
      });
  }
  return ocrWorkerPromise;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be read.'));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteSize(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return Math.floor((payload.length * 3) / 4);
}

function canvasToEvidenceDataUrl(sourceCanvas, initialQuality) {
  let canvas = sourceCanvas;
  let quality = initialQuality;
  let result = canvas.toDataURL('image/jpeg', quality);

  for (let attempt = 0; attempt < 6 && dataUrlByteSize(result) > MAX_IDENTITY_EVIDENCE_BYTES; attempt += 1) {
    if (quality > 0.56) {
      quality -= 0.08;
    } else {
      const resized = document.createElement('canvas');
      resized.width = Math.max(Math.round(canvas.width * 0.82), 1);
      resized.height = Math.max(Math.round(canvas.height * 0.82), 1);
      resized.getContext('2d').drawImage(canvas, 0, 0, resized.width, resized.height);
      canvas = resized;
      quality = 0.72;
    }
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
}

async function optimizeImageFile(file, maxWidth) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Choose an image smaller than 8 MB.');

  const source = await readFileAsDataUrl(file);
  const image = await dataUrlToImage(source);
  const scale = Math.min(maxWidth / image.width, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(Math.round(image.width * scale), 1);
  canvas.height = Math.max(Math.round(image.height * scale), 1);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToEvidenceDataUrl(canvas, 0.82);
}

function captureVideoFrame(video, maxWidth = 960, quality = 0.76) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('The camera is still starting. Try again.');
  const scale = Math.min(maxWidth / video.videoWidth, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToEvidenceDataUrl(canvas, quality);
}

async function runFaceDetection(faceapi, image, options) {
  return faceapi
    .detectSingleFace(image, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
}

async function detectFaceDescriptor(faceapi, dataUrl, imageKind) {
  await loadFaceMatchingModels(faceapi);
  const image = await dataUrlToImage(dataUrl);
  if (!image.width || !image.height) throw new Error('The selected image has invalid dimensions. Choose another image.');

  const tinyProfiles = imageKind === 'idCard'
    ? [{ inputSize: 608, scoreThreshold: 0.2 }]
    : [
        { inputSize: 416, scoreThreshold: 0.35 },
        { inputSize: 608, scoreThreshold: 0.22 },
      ];

  let detection = null;
  for (const profile of tinyProfiles) {
    detection = await runFaceDetection(faceapi, image, new faceapi.TinyFaceDetectorOptions(profile));
    if (detection?.descriptor) break;
  }

  if (!detection?.descriptor) {
    await loadSsdFaceDetector(faceapi);
    detection = await runFaceDetection(
      faceapi,
      image,
      new faceapi.SsdMobilenetv1Options({ minConfidence: imageKind === 'idCard' ? 0.22 : 0.35, maxResults: 1 })
    );
  }

  if (!detection?.descriptor) {
    const message = imageKind === 'idCard'
      ? 'ID card: the printed face is too small or unclear. Keep the full card visible, move it closer, avoid glare, and try again.'
      : 'Student photo: no clear face was detected. Face the camera directly, move closer, and use even lighting.';
    throw new Error(message);
  }

  const box = detection.detection.box;
  const descriptor = Array.from(detection.descriptor, Number);
  if (
    descriptor.length !== 128
    || descriptor.some((value) => !Number.isFinite(value))
    || !box
    || !Number.isFinite(box.width)
    || !Number.isFinite(box.height)
  ) {
    throw new Error('Face detection returned an invalid result. Retake both photos and try again.');
  }

  return {
    descriptor,
    faceHeightRatio: box.height / image.height,
    faceWidthRatio: box.width / image.width,
    faceCenterXRatio: (box.x + box.width / 2) / image.width,
    faceCenterYRatio: (box.y + box.height / 2) / image.height,
    detectionScore: Number(detection.detection.score || 0),
  };
}

async function detectLiveFace(faceapi, dataUrl) {
  const image = await dataUrlToImage(dataUrl);
  const detection = await faceapi.detectSingleFace(
    image,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 })
  );
  if (!detection?.box) throw new Error('No face detected. Move your face inside the circle and use clear lighting.');
  const box = detection.box;
  return {
    faceHeightRatio: box.height / image.height,
    faceCenterXRatio: (box.x + box.width / 2) / image.width,
    faceCenterYRatio: (box.y + box.height / 2) / image.height,
    detectionScore: Number(detection.score || 0),
  };
}

async function extractIdCardText(dataUrl) {
  try {
    const worker = await loadOcrWorker();
    const result = await worker.recognize(dataUrl);
    const data = result?.data || {};
    return {
      text: String(data.text || '').replace(/\s+/g, ' ').trim(),
      confidence: Math.max(0, Math.min(100, Number(data.confidence || 0))),
    };
  } catch (error) {
    console.error('ID-card text reader could not be loaded.', error);
    const ocrError = new Error('The ID-card reader could not start. Check your connection, then try again.');
    ocrError.code = 'OCR_LOAD_FAILED';
    throw ocrError;
  }
}

function storageAvailable(storage) {
  try {
    const key = `evalora-security-${Date.now()}`;
    storage.setItem(key, '1');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

async function queryPermissionState(name) {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return 'unsupported';
  }
}

async function hasDuplicateExamTab(assignmentId, instanceId) {
  if (typeof window.BroadcastChannel === 'undefined') return false;
  const channel = new window.BroadcastChannel(`evalora-exam-${assignmentId}`);
  let duplicate = false;
  channel.onmessage = (event) => {
    if (event.data?.instanceId && event.data.instanceId !== instanceId) duplicate = true;
  };
  channel.postMessage({ type: 'security-probe', instanceId });
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  channel.close();
  return duplicate;
}

async function probeNetwork() {
  if (!navigator.onLine) throw new Error('No internet connection was detected. Reconnect and try again.');
  const samples = [];
  for (let index = 0; index < 2; index += 1) {
    const startedAt = window.performance.now();
    await api.get('/health', { params: { probe: `${Date.now()}-${index}` } });
    samples.push(window.performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  const latency = Math.round(samples[Math.floor(samples.length / 2)]);
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = connection?.effectiveType || 'unknown';
  const downlink = Number(connection?.downlink || 0);
  const downloadStartedAt = window.performance.now();
  const downloadResponse = await api.get('/health/download-probe', {
    params: { probe: Date.now() },
    responseType: 'arraybuffer',
  });
  const downloadMs = Math.max(window.performance.now() - downloadStartedAt, 1);
  const downloadedBytes = Number(downloadResponse.data?.byteLength || 0);
  const measuredMbps = Number((((downloadedBytes * 8) / downloadMs) / 1000).toFixed(2));

  if (latency > MAX_NETWORK_LATENCY_MS) {
    throw new Error(`The server response is too slow (${latency} ms). Use a more stable connection.`);
  }
  if (effectiveType === 'slow-2g' || measuredMbps < MIN_NETWORK_DOWNLINK_MBPS) {
    throw new Error('The available internet speed is too low for a stable exam. Switch networks and retry.');
  }

  return { latency, effectiveType, downlink, measuredMbps };
}

async function inspectPrivateModeSignals() {
  if (!window.indexedDB) throw new Error('IndexedDB is unavailable. Private browsing or strict privacy blocking may be active.');
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const quotaMb = estimate?.quota ? Math.round(estimate.quota / (1024 * 1024)) : 0;
  const chromium = /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/OPR\//.test(navigator.userAgent);
  // Chromium private sessions commonly expose a small temporary quota. This
  // is treated as a security signal only when it is exceptionally low.
  if (chromium && quotaMb > 0 && quotaMb < 120) {
    throw new Error('Private or incognito browsing was detected. Reopen Evalora in a normal browser window.');
  }
  return { quotaMb };
}

async function verifyMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this browser.');
  const permission = await queryPermissionState('microphone');
  if (permission === 'denied') throw new Error('Microphone permission is blocked. Allow it in browser settings and retry.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() || {};
  if (!track || track.readyState !== 'live' || !track.enabled || track.muted) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error('The microphone did not provide an active audio track. Check the device and retry.');
  }
  const result = { label: track.label || 'Microphone', sampleRate: Number(settings.sampleRate || 0) };
  stream.getTracks().forEach((item) => item.stop());
  return result;
}

function needsMicrophone(exam) {
  // Whole-attempt camera evidence includes audio for every exam.
  return Boolean(exam);
}

function passedSetupKeys(exam) {
  return new Set(
    (exam.attempt?.setupSteps || [])
      .filter((step) => step.status === 'passed')
      .map((step) => step.key),
  );
}

function getInitialCompletedPhases(exam, reverify) {
  if (reverify) return new Set();
  const keys = passedSetupKeys(exam);
  const completed = new Set();
  const environmentKeys = ['browser', ...(needsMicrophone(exam) ? ['microphone'] : [])];
  if (environmentKeys.every((key) => keys.has(key))) completed.add('environment');
  if (keys.has('location')) completed.add('location');
  return completed;
}

function buildSecurityTerms(settings = {}) {
  const terms = [
    'Camera access is verified before full screen.',
    'Camera recording starts when the exam opens.',
    'Monitoring events are saved with time and evidence.',
    'A proctor may view the live camera when enabled.',
  ];
  if (settings.fullscreenEnabled || settings.requireFullscreenBeforeStart) terms.push('Keep full screen active until submission.');
  terms.push('The complete exam camera recording includes microphone audio.');
  return terms;
}

function StepStatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={17} className="animate-spin text-orange-500" />;
  if (status === 'passed') return <CheckCircle2 size={17} className="text-emerald-500" />;
  if (status === 'failed') return <AlertTriangle size={17} className="text-red-500" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />;
}

function EnvironmentCheckCard({ item, onAction }) {
  const Icon = item.icon;
  return (
    <div className={`rounded-2xl border p-4 transition ${item.status === 'passed' ? 'border-emerald-200 bg-emerald-50/70' : item.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200/70">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">{item.label}</p>
            <StepStatusIcon status={item.status} />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
          {item.status === 'failed' && onAction ? (
            <button type="button" className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50" onClick={() => onAction(item.key)}>
              {item.key === 'permissions' ? 'Allow microphone' : item.key === 'integrity' ? 'Check tabs again' : 'Check again'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IdentityCaptureCard({ kind, title, hint, image, source, onUpload, onLive, disabled, liveOnly = false }) {
  const inputRef = useRef(null);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-950">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
          {kind === 'selfieImage' ? <Camera size={19} /> : <IdCard size={19} />}
        </span>
      </div>
      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
        {image ? (
          <img
            src={image}
            alt={title}
            className={`h-full w-full ${kind === 'idCardImage' ? 'object-contain p-2' : 'object-cover'}`}
          />
        ) : (
          <div className="grid h-full place-items-center text-center text-slate-400">
            <div>
              <ImagePlus size={28} className="mx-auto" />
              <p className="mt-2 text-xs font-bold">No image added</p>
            </div>
          </div>
        )}
        {source ? (
          <span className="absolute left-2 top-2 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
            {source === 'live' ? 'Live capture' : 'Uploaded file'}
          </span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onUpload(kind, file);
        }}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {!liveOnly ? (
          <button type="button" className="secondary-button h-10 justify-center px-3 text-xs" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <Upload size={15} /> Upload
          </button>
        ) : null}
        <button type="button" className={`secondary-button h-10 justify-center px-3 text-xs ${liveOnly ? 'col-span-2' : ''}`} onClick={() => onLive(kind)} disabled={disabled}>
          <Camera size={15} /> Take live
        </button>
      </div>
    </section>
  );
}

function PhaseRail({ phases, activeIndex, completed, highestUnlockedIndex, onSelect, compact = false }) {
  if (compact) {
    return (
      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>Step {activeIndex + 1} of {phases.length}</span>
          <span>{Math.round(((activeIndex + 1) / phases.length) * 100)}%</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {phases.map((phase, index) => (
            <button
              key={phase.key}
              type="button"
              aria-label={`Open ${phase.label}`}
              disabled={index > highestUnlockedIndex}
              onClick={() => onSelect(index)}
              className={`h-1.5 flex-1 rounded-full transition ${completed.has(phase.key) ? 'bg-emerald-500' : index === activeIndex ? 'bg-orange-500' : 'bg-slate-200'} disabled:cursor-not-allowed`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden min-h-0 flex-col border-r border-slate-200 bg-slate-50/80 p-6 lg:flex">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-200">
          <ShieldCheck size={21} />
        </span>
        <div>
          <p className="font-extrabold text-slate-950">Security check</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{completed.size} of {phases.length - 1} checks verified</p>
        </div>
      </div>
      <nav className="mt-8 space-y-2" aria-label="Security phases">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const isComplete = completed.has(phase.key);
          const isActive = activeIndex === index;
          const locked = index > highestUnlockedIndex;
          return (
            <button
              key={phase.key}
              type="button"
              disabled={locked}
              onClick={() => onSelect(index)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${isActive ? 'border-orange-200 bg-white shadow-sm' : 'border-transparent hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                {isComplete ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-extrabold ${isActive || isComplete ? 'text-slate-950' : 'text-slate-500'}`}>{phase.label}</span>
                <span className={`mt-0.5 block text-xs ${isComplete ? 'font-semibold text-emerald-600' : 'text-slate-500'}`}>{isComplete ? 'Verified' : phase.caption}</span>
              </span>
              {isActive ? <ChevronRight size={16} className="text-orange-500" /> : null}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-slate-200 bg-white p-4">
        <p className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><LockKeyhole size={14} /> Saved progress</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">Every completed phase is saved. You can return to any verified phase before starting.</p>
      </div>
    </aside>
  );
}

export function SecuritySetupDialog({ exam, onClose, onAttemptUpdated, onStarted, reverify = false }) {
  const phases = useMemo(() => (reverify ? SECURITY_PHASES.filter((phase) => phase.key !== 'identity') : SECURITY_PHASES), [reverify]);
  const initialCompleted = useMemo(() => getInitialCompletedPhases(exam, reverify), [exam, reverify]);
  const [completed, setCompleted] = useState(initialCompleted);
  const [activeIndex, setActiveIndex] = useState(() => {
    const firstPending = phases.findIndex((phase) => !initialCompleted.has(phase.key));
    return firstPending === -1 ? phases.length - 1 : firstPending;
  });
  const [working, setWorking] = useState(false);
  const [workingText, setWorkingText] = useState('Verifying…');
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(reverify);
  const [environmentChecks, setEnvironmentChecks] = useState(INITIAL_ENVIRONMENT_CHECKS);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraDetails, setCameraDetails] = useState(null);
  const [cameraAlignment, setCameraAlignment] = useState('idle');
  const [liveTarget, setLiveTarget] = useState('');
  const [modelStatus, setModelStatus] = useState('idle');
  const [locationResult, setLocationResult] = useState(exam.attempt?.locationVerification || null);
  const [identity, setIdentity] = useState({
    selfieImage: '',
    idCardImage: '',
    selfieSource: '',
    idCardSource: '',
    matchPercentage: exam.attempt?.identityVerification?.matchPercentage ?? null,
    status: exam.attempt?.identityVerification?.status || '',
  });
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaHandoffRef = useRef(false);
  const setupTabInstanceRef = useRef(`setup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const current = phases[activeIndex] || phases[0];
  const CurrentIcon = current.icon;
  const isReviewPhase = current.key === 'review';
  const firstIncompleteIndex = phases.findIndex((phase) => phase.key === 'review' || !completed.has(phase.key));
  const highestUnlockedIndex = firstIncompleteIndex === -1 ? phases.length - 1 : firstIncompleteIndex;

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return;
    if (videoRef.current.srcObject !== cameraStream) videoRef.current.srcObject = cameraStream;
    videoRef.current.play().catch(() => {});
  }, [activeIndex, cameraStream, liveTarget]);

  useEffect(() => {
    if (typeof window.BroadcastChannel === 'undefined') return undefined;
    const channel = new window.BroadcastChannel(`evalora-exam-${exam.assignmentId}`);
    const instanceId = setupTabInstanceRef.current;
    channel.onmessage = (event) => {
      if (!event.data?.instanceId || event.data.instanceId === instanceId) return;
      if (event.data.type === 'security-probe') {
        channel.postMessage({ type: 'exam-tab-online', instanceId });
      }
    };
    channel.postMessage({ type: 'exam-tab-online', instanceId });
    const pulse = window.setInterval(() => channel.postMessage({ type: 'exam-tab-online', instanceId }), 2000);
    return () => {
      window.clearInterval(pulse);
      channel.close();
    };
  }, [exam.assignmentId]);

  useEffect(() => () => {
    if (!mediaHandoffRef.current) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      const handoff = getExamMediaHandoff();
      if (handoff?.assignmentId === exam.assignmentId) {
        handoff.cameraStream = null;
      }
    }
  }, [exam.assignmentId]);

  useEffect(() => {
    const identityIndex = phases.findIndex((phase) => phase.key === 'identity');
    if (identityIndex < 0 || activeIndex < Math.max(identityIndex - 1, 0) || modelStatus !== 'idle') return;
    setModelStatus('loading');
    loadFaceApi().then(() => setModelStatus('ready')).catch(() => setModelStatus('failed'));
  }, [activeIndex, modelStatus, phases]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || !completed.has('fullscreen')) return;
      setCompleted((currentCompleted) => {
        const next = new Set(currentCompleted);
        next.delete('fullscreen');
        return next;
      });
      const fullscreenIndex = phases.findIndex((phase) => phase.key === 'fullscreen');
      if (fullscreenIndex >= 0) setActiveIndex(fullscreenIndex);
      setError({
        title: 'Full screen was closed',
        message: 'Enable full screen again before starting the exam.',
      });
      api.post(`/student/exams/${exam.assignmentId}/setup-step`, {
        key: 'fullscreen',
        status: 'failed',
        message: 'Full screen was exited before the exam started.',
      }).then((response) => onAttemptUpdated(response.data.attempt)).catch(() => {});
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [completed, exam.assignmentId, onAttemptUpdated, phases]);

  function updateEnvironmentCheck(key, status, detail) {
    setEnvironmentChecks((items) => items.map((item) => (item.key === key ? { ...item, status, detail } : item)));
  }

  function markPhaseComplete(key) {
    setCompleted((currentCompleted) => new Set([...currentCompleted, key]));
    const index = phases.findIndex((phase) => phase.key === key);
    setActiveIndex(Math.min(index + 1, phases.length - 1));
    setError(null);
  }

  function invalidatePhasesAfter(key) {
    const index = phases.findIndex((phase) => phase.key === key);
    if (index < 0) return;
    setCompleted((currentCompleted) => {
      const next = new Set(currentCompleted);
      phases.slice(index + 1).forEach((phase) => next.delete(phase.key));
      return next;
    });
  }

  function markPhaseFailed(phaseKey, setupKey, message) {
    const failedIndex = phases.findIndex((phase) => phase.key === phaseKey);
    setCompleted((currentCompleted) => {
      const next = new Set(currentCompleted);
      phases.slice(Math.max(failedIndex, 0)).forEach((phase) => next.delete(phase.key));
      return next;
    });
    if (failedIndex >= 0) setActiveIndex(failedIndex);
    setAccepted(reverify);
    api.post(`/student/exams/${exam.assignmentId}/setup-step`, {
      key: setupKey,
      status: 'failed',
      message,
    }).then((response) => onAttemptUpdated(response.data.attempt)).catch(() => {});
  }

  function showError(requestError, fallback, title = 'This check needs attention') {
    const message = getStudentFriendlyError(requestError, fallback);
    setError({ title, message });
    return message;
  }

  async function saveSetupStep(key, message, status = 'passed') {
    const response = await api.post(`/student/exams/${exam.assignmentId}/setup-step`, { key, status, message });
    onAttemptUpdated(response.data.attempt);
    return response.data.attempt;
  }

  async function ensureCameraStream() {
    if (hasLiveCameraStream(cameraStreamRef.current)) return cameraStreamRef.current;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      // Acquire one combined stream during setup and hand it to the attempt.
      // This prevents a second microphone prompt after the exam has started.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    cameraStreamRef.current = stream;
    setCameraStream(stream);
    return stream;
  }

  async function prepareExamMediaHandoff() {
    const camera = hasLiveCameraStream(cameraStreamRef.current) ? cameraStreamRef.current : await ensureCameraStream();
    const handoff = getExamMediaHandoff();
    handoff.assignmentId = exam.assignmentId;
    handoff.cameraStream = camera;
    handoff.capturedAt = Date.now();
    return { camera };
  }

  function getPreparedExamMedia() {
    const handoff = getExamMediaHandoff();
    if (handoff?.assignmentId !== exam.assignmentId) return null;
    if (!hasLiveCameraStream(handoff.cameraStream)) return null;
    return {
      camera: handoff.cameraStream,
    };
  }

  async function waitForCameraFrame(stream) {
    const preview = videoRef.current || document.createElement('video');
    const createdPreview = !videoRef.current;
    preview.muted = true;
    preview.playsInline = true;
    preview.autoplay = true;
    if (preview.srcObject !== stream) preview.srcObject = stream;

    try {
      await preview.play();
      if (!preview.videoWidth || !preview.videoHeight || preview.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('The camera preview did not start. Check camera permission and try again.')), 8000);
          const ready = () => {
            window.clearTimeout(timeout);
            preview.removeEventListener('loadeddata', ready);
            preview.removeEventListener('canplay', ready);
            resolve();
          };
          preview.addEventListener('loadeddata', ready, { once: true });
          preview.addEventListener('canplay', ready, { once: true });
        });
      }
      if (!hasLiveCameraStream(stream) || !preview.videoWidth || !preview.videoHeight) {
        throw new Error('The camera is not sending a live video feed. Re-enable it and try again.');
      }
      return captureVideoFrame(preview, 720, 0.76);
    } finally {
      if (createdPreview) {
        preview.pause();
        preview.srcObject = null;
      }
    }
  }

  async function verifyActiveCamera(faceapi) {
    const stream = await ensureCameraStream();
    const frame = await waitForCameraFrame(stream);
    const face = await detectLiveFace(faceapi, frame);
    // Match the on-screen elliptical guide (44% wide, 72% high). A small
    // inset keeps the full face away from the edge of the guide.
    const normalizedX = (face.faceCenterXRatio - 0.5) / 0.19;
    const normalizedY = (face.faceCenterYRatio - 0.5) / 0.31;
    const centered = (normalizedX ** 2) + (normalizedY ** 2) <= 1;
    const usefulSize = face.faceHeightRatio >= 0.18 && face.faceHeightRatio <= 0.62;
    if (!centered || !usefulSize) {
      setCameraAlignment('misaligned');
      throw new Error('Move your full face inside the circle and look straight at the camera. The circle will turn green when you are aligned.');
    }
    setCameraAlignment('aligned');
    const track = stream.getVideoTracks().find((item) => item.readyState === 'live' && item.enabled);
    const settings = track?.getSettings?.() || {};
    const details = {
      label: track?.label || 'Camera',
      width: Number(settings.width || 0),
      height: Number(settings.height || 0),
      checkedAt: new Date().toISOString(),
      detectionScore: face.detectionScore,
    };
    setCameraDetails(details);
    return details;
  }

  async function runEnvironment() {
    setWorking(true);
    setWorkingText('Checking environment…');
    setError(null);
    setEnvironmentChecks(INITIAL_ENVIRONMENT_CHECKS.map((item) => ({ ...item, status: 'running', detail: 'Checking now…' })));
    let activeCheck = 'session';
    try {
      if (!window.isSecureContext) throw new Error('Open Evalora through a secure HTTPS connection.');
      if (!navigator.cookieEnabled) throw new Error('Cookies are blocked. Enable them for Evalora and retry.');
      if (!storageAvailable(window.localStorage) || !storageAvailable(window.sessionStorage)) {
        throw new Error('Browser storage is blocked. Disable privacy blocking for Evalora and retry.');
      }
      if (navigator.webdriver) throw new Error('Browser automation was detected. Use a normal browser session.');
      updateEnvironmentCheck('session', 'passed', 'HTTPS, cookies, and secure storage are available');

      activeCheck = 'privacy';
      const privacy = await inspectPrivateModeSignals();
      updateEnvironmentCheck('privacy', 'passed', `Normal storage session${privacy.quotaMb ? ` · ${privacy.quotaMb} MB quota` : ''}`);

      activeCheck = 'connection';
      const network = await probeNetwork();
      updateEnvironmentCheck(
        'connection',
        'passed',
        `${network.latency} ms latency · ${network.measuredMbps.toFixed(2)} Mbps measured${network.effectiveType !== 'unknown' ? ` · ${network.effectiveType}` : ''}`,
      );

      activeCheck = 'integrity';
      const duplicateTab = await hasDuplicateExamTab(exam.assignmentId, setupTabInstanceRef.current);
      if (document.visibilityState !== 'visible' || !document.hasFocus()) throw new Error('Keep this exam tab visible and active while checking.');
      if (duplicateTab) throw new Error('This exam is open in another Evalora tab. Close the other tab and retry.');
      if (!document.documentElement.requestFullscreen) throw new Error('This browser does not support the required full-screen mode.');
      updateEnvironmentCheck('integrity', 'passed', 'Active window, normal browser, and no duplicate exam tab');

      activeCheck = 'permissions';
      const microphone = await verifyMicrophone();
      updateEnvironmentCheck('permissions', 'passed', `${microphone.label} active${microphone.sampleRate ? ` · ${microphone.sampleRate} Hz` : ''}`);

      await saveSetupStep('browser', `Environment verified: normal session; latency ${network.latency}ms; measured download ${network.measuredMbps}Mbps; no duplicate tab.`);
      await saveSetupStep('microphone', `Active microphone verified${microphone.sampleRate ? ` at ${microphone.sampleRate}Hz` : ''}.`);
      markPhaseComplete('environment');
    } catch (requestError) {
      setEnvironmentChecks((items) => items.map((item) => {
        if (item.key === activeCheck) return { ...item, status: 'failed', detail: getStudentFriendlyError(requestError, 'Needs attention before continuing') };
        if (item.status === 'running') return { ...item, status: 'idle', detail: 'Waiting for the failed check to be corrected' };
        return item;
      }));
      const message = showError(
        requestError,
        'We could not complete the environment check. Review the items above, then try again.',
        'Environment check needs attention',
      );
      if (!isRetryableTransportError(requestError)) markPhaseFailed('environment', 'browser', message);
    } finally {
      setWorking(false);
    }
  }

  async function recoverEnvironmentCheck(key) {
    setError(null);
    if (key === 'permissions') {
      updateEnvironmentCheck('permissions', 'running', 'Requesting microphone permission…');
      try {
        const microphone = await verifyMicrophone();
        updateEnvironmentCheck('permissions', 'passed', `${microphone.label} active${microphone.sampleRate ? ` · ${microphone.sampleRate} Hz` : ''}`);
      } catch (requestError) {
        const permission = await queryPermissionState('microphone');
        const message = permission === 'denied'
          ? 'Microphone is blocked. Click the site controls icon beside the address, set Microphone to Allow, then click Try again.'
          : getStudentFriendlyError(requestError, 'Select Allow in the browser microphone prompt, then try again.');
        updateEnvironmentCheck('permissions', 'failed', message);
        setError({ title: 'Microphone permission required', message });
      }
      return;
    }
    await runEnvironment();
  }

  async function runLocation() {
    setWorking(true);
    setWorkingText('Verifying location…');
    setError(null);
    try {
      if (!navigator.geolocation) throw new Error('Location is unavailable. Disable location-blocking extensions and retry.');
      const permissionState = await queryPermissionState('geolocation');
      if (permissionState === 'denied') {
        throw new Error('Location permission is blocked. Allow it in browser settings and disable location/privacy extensions.');
      }
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }));
      const { latitude, longitude, accuracy } = position.coords;
      const stale = Date.now() - Number(position.timestamp || 0) > 120000;
      const suspicious = !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(accuracy)
        || accuracy <= 0
        || accuracy > 50000
        || (latitude === 0 && longitude === 0)
        || stale;
      if (suspicious) {
        throw new Error('Location integrity could not be confirmed. Disable location-spoofing or privacy extensions, enable precise location, and retry.');
      }

      const response = await api.post(`/student/exams/${exam.assignmentId}/location-verification`, {
        latitude,
        longitude,
        accuracy,
        permissionState,
        capturedAt: new Date(position.timestamp).toISOString(),
      });
      setLocationResult(response.data.locationVerification);
      onAttemptUpdated(response.data.attempt);
      markPhaseComplete('location');
    } catch (requestError) {
      const message = showError(
        requestError,
        'We could not verify your location. Allow location access, then try again.',
        'Location could not be verified',
      );
      if (!isRetryableTransportError(requestError)) markPhaseFailed('location', 'location', message);
    } finally {
      setWorking(false);
    }
  }

  async function runCamera() {
    setWorking(true);
    setWorkingText('Starting camera…');
    setError(null);
    setCameraAlignment('checking');
    try {
      setModelStatus('loading');
      const faceapi = await loadFaceApi();
      setModelStatus('ready');
      setWorkingText('Checking live camera view…');
      const details = await verifyActiveCamera(faceapi);
      await prepareExamMediaHandoff();
      const resolution = details.width && details.height ? ` at ${details.width}×${details.height}` : '';
      if (!reverify) {
        await saveSetupStep('camera', `Camera enabled${resolution}; live face view verified.`);
        invalidatePhasesAfter('camera');
      }
      markPhaseComplete('camera');
    } catch (requestError) {
      setCameraAlignment('misaligned');
      setModelStatus((currentStatus) => (currentStatus === 'loading' ? 'failed' : currentStatus));
      const message = showError(
        requestError,
        'Allow camera access, face the camera clearly, and make sure no other app is using it.',
        'Camera check needs attention',
      );
      if (!isRetryableTransportError(requestError)) markPhaseFailed('camera', 'camera', message);
    } finally {
      setWorking(false);
    }
  }

  async function uploadIdentityImage(kind, file) {
    setWorking(true);
    setWorkingText('Preparing image…');
    setError(null);
    try {
      const image = await optimizeImageFile(file, kind === 'selfieImage' ? 900 : 1400);
      const sourceKey = kind === 'selfieImage' ? 'selfieSource' : 'idCardSource';
      setIdentity((currentIdentity) => ({
        ...currentIdentity,
        [kind]: image,
        [sourceKey]: 'upload',
        matchPercentage: null,
        status: '',
      }));
    } catch (requestError) {
      showError(requestError, 'Choose another clear JPG, PNG, or WebP image.', 'Photo could not be prepared');
    } finally {
      setWorking(false);
    }
  }

  async function beginLiveCapture(kind) {
    setWorking(true);
    setWorkingText('Starting camera…');
    setError(null);
    setLiveTarget(kind);
    try {
      await ensureCameraStream();
    } catch (requestError) {
      setLiveTarget('');
      showError(requestError, 'Allow camera permission, then try again.', 'Camera could not start');
    } finally {
      setWorking(false);
    }
  }

  function takeLivePhoto() {
    try {
      const image = captureVideoFrame(videoRef.current, liveTarget === 'selfieImage' ? 900 : 1400, 0.8);
      const sourceKey = liveTarget === 'selfieImage' ? 'selfieSource' : 'idCardSource';
      setIdentity((currentIdentity) => ({
        ...currentIdentity,
        [liveTarget]: image,
        [sourceKey]: 'live',
        matchPercentage: null,
        status: '',
      }));
      setLiveTarget('');
      setError(null);
    } catch (requestError) {
      showError(requestError, 'Wait for the camera preview, then take the photo again.', 'Photo could not be captured');
    }
  }

  async function runIdentity() {
    let stage = 'inputs';
    setWorking(true);
    setWorkingText('Preparing identity check…');
    setError(null);
    try {
      if (!identity.selfieImage || !identity.idCardImage) throw new Error('Add both a student photo and an identity-card photo.');
      if (identity.selfieSource !== 'live') throw new Error('Take a live student photo before verifying identity.');

      stage = 'models';
      setWorkingText('Preparing face matching…');
      setModelStatus('loading');
      const faceapi = await loadFaceApi();
      setModelStatus('ready');

      stage = 'camera';
      setWorkingText('Rechecking live camera view…');
      const cameraCheck = await verifyActiveCamera(faceapi);
      const cameraResolution = cameraCheck.width && cameraCheck.height ? ` at ${cameraCheck.width}×${cameraCheck.height}` : '';
      await saveSetupStep('camera', `Camera rechecked before identity verification${cameraResolution}.`);

      stage = 'selfie';
      setWorkingText('Checking student photo…');
      const selfieFace = await detectFaceDescriptor(faceapi, identity.selfieImage, 'selfie');

      stage = 'idFace';
      setWorkingText('Checking the ID-card portrait…');
      const idCardFace = await detectFaceDescriptor(faceapi, identity.idCardImage, 'idCard');
      if (idCardFace.faceHeightRatio > MAX_CARD_FACE_HEIGHT_RATIO || idCardFace.faceWidthRatio > 0.26) {
        throw new Error('The ID image looks like a normal selfie. Upload or capture the full physical card with visible edges.');
      }

      stage = 'idText';
      setWorkingText('Reading ID card text…');
      const idCardOcr = await extractIdCardText(identity.idCardImage);
      if (!idCardOcr.text || idCardOcr.text.length < 12) {
        throw new Error('No readable identity-card text was found. Upload a clear physical ID card, not a logo or normal photo.');
      }

      stage = 'upload';
      setWorkingText('Uploading photos securely…');
      const [selfieEvidence, idCardEvidence] = await Promise.all([
        uploadEvidenceDataUrl(identity.selfieImage, {
          category: 'identity', assignmentId: exam.assignmentId, filename: 'identity-selfie.jpg',
        }),
        uploadEvidenceDataUrl(identity.idCardImage, {
          category: 'identity', assignmentId: exam.assignmentId, filename: 'identity-card.jpg',
        }),
      ]);

      stage = 'submit';
      setWorkingText('Confirming identity match…');
      const response = await api.post(`/student/exams/${exam.assignmentId}/identity-verification`, {
        selfieImage: selfieEvidence.url || identity.selfieImage,
        idCardImage: idCardEvidence.url || identity.idCardImage,
        selfieStorageKey: selfieEvidence.key || '',
        idCardStorageKey: idCardEvidence.key || '',
        selfieDescriptor: selfieFace.descriptor,
        idCardDescriptor: idCardFace.descriptor,
        idCardOcrText: idCardOcr.text,
        idCardOcrConfidence: idCardOcr.confidence,
        selfieSource: identity.selfieSource || 'upload',
        idCardSource: identity.idCardSource || 'upload',
      });
      const result = response.data.identityVerification;
      setIdentity((currentIdentity) => ({
        ...currentIdentity,
        matchPercentage: result.matchPercentage,
        status: result.status,
      }));
      onAttemptUpdated(response.data.attempt);
      markPhaseComplete('identity');
    } catch (requestError) {
      if (stage === 'models') setModelStatus('failed');
      const stageError = IDENTITY_STAGE_ERRORS[stage] || IDENTITY_STAGE_ERRORS.submit;
      const title = requestError?.response?.status === 422
        ? 'Identity details did not match'
        : stageError.title;
      const message = showError(requestError, stageError.fallback, title);
      if (!isRetryableTransportError(requestError)) {
        if (stage === 'camera') markPhaseFailed('camera', 'camera', message);
        else markPhaseFailed('identity', 'identity', message);
      }
    } finally {
      setWorking(false);
    }
  }

  async function runFullscreen() {
    setWorking(true);
    setWorkingText('Enabling full screen…');
    setError(null);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!reverify) await saveSetupStep('fullscreen', 'Full-screen mode enabled and verified.');
      markPhaseComplete('fullscreen');
    } catch (requestError) {
      if (document.fullscreenElement && requestError?.response?.status === 409) {
        await document.exitFullscreen().catch(() => {});
      }
      showError(requestError, 'Allow full-screen access, then try again.', 'Full screen could not be enabled');
    } finally {
      setWorking(false);
    }
  }

  async function finishReview() {
    setWorking(true);
    setWorkingText(reverify ? 'Resuming exam…' : 'Starting secure exam…');
    setError(null);
    try {
      const requiredPhases = phases.filter((phase) => phase.key !== 'review');
      const missingPhase = requiredPhases.find((phase) => !completed.has(phase.key));
      if (missingPhase) throw new Error(`Complete the ${missingPhase.label} phase before starting.`);
      if (!document.fullscreenElement) {
        const fullscreenIndex = phases.findIndex((phase) => phase.key === 'fullscreen');
        if (fullscreenIndex >= 0) setActiveIndex(fullscreenIndex);
        throw new Error('Full screen is no longer active. Enable it again before starting.');
      }
      if (!accepted) throw new Error('Read and accept the exam instructions and monitoring policy.');

      setWorkingText(reverify ? 'Resuming secure exam…' : 'Starting secure exam…');
      const media = getPreparedExamMedia();
      if (!media) {
        const cameraIndex = phases.findIndex((phase) => phase.key === 'camera');
        if (cameraIndex >= 0) setActiveIndex(cameraIndex);
        throw new Error('Camera is no longer active. Verify the camera again before starting.');
      }
      if (!document.fullscreenElement) throw new Error('Full screen is no longer active. Enable it again before starting.');
      cameraStream?.getAudioTracks().forEach((track) => track.stop());
      if (reverify) {
        const response = await api.post(`/student/exams/${exam.assignmentId}/security-hold/recheck`, {
          checks: {
            visible: document.visibilityState === 'visible',
            focused: document.hasFocus(),
            fullscreen: Boolean(document.fullscreenElement),
            camera: completed.has('camera') && hasLiveCameraStream(media.camera),
            microphone: completed.has('environment') || !needsMicrophone(exam),
          },
        });
        mediaHandoffRef.current = true;
        onStarted(response.data);
        return;
      }

      const instructionAttempt = await saveSetupStep('instructions', 'Exam instructions and monitoring terms accepted.');
      onAttemptUpdated(instructionAttempt);
      const response = await api.post(`/student/exams/${exam.assignmentId}/start`);
      onAttemptUpdated(response.data.attempt);
      mediaHandoffRef.current = true;
      onStarted(response.data);
    } catch (requestError) {
      showError(requestError, 'Your completed checks are saved. Keep this page open and try again.', 'Exam could not be started');
    } finally {
      setWorking(false);
    }
  }

  const phaseAction = {
    environment: runEnvironment,
    location: runLocation,
    camera: runCamera,
    identity: runIdentity,
    fullscreen: runFullscreen,
    review: finishReview,
  }[current.key];
  const actionLabel = {
    environment: 'Run environment check',
    location: 'Allow and verify location',
    camera: 'Enable and verify camera',
    identity: 'Verify identity match',
    fullscreen: 'Enable full screen',
    review: reverify ? 'Resume secure exam' : 'Start secure exam',
  }[current.key];

  function goToPhase(index) {
    if (index > highestUnlockedIndex) return;
    setActiveIndex(index);
    setError(null);
  }

  const currentComplete = completed.has(current.key);
  const pageCopy = {
    environment: {
      eyebrow: 'Phase 1',
      title: 'Prepare your exam environment',
      text: 'We’ll verify the browser session, Evalora connection, duplicate exam tabs, and any device permissions required by this exam.',
    },
    location: {
      eyebrow: 'Phase 2',
      title: 'Verify your location',
      text: 'Allow precise location when prompted. Suspicious, stale, blocked, or unusable location results cannot continue.',
    },
    camera: {
      eyebrow: 'Phase 3',
      title: 'Enable your camera',
      text: 'Keep your face clearly visible. Evalora verifies a live camera feed now and rechecks it before identity matching.',
    },
    identity: {
      eyebrow: 'Phase 4',
      title: 'Confirm your identity',
      text: 'Take a live face photo and add a clear physical ID card.',
    },
    fullscreen: {
      eyebrow: 'Phase 5',
      title: 'Enter full-screen mode',
      text: 'Your exam opens in a distraction-free workspace. Exiting full screen during the exam may trigger a security alert.',
    },
    review: {
      eyebrow: 'Phase 6',
      title: reverify ? 'Ready to resume' : 'Review and start',
      text: reverify ? 'Checks complete. Resume when ready.' : 'Review checks, accept monitoring, then start.',
    },
  }[current.key];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 backdrop-blur-md sm:p-4 lg:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="security-dialog-title" className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-[0_35px_120px_rgba(2,6,23,0.4)] sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl lg:grid lg:grid-cols-[290px_minmax(0,1fr)]">
        <PhaseRail phases={phases} activeIndex={activeIndex} completed={completed} highestUnlockedIndex={highestUnlockedIndex} onSelect={goToPhase} />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 text-white"><ShieldCheck size={18} /></span>
              <div><p className="text-sm font-extrabold text-slate-950">Security check</p><p className="text-[11px] font-semibold text-slate-500">{current.label}</p></div>
            </div>
            <button type="button" aria-label="Close security check" onClick={onClose} disabled={working} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={17} /></button>
          </header>
          <PhaseRail compact phases={phases} activeIndex={activeIndex} completed={completed} highestUnlockedIndex={highestUnlockedIndex} onSelect={goToPhase} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={`mx-auto w-full max-w-4xl px-5 sm:px-8 lg:px-10 ${isReviewPhase ? 'py-4 sm:py-5 lg:py-6' : 'py-6 sm:py-8 lg:py-9'}`}>
              <div className="flex items-start justify-between gap-5">
                <div className="flex min-w-0 items-start gap-4">
                  <span className={`grid shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 ${isReviewPhase ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-12 w-12 sm:h-14 sm:w-14'}`}>
                    <CurrentIcon size={isReviewPhase ? 20 : 24} />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600">{pageCopy.eyebrow}</p>
                    <h2 id="security-dialog-title" className={`mt-1.5 font-black tracking-tight text-slate-950 ${isReviewPhase ? 'text-2xl sm:text-[1.7rem]' : 'text-2xl sm:text-3xl'}`}>{pageCopy.title}</h2>
                    <p className={`max-w-2xl text-sm text-slate-500 ${isReviewPhase ? 'mt-1 leading-5' : 'mt-2 leading-6'}`}>{pageCopy.text}</p>
                  </div>
                </div>
                <button type="button" aria-label="Close security check" onClick={onClose} disabled={working} className="hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-40 lg:grid"><X size={17} /></button>
              </div>

              {current.key === 'environment' ? (
                <div className="mt-7">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {environmentChecks.map((item) => <EnvironmentCheckCard key={item.key} item={item} onAction={recoverEnvironmentCheck} />)}
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-800">
                    <MonitorCheck size={17} className="mt-0.5 shrink-0" />
                    <p>For privacy, a website cannot inspect or close every app, browser window, or extension on your device. Close them yourself; Evalora verifies the controls browsers safely expose and detects another active Evalora exam tab.</p>
                  </div>
                </div>
              ) : null}

              {current.key === 'location' ? (
                <div className="mt-7 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-7">
                    <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-orange-500/20 blur-2xl" />
                    <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><LocateFixed size={24} /></span>
                    <h3 className="relative mt-5 text-xl font-black">Precise location permission</h3>
                    <p className="relative mt-2 text-sm leading-6 text-slate-300">Your coordinates are saved securely with this attempt. Only accuracy is shown in this setup screen.</p>
                    {locationResult ? (
                      <div className="relative mt-5 flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                        <div><p className="text-sm font-extrabold">Location verified</p><p className="mt-0.5 text-xs text-slate-300">Accuracy: approximately {Math.round(Number(locationResult.accuracy || 0))} metres</p></div>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    {[
                      [Navigation, 'Allow precise location', 'Choose Allow when the browser asks.'],
                      [ShieldCheck, 'Integrity screening', 'Stale or unusable coordinates are rejected.'],
                      [AlertTriangle, 'Disable spoofing tools', 'Turn off VPN/location-spoofing and privacy extensions before retrying.'],
                    ].map(([Icon, title, text]) => (
                      <div key={title} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-orange-600 shadow-sm"><Icon size={18} /></span>
                        <div><p className="text-sm font-extrabold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>
                      </div>
                    ))}
                  </div>
                  <p className="md:col-span-2 text-xs leading-5 text-slate-500">Browsers cannot reliably name installed extensions. If location is blocked or fails integrity checks, Evalora asks you to disable location/privacy extensions and retry.</p>
                </div>
              ) : null}

              {current.key === 'camera' ? (
                <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-3 shadow-lg shadow-slate-200/60">
                    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div className={`h-[72%] w-[44%] rounded-[50%] border-[3px] border-dashed shadow-[0_0_0_999px_rgba(2,6,23,0.22)] transition-colors duration-200 ${cameraAlignment === 'aligned' ? 'border-emerald-400 shadow-[0_0_22px_rgba(52,211,153,0.8),0_0_0_999px_rgba(2,6,23,0.22)]' : cameraAlignment === 'misaligned' ? 'animate-pulse border-red-500 shadow-[0_0_22px_rgba(239,68,68,0.8),0_0_0_999px_rgba(2,6,23,0.22)]' : 'border-white/90'}`} />
                      </div>
                      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/90 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm">
                        <span className={`h-2 w-2 rounded-full ${hasLiveCameraStream(cameraStream) ? 'animate-pulse bg-white' : 'bg-amber-200'}`} />
                        {hasLiveCameraStream(cameraStream) ? 'LIVE CAMERA' : 'CAMERA READY TO START'}
                      </span>
                    </div>
                    <p className={`px-2 pb-1 pt-3 text-xs font-semibold leading-5 ${cameraAlignment === 'aligned' ? 'text-emerald-400' : cameraAlignment === 'misaligned' ? 'animate-pulse text-red-400' : 'text-slate-300'}`}>
                      {cameraAlignment === 'aligned' ? 'Face aligned — camera verified.' : cameraAlignment === 'misaligned' ? 'Face is outside the guide. Center your full face inside the red circle and try again.' : 'Look straight at the camera with your full face inside the guide.'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-orange-600 shadow-sm"><Camera size={20} /></span>
                      <h3 className="mt-4 text-base font-black text-slate-950">Live face check</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">This phase opens the camera, confirms a live video frame, and checks that your face is visible. The camera stays active for the next phase.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {cameraDetails ? (
                        <div className="flex gap-3">
                          <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-500" />
                          <div><p className="font-extrabold">Camera verified</p><p className="mt-1 text-xs leading-5 text-slate-500">{cameraDetails.label}{cameraDetails.width && cameraDetails.height ? ` · ${cameraDetails.width}×${cameraDetails.height}` : ''}. It will be rechecked before identity matching.</p></div>
                        </div>
                      ) : (
                        <div className="flex gap-3"><Gauge size={19} className="mt-0.5 shrink-0 text-slate-400" /><p className="text-xs leading-5 text-slate-500">Select “Enable and verify camera” below. Your browser will ask for permission if needed.</p></div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {current.key === 'identity' ? (
                <div className="mt-7">
                  {liveTarget ? (
                    <div className="mb-5 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-3 shadow-lg shadow-slate-200/60">
                      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`h-full w-full ${liveTarget === 'selfieImage' ? 'scale-x-[-1] object-cover' : 'object-contain'}`}
                        />
                        <div className="pointer-events-none absolute inset-0 grid place-items-center">
                          <div className={`${liveTarget === 'selfieImage' ? 'h-[72%] w-[44%] rounded-[50%]' : 'h-[68%] w-[82%] rounded-2xl'} border-2 border-dashed border-white/80 shadow-[0_0_0_999px_rgba(2,6,23,0.25)]`} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 p-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold text-slate-300">{liveTarget === 'selfieImage' ? 'Look directly at the camera in clear light.' : 'Show the full physical card, including all four edges.'}</p>
                        <div className="flex gap-2">
                          <button type="button" className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-white" onClick={() => setLiveTarget('')}>Cancel</button>
                          <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white" onClick={takeLivePhoto}><Camera size={15} /> Capture now</button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {!liveTarget ? <video ref={videoRef} autoPlay playsInline muted aria-hidden="true" className="sr-only" /> : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <IdentityCaptureCard
                      kind="selfieImage"
                      title="Student photo"
                      hint="Live capture only. Look straight at the camera."
                      image={identity.selfieImage}
                      source={identity.selfieSource}
                      onUpload={uploadIdentityImage}
                      onLive={beginLiveCapture}
                      disabled={working}
                      liveOnly
                    />
                    <IdentityCaptureCard
                      kind="idCardImage"
                      title="Physical identity card"
                      hint="Show the full card with clear text and portrait."
                      image={identity.idCardImage}
                      source={identity.idCardSource}
                      onUpload={uploadIdentityImage}
                      onLive={beginLiveCapture}
                      disabled={working}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      {modelStatus === 'loading' ? <Loader2 size={15} className="animate-spin text-orange-500" /> : modelStatus === 'ready' ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Gauge size={15} className="text-slate-400" />}
                      {modelStatus === 'loading' ? 'Preparing secure face match…' : modelStatus === 'ready' ? 'Face matching is ready' : modelStatus === 'failed' ? 'Face matching will retry during verification' : 'Face matching loads only when needed'}
                    </div>
                    {identity.matchPercentage !== null ? (
                      <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${identity.status === 'passed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {Number(identity.matchPercentage).toFixed(1)}% match · {identity.status === 'passed' ? 'Verified' : 'Saved for review'}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {current.key === 'fullscreen' ? (
                <div className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_0.9fr] md:items-center">
                    <div>
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-200"><Maximize size={25} /></span>
                      <h3 className="mt-5 text-xl font-black text-slate-950">One focused exam workspace</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">Full screen hides normal browser controls and reduces accidental navigation. Keep it active until you submit.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      {[
                        'Browser controls stay out of the way',
                        'Fullscreen exits may be recorded',
                        'You can still use all exam navigation',
                      ].map((text) => <p key={text} className="flex gap-2.5 py-2 text-sm font-semibold text-slate-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" /> {text}</p>)}
                    </div>
                  </div>
                </div>
              ) : null}

              {current.key === 'review' ? (
                <div className="mt-5">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {phases.filter((phase) => phase.key !== 'review').map((phase, index) => {
                      const Icon = phase.icon;
                      return (
                        <button key={phase.key} type="button" onClick={() => goToPhase(index)} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-left transition hover:bg-emerald-50 xl:flex-col xl:items-start">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm"><Icon size={15} /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-slate-900">{phase.label}</span><span className="mt-0.5 block text-[11px] font-semibold text-emerald-700">Verified</span></span>
                        </button>
                      );
                    })}
                  </div>
                  {!reverify ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3"><FileImage size={18} className="text-orange-600" /><h3 className="text-sm font-extrabold text-slate-950">Instructions</h3></div>
                        <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-5 text-slate-600">{exam.instructions || 'Read every question carefully. Do not switch tabs, leave full screen, use another device, or communicate with anyone during the exam. Keep your face visible and remain seated for the full duration.'}</p>
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-orange-200 bg-white p-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600"><ShieldCheck size={15} /></span>
                          <div>
                            <h3 className="text-xs font-extrabold text-slate-950">Monitoring consent</h3>
                            <p className="mt-0.5 text-xs leading-4 text-slate-600">All required permissions are verified. Start opens the secure exam.</p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-slate-200 pt-3 md:grid-cols-2">
                          {buildSecurityTerms(exam.settings).map((term) => <p key={term} className="flex gap-2 text-[11px] leading-4 text-slate-600"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" /> {term}</p>)}
                        </div>
                      </div>
                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
                        <span className="text-sm font-semibold leading-5 text-slate-700">I accept the exam instructions and monitoring policy.</span>
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-extrabold text-red-800">{error.title}</p>
                    <p className="mt-0.5 font-semibold text-red-700">{error.message}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <footer className={`border-t border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10 ${isReviewPhase ? 'py-3' : 'py-4'}`}>
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              {activeIndex > 0 ? (
                <button type="button" className={`secondary-button shrink-0 justify-center px-4 ${isReviewPhase ? 'h-10' : 'h-11'}`} onClick={() => goToPhase(activeIndex - 1)} disabled={working}>
                  <ArrowLeft size={16} /><span className="hidden sm:inline">Back</span>
                </button>
              ) : null}
              {currentComplete && current.key !== 'review' ? (
                <button type="button" className="secondary-button h-11 shrink-0 justify-center px-4 text-xs" onClick={phaseAction} disabled={working}>
                  <RefreshCw size={15} /><span className="hidden sm:inline">Verify again</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={currentComplete && current.key !== 'review' ? () => goToPhase(Math.min(activeIndex + 1, phases.length - 1)) : phaseAction}
                disabled={working || (current.key === 'review' && !accepted)}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-extrabold text-white shadow-lg shadow-orange-100 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none ${isReviewPhase ? 'h-10' : 'h-11'}`}
              >
                {working ? <><Loader2 size={17} className="animate-spin" /> <span className="truncate">{workingText}</span></> : <>{currentComplete && current.key !== 'review' ? 'Continue' : error ? 'Try again' : actionLabel}<ChevronRight size={17} /></>}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
