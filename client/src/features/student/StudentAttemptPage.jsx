import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  ChevronLeft,
  ChevronRight,
  Camera,
  Clock,
  Eye,
  Flag,
  Loader2,
  LockKeyhole,
  Maximize,
  Mic,
  Radio,
  Save,
  Send,
  ShieldCheck,
  UserRound,
  Wifi,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../../lib/api';
import { uploadEvidenceBlob, uploadEvidenceDataUrl } from '../../lib/storage';

const HARD_SECURITY_HOLD_TYPES = [
  'duplicate_tab',
  'camera_missing',
];
const PROCTOR_ONLY_TYPES = ['microphone_missing', 'camera_movement', 'ai_unavailable', 'ai_multiple_faces', 'ai_looking_away', 'ai_mobile_detected', 'noise_detected'];
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MEDIAPIPE_FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const RECORDING_MIME_TYPE = 'video/webm;codecs=vp8,opus';

function socketUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return apiBase.replace(/\/api\/?$/, '');
}

function getIceServers() {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Allow simple comma-separated STUN/TURN URLs in local env files.
  }

  const urls = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return urls.length ? urls.map((url) => ({ urls: url })) : [{ urls: 'stun:stun.l.google.com:19302' }];
}

function formatTime(ms) {
  const safeMs = Math.max(Number(ms || 0), 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${two(hours)}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

function buildAnswerMap(items = []) {
  return Object.fromEntries(
    items.map((answer) => [
      String(answer.questionId),
      {
        selectedOptionId: answer.selectedOptionId ? String(answer.selectedOptionId) : '',
        textAnswer: answer.textAnswer || '',
        markedForReview: Boolean(answer.markedForReview),
        answered: Boolean(answer.answered),
        savedAt: answer.savedAt,
      },
    ])
  );
}

function captureEvidenceFrame(video, maxWidth = 360, quality = 0.52) {
  if (!video?.videoWidth || !video?.videoHeight) return '';
  const scale = Math.min(maxWidth / video.videoWidth, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function getSupportedRecordingMimeType() {
  if (!window.MediaRecorder) return '';
  if (window.MediaRecorder.isTypeSupported?.(RECORDING_MIME_TYPE)) return RECORDING_MIME_TYPE;
  if (window.MediaRecorder.isTypeSupported?.('video/webm')) return 'video/webm';
  return '';
}

function isAnswered(question, answer) {
  if (!answer) return false;
  if (question.type === 'mcq') return Boolean(answer.selectedOptionId);
  return Boolean(String(answer.textAnswer || '').trim());
}

function QuestionPalette({ questions, answers, activeIndex, filter, onSelect }) {
  const visibleQuestions = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => filter === 'all' || question.type === filter);

  return (
    <div className="grid grid-cols-6 gap-2">
      {visibleQuestions.map(({ question, index }) => {
        const answer = answers[question.id];
        const answered = isAnswered(question, answer);
        const marked = Boolean(answer?.markedForReview);
        const active = activeIndex === index;

        const stateClass = marked
          ? 'border-amber-300 bg-amber-100 text-amber-800'
          : answered
            ? 'border-brand-700 bg-brand-700 text-white'
            : 'border-slate-300 bg-slate-100 text-slate-600';

        return (
          <button
            className={`relative grid h-9 w-9 place-items-center rounded-full border text-xs font-semibold transition hover:border-brand-500 ${stateClass} ${active ? 'ring-2 ring-brand-200 ring-offset-2' : ''}`}
            key={question.id}
            type="button"
            onClick={() => onSelect(index)}
            title={`Question ${index + 1}`}
          >
            {index + 1}
          </button>
        );
      })}
      {visibleQuestions.length === 0 ? <p className="col-span-6 py-3 text-center text-xs text-slate-500">No questions in this section.</p> : null}
    </div>
  );
}

function SubmitDialog({ summary, isSubmitting, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle size={19} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-950">Submit exam?</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Review the summary carefully. After final submission, your answers will be locked.</p>
          </div>
        </div>
        <div className="grid gap-3 p-5 text-sm md:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Answered</p>
            <p className="mt-1 text-xl font-semibold text-green-700">{summary.answered}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Unanswered</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{summary.unanswered}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Review</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{summary.markedForReview}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={isSubmitting}>
            <Send size={16} />
            {isSubmitting ? 'Submitting' : 'Submit Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SecurityHoldOverlay({ hold, onQuickReturn, onVerifyAgain }) {
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const graceEndsAt = hold?.graceEndsAt ? new Date(hold.graceEndsAt).getTime() : now;
  const recheckExpiresAt = hold?.recheckExpiresAt ? new Date(hold.recheckExpiresAt).getTime() : now;
  const inGrace = hold?.phase === 'grace' && now < graceEndsAt;
  const seconds = Math.max(Math.ceil(((inGrace ? graceEndsAt : recheckExpiresAt) - now) / 1000), 0);

  async function quickReturn() {
    setWorking(true); setError('');
    try { await onQuickReturn(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Security verification is required.'); }
    finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-red-200 bg-white shadow-2xl">
        <div className="flex items-start gap-4 border-b border-red-200 bg-red-50 px-6 py-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-red-200 bg-white text-red-600"><AlertOctagon size={22} /></span>
          <div><p className="field-label text-red-600">Exam security hold</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{inGrace ? 'Return to the exam window' : 'Security re-verification required'}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{hold.reason || 'Suspicious browser activity was detected.'}</p></div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div><p className="text-xs font-semibold uppercase text-slate-500">{inGrace ? 'Return window' : 'Verification time'}</p><p className="mt-1 text-sm font-semibold text-slate-800">The exam timer is paused</p></div>
            <p className={`font-mono text-3xl font-semibold ${seconds <= 5 ? 'animate-pulse text-red-600' : 'text-slate-950'}`}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>
          </div>

          {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
          <button className="primary-button mt-5 w-full" type="button" disabled={working || seconds === 0} onClick={inGrace ? quickReturn : onVerifyAgain}>
            {working ? <Loader2 size={16} className="animate-spin" /> : inGrace ? <ChevronLeft size={16} /> : <LockKeyhole size={16} />}
            {inGrace ? 'I am back — resume exam' : 'Verify again'}
          </button>
          <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">This event and its exact detection time are recorded for the exam administrator.</p>
        </div>
      </div>
    </div>
  );
}

function buildLocalSecurityHold(type, reason, phase = 'grace') {
  const now = Date.now();
  const graceSeconds = phase === 'grace' ? 15 : 0;
  return {
    active: true,
    phase,
    reason,
    triggerType: type,
    detectedAt: new Date(now).toISOString(),
    graceEndsAt: new Date(now + graceSeconds * 1000).toISOString(),
    recheckExpiresAt: new Date(now + (graceSeconds + 120) * 1000).toISOString(),
  };
}

export function StudentAttemptPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(null);
  const [questionFilter, setQuestionFilter] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [isWindowFocused, setIsWindowFocused] = useState(document.hasFocus());
  const [saveState, setSaveState] = useState('Saved');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [securitySummary, setSecuritySummary] = useState(null);
  const [securityHold, setSecurityHold] = useState(null);
  const [mediaStatus, setMediaStatus] = useState({
    camera: 'off',
    microphone: 'off',
    movement: 'steady',
    face: 'not checked',
    object: 'clear',
    ai: 'standby',
  });
  const saveTimers = useRef({});
  const eventCooldowns = useRef({});
  const mediaIncidentRef = useRef({});
  const faceDetectingRef = useRef(false);
  const faceLandmarkerRef = useRef(null);
  const faceLandmarkerLoadingRef = useRef(false);
  const objectDetectorRef = useRef(null);
  const objectDetectorLoadingRef = useRef(false);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const recordingUploadPromiseRef = useRef(null);
  const mediaCleanupTimerRef = useRef(null);
  const mediaMonitorSessionRef = useRef(0);
  const liveMediaStreamRef = useRef(null);
  const proctorPeerRef = useRef(null);
  const studentSocketRef = useRef(null);
  const liveSessionRef = useRef(null);
  const movementCanvasRef = useRef(null);
  const lastFrameRef = useRef(null);
  const autoSubmitRef = useRef(false);
  const [proctorLiveStatus, setProctorLiveStatus] = useState('idle');
  const [proctorChatMessages, setProctorChatMessages] = useState([]);
  const [proctorChatDraft, setProctorChatDraft] = useState('');
  const currentQuestion = questions[activeIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] || {} : {};
  const activeSecurityHold = securityHold?.active && HARD_SECURITY_HOLD_TYPES.includes(securityHold.triggerType);

  const summary = useMemo(() => {
    const answered = questions.filter((question) => isAnswered(question, answers[question.id])).length;
    const markedForReview = questions.filter((question) => answers[question.id]?.markedForReview).length;

    return {
      total: questions.length,
      answered,
      unanswered: Math.max(questions.length - answered, 0),
      markedForReview,
    };
  }, [answers, questions]);

  const loadAttempt = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get(`/student/exams/${assignmentId}/attempt`);
      setExam(response.data.exam);
      setQuestions(response.data.questions || []);
      setAnswers(buildAnswerMap(response.data.answers));
      setSecuritySummary(response.data.exam?.attempt?.securitySummary || null);
      const nextHold = response.data.exam?.attempt?.securityHold;
      setSecurityHold(nextHold?.active && HARD_SECURITY_HOLD_TYPES.includes(nextHold.triggerType) ? nextHold : null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to open exam attempt.');
    } finally {
      setIsLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    loadAttempt();
  }, [loadAttempt]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!exam?.attempt?.allowedEndAt) return undefined;

    function tick() {
      if (activeSecurityHold) {
        const holdStartedAt = securityHold.detectedAt ? new Date(securityHold.detectedAt).getTime() : Date.now();
        setRemainingMs(new Date(exam.attempt.allowedEndAt).getTime() - holdStartedAt);
        return;
      }
      setRemainingMs(new Date(exam.attempt.allowedEndAt).getTime() - Date.now());
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeSecurityHold, exam, securityHold]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      api.post(`/student/exams/${assignmentId}/heartbeat`).then((response) => {
        if (response.data.securityHold) {
          setSecurityHold(response.data.securityHold.active && HARD_SECURITY_HOLD_TYPES.includes(response.data.securityHold.triggerType) ? response.data.securityHold : null);
        }
        if (response.data.allowedEndAt) {
          setExam((current) => current ? { ...current, attempt: { ...current.attempt, allowedEndAt: response.data.allowedEndAt } } : current);
        }
      }).catch(() => {});
    }, 30000);

    return () => window.clearInterval(interval);
  }, [assignmentId]);

  const sendSecurityEvent = useCallback(
    async (type, payload = {}) => {
      const cooldownKey = `${type}:${payload.cooldownKey || 'default'}`;
      const now = Date.now();

      if (eventCooldowns.current[cooldownKey] && now - eventCooldowns.current[cooldownKey] < (payload.cooldownMs || 5000)) {
        return;
      }

      eventCooldowns.current[cooldownKey] = now;

      try {
        const response = await api.post(`/student/exams/${assignmentId}/security-event`, {
          type,
          severity: payload.severity || 'warning',
          score: payload.score || 1,
          message: payload.message || '',
          metadata: payload.metadata || {},
          occurredAt: new Date().toISOString(),
        });
        setSecuritySummary(response.data.securitySummary || null);
        if (response.data.enforcement?.submitted) {
          navigate('/student/exams', { replace: true });
          return;
        }
        if (
          response.data.enforcement?.securityHold?.active
          && HARD_SECURITY_HOLD_TYPES.includes(response.data.enforcement.securityHold.triggerType)
          && !PROCTOR_ONLY_TYPES.includes(type)
        ) {
          setSecurityHold(response.data.enforcement.securityHold);
        }
      } catch {
        // Avoid interrupting the exam UI for telemetry failures.
      }
    },
    [assignmentId, navigate]
  );

  const startExamRecording = useCallback((stream) => {
    if (!stream || mediaRecorderRef.current || !window.MediaRecorder) return;
    const mimeType = getSupportedRecordingMimeType();
    if (!mimeType) return;

    try {
      const recorder = new window.MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 260000,
        audioBitsPerSecond: 24000,
      });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.start(15000);
      mediaRecorderRef.current = recorder;
    } catch (recordingError) {
      console.error('Exam recording could not start', recordingError);
    }
  }, []);

  const stopAndUploadRecorder = useCallback(async ({ reason, recorderRef, chunksRef, uploadPromiseRef, filename, eventType, metadataKey }) => {
    if (uploadPromiseRef.current) return uploadPromiseRef.current;
    const recorder = recorderRef.current;
    if (!recorder) return null;

    uploadPromiseRef.current = new Promise((resolve, reject) => {
      const finish = async () => {
        try {
          const chunks = chunksRef.current;
          chunksRef.current = [];
          recorderRef.current = null;
          if (!chunks.length) {
            resolve(null);
            return;
          }

          const type = recorder.mimeType || 'video/webm';
          const blob = new window.Blob(chunks, { type });
          const evidence = await uploadEvidenceBlob(blob, {
            category: 'recording',
            assignmentId,
            filename,
          });

          await api.post(`/student/exams/${assignmentId}/security-event`, {
            type: eventType,
            severity: 'info',
            score: 0,
            message: `Camera recording uploaded (${reason}).`,
            metadata: {
              evidence: {
                [metadataKey]: evidence.url,
                [`${metadataKey.replace('Url', '')}Key`]: evidence.key,
                contentType: evidence.contentType,
                size: evidence.size,
              },
            },
            occurredAt: new Date().toISOString(),
          });

          resolve(evidence);
        } catch (recordingError) {
          console.error('Exam recording upload failed', recordingError);
          reject(recordingError);
        }
      };

      recorder.addEventListener('stop', finish, { once: true });
      if (recorder.state === 'inactive') {
        finish();
        return;
      }
      try {
        recorder.requestData();
      } catch {
        // Some browsers throw if the recorder is already stopping.
      }
      recorder.stop();
    }).finally(() => {
      uploadPromiseRef.current = null;
    });

    return uploadPromiseRef.current;
  }, [assignmentId]);

  const stopAndUploadExamRecording = useCallback(async (reason = 'submitted') => {
    return stopAndUploadRecorder({
      reason,
      recorderRef: mediaRecorderRef,
      chunksRef: recordingChunksRef,
      uploadPromiseRef: recordingUploadPromiseRef,
      filename: `camera-recording-${reason}.webm`,
      eventType: 'exam_camera_recording',
      metadataKey: 'cameraRecordingUrl',
    });
  }, [stopAndUploadRecorder]);

  const startLocalSecurityHold = useCallback((type, reason, phase = 'grace') => {
    if (!HARD_SECURITY_HOLD_TYPES.includes(type)) return;
    setSecurityHold((current) => (
      current?.active && HARD_SECURITY_HOLD_TYPES.includes(current.triggerType)
        ? current
        : buildLocalSecurityHold(type, reason, phase)
    ));
  }, []);

  useEffect(() => {
    if (!exam || !assignmentId) return undefined;

    const token = localStorage.getItem('evalora_token');
    const socket = io(socketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    studentSocketRef.current = socket;

    socket.emit('student:join', { assignmentId }, (ack) => {
      if (!ack?.ok) setError(ack?.message || 'Unable to join live proctoring channel.');
    });

    async function getLiveStream() {
      if (mediaStreamRef.current?.getTracks().some((track) => track.readyState === 'live')) return mediaStreamRef.current;
      if (liveMediaStreamRef.current?.getTracks().some((track) => track.readyState === 'live')) return liveMediaStreamRef.current;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: Boolean(exam.settings?.microphoneRequired || exam.settings?.microphoneMonitoring),
      });
      liveMediaStreamRef.current = stream;
      return stream;
    }

    async function handleMonitorRequest(payload) {
      try {
        if (proctorPeerRef.current) proctorPeerRef.current.close();

        const stream = await getLiveStream();
        const peer = new RTCPeerConnection({ iceServers: getIceServers() });
        proctorPeerRef.current = peer;
        liveSessionRef.current = payload;
        setProctorLiveStatus('sharing');

        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('student:ice-candidate', {
              assignmentId: payload.assignmentId,
              studentId: assignmentId,
              sessionId: payload.sessionId,
              candidate: event.candidate,
            });
          }
        };
        peer.onconnectionstatechange = () => {
          if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) setProctorLiveStatus('idle');
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('student:webrtc-offer', {
          assignmentId: payload.assignmentId,
          studentId: assignmentId,
          sessionId: payload.sessionId,
          sdp: offer,
        });
      } catch {
        setProctorLiveStatus('blocked');
        sendSecurityEvent('camera_missing', {
          message: 'Proctor requested live monitoring but camera or microphone access was unavailable.',
          severity: 'warning',
          metadata: { source: 'proctor_live_request' },
        });
      }
    }

    async function handleAnswer(payload) {
      if (!proctorPeerRef.current || String(payload?.sessionId) !== String(liveSessionRef.current?.sessionId)) return;
      try {
        await proctorPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        setProctorLiveStatus('connected');
      } catch {
        setProctorLiveStatus('blocked');
      }
    }

    async function handleIceCandidate(payload) {
      if (!proctorPeerRef.current || String(payload?.sessionId) !== String(liveSessionRef.current?.sessionId)) return;
      try {
        await proctorPeerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        // Ignore stale candidates after the live monitor was closed.
      }
    }

    function handleMonitorStop(payload) {
      if (payload?.sessionId && String(payload.sessionId) !== String(liveSessionRef.current?.sessionId)) return;
      if (proctorPeerRef.current) proctorPeerRef.current.close();
      proctorPeerRef.current = null;
      setProctorLiveStatus('idle');
    }

    function handleChatMessage(message) {
      if (String(message.studentId) === String(assignmentId)) {
        liveSessionRef.current = liveSessionRef.current || {
          assignmentId: message.assignmentId,
          studentId: assignmentId,
          sessionId: null,
        };
        setProctorChatMessages((current) => [...current, message].slice(-100));
      }
    }

    socket.on('student:monitor-request', handleMonitorRequest);
    socket.on('student:webrtc-answer', handleAnswer);
    socket.on('student:ice-candidate', handleIceCandidate);
    socket.on('student:monitor-stop', handleMonitorStop);
    socket.on('proctor:chat-message', handleChatMessage);

    return () => {
      socket.off('student:monitor-request', handleMonitorRequest);
      socket.off('student:webrtc-answer', handleAnswer);
      socket.off('student:ice-candidate', handleIceCandidate);
      socket.off('student:monitor-stop', handleMonitorStop);
      socket.off('proctor:chat-message', handleChatMessage);
      socket.disconnect();
      studentSocketRef.current = null;
      if (proctorPeerRef.current) proctorPeerRef.current.close();
      proctorPeerRef.current = null;
      if (liveMediaStreamRef.current) {
        liveMediaStreamRef.current.getTracks().forEach((track) => track.stop());
        liveMediaStreamRef.current = null;
      }
      setProctorLiveStatus('idle');
    };
  }, [assignmentId, exam, sendSecurityEvent]);

  useEffect(() => {
    if (!exam?.settings) return undefined;

    function blockEvent(event) {
      event.preventDefault();
      const eventTypeMap = {
        contextmenu: 'right_click_blocked',
        copy: 'copy_blocked',
        cut: 'cut_blocked',
        paste: 'paste_blocked',
      };
      sendSecurityEvent(eventTypeMap[event.type], {
        message: `${event.type} was blocked by assessment settings.`,
        severity: 'info',
      });
    }

    if (exam.settings.rightClickDisabled) {
      document.addEventListener('contextmenu', blockEvent);
    }

    if (exam.settings.copyPasteDisabled) {
      document.addEventListener('copy', blockEvent);
      document.addEventListener('cut', blockEvent);
      document.addEventListener('paste', blockEvent);
    }

    return () => {
      document.removeEventListener('contextmenu', blockEvent);
      document.removeEventListener('copy', blockEvent);
      document.removeEventListener('cut', blockEvent);
      document.removeEventListener('paste', blockEvent);
    };
  }, [assignmentId, exam, sendSecurityEvent]);

  useEffect(() => {
    if (!exam?.settings?.shortcutBlocking && !exam?.settings?.screenshotWarning) return undefined;

    function handleRestrictedKey(event) {
      const key = String(event.key || '').toLowerCase();
      const screenshotAttempt = key === 'printscreen'
        || (event.metaKey && event.shiftKey && ['3', '4', '5', 's'].includes(key))
        || (event.ctrlKey && event.shiftKey && key === 's');

      if (screenshotAttempt && exam.settings.screenshotWarning) {
        event.preventDefault();
        event.stopPropagation();
        sendSecurityEvent('screenshot_attempt', {
          message: `Screenshot shortcut attempt detected (${event.code || event.key}).`,
          severity: 'critical', score: 3, metadata: { code: event.code, key: event.key }, cooldownMs: 5000,
        });
        return;
      }

      const browserNavigation = (event.ctrlKey || event.metaKey) && ['l', 't', 'n', 'w', 'r', 'p', 'u', 'tab', 'pageup', 'pagedown'].includes(key);
      const developerShortcut = key === 'f12'
        || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key))
        || ((event.ctrlKey || event.metaKey) && key === 'u');
      const windowShortcut = event.altKey && ['tab', 'escape', 'arrowleft', 'arrowright', 'f4'].includes(key);

      if (exam.settings.shortcutBlocking && (browserNavigation || developerShortcut || windowShortcut)) {
        event.preventDefault();
        event.stopPropagation();
        sendSecurityEvent('shortcut_attempt', {
          message: `Restricted keyboard shortcut detected (${event.code || event.key}).`,
          severity: 'warning', score: 2, metadata: { code: event.code, key: event.key }, cooldownMs: 3000,
        });
      }
    }

    function protectUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('keydown', handleRestrictedKey, true);
    window.addEventListener('beforeunload', protectUnload);
    return () => {
      window.removeEventListener('keydown', handleRestrictedKey, true);
      window.removeEventListener('beforeunload', protectUnload);
    };
  }, [assignmentId, exam, sendSecurityEvent]);

  useEffect(() => {
    if (!exam?.settings?.multipleTabDetection || typeof window.BroadcastChannel === 'undefined') return undefined;
    const channel = new window.BroadcastChannel(`evalora-exam-${assignmentId}`);
    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    channel.onmessage = (event) => {
      if (!event.data?.instanceId || event.data.instanceId === instanceId) return;
      if (event.data.type === 'security-probe') {
        channel.postMessage({ type: 'exam-tab-online', instanceId });
      }
      sendSecurityEvent('duplicate_tab', {
        message: 'The same exam is open in another browser tab.', severity: 'critical', score: 4, cooldownMs: 30000,
      });
    };
    channel.postMessage({ type: 'exam-tab-online', instanceId });
    const pulse = window.setInterval(() => channel.postMessage({ type: 'exam-tab-online', instanceId }), 3000);
    return () => { window.clearInterval(pulse); channel.close(); };
  }, [assignmentId, exam, sendSecurityEvent]);

  useEffect(() => {
    if (!exam?.settings?.idleDetection) return undefined;
    let lastActivityAt = Date.now();
    let reported = false;
    const noteActivity = () => { lastActivityAt = Date.now(); reported = false; };
    const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, noteActivity, { passive: true }));
    const interval = window.setInterval(() => {
      const thresholdMs = Math.max(Number(exam.settings.idleThresholdMinutes || 5), 1) * 60 * 1000;
      if (!reported && Date.now() - lastActivityAt >= thresholdMs) {
        reported = true;
        sendSecurityEvent('idle_detected', {
          message: `No student activity detected for ${exam.settings.idleThresholdMinutes || 5} minute(s).`, severity: 'warning', score: 2, cooldownMs: thresholdMs,
        });
      }
    }, 5000);
    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, noteActivity));
    };
  }, [exam, sendSecurityEvent]);

  useEffect(() => {
    if (!activeSecurityHold) return;
    Object.values(saveTimers.current).forEach((timer) => window.clearTimeout(timer));
    setSaveState('Paused');
  }, [activeSecurityHold]);

  useEffect(() => {
    if (!securityHold?.active || HARD_SECURITY_HOLD_TYPES.includes(securityHold.triggerType)) return;
    api.post(`/student/exams/${assignmentId}/heartbeat`).then((response) => {
      if (response.data.securityHold) {
        setSecurityHold(response.data.securityHold.active && HARD_SECURITY_HOLD_TYPES.includes(response.data.securityHold.triggerType) ? response.data.securityHold : null);
      }
      if (response.data.allowedEndAt) {
        setExam((current) => current ? { ...current, attempt: { ...current.attempt, allowedEndAt: response.data.allowedEndAt } } : current);
      }
    }).catch(() => {});
  }, [assignmentId, securityHold]);

  useEffect(() => {
    if (!exam?.settings) return undefined;

    function handleVisibilityChange() {
      setIsWindowFocused(!document.hidden && document.hasFocus());
      if (document.hidden && exam.settings.tabSwitchDetection) {
        startLocalSecurityHold('tab_switch', 'Student switched away from the exam tab.');
        sendSecurityEvent('tab_switch', {
          message: 'Student switched away from the exam tab.',
          severity: 'warning',
          score: 2,
          cooldownMs: 1000,
        });
      }
    }

    function handleBlur() {
      setIsWindowFocused(false);
      if (exam.settings.tabSwitchDetection) {
        startLocalSecurityHold('window_blur', 'Exam window lost focus.');
        sendSecurityEvent('window_blur', {
          message: 'Exam window lost focus.',
          severity: 'warning',
          score: 2,
          cooldownMs: 1000,
        });
      }
    }

    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if ((exam.settings.fullscreenEnabled || exam.settings.requireFullscreenBeforeStart) && !document.fullscreenElement) {
        startLocalSecurityHold('fullscreen_exit', 'Student exited fullscreen mode.', 'recheck');
        sendSecurityEvent('fullscreen_exit', {
          message: 'Student exited fullscreen mode.',
          severity: 'warning',
          score: 3,
          cooldownMs: 1000,
        });
      }
    }

    function handleFocus() {
      setIsWindowFocused(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [exam, sendSecurityEvent, startLocalSecurityHold]);

  useEffect(() => {
    if (!exam?.settings) return undefined;

    const needsCamera = true;
    const needsMic = exam.settings.microphoneRequired || exam.settings.noiseMonitoring || exam.settings.proctoringEnabled;
    const needsFaceAi = needsCamera && (
      exam.settings.aiProctoringEnabled
      || exam.settings.detectNoFace
      || exam.settings.detectCameraBlocked
      || exam.settings.detectMultipleFaces
      || exam.settings.detectLookingAway
    );

    if (!needsCamera && !needsMic) {
      return undefined;
    }

    if (mediaCleanupTimerRef.current) {
      window.clearTimeout(mediaCleanupTimerRef.current);
      mediaCleanupTimerRef.current = null;
    }
    const monitorSession = ++mediaMonitorSessionRef.current;
    let cancelled = false;
    let movementInterval;
    let noiseInterval;
    let audioContext;

    function shouldReportMediaIncident(key, cooldownMs = 45000) {
      const now = Date.now();
      const lastReportedAt = Number(mediaIncidentRef.current[key] || 0);
      if (lastReportedAt && now - lastReportedAt < cooldownMs) return false;
      mediaIncidentRef.current[key] = now;
      return true;
    }

    function setMediaStatusIfChanged(patch) {
      setMediaStatus((current) => {
        const next = { ...current, ...patch };
        return Object.keys(patch).some((key) => current[key] !== next[key]) ? next : current;
      });
    }

    async function sendProctorOnlyEvent(type, payload = {}, cooldownMs = 45000, evidenceVideo = null) {
      if (!shouldReportMediaIncident(type, cooldownMs)) return;
      const metadata = { ...(payload.metadata || {}) };

      if (evidenceVideo) {
        const snapshot = captureEvidenceFrame(evidenceVideo);
        if (snapshot) {
          try {
            const evidence = await uploadEvidenceDataUrl(snapshot, {
              category: 'snapshot',
              assignmentId,
              filename: `${type}.jpg`,
            });
            metadata.evidence = {
              ...(metadata.evidence || {}),
              snapshotUrl: evidence.url,
              snapshotKey: evidence.key,
              contentType: evidence.contentType,
              size: evidence.size,
              capturedAt: new Date().toISOString(),
            };
          } catch {
            metadata.evidence = {
              ...(metadata.evidence || {}),
              uploadStatus: 'r2_unavailable',
            };
          }
        }
      }

      sendSecurityEvent(type, { ...payload, metadata, cooldownMs });
    }

    function noteStableSignal(key, isActive, threshold = 2) {
      const activeKey = `${key}ActiveFrames`;
      const clearKey = `${key}ClearFrames`;
      if (isActive) {
        mediaIncidentRef.current[activeKey] = Number(mediaIncidentRef.current[activeKey] || 0) + 1;
        mediaIncidentRef.current[clearKey] = 0;
        return mediaIncidentRef.current[activeKey] >= threshold;
      }
      mediaIncidentRef.current[clearKey] = Number(mediaIncidentRef.current[clearKey] || 0) + 1;
      mediaIncidentRef.current[activeKey] = 0;
      return false;
    }

    function hasStableClearSignal(key, threshold = 2) {
      return Number(mediaIncidentRef.current[`${key}ClearFrames`] || 0) >= threshold;
    }

    async function loadFaceLandmarker() {
      if (faceLandmarkerRef.current || faceLandmarkerLoadingRef.current) return faceLandmarkerRef.current;
      faceLandmarkerLoadingRef.current = true;
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_FACE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 4,
          minFaceDetectionConfidence: Number(exam.settings.confidenceThreshold || 0.75),
          minFacePresenceConfidence: Number(exam.settings.confidenceThreshold || 0.75),
          minTrackingConfidence: 0.5,
        });
        setMediaStatusIfChanged({ ai: 'ml active', face: 'checking' });
        return faceLandmarkerRef.current;
      } catch {
        setMediaStatusIfChanged({ ai: 'face model failed', face: 'unavailable' });
        sendProctorOnlyEvent('ai_unavailable', {
          message: 'Browser face landmark model could not be loaded for this exam session.',
          severity: 'warning',
          score: 1,
        }, 120000);
        return null;
      } finally {
        faceLandmarkerLoadingRef.current = false;
      }
    }

    async function loadObjectDetector() {
      if (objectDetectorRef.current || objectDetectorLoadingRef.current) return objectDetectorRef.current;
      objectDetectorLoadingRef.current = true;
      try {
        const [tf, cocoSsd] = await Promise.all([
          import('@tensorflow/tfjs'),
          import('@tensorflow/tfjs-backend-webgl'),
          import('@tensorflow-models/coco-ssd'),
        ]);
        await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
        await tf.ready();
        objectDetectorRef.current = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        setMediaStatusIfChanged({ object: 'checking' });
        return objectDetectorRef.current;
      } catch {
        sendProctorOnlyEvent('ai_unavailable', {
          message: 'Browser object detection model could not be loaded for this exam session.',
          severity: 'warning',
          score: 1,
          metadata: { detector: 'coco-ssd' },
        }, 120000);
        return null;
      } finally {
        objectDetectorLoadingRef.current = false;
      }
    }

    function normalizeFaceLandmarks(result, video) {
      return (result?.faceLandmarks || []).map((landmarks) => {
        const xs = landmarks.map((point) => point.x);
        const ys = landmarks.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const nose = landmarks[1] || landmarks[4] || landmarks[0];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const width = Math.max((maxX - minX) * video.videoWidth, 0);
        const height = Math.max((maxY - minY) * video.videoHeight, 0);
        const centerX = ((minX + maxX) / 2) * video.videoWidth;
        const centerY = ((minY + maxY) / 2) * video.videoHeight;
        const noseOffsetX = nose ? ((nose.x - minX) / Math.max(maxX - minX, 0.001)) - 0.5 : 0;
        const noseOffsetY = nose ? ((nose.y - minY) / Math.max(maxY - minY, 0.001)) - 0.5 : 0;
        const eyeTilt = leftEye && rightEye ? Math.abs(leftEye.y - rightEye.y) : 0;

        return {
          boundingBox: {
            x: minX * video.videoWidth,
            y: minY * video.videoHeight,
            width,
            height,
          },
          centerX,
          centerY,
          noseOffsetX,
          noseOffsetY,
          eyeTilt,
        };
      });
    }

    function processDetectedFaces(faces = [], source, video) {
      if (faces.length === 0 && exam.settings.detectNoFace) {
        if (noteStableSignal('noFace', true, 2)) {
          setMediaStatusIfChanged({ face: 'not visible' });
          sendProctorOnlyEvent('ai_no_face', {
            message: 'No face detected in camera frame.',
            severity: 'warning',
            score: 2,
            metadata: { detector: source },
          }, 30000, video);
        }
        return;
      }
      noteStableSignal('noFace', false, 2);

      if (faces.length > 1 && exam.settings.detectMultipleFaces) {
        if (noteStableSignal('multipleFaces', true, 2)) {
          setMediaStatusIfChanged({ face: 'multiple' });
          sendProctorOnlyEvent('ai_multiple_faces', {
            message: 'Multiple faces detected in camera frame.',
            severity: 'warning',
            score: 2,
            metadata: { faces: faces.length, detector: source },
          }, 45000, video);
        }
        return;
      }
      noteStableSignal('multipleFaces', false, 2);

      const [face] = faces;
      if (face?.boundingBox) {
        const centerX = face.centerX || face.boundingBox.x + face.boundingBox.width / 2;
        const centerY = face.centerY || face.boundingBox.y + face.boundingBox.height / 2;
        const leftBoundary = video.videoWidth * 0.25;
        const rightBoundary = video.videoWidth * 0.75;
        const topBoundary = video.videoHeight * 0.18;
        const bottomBoundary = video.videoHeight * 0.84;
        const headTurned = Math.abs(Number(face.noseOffsetX || 0)) > 0.16 || Math.abs(Number(face.noseOffsetY || 0)) > 0.2 || Number(face.eyeTilt || 0) > 0.055;
        const offCenter =
          centerX < leftBoundary ||
          centerX > rightBoundary ||
          centerY < topBoundary ||
          centerY > bottomBoundary;

        if ((offCenter || headTurned) && exam.settings.detectLookingAway) {
          if (noteStableSignal('lookingAway', true, 3)) {
            const horizontalDirection = centerX < leftBoundary || Number(face.noseOffsetX || 0) < -0.16 ? 'left' : centerX > rightBoundary || Number(face.noseOffsetX || 0) > 0.16 ? 'right' : 'center';
            const verticalDirection = centerY < topBoundary || Number(face.noseOffsetY || 0) < -0.2 ? 'up' : centerY > bottomBoundary || Number(face.noseOffsetY || 0) > 0.2 ? 'down' : 'center';
            setMediaStatusIfChanged({ face: horizontalDirection !== 'center' ? `looking ${horizontalDirection}` : `looking ${verticalDirection}` });
            sendProctorOnlyEvent('ai_looking_away', {
              message: 'Face/eye direction suggests the student may be looking away from the exam.',
              severity: 'warning',
              score: 1,
              metadata: {
                detector: source,
                centerX: Math.round(centerX),
                centerY: Math.round(centerY),
                horizontalDirection,
                verticalDirection,
                noseOffsetX: Number(face.noseOffsetX || 0).toFixed(3),
                noseOffsetY: Number(face.noseOffsetY || 0).toFixed(3),
              },
            }, 45000, video);
          }
        } else {
          noteStableSignal('lookingAway', false, 2);
          if (hasStableClearSignal('lookingAway', 2) && hasStableClearSignal('noFace', 2) && hasStableClearSignal('multipleFaces', 2)) {
            setMediaStatusIfChanged({ face: 'visible' });
          }
        }
      }
    }

    function processDetectedObjects(predictions = [], video = null) {
      const confidenceThreshold = Number(exam.settings.confidenceThreshold || 0.75);
      const phones = predictions.filter((item) => item.class === 'cell phone' && Number(item.score || 0) >= confidenceThreshold);
      const people = predictions.filter((item) => item.class === 'person' && Number(item.score || 0) >= Math.max(confidenceThreshold - 0.1, 0.55));

      if (phones.length > 0 && exam.settings.detectMobilePhone) {
        if (noteStableSignal('mobileObject', true, 2)) {
          setMediaStatusIfChanged({ object: 'mobile phone' });
          sendProctorOnlyEvent('ai_mobile_detected', {
            message: 'Mobile phone detected in camera frame.',
            severity: 'warning',
            score: 2,
            metadata: {
              detector: 'coco-ssd',
              count: phones.length,
              confidence: Number(phones[0].score || 0).toFixed(3),
              bbox: phones[0].bbox?.map((value) => Math.round(value)),
            },
          }, 60000, video);
        }
      } else {
        noteStableSignal('mobileObject', false, 2);
      }

      if (people.length > 1 && exam.settings.detectMultiplePersons) {
        if (noteStableSignal('multiplePersons', true, 2)) {
          setMediaStatusIfChanged({ object: 'multiple people' });
          sendProctorOnlyEvent('ai_multiple_faces', {
            message: 'Multiple people detected in camera frame.',
            severity: 'warning',
            score: 2,
            metadata: {
              detector: 'coco-ssd',
              people: people.length,
              confidence: Number(people[0].score || 0).toFixed(3),
            },
          }, 45000, video);
        }
      } else {
        noteStableSignal('multiplePersons', false, 2);
      }

      if (hasStableClearSignal('mobileObject', 2) && hasStableClearSignal('multiplePersons', 2)) {
        setMediaStatusIfChanged({ object: 'clear' });
      }
    }

    async function startMediaMonitoring() {
      try {
        let monitorVideo = null;
        const handoff = window.__evaloraExamMedia?.assignmentId === assignmentId ? window.__evaloraExamMedia : null;
        const handoffCamera = handoff?.cameraStream?.getVideoTracks().some((track) => track.readyState === 'live')
          ? handoff.cameraStream
          : null;
        let stream = handoffCamera || await navigator.mediaDevices.getUserMedia({
          video: Boolean(needsCamera),
          audio: Boolean(needsMic),
        });
        if (handoffCamera && needsMic && !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
          const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          stream = new window.MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        startExamRecording(stream);
        // Keep the approved camera stream available while the attempt mounts.
        // React Strict Mode replays effects in development.
        stream.getVideoTracks().forEach((track) => {
          const reportCameraMissing = () => {
            setMediaStatusIfChanged({ camera: 'missing', movement: 'unknown', face: 'blocked' });
            sendProctorOnlyEvent('camera_missing', {
              message: 'Camera stream stopped or was hidden during the exam.',
              severity: 'critical',
              score: 3,
            }, 60000, monitorVideo);
          };
          track.addEventListener('ended', reportCameraMissing);
          track.addEventListener('mute', reportCameraMissing);
          track.addEventListener('unmute', () => setMediaStatusIfChanged({ camera: 'active' }));
        });
        stream.getAudioTracks().forEach((track) => {
          const reportMicrophoneMissing = () => {
            setMediaStatusIfChanged({ microphone: 'missing' });
            sendProctorOnlyEvent('microphone_missing', {
              message: 'Microphone stream stopped during the exam.',
              severity: 'critical',
              score: 3,
            }, 60000);
          };
          track.addEventListener('ended', reportMicrophoneMissing);
          track.addEventListener('mute', reportMicrophoneMissing);
          track.addEventListener('unmute', () => setMediaStatusIfChanged({ microphone: 'active' }));
        });
        setMediaStatus({
          camera: needsCamera ? 'active' : 'off',
          microphone: needsMic ? 'active' : 'off',
          movement: 'steady',
          face: needsFaceAi ? 'checking' : 'off',
          object: 'clear',
          ai: needsFaceAi ? 'active' : 'off',
        });

        if (needsCamera) {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          await video.play();
          if (cancelled || mediaMonitorSessionRef.current !== monitorSession) return;
          monitorVideo = video;

          const canvas = document.createElement('canvas');
          canvas.width = 96;
          canvas.height = 72;
          movementCanvasRef.current = canvas;
          const context = canvas.getContext('2d', { willReadFrequently: true });

          if (needsFaceAi) {
            setMediaStatusIfChanged({ ai: 'loading ml', face: 'checking', object: 'checking' });
            loadFaceLandmarker();
            if (exam.settings.detectMobilePhone || exam.settings.detectMultiplePersons) {
              loadObjectDetector();
            }
          }

          movementInterval = window.setInterval(() => {
            if (!context || video.readyState < 2) return;

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let lumaTotal = 0;
            let lumaMin = 255;
            let lumaMax = 0;

            for (let index = 0; index < frame.length; index += 16) {
              const luma = (frame[index] + frame[index + 1] + frame[index + 2]) / 3;
              lumaTotal += luma;
              lumaMin = Math.min(lumaMin, luma);
              lumaMax = Math.max(lumaMax, luma);
            }

            const sampleCount = frame.length / 16;
            const avgLuma = lumaTotal / sampleCount;
            const contrast = lumaMax - lumaMin;

            const cameraBlocked = avgLuma < 12 || contrast < 8;
            if (needsFaceAi && exam.settings.detectCameraBlocked !== false && cameraBlocked) {
              if (noteStableSignal('blockedCamera', true, 2)) {
                setMediaStatusIfChanged({ face: 'blocked' });
                sendProctorOnlyEvent('ai_camera_blocked', {
                  message: 'Camera feed appears blocked, frozen, or too dark.',
                  severity: 'warning',
                  score: 2,
                  metadata: { avgLuma: Math.round(avgLuma), contrast: Math.round(contrast) },
                }, 60000, video);
              }
            } else {
              noteStableSignal('blockedCamera', false, 2);
            }

            if (lastFrameRef.current) {
              let diff = 0;
              for (let index = 0; index < frame.length; index += 16) {
                diff += Math.abs(frame[index] - lastFrameRef.current[index]);
              }

              const movementScore = diff / (frame.length / 16);
              if (movementScore > 24) {
                mediaIncidentRef.current.movementHighFrames = Number(mediaIncidentRef.current.movementHighFrames || 0) + 1;
                setMediaStatusIfChanged({ movement: 'high' });
                if (mediaIncidentRef.current.movementHighFrames >= 2) {
                  sendProctorOnlyEvent('camera_movement', {
                    message: 'High camera movement detected.',
                    severity: 'warning',
                    score: 1,
                    metadata: { movementScore: Math.round(movementScore) },
                  }, 45000, video);
                }
              } else {
                mediaIncidentRef.current.movementHighFrames = 0;
                setMediaStatusIfChanged({ movement: 'steady' });
              }
            }

            lastFrameRef.current = new Uint8ClampedArray(frame);

            if (needsFaceAi && !faceDetectingRef.current) {
              faceDetectingRef.current = true;
              const detectionPromise = Promise.all([
                Promise.resolve(faceLandmarkerRef.current || loadFaceLandmarker())
                  .then((model) => {
                    if (!model) return null;
                    return model.detectForVideo(video, window.performance.now());
                  })
                  .then((result) => {
                    if (result) processDetectedFaces(normalizeFaceLandmarks(result, video), 'mediapipe-face-landmarker', video);
                  }),
                exam.settings.detectMobilePhone || exam.settings.detectMultiplePersons
                  ? Promise.resolve(objectDetectorRef.current || loadObjectDetector())
                      .then((model) => {
                        if (!model) return null;
                        return model.detect(video);
                      })
                      .then((predictions) => {
                        if (Array.isArray(predictions)) processDetectedObjects(predictions, video);
                      })
                  : Promise.resolve(),
              ]);

              detectionPromise
                .catch(() => {
                  setMediaStatusIfChanged({ ai: 'ml retrying' });
                })
                .finally(() => {
                  faceDetectingRef.current = false;
                });
            }
          }, Number(exam.settings.detectionIntervalMs || 2500));
        }

        if (needsMic && exam.settings.noiseMonitoring) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioContext = new AudioContextClass();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            audioContext.createMediaStreamSource(stream).connect(analyser);
            const samples = new Uint8Array(analyser.fftSize);
            noiseInterval = window.setInterval(() => {
              analyser.getByteTimeDomainData(samples);
              let squareTotal = 0;
              for (const sample of samples) squareTotal += ((sample - 128) / 128) ** 2;
              const noiseLevel = Math.min(Math.round(Math.sqrt(squareTotal / samples.length) * 200), 100);
              if (noiseLevel >= Number(exam.settings.noiseThreshold || 70)) {
                sendProctorOnlyEvent('noise_detected', {
                  message: `High background noise detected (${noiseLevel}%).`, severity: 'warning', score: 1,
                  metadata: { noiseLevel, threshold: Number(exam.settings.noiseThreshold || 70) },
                }, Math.max(Number(exam.settings.violationCooldownSeconds || 10) * 1000, 30000));
              }
            }, 1000);
          }
        }
      } catch {
        setMediaStatus({
          camera: needsCamera ? 'missing' : 'off',
          microphone: needsMic ? 'missing' : 'off',
          movement: 'unknown',
          face: 'unknown',
          object: 'unknown',
          ai: needsFaceAi ? 'blocked' : 'off',
        });
        if (needsCamera) {
          sendProctorOnlyEvent('camera_missing', {
            message: 'Camera permission or device is unavailable during exam.',
            severity: exam.settings.cameraRequired ? 'critical' : 'warning',
          }, 60000);
        }
        if (needsMic) {
          sendProctorOnlyEvent('microphone_missing', {
            message: 'Microphone permission or device is unavailable during exam.',
            severity: exam.settings.microphoneRequired ? 'critical' : 'warning',
          }, 60000);
        }
      }
    }

    startMediaMonitoring();

    return () => {
      cancelled = true;
      if (movementInterval) window.clearInterval(movementInterval);
      if (noiseInterval) window.clearInterval(noiseInterval);
      if (audioContext) audioContext.close().catch(() => {});
      mediaCleanupTimerRef.current = window.setTimeout(() => {
        // The current session check intentionally protects streams reused by
        // React Strict Mode's development-only effect replay.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (mediaMonitorSessionRef.current !== monitorSession) return;
        if (mediaStreamRef.current) {
          stopAndUploadExamRecording('closed').catch(() => {});
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        mediaStreamRef.current = null;
        lastFrameRef.current = null;
        mediaCleanupTimerRef.current = null;
      }, 250);
    };
  }, [assignmentId, exam, sendSecurityEvent, startExamRecording, stopAndUploadExamRecording]);

  function scheduleSave(question, answerPatch) {
    const questionId = question.id;
    window.clearTimeout(saveTimers.current[questionId]);
    setSaveState('Saving...');

    saveTimers.current[questionId] = window.setTimeout(async () => {
      try {
        const response = await api.post(`/student/exams/${assignmentId}/answers`, {
          questionId,
          ...answerPatch,
        });
        setAnswers((current) => ({
          ...current,
          [questionId]: {
            ...current[questionId],
            ...response.data.answer,
            questionId,
          },
        }));
        setSaveState('Saved');
      } catch (requestError) {
        setSaveState('Save failed');
        setError(requestError.response?.data?.message || 'Unable to autosave answer.');
      }
    }, 650);
  }

  function updateAnswer(question, patch) {
    const nextAnswer = {
      ...(answers[question.id] || {}),
      ...patch,
    };

    nextAnswer.answered = isAnswered(question, nextAnswer);
    setAnswers((current) => ({
      ...current,
      [question.id]: nextAnswer,
    }));
    scheduleSave(question, nextAnswer);
  }

  function applySecurityResume(response) {
    const nextHold = response.data.securityHold;
    setSecurityHold(nextHold?.active && HARD_SECURITY_HOLD_TYPES.includes(nextHold.triggerType) ? nextHold : null);
    if (response.data.allowedEndAt) {
      setExam((current) => current ? { ...current, attempt: { ...current.attempt, allowedEndAt: response.data.allowedEndAt } } : current);
    }
    setSaveState('Saved');
  }

  async function returnFromSecurityGrace() {
    const response = await api.post(`/student/exams/${assignmentId}/security-hold/return`);
    applySecurityResume(response);
  }

  const submitAttempt = useCallback(async () => {
    setIsSubmitting(true);
    setError('');
    try {
      Object.values(saveTimers.current).forEach((timer) => window.clearTimeout(timer));
      setSaveState('Saving...');
      await api.post(`/student/exams/${assignmentId}/answers/batch`, {
        answers: questions.map((question) => ({
          questionId: question.id,
          selectedOptionId: answers[question.id]?.selectedOptionId || '',
          textAnswer: answers[question.id]?.textAnswer || '',
          markedForReview: Boolean(answers[question.id]?.markedForReview),
        })),
      });
      setSaveState('Saved');
      await stopAndUploadExamRecording('submitted');
      await api.post(`/student/exams/${assignmentId}/submit`);
      navigate('/student/exams', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to submit assessment.');
    } finally {
      setIsSubmitting(false);
      setIsSubmitOpen(false);
    }
  }, [answers, assignmentId, navigate, questions, stopAndUploadExamRecording]);

  function sendProctorChat(event) {
    event.preventDefault();
    const text = proctorChatDraft.trim();
    const assignment = liveSessionRef.current;
    if (!text || !studentSocketRef.current || !assignment?.assignmentId) return;

    studentSocketRef.current.emit('student:chat-send', {
      assignmentId: assignment.assignmentId,
      studentId: assignmentId,
      text,
    }, (ack) => {
      if (!ack?.ok) {
        setError(ack?.message || 'Unable to send proctor chat message.');
        return;
      }
      setProctorChatDraft('');
    });
  }

  useEffect(() => {
    if (remainingMs === null || remainingMs > 0 || !exam || autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    submitAttempt();
  }, [remainingMs, exam, submitAttempt]);

  if (isLoading) {
    return (
      <section className="panel p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">Loading exam attempt...</p>
        <p className="mt-1 text-xs text-slate-500">Evalora is restoring saved answers and timer state.</p>
      </section>
    );
  }

  if (error && !exam) {
    return (
      <section className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
        <button className="secondary-button" type="button" onClick={() => navigate('/student/exams')}>
          Back to exams
        </button>
      </section>
    );
  }

  const faceAlert = ['multiple', 'not visible', 'blocked', 'looking left', 'looking right', 'looking up', 'looking down'].includes(mediaStatus.face);
  const cameraAlert = mediaStatus.camera === 'missing';
  const microphoneAlert = mediaStatus.microphone === 'missing';
  const movementAlert = mediaStatus.movement === 'high';
  const objectAlert = mediaStatus.object === 'possible mobile';
  const fullscreenAlert = Boolean(exam?.settings?.fullscreenEnabled || exam?.settings?.requireFullscreenBeforeStart) && !isFullscreen;
  const focusAlert = !isWindowFocused;
  const monitoringItems = [
    { label: 'Camera', value: mediaStatus.camera, icon: Camera, alert: cameraAlert, count: securitySummary?.cameraIssueCount || 0 },
    { label: 'Microphone', value: mediaStatus.microphone, icon: Mic, alert: microphoneAlert, count: securitySummary?.microphoneIssueCount || 0 },
    { label: 'Face', value: mediaStatus.face, icon: Eye, alert: faceAlert, count: securitySummary?.aiAlertCount || 0 },
    { label: 'Device', value: mediaStatus.object, icon: AlertTriangle, alert: objectAlert, count: securitySummary?.aiAlertCount || 0 },
    { label: 'Movement', value: mediaStatus.movement, icon: Radio, alert: movementAlert, count: securitySummary?.warningCount || 0 },
    { label: 'Full screen', value: isFullscreen ? 'active' : 'exited', icon: Maximize, alert: fullscreenAlert, count: securitySummary?.fullscreenExitCount || 0 },
    { label: 'Exam window', value: isWindowFocused ? 'focused' : 'inactive', icon: Wifi, alert: focusAlert, count: securitySummary?.tabSwitchCount || 0 },
  ];
  const activeAlerts = monitoringItems.filter((item) => item.alert);
  const progressPercent = questions.length ? Math.round(((activeIndex + 1) / questions.length) * 100) : 0;

  return (
    <section className="relative min-h-screen bg-slate-100 pb-[46px]">
      {exam?.settings?.watermarkEnabled ? (
        <div className="pointer-events-none fixed inset-0 z-0 grid place-items-center overflow-hidden text-slate-400/10">
          <div className="-rotate-12 select-none text-5xl font-semibold">{user?.email}</div>
        </div>
      ) : null}

      <div className="relative z-10 grid min-h-[calc(100vh-46px)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-w-0 flex-col p-4 sm:p-6 lg:p-8">
          <header className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /><p className="field-label text-brand-600">Live exam</p></div>
                <h1 className="exam-display-font mt-1 truncate text-[17px] font-semibold text-slate-950">{exam?.title}</h1>
                <p className="mt-1 text-[11px] font-medium text-slate-500">{exam?.courseName}{exam?.courseId ? ` • ${exam.courseId}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-8 items-center gap-2 rounded-md border bg-white px-2.5 text-[11px] font-semibold ${saveState === 'Save failed' ? 'border-red-200 text-red-700' : 'border-slate-200 text-slate-600'}`}>
                  {saveState === 'Saving...' ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <Save size={14} className="text-brand-500" />}
                  {saveState}
                </span>
                <span className="inline-flex h-8 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-2.5 text-[11px] font-semibold text-green-700">
                  <ShieldCheck size={14} /> Secure session
                </span>
              </div>
            </div>
            <div className="h-1 bg-slate-100"><div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} /></div>
          </header>

          {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

          <div className="panel flex min-h-[620px] flex-1 flex-col overflow-hidden border-t-2 border-t-brand-500">
            {currentQuestion ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-500 text-sm font-semibold text-white">{activeIndex + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Question {activeIndex + 1} of {questions.length}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{currentQuestion.type === 'one_word' ? 'One-word answer' : 'Multiple choice'}</span>
                        <span>•</span>
                        <span>+{currentQuestion.positiveMarks || 0} marks</span>
                        {Number(currentQuestion.negativeMarks || 0) > 0 ? <><span>•</span><span>-{currentQuestion.negativeMarks} negative</span></> : null}
                      </div>
                    </div>
                  </div>
                  <button
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${currentAnswer.markedForReview ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-600'}`}
                    type="button"
                    onClick={() => updateAnswer(currentQuestion, { markedForReview: !currentAnswer.markedForReview })}
                  >
                    <Flag size={15} />
                    {currentAnswer.markedForReview ? 'Marked for review' : 'Mark for review'}
                  </button>
                </div>

                <div className="flex-1 px-5 py-7 sm:px-7 lg:px-10 lg:py-9">
                  <p className="exam-question-copy max-w-5xl text-[19px] font-semibold leading-8 text-slate-950">{currentQuestion.questionText}</p>

                  {currentQuestion.type === 'mcq' ? (
                    <div className="mt-7 max-w-4xl space-y-3">
                      {currentQuestion.options.map((option, index) => {
                        const selected = String(currentAnswer.selectedOptionId || '') === String(option.id);
                        return (
                          <button
                            className={`group flex min-h-14 w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition ${selected ? 'border-brand-500 bg-brand-50 text-slate-950 ring-1 ring-brand-100' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40'}`}
                            key={option.id}
                            type="button"
                            onClick={() => updateAnswer(currentQuestion, { selectedOptionId: option.id, textAnswer: '' })}
                          >
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-slate-50 text-slate-600 group-hover:border-brand-300'}`}>{String.fromCharCode(65 + index)}</span>
                            <span className="text-sm font-medium leading-6">{option.text}</span>
                            {selected ? <Check size={18} className="ml-auto shrink-0 text-brand-600" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-7 max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-5">
                      <label className="field-label">Your answer</label>
                      <input
                        className="field-input mt-2 bg-white"
                        value={currentAnswer.textAnswer || ''}
                        onChange={(event) => updateAnswer(currentQuestion, { textAnswer: event.target.value, selectedOptionId: '' })}
                        placeholder="Type your one-word answer"
                        autoComplete="off"
                      />
                      <p className="mt-2 text-xs text-slate-500">Enter a concise answer. Your response is saved automatically.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                  <button className="secondary-button" type="button" onClick={() => setActiveIndex((index) => Math.max(index - 1, 0))} disabled={activeIndex === 0}>
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <p className="hidden text-xs font-medium text-slate-500 sm:block">Answers are saved automatically when changed.</p>
                  <button className="primary-button" type="button" onClick={() => setActiveIndex((index) => Math.min(index + 1, questions.length - 1))} disabled={activeIndex === questions.length - 1}>
                    Save & next <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div><p className="text-sm font-semibold text-slate-700">No questions available</p><p className="mt-1 text-xs text-slate-500">Your course paper has no mapped questions.</p></div>
              </div>
            )}
          </div>
        </main>

        <aside className="relative z-20 border-l border-slate-200 bg-white xl:max-h-[calc(100vh-46px)] xl:overflow-y-auto">
          <div className="border-b border-slate-200 px-5 py-4">
            <img src="/logo.webp" alt="Evalora" className="h-10 w-auto max-w-[165px] object-contain object-left" />
          </div>

          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-brand-100 bg-brand-50 text-brand-700"><UserRound size={19} /></span>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{user?.name || 'Student'}</p><p className="mt-0.5 truncate text-xs text-slate-500">{exam?.courseName}{exam?.courseId ? ` (${exam.courseId})` : ''}</p></div>
            </div>

            <div className={`mt-4 flex items-center justify-between rounded-lg border p-4 ${remainingMs !== null && remainingMs <= 600000 ? 'border-red-200 bg-red-50' : 'border-brand-100 bg-brand-50'}`}>
              <div><p className="field-label">Time remaining</p><p className={`mt-1 font-mono text-2xl font-semibold tracking-wide ${remainingMs !== null && remainingMs <= 600000 ? 'text-red-700' : 'text-brand-700'}`}>{remainingMs === null ? '--:--' : formatTime(remainingMs)}</p></div>
              <Clock size={22} className={remainingMs !== null && remainingMs <= 600000 ? 'text-red-600' : 'text-brand-500'} />
            </div>

            <button className="primary-button mt-4 w-full" type="button" onClick={() => setIsSubmitOpen(true)}><Send size={16} />Submit exam</button>
          </div>

          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-950">Questions</h2><span className="text-xs font-semibold text-slate-500">{summary.total} total</span></div>
            <div className="mt-3 grid grid-cols-3 rounded-md border border-slate-200 bg-slate-50 p-1">
              {[['all', 'All'], ['mcq', `MCQ (${exam?.questionSummary?.mcq || questions.filter((q) => q.type === 'mcq').length})`], ['one_word', `One word (${exam?.questionSummary?.oneWord || questions.filter((q) => q.type === 'one_word').length})`]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setQuestionFilter(key)} className={`rounded px-2 py-2 text-[11px] font-semibold transition ${questionFilter === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
              ))}
            </div>

            <div className="mt-5"><QuestionPalette questions={questions} answers={answers} activeIndex={activeIndex} filter={questionFilter} onSelect={setActiveIndex} /></div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2"><p className="text-lg font-semibold text-slate-800">{summary.total}</p><p className="text-[10px] font-semibold text-slate-500">Total</p></div>
              <div className="rounded-md border border-brand-100 bg-brand-50 p-2"><p className="text-lg font-semibold text-brand-700">{summary.answered}</p><p className="text-[10px] font-semibold text-brand-700">Attempted</p></div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2"><p className="text-lg font-semibold text-amber-800">{summary.markedForReview}</p><p className="text-[10px] font-semibold text-amber-700">Review</p></div>
            </div>
          </div>

          <div className="p-5">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Question status</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs text-slate-600">
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-slate-300 bg-slate-100" />Not visited</div>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-brand-700 bg-brand-700" />Attempted</div>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-amber-300 bg-amber-100" />For review</div>
              <div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-brand-500 ring-2 ring-brand-200 ring-offset-1" />Current</div>
            </div>
          </div>
        </aside>
      </div>

      <footer className={`fixed inset-x-0 bottom-0 z-40 h-[46px] border-t px-4 shadow-[0_-2px_10px_rgba(15,23,42,0.05)] transition-colors ${activeAlerts.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        <div className="mx-auto flex h-full max-w-[1800px] items-center gap-2 overflow-x-auto">
          <div className={`flex shrink-0 items-center gap-2 border-r pr-3 ${activeAlerts.length > 0 ? 'border-red-200 text-red-800' : 'border-green-200 text-green-800'}`}><ShieldCheck size={15} /><p className="text-[11px] font-semibold">Live proctoring</p></div>
          {activeAlerts.length === 0 ? (
            <div className="flex items-center gap-2 text-[10px] font-medium text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Monitoring active · No issues detected</div>
          ) : activeAlerts.map((item) => { const Icon = item.icon; return (
            <div key={item.label} className="flex h-7 min-w-[126px] shrink-0 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <Icon size={12} />
              <p className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase">{item.label}: <span className="capitalize">{item.value}</span></p>
              <span className="text-[10px] font-semibold">{item.count}</span>
            </div>
          ); })}
        </div>
      </footer>

      {(proctorLiveStatus !== 'idle' || proctorChatMessages.length > 0) ? (
        <div className="fixed bottom-14 right-4 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${proctorLiveStatus === 'connected' ? 'bg-green-500' : proctorLiveStatus === 'blocked' ? 'bg-red-500' : 'bg-amber-500'}`} />
              <p className="text-xs font-bold text-slate-800">
                {proctorLiveStatus === 'connected' ? 'Proctor live connected' : proctorLiveStatus === 'blocked' ? 'Live monitor blocked' : 'Proctor live monitor'}
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Chat</span>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto p-3">
            {proctorChatMessages.length === 0 ? (
              <p className="text-xs font-semibold text-slate-400">No proctor messages yet.</p>
            ) : (
              proctorChatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-lg px-3 py-2 text-xs font-semibold leading-5 ${
                    message.senderRole === 'student' ? 'ml-auto bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className={`mt-1 text-[10px] ${message.senderRole === 'student' ? 'text-brand-50/80' : 'text-slate-400'}`}>{message.senderName}</p>
                </div>
              ))
            )}
          </div>
          <form className="flex gap-2 border-t border-slate-200 p-3" onSubmit={sendProctorChat}>
            <input
              className="field-input h-9 text-sm"
              value={proctorChatDraft}
              onChange={(event) => setProctorChatDraft(event.target.value)}
              placeholder="Reply to proctor"
              disabled={!liveSessionRef.current?.assignmentId}
            />
            <button className="primary-button h-9 px-3 text-xs" type="submit" disabled={!proctorChatDraft.trim() || !liveSessionRef.current?.assignmentId}>
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : null}

      {isSubmitOpen ? <SubmitDialog summary={summary} isSubmitting={isSubmitting} onCancel={() => setIsSubmitOpen(false)} onConfirm={submitAttempt} /> : null}
      {securityHold?.active && HARD_SECURITY_HOLD_TYPES.includes(securityHold.triggerType) ? (
        <SecurityHoldOverlay
          hold={securityHold}
          onQuickReturn={returnFromSecurityGrace}
          onVerifyAgain={() => navigate(`/student/exams?reverify=${assignmentId}`, { replace: true })}
        />
      ) : null}
    </section>
  );
}
