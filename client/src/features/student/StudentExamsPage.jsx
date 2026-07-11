import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import { SecuritySetupDialog } from "./SecuritySetupDialog";

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
  const [stage, setStage] = useState(reverify ? 'security' : 'details');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function confirmDetails() {
    setWorking(true);
    setError('');
    try {
      const alreadyVerified = exam.attempt?.setupSteps?.some(
        (item) => item.key === 'verify' && item.status === 'passed',
      );
      if (!alreadyVerified) {
        const response = await api.post(`/student/exams/${exam.assignmentId}/setup-step`, {
          key: 'verify',
          status: 'passed',
          message: 'Student eligibility and exam assignment verified.',
        });
        onAttemptUpdated(response.data.attempt);
      }
      setStage('security');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to verify this exam.');
    } finally {
      setWorking(false);
    }
  }

  if (stage === 'security') {
    return (
      <SecuritySetupDialog
        exam={exam}
        reverify={reverify}
        onClose={onClose}
        onAttemptUpdated={onAttemptUpdated}
        onStarted={onStarted}
      />
    );
  }

  return (
    <ModalFrame onClose={onClose}>
      <div className="bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
          <FileText size={23} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Exam overview</p>
        <h2 className="mt-2 pr-8 text-2xl font-bold">{exam.title}</h2>
        <p className="mt-2 text-sm text-slate-300">Confirm the exam details before starting secure verification.</p>
      </div>
      <div className="p-6">
        <DetailRows exam={exam} />
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button type="button" className="secondary-button flex-1 justify-center" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button flex-1 justify-center" onClick={confirmDetails} disabled={working}>
            {working ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Continue securely
          </button>
        </div>
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
