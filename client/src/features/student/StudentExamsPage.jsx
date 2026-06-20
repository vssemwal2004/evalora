import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Maximize,
  Mic,
  MonitorCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { api } from "../../lib/api";

const securitySteps = [
  {
    key: "browser",
    label: "Environment",
    caption: "Browser and session",
    icon: MonitorCheck,
  },
  { key: "camera", label: "Camera", caption: "Face visibility", icon: Camera },
  {
    key: "microphone",
    label: "Permissions",
    caption: "Location and audio",
    icon: MapPin,
  },
  {
    key: "fullscreen",
    label: "Full screen",
    caption: "Distraction-free mode",
    icon: Maximize,
  },
  {
    key: "review",
    label: "Final review",
    caption: "System verification",
    icon: ShieldCheck,
  },
];

function buildSecurityTerms(settings = {}) {
  const terms = [];
  if (settings.tabSwitchDetection) terms.push(`Tab and window switching is detected. The configured limit is ${settings.maxTabSwitches ?? 0}.`);
  if (settings.fullscreenEnabled || settings.requireFullscreenBeforeStart) terms.push(`Full-screen mode is required and exits are recorded. The configured limit is ${settings.maxFullscreenExits ?? 0}.`);
  if (settings.copyPasteDisabled || settings.rightClickDisabled || settings.shortcutBlocking) terms.push('Copy, paste, right-click, restricted browser navigation, and developer shortcuts may be blocked and recorded.');
  if (settings.screenshotWarning) terms.push('Screenshot shortcuts visible to the browser are recorded as security events.');
  if (settings.multipleTabDetection) terms.push('Opening this exam in another tab is prohibited and detected.');
  if (settings.cameraRequired || settings.cameraMonitoring || settings.proctoringEnabled) terms.push('Camera availability, movement, and configured face-presence signals are monitored.');
  if (settings.microphoneRequired || settings.noiseMonitoring || settings.proctoringEnabled) terms.push(`Microphone availability${settings.noiseMonitoring ? ` and noise above the configured ${settings.noiseThreshold ?? 70}% threshold are` : ' is'} monitored.`);
  if (settings.idleDetection) terms.push(`Inactivity longer than ${settings.idleThresholdMinutes || 5} minute(s) is recorded.`);
  if (settings.watermarkEnabled) terms.push('A student-identity watermark may remain visible throughout the exam.');
  if (settings.securityRecheckEnabled) terms.push(`A detected violation may pause the exam and require security verification within ${settings.securityRecheckTimeoutSeconds || 120} seconds.`);
  return terms.length ? terms : ['Standard exam integrity and activity records remain enabled.'];
}

function formatDate(value, options = {}) {
  if (!value) return "Not announced";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}

function examState(exam) {
  if (exam.examStatus === "submitted")
    return { label: "Completed", tone: "slate" };
  if (exam.examStatus === "in_progress")
    return { label: "In progress", tone: "blue" };
  if (exam.operationalStatus === "active")
    return { label: "Live now", tone: "green" };
  if (exam.operationalStatus === "upcoming")
    return { label: "Upcoming", tone: "amber" };
  return { label: "Closed", tone: "slate" };
}

function canEnter(exam) {
  return (
    exam.operationalStatus === "active" &&
    exam.eligibilityStatus === "eligible" &&
    !["submitted", "ufm", "blocked"].includes(exam.examStatus) &&
    Boolean(exam.questionSummary?.totalQuestions)
  );
}

async function hasDuplicateExamTab(assignmentId) {
  if (typeof window.BroadcastChannel === "undefined") return false;
  const channel = new window.BroadcastChannel(`evalora-exam-${assignmentId}`);
  const instanceId = `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let duplicate = false;
  channel.onmessage = (event) => {
    if (event.data?.instanceId && event.data.instanceId !== instanceId)
      duplicate = true;
  };
  channel.postMessage({ type: "security-probe", instanceId });
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  channel.close();
  return duplicate;
}

function canCancelBrowserEvent(eventName) {
  let blocked = false;
  const handler = (event) => {
    event.preventDefault();
    blocked = event.defaultPrevented;
  };
  document.addEventListener(eventName, handler, { capture: true, once: true });
  const event = new window.Event(eventName, { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  document.removeEventListener(eventName, handler, true);
  return blocked;
}

function storageAvailable(storage) {
  try {
    const key = `evalora-security-${Date.now()}`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

async function queryPermissionState(name) {
  try {
    if (!navigator.permissions?.query) return "unsupported";
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return "unsupported";
  }
}

async function getSecureBrowserIntegrityIssues(exam) {
  const settings = exam.settings || {};
  const issues = [];
  const needsCamera =
    settings.cameraRequired || settings.cameraMonitoring || settings.proctoringEnabled;
  const needsMic =
    settings.microphoneRequired || settings.noiseMonitoring || settings.proctoringEnabled;

  if (!storageAvailable(window.localStorage) || !storageAvailable(window.sessionStorage)) {
    issues.push("Browser storage is blocked. Disable privacy/extension blocking for this exam site.");
  }

  if (settings.multipleTabDetection && typeof window.BroadcastChannel === "undefined") {
    issues.push("Duplicate-tab detection is unavailable. Use a normal Chrome/Edge browser without privacy blocking.");
  }

  if ((settings.copyPasteDisabled || settings.rightClickDisabled) && !canCancelBrowserEvent("copy")) {
    issues.push("Copy/paste blocking hook is not available in this browser session.");
  }

  if (settings.rightClickDisabled && !canCancelBrowserEvent("contextmenu")) {
    issues.push("Right-click blocking hook is not available in this browser session.");
  }

  if (settings.shortcutBlocking && typeof KeyboardEvent === "undefined") {
    issues.push("Keyboard security detection is unavailable.");
  }

  if ((settings.fullscreenEnabled || settings.requireFullscreenBeforeStart) && document.fullscreenEnabled === false) {
    issues.push("Fullscreen permission is blocked by the browser or an extension.");
  }

  if (!navigator.permissions?.query) {
    issues.push("Browser permission status API is unavailable; security permissions cannot be verified.");
  }

  if (!navigator.geolocation) {
    issues.push("Geolocation API is unavailable or blocked.");
  } else {
    const geoState = await queryPermissionState("geolocation");
    if (geoState === "denied") issues.push("Location permission is blocked. Allow location before continuing.");
  }

  if (needsCamera) {
    const cameraState = await queryPermissionState("camera");
    if (cameraState === "denied") issues.push("Camera permission is blocked. Allow camera before continuing.");
  }

  if (needsMic) {
    const micState = await queryPermissionState("microphone");
    if (micState === "denied") issues.push("Microphone permission is blocked. Allow microphone before continuing.");
  }

  return issues;
}

function StatusPill({ exam }) {
  const state = examState(exam);
  const colors = {
    green:
      "border-emerald-200 bg-emerald-50 text-emerald-700 before:bg-emerald-500",
    amber: "border-amber-200 bg-amber-50 text-amber-700 before:bg-amber-500",
    blue: "border-blue-200 bg-blue-50 text-blue-700 before:bg-blue-500",
    slate: "border-slate-200 bg-slate-50 text-slate-600 before:bg-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold before:h-1.5 before:w-1.5 before:rounded-full ${colors[state.tone]}`}
    >
      {state.label}
    </span>
  );
}

function ExamCard({ exam, onContinue, onResume }) {
  const enabled = canEnter(exam);
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)]">
      <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
            <FileText size={22} />
          </div>
          <StatusPill exam={exam} />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-orange-600">
          {exam.courseName || "General exam"}
        </p>
        <h3 className="mt-2 line-clamp-2 text-xl font-bold tracking-tight text-slate-950">
          {exam.title}
        </h3>
        <p className="mt-1 text-sm font-medium text-slate-400">
          Exam code: {exam.assessmentCode || "—"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-2.5">
            <Clock3 size={16} className="text-slate-400" />
            <div>
              <p className="text-[11px] font-semibold text-slate-400">
                Duration
              </p>
              <p className="text-sm font-bold text-slate-700">
                {exam.durationMinutes || 0} min
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <FileText size={16} className="text-slate-400" />
            <div>
              <p className="text-[11px] font-semibold text-slate-400">
                Questions
              </p>
              <p className="text-sm font-bold text-slate-700">
                {exam.questionSummary?.totalQuestions || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <CalendarDays size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            {formatDate(exam.startAt)} — {formatDate(exam.endAt)}
          </span>
        </div>
        <button
          type="button"
          disabled={!enabled}
          onClick={() =>
            exam.examStatus === "in_progress" && exam.attempt?.startedAt
              ? onResume(exam)
              : onContinue(exam)
          }
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {exam.examStatus === "in_progress"
            ? "Resume exam"
            : enabled
              ? "Continue"
              : exam.operationalStatus === "upcoming"
                ? "Available soon"
                : "Unavailable"}
          {enabled ? <ArrowRight size={16} /> : null}
        </button>
      </div>
    </article>
  );
}

function ModalFrame({ children, onClose, wide = false, lockClose = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:p-6">
      <div
        className={`relative my-auto w-full overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_30px_100px_rgba(2,6,23,0.35)] ${wide ? "max-w-5xl" : "max-w-xl"}`}
      >
        {!lockClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-900"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function DetailRows({ exam }) {
  const rows = [
    ["Exam date", formatDate(exam.startAt)],
    ["Duration", `${exam.durationMinutes || 0} minutes`],
    ["Questions", String(exam.questionSummary?.totalQuestions || 0)],
    ["Maximum marks", String(exam.questionSummary?.totalMarks || 0)],
  ];
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="bg-slate-50 p-4" key={label}>
          <p className="text-xs font-semibold text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
        </div>
      ))}
    </div>
  );
}

function EntryFlow({ exam, onClose, onAttemptUpdated, onStarted, reverify = false }) {
  const [stage, setStage] = useState(reverify ? "security" : "details");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [activeSecurity, setActiveSecurity] = useState(0);
  const [passed, setPassed] = useState(() => new Set());
  const [cameraStream, setCameraStream] = useState(null);
  const [countdown, setCountdown] = useState(reverify ? 0 : 30);
  const [accepted, setAccepted] = useState(reverify);
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && cameraStream)
      videoRef.current.srcObject = cameraStream;
  }, [cameraStream, activeSecurity]);

  useEffect(
    () => () => cameraStream?.getTracks().forEach((track) => track.stop()),
    [cameraStream],
  );

  useEffect(() => {
    if (stage !== "instructions" || countdown <= 0) return undefined;
    const timer = window.setTimeout(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [stage, countdown]);

  function fail(message) {
    setError(message);
    setWorking(false);
  }

  async function saveStep(key, message) {
    const response = await api.post(
      `/student/exams/${exam.assignmentId}/setup-step`,
      { key, status: "passed", message },
    );
    onAttemptUpdated(response.data.attempt);
    setPassed((current) => new Set([...current, key]));
  }

  function advance() {
    setError("");
    setActiveSecurity((value) => Math.min(value + 1, securitySteps.length - 1));
  }

  async function confirmDetails() {
    setWorking(true);
    setError("");
    try {
      if (
        !exam.attempt?.setupSteps?.some(
          (item) => item.key === "verify" && item.status === "passed",
        )
      ) {
        await saveStep(
          "verify",
          "Student eligibility and exam assignment verified.",
        );
      }
      setStage(exam.attempt?.passwordVerified ? "ready" : "password");
    } catch (requestError) {
      fail(
        requestError.response?.data?.message || "Unable to verify this exam.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function verifyPassword() {
    setWorking(true);
    setError("");
    try {
      const response = await api.post(
        `/student/exams/${exam.assignmentId}/verify-password`,
        { password },
      );
      onAttemptUpdated(response.data.attempt);
      setPassword("");
      setStage("ready");
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          "Incorrect exam password. Please try again.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function checkEnvironment() {
    setWorking(true);
    setError("");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    if (!navigator.onLine)
      return fail("No internet connection detected. Reconnect and retry.");
    if (!navigator.cookieEnabled)
      return fail("Cookies are disabled. Enable them before continuing.");
    if (document.visibilityState !== "visible" || !document.hasFocus())
      return fail("Keep this exam tab active and close other browser windows.");
    if (!window.isSecureContext)
      return fail("A secure HTTPS browser session is required for this exam.");
    if (navigator.webdriver)
      return fail(
        "Browser automation was detected. Open the exam in a normal browser session.",
      );
    if (
      (exam.settings?.cameraRequired ||
        exam.settings?.microphoneRequired ||
        exam.settings?.proctoringEnabled) &&
      !navigator.mediaDevices?.getUserMedia
    )
      return fail(
        "Required camera and microphone security APIs are unavailable in this browser.",
      );
    if (
      (exam.settings?.fullscreenEnabled ||
        exam.settings?.requireFullscreenBeforeStart) &&
      !document.documentElement.requestFullscreen
    )
      return fail(
        "This browser does not support the required full-screen security mode.",
      );
    const integrityIssues = await getSecureBrowserIntegrityIssues(exam);
    if (integrityIssues.length > 0) {
      return fail(
        `Secure browser check failed: ${integrityIssues[0]} Close extension/privacy blockers and retry.`,
      );
    }
    if (
      exam.settings?.multipleTabDetection &&
      (await hasDuplicateExamTab(exam.assignmentId))
    )
      return fail(
        "This exam is already open in another tab. Close the other tab and retry.",
      );
    try {
      await saveStep(
        "browser",
        "Browser, network, cookies, visibility and focus checks passed.",
      );
      advance();
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          "Environment verification could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function checkCamera() {
    setWorking(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setCameraStream(stream);
      await new Promise((resolve) => window.setTimeout(resolve, 2200));
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== "live")
        throw new Error("Camera feed is not active.");
      await saveStep(
        "camera",
        "Camera feed active and face framing check completed.",
      );
      advance();
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          requestError.message ||
          "Camera access failed. Allow camera permission and retry.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function checkPermissions() {
    setWorking(true);
    setError("");
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const location = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
        }),
      );
      const audioTrack = audio.getAudioTracks()[0];
      audio.getTracks().forEach((track) => track.stop());
      if (!audioTrack) throw new Error("No microphone was detected.");
      await saveStep(
        "microphone",
        `Microphone and location verified (${location.coords.accuracy.toFixed(0)}m accuracy).`,
      );
      advance();
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          "Microphone or location permission was denied. Allow both permissions and retry.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function checkFullscreen() {
    setWorking(true);
    setError("");
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
      await saveStep("fullscreen", "Full screen mode verified.");
      advance();
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          "Full screen could not be enabled. Allow it and retry.",
      );
    } finally {
      setWorking(false);
    }
  }

  function completeReview() {
    const required = ["browser", "camera", "microphone", "fullscreen"];
    if (
      !required.every(
        (key) =>
          passed.has(key) ||
          exam.attempt?.setupSteps?.some(
            (item) => item.key === key && item.status === "passed",
          ),
      )
    ) {
      setError(
        "A required security check is missing. Please complete all checks.",
      );
      return;
    }
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setStage("instructions");
    setCountdown(reverify ? 0 : 30);
    setError("");
  }

  async function startExam() {
    if ((!accepted && !reverify) || countdown > 0) return;
    setWorking(true);
    setError("");
    try {
      if (reverify) {
        const response = await api.post(
          `/student/exams/${exam.assignmentId}/security-hold/recheck`,
          {
            checks: {
              visible: document.visibilityState === "visible",
              focused: document.hasFocus(),
              fullscreen: Boolean(document.fullscreenElement),
              camera:
                passed.has("camera") ||
                !(
                  exam.settings?.cameraRequired ||
                  exam.settings?.cameraMonitoring ||
                  exam.settings?.proctoringEnabled
                ),
              microphone:
                passed.has("microphone") ||
                !(
                  exam.settings?.microphoneRequired ||
                  exam.settings?.noiseMonitoring ||
                  exam.settings?.proctoringEnabled
                ),
            },
          },
        );
        onStarted(response.data);
        return;
      }
      const instructionResponse = await api.post(
        `/student/exams/${exam.assignmentId}/setup-step`,
        {
          key: "instructions",
          status: "passed",
          message: "Exam instructions and monitoring terms accepted.",
        },
      );
      onAttemptUpdated(instructionResponse.data.attempt);
      const response = await api.post(
        `/student/exams/${exam.assignmentId}/start`,
      );
      onAttemptUpdated(response.data.attempt);
      onStarted(response.data);
    } catch (requestError) {
      fail(
        requestError.response?.data?.message ||
          "The exam could not be started.",
      );
    } finally {
      setWorking(false);
    }
  }

  const ActionError = error ? (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
      {error}
    </div>
  ) : null;

  if (stage === "details")
    return (
      <ModalFrame onClose={onClose}>
        <div className="bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
            <FileText size={23} />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
            Exam overview
          </p>
          <h2 className="mt-2 pr-8 text-2xl font-bold">{exam.title}</h2>
          <p className="mt-2 text-sm text-slate-300">
            Please confirm the details before continuing.
          </p>
        </div>
        <div className="p-6">
          <DetailRows exam={exam} />
          {ActionError}
          <div className="mt-6 flex gap-3">
            <button
              className="secondary-button flex-1 justify-center"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button flex-1 justify-center"
              onClick={confirmDetails}
              disabled={working}
            >
              {working ? <Loader2 size={16} className="animate-spin" /> : null}
              Yes, continue
            </button>
          </div>
        </div>
      </ModalFrame>
    );

  if (stage === "password")
    return (
      <ModalFrame onClose={onClose}>
        <div className="p-7 sm:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-600">
            <KeyRound size={25} />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">
            Secure access
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            Enter exam password
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use the password shared by your exam administrator.
          </p>
          <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Exam password
          </label>
          <div className="relative mt-2">
            <Lock
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && password.trim() && verifyPassword()
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
              placeholder="Enter password"
            />
          </div>
          {ActionError}
          <button
            className="primary-button mt-6 h-12 w-full justify-center rounded-xl"
            onClick={verifyPassword}
            disabled={working || !password.trim()}
          >
            {working ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Fingerprint size={17} />
            )}
            Verify and continue
          </button>
        </div>
      </ModalFrame>
    );

  if (stage === "ready")
    return (
      <ModalFrame onClose={onClose}>
        <div className="p-7 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={23} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
                Access verified
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                One step before your exam
              </h2>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="flex gap-3">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-orange-600"
                size={21}
              />
              <div>
                <p className="font-bold text-slate-900">
                  Security check required
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Continuing will start a guided device and environment check.
                  After all checks pass, you’ll review the instructions and
                  begin your exam.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 p-4 text-sm">
            <span className="font-semibold text-slate-500">
              Estimated setup time
            </span>
            <span className="font-bold text-slate-900">2–3 minutes</span>
          </div>
          <button
            className="primary-button mt-6 h-12 w-full justify-center rounded-xl"
            onClick={() => setStage("security")}
          >
            <ShieldCheck size={17} />
            Continue to security check
          </button>
        </div>
      </ModalFrame>
    );

  if (stage === "instructions")
    return (
      <ModalFrame onClose={onClose} wide lockClose>
        <div className="grid max-h-[92vh] lg:grid-cols-[300px_1fr]">
          <aside className="bg-slate-950 p-7 text-white">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
              <FileText size={22} />
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
              Final step
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              {reverify ? "Verification complete" : "Instructions & terms"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {reverify
                ? "Security checks passed. Resume your paused exam when ready."
                : "Read carefully. Your exam begins immediately after you press start."}
            </p>
            <div
              className={`mt-8 grid aspect-square max-w-[170px] place-items-center rounded-full border-[6px] ${countdown <= 5 && countdown > 0 ? "animate-pulse border-red-400 bg-red-500/10" : "border-orange-400 bg-white/5"}`}
            >
              <div className="text-center">
                <p className="text-4xl font-black tabular-nums">{countdown}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  seconds
                </p>
              </div>
            </div>
          </aside>
          <main className="overflow-y-auto p-7 sm:p-9">
            <h3 className="text-xl font-bold text-slate-950">{exam.title}</h3>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700 whitespace-pre-line">
              {exam.instructions ||
                "Read every question carefully. Do not switch tabs, leave full screen, use another device, or communicate with anyone during the exam. Keep your face visible and remain seated for the complete duration."}
            </div>
            <div className="mt-5 space-y-3">
              {buildSecurityTerms(exam.settings).map((text) => (
                <div className="flex gap-3 text-sm text-slate-600" key={text}>
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                  <span>{text}</span>
                </div>
              ))}
            </div>
            {!reverify ? <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange-500"
              />
              <span className="text-sm font-semibold leading-6 text-slate-700">
                I have read and agree to the exam instructions, terms, and
                monitoring policy.
              </span>
            </label> : null}
            {ActionError}
            <button
              onClick={startExam}
              disabled={countdown > 0 || (!accepted && !reverify) || working}
              className={`mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${countdown === 0 && accepted ? "bg-orange-600 text-white shadow-lg shadow-orange-200 hover:bg-orange-700" : "cursor-not-allowed bg-slate-200 text-slate-500"}`}
            >
              {working ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
              {countdown > 0
                ? `Start available in ${countdown}s`
                : reverify
                  ? "Resume exam"
                  : "Start exam now"}
            </button>
          </main>
        </div>
      </ModalFrame>
    );

  const current = securitySteps[activeSecurity];
  const runCurrent =
    current.key === "browser"
      ? checkEnvironment
      : current.key === "camera"
        ? checkCamera
        : current.key === "microphone"
          ? checkPermissions
          : current.key === "fullscreen"
            ? checkFullscreen
            : completeReview;
  const CurrentIcon = current.icon;
  const body = {
    browser: {
      title: "Prepare your environment",
      text: "Close all other browser windows and applications. Keep only this exam tab open, then run the system check.",
      icon: MonitorCheck,
      notes: [
        [Wifi, "Stable internet connection"],
        [Lock, "Cookies and secure session"],
        [MonitorCheck, "Active exam window"],
      ],
    },
    camera: {
      title: "Camera and face check",
      text: "Sit in a well-lit place and position your full face inside the camera frame. Remove masks, caps, or anything covering your face.",
      icon: Camera,
      notes: [],
    },
    microphone: {
      title: "Location and microphone",
      text: "Allow both permissions when your browser asks. They are required to verify your exam environment.",
      icon: Mic,
      notes: [
        [Mic, "Working microphone"],
        [MapPin, "Precise location permission"],
      ],
    },
    fullscreen: {
      title: "Enter full screen",
      text: "The exam must run in full-screen mode. Exiting full screen during the exam may create a security alert.",
      icon: Maximize,
      notes: [],
    },
    review: {
      title: "Everything looks good",
      text: "All required security checks have been recorded. Continue to read your exam instructions and terms.",
      icon: ShieldCheck,
      notes: [],
    },
  }[current.key];
  return (
    <ModalFrame onClose={onClose} wide lockClose>
      <div className="grid min-h-[610px] lg:grid-cols-[310px_1fr]">
        <aside className="bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="font-bold">Security check</p>
              <p className="text-xs text-slate-400">
                {activeSecurity + 1} of {securitySteps.length} steps
              </p>
            </div>
          </div>
          <div className="mt-8 space-y-2">
            {securitySteps.map((step, index) => {
              const Icon = step.icon;
              const done = index < activeSecurity;
              const active = index === activeSecurity;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 rounded-xl p-3 ${active ? "bg-white/10" : ""}`}
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-lg ${done ? "bg-emerald-500 text-white" : active ? "bg-orange-500 text-white" : "bg-white/5 text-slate-500"}`}
                  >
                    {done ? <Check size={17} /> : <Icon size={17} />}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-bold ${active || done ? "text-white" : "text-slate-500"}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {done ? "Verified" : step.caption}
                    </p>
                  </div>
                  {done ? (
                    <CheckCircle2
                      size={16}
                      className="ml-auto text-emerald-400"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Lock size={14} />
              Secure verification
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Each completed check is verified and saved before the next step
              unlocks.
            </p>
          </div>
        </aside>
        <main className="flex flex-col p-7 sm:p-10">
          <div className="flex-1">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-600">
              <CurrentIcon size={25} />
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">
              Step {activeSecurity + 1}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {body.title}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              {body.text}
            </p>
            {current.key === "camera" ? (
              <div className="relative mt-6 aspect-video max-w-lg overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover scale-x-[-1]"
                />
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="h-[72%] w-[44%] rounded-[50%] border-2 border-dashed border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.28)]" />
                </div>
                {!cameraStream ? (
                  <div className="absolute inset-0 grid place-items-center text-center text-white">
                    <div>
                      <Video size={30} className="mx-auto text-slate-500" />
                      <p className="mt-2 text-sm font-semibold text-slate-400">
                        Camera preview will appear here
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {body.notes.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {body.notes.map(([Icon, label]) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
                      <Icon size={17} />
                    </span>
                    <span className="text-sm font-bold text-slate-700">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {current.key === "review" ? (
              <div className="mt-6 grid gap-2">
                {securitySteps.slice(0, 4).map((step) => (
                  <div
                    key={step.key}
                    className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3"
                  >
                    <span className="text-sm font-bold text-slate-700">
                      {step.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={15} />
                      Verified
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {ActionError}
          </div>
          <button
            onClick={runCurrent}
            disabled={working}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-bold text-white shadow-lg shadow-orange-100 transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70"
          >
            {working ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                {current.key === "review"
                  ? "Continue to instructions"
                  : current.key === "browser"
                    ? "Run environment check"
                    : current.key === "camera"
                      ? "Turn on camera"
                      : current.key === "microphone"
                        ? "Allow and verify"
                        : "Enter full screen"}
                <ChevronRight size={17} />
              </>
            )}
          </button>
        </main>
      </div>
    </ModalFrame>
  );
}

export function StudentExamsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reverifyAssignmentId = searchParams.get("reverify");
  const [exams, setExams] = useState([]);
  const [summary, setSummary] = useState({
    assigned: 0,
    active: 0,
    submitted: 0,
  });
  const [selectedExam, setSelectedExam] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/student/exams");
      setExams(response.data.items || []);
      setSummary(response.data.summary || {});
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "We could not load your exams.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (!reverifyAssignmentId || selectedExam || exams.length === 0) return;
    const reverifyExam = exams.find(
      (item) =>
        String(item.assignmentId) === String(reverifyAssignmentId),
    );
    if (reverifyExam) setSelectedExam(reverifyExam);
  }, [exams, reverifyAssignmentId, selectedExam]);

  const visibleExams = useMemo(
    () =>
      exams.filter(
        (exam) =>
          filter === "all" ||
          (filter === "live"
            ? exam.operationalStatus === "active"
            : exam.operationalStatus === "upcoming"),
      ),
    [exams, filter],
  );
  function updateAttempt(attempt) {
    setSelectedExam((current) => (current ? { ...current, attempt } : current));
    setExams((current) =>
      current.map((item) =>
        item.assignmentId === selectedExam?.assignmentId
          ? { ...item, attempt }
          : item,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-9 text-white sm:px-10 sm:py-11">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-[20%] h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
              Student exam portal
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Your exams, all in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Review upcoming exams, complete secure verification, and begin
              when you’re ready.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
              <p className="text-2xl font-black">{summary.active || 0}</p>
              <p className="text-xs font-semibold text-slate-400">Live now</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
              <p className="text-2xl font-black">{summary.assigned || 0}</p>
              <p className="text-xs font-semibold text-slate-400">Assigned</p>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            My exams
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Select an exam to view details and continue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            ["all", "All exams"],
            ["live", "Live"],
            ["upcoming", "Upcoming"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${filter === key ? "bg-slate-950 text-white shadow-md" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={loadExams}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500"
            aria-label="Refresh exams"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-[360px] animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : visibleExams.length ? (
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleExams.map((exam) => (
            <ExamCard
              key={exam.assignmentId}
              exam={exam}
              onContinue={setSelectedExam}
              onResume={(item) =>
                navigate(`/student/exams/${item.assignmentId}/attempt`)
              }
            />
          ))}
        </div>
      ) : (
        <div className="mt-7 grid min-h-[300px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center">
          <div>
            <TimerReset size={34} className="mx-auto text-slate-300" />
            <h3 className="mt-4 font-bold text-slate-900">No exams here yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Newly assigned exams will appear automatically.
            </p>
          </div>
        </div>
      )}
      {selectedExam ? (
        <EntryFlow
          exam={selectedExam}
          reverify={
            String(selectedExam.assignmentId) ===
            String(reverifyAssignmentId)
          }
          onClose={() => setSelectedExam(null)}
          onAttemptUpdated={updateAttempt}
          onStarted={() => {
            setSelectedExam(null);
            navigate(`/student/exams/${selectedExam.assignmentId}/attempt`);
          }}
        />
      ) : null}
    </div>
  );
}
