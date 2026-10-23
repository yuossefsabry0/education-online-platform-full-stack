import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";
import TeacherStatistics from "../components/TeacherStatistics.jsx";

// GET /api/user/me -> { user: { userType, id, username }, activeRoles, teachers }

// Learning statistics (student profile only, read-only).
// Percentages are computed automatically from the student's recorded exams
// (score/max for any max: 10, 20, 100) and attendance records. The student
// has no inputs to add or modify them; the average and level recompute
// whenever new exam records arrive.
function proficiencyFor(average) {
  if (average == null || Number.isNaN(average)) return null;
  if (average >= 80) return "Excellent";
  if (average >= 70) return "Very Good";
  if (average >= 50) return "Good";
  return "Acceptable";
}

// Presentation-only helper: rough strength estimate for the "New password"
// meter (0-4 filled segments). Purely visual; the backend still enforces the
// real password rules.
function passwordStrength(value) {
  const v = typeof value === "string" ? value : "";
  let score = 0;
  if (v.length >= 8) score += 1;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score += 1;
  if (/\d/.test(v)) score += 1;
  if (/[^A-Za-z0-9]/.test(v)) score += 1;
  return score;
}

// Shared date formatting for the redesigned profile sections ("Oct 9, 2026").
function formatDay(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function emptyLearningStats() {
  return { lessons: [], quizzes: [], totalLessons: null };
}

function learningStatsKey(userId) {
  return `edu-learning-stats-${userId ?? "anon"}`;
}

function loadLearningStats(userId) {
  try {
    const raw = localStorage.getItem(learningStatsKey(userId));
    if (!raw) return emptyLearningStats();
    const parsed = JSON.parse(raw);
    const lessons = Array.isArray(parsed.lessons)
      ? parsed.lessons.filter((l) => l && typeof l.title === "string" && Number.isFinite(l.seconds) && l.seconds > 0).slice(0, 500)
      : [];
    const quizzes = Array.isArray(parsed.quizzes)
      ? parsed.quizzes.filter((q) => q && Number.isFinite(q.score) && Number.isFinite(q.max) && q.max > 0 && q.score >= 0 && q.score <= q.max).slice(0, 500)
      : [];
    const totalLessons = Number.isInteger(parsed.totalLessons) && parsed.totalLessons >= 0 ? parsed.totalLessons : null;
    return { lessons, quizzes, totalLessons };
  } catch {
    return emptyLearningStats();
  }
}

function quizPercent(quiz) {
  if (!quiz || !Number.isFinite(quiz.max) || quiz.max <= 0) return 0;
  return (quiz.score / quiz.max) * 100;
}

function averageQuizPercent(quizzes) {
  if (!Array.isArray(quizzes) || quizzes.length === 0) return null;
  const total = quizzes.reduce((sum, q) => sum + quizPercent(q), 0);
  return total / quizzes.length;
}

function Gauge({ label, percent, centerTop, centerBottom }) {
  const size = 120;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent == null ? 0 : Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  const display = percent == null ? "—" : `${Math.round(percent)}%`;
  return (
    <div className="gauge" role="img" aria-label={`${label}: ${percent == null ? "no data yet" : `${Math.round(percent)} percent`}`}>
      <svg className="gauge-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="gauge-track" cx={size / 2} cy={size / 2} r={radius} />
        <circle
          className="gauge-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-center">
        <strong>{centerTop ?? display}</strong>
        {centerBottom ? <span className="muted small">{centerBottom}</span> : null}
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

// Minimal inline icon set for the redesigned profile sections. Purely
// decorative (aria-hidden) strokes drawn in currentColor.
const Svg = ({ children, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);
const ICON_CLOCK = <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
const ICON_MEDAL = <Svg><circle cx="12" cy="9.5" r="4.5" /><path d="m9.8 13.3-1.7 6.7 3.9-2.2 3.9 2.2-1.7-6.7" /></Svg>;
const ICON_TROPHY = <Svg><path d="M7.5 4h9v4.3a4.5 4.5 0 0 1-9 0Z" /><path d="M7.5 5.5H5a3.4 3.4 0 0 0 3.4 3.4" /><path d="M16.5 5.5H19a3.4 3.4 0 0 1-3.4 3.4" /><path d="M12 12.8V17" /><path d="M8.5 20h7" /></Svg>;
const ICON_USERS = <Svg><circle cx="9.5" cy="7.8" r="3.2" /><path d="M3.8 19.5c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" /><path d="M15.9 8.2a3.1 3.1 0 1 1 1 6" /><path d="M17.6 15.3c1.8.6 2.9 2 3 4.2" /></Svg>;
const ICON_SESSIONS = <Svg><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.8a3 3 0 0 1 6 0" /><path d="M9 10.5h6" /><path d="M9 14h6" /></Svg>;
const ICON_BOOKS = <Svg><path d="M4.5 19.5v-15H9v15Z" /><path d="M9 4.5H14v15H9Z" /><path d="M14 5.5h3.6a1.4 1.4 0 0 1 1.4 1.4v11.2a1.4 1.4 0 0 1-1.4 1.4H14" /></Svg>;
const ICON_GRADCAP = <Svg><path d="M2.5 9.3 12 5.5l9.5 3.8-9.5 3.8-9.5-3.8Z" /><path d="M6.5 11.3v3.9c0 1.1 2.6 2.2 5.5 2.2s5.5-1.1 5.5-2.2v-3.9" /></Svg>;
const ICON_IDCARD = <Svg><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10.8" r="2" /><path d="M13.5 9h4" /><path d="M13.5 12h4" /><path d="M5.8 15.8c.7-1.6 5.7-1.6 6.4 0" /></Svg>;
const ICON_PLAY = <Svg><path d="M8.8 5.8v12.4L18.6 12Z" /></Svg>;
const ICON_CHECK = <Svg><path d="M20 6.5 9.5 17l-4.9-4.9" /></Svg>;
const ICON_ALERT = <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v5" /><path d="M12 16h.01" /></Svg>;
const ICON_EYE = <Svg><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.7" /></Svg>;
const ICON_EYE_OFF = <Svg><path d="m4.5 4.5 15 15" /><path d="M10.3 6.1c.6-.2 1.1-.3 1.7-.3 6 0 9.5 6.2 9.5 6.2a16.4 16.4 0 0 1-2.3 3" /><path d="M6.5 7.3A15.7 15.7 0 0 0 2.5 12S6 18.2 12 18.2c1.2 0 2.3-.2 3.3-.7" /></Svg>;
const ICON_KEY = <Svg><circle cx="8" cy="15.5" r="3.6" /><path d="m10.6 13.1 9-9" /><path d="M16.4 5.3 19 7.9" /></Svg>;
const ICON_LOCK = <Svg><rect x="4.8" y="10.3" width="14.4" height="9.4" rx="2" /><path d="M8 10.3V7.6a4 4 0 0 1 8 0v2.7" /></Svg>;
const ICON_DOWNLOAD = <Svg><path d="M12 4v10.5" /><path d="m7.5 10.8 4.5 4.5 4.5-4.5" /><path d="M4.5 20h15" /></Svg>;
const ICON_INFO = <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 11v4.3" /><path d="M12 8h.01" /></Svg>;
const ICON_BOOK = <Svg><path d="M4.5 18.4V5.6A1.6 1.6 0 0 1 6.1 4h12.4v13.4" /><path d="M6.3 15.8h12.2v4.7H6.1a2 2 0 0 1 .2-4.7Z" /></Svg>;

export default function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [changeDone, setChangeDone] = useState(null);
  const [learningStats, setLearningStats] = useState(() => emptyLearningStats());
  const [statsLoadedFor, setStatsLoadedFor] = useState(null);
  const [examPerf, setExamPerf] = useState(null);
  // Integrated journey watches (additive): LECTURE_WATCHED events tracked alongside exams.
  const [lectureWatches, setLectureWatches] = useState([]);
  // Assigned lecture total (additive): published lectures across subscribed teachers.
  const [assignedTotal, setAssignedTotal] = useState(null);
  // Teaching statistics (additive, teacher profile only): same live component as
  // the teacher dashboard Statistics tab, fed by the teacher endpoints.
  const [teacherStats, setTeacherStats] = useState(null);
  const [teacherStatsLoading, setTeacherStatsLoading] = useState(false);
  const [teacherStatsError, setTeacherStatsError] = useState(null);
  // Dashboard interactivity (additive, presentation only — no logic changes).
  const [chartRange, setChartRange] = useState("month");
  const [activeMonth, setActiveMonth] = useState(null);
  // Live linkage (additive): timestamp of the last dashboard sync + throttle
  // guard so background focus/visibility events never spam the backend.
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const lastAutoRefreshRef = useRef(0);
  // Anchor for the "Edit profile" button (scrolls to the account/password card).
  const accountSettingsRef = useRef(null);
  // Presentation-only additions for the redesigned layout (no logic changes):
  // confirm field + its mismatch message.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  // Show/hide toggles for the three password inputs (purely presentational).
  const [pwVisible, setPwVisible] = useState({ current: false, next: false, confirm: false });
  // Lecture-journey activity tabs (client-side filter of the already loaded rows).
  const [journeyTab, setJourneyTab] = useState("all");

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangeError(null);
    setChangeDone(null);
    // Presentation-only guard: when the confirm field is filled in, it must
    // match the new password. The endpoint contract is unchanged.
    if (confirmPassword && confirmPassword !== newPassword) {
      setConfirmMismatch(true);
      return;
    }
    setConfirmMismatch(false);
    setChanging(true);
    try {
      const result = await endpoints.changePassword({ currentPassword, newPassword });
      const doneMessage = result.message || "Password changed. Please log in again.";
      setChangeDone(doneMessage);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await logout();
      navigate("/login", { replace: true, state: { notice: doneMessage } });
    } catch (err) {
      setChangeError(toApiError(err));
    } finally {
      setChanging(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await endpoints.me();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(toApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const studentId = data && data.user && data.user.userType === "student" ? data.user.id : null;
    if (studentId == null || statsLoadedFor === studentId) return;
    setLearningStats(loadLearningStats(studentId));
    setStatsLoadedFor(studentId);
  }, [data, statsLoadedFor]);

  useEffect(() => {
    const isStudentUser = data && data.user && data.user.userType === "student";
    if (!isStudentUser || examPerf !== null) return;
    let cancelled = false;
    async function loadPerf() {
      try {
        if (typeof endpoints.examPerformance !== "function") return;
        const perf = await endpoints.examPerformance();
        if (!cancelled) setExamPerf(perf);
      } catch {
        if (!cancelled) setExamPerf(null);
      }
    }
    loadPerf();
    return () => {
      cancelled = true;
    };
  }, [data, examPerf]);

  useEffect(() => {
    const isStudentUser = data && data.user && data.user.userType === "student";
    if (!isStudentUser) return;
    let cancelled = false;
    async function loadWatches() {
      try {
        const result = await endpoints.history({ page: 1, limit: 50 });
        const items = (result && result.events && result.events.items) || [];
        if (!cancelled) setLectureWatches(items.filter((e) => e.actionType === "LECTURE_WATCHED").slice(0, 20));
      } catch {
        if (!cancelled) setLectureWatches([]);
      }
    }
    loadWatches();
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const isStudentUser = data && data.user && data.user.userType === "student";
    const teacherIds = isStudentUser && Array.isArray(data.teachers)
      ? [...new Set(data.teachers.map((t) => t && t.id).filter((id) => Number.isInteger(id)))]
      : [];
    if (!isStudentUser || teacherIds.length === 0) return;
    let cancelled = false;
    async function loadAssignedTotal() {
      try {
        const totals = await Promise.all(
          teacherIds.map(async (id) => {
            const res = await endpoints.contentSection(id, "lectures", { page: 1, limit: 1 });
            const total = res && res.pagination && res.pagination.total;
            return Number.isFinite(total) ? total : null;
          })
        );
        if (!cancelled && totals.every((n) => Number.isFinite(n))) {
          setAssignedTotal(totals.reduce((sum, n) => sum + n, 0));
        }
      } catch {
        if (!cancelled) setAssignedTotal(null);
      }
    }
    loadAssignedTotal();
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const isTeacherUser = data && data.user && data.user.userType === "teacher";
    if (!isTeacherUser) return;
    let cancelled = false;
    async function loadTeacherStats() {
      setTeacherStatsLoading(true);
      setTeacherStatsError(null);
      try {
        const [dash, subs, ex] = await Promise.all([
          endpoints.teacherDashboard({ limit: 50, page: 1 }),
          endpoints.teacherSubscribers({ page: 1, limit: 10 }),
          endpoints.teacherExams().catch(() => ({ exams: [] })),
        ]);
        if (!cancelled) setTeacherStats({ dashboard: dash, subscribers: subs, exams: ex.exams || [] });
      } catch (err) {
        if (!cancelled) setTeacherStatsError(toApiError(err));
      } finally {
        if (!cancelled) setTeacherStatsLoading(false);
      }
    }
    loadTeacherStats();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Live linkage (additive, student dashboard only): every figure rendered
  // above (KPIs, monthly chart, streak, badges, certificates, gauges) derives
  // during render from `learningStats` / `examPerf` / `lectureWatches` / `data`,
  // so keeping those four states fresh keeps the whole dashboard linked to the
  // actual data. Refresh on:
  // - `edu:learning-stats-updated` — lecture watched (LectureJourney) or exam
  //   submitted (ExamTake), same tab;
  // - `storage` — same localStorage key changed in another tab;
  // - `focus` / visible tab — user returns to the profile (throttled).
  // Existing load effects are untouched; this only re-runs their fetches.
  useEffect(() => {
    const studentId = data && data.user && data.user.userType === "student" ? data.user.id : null;
    if (studentId == null) return undefined;
    let cancelled = false;

    function refreshLocal() {
      if (cancelled) return;
      setLearningStats(loadLearningStats(studentId));
      setStatsLoadedFor(studentId);
      setLiveUpdatedAt(new Date());
    }

    async function refreshServer() {
      try {
        if (typeof endpoints.examPerformance === "function") {
          const perf = await endpoints.examPerformance();
          if (!cancelled && perf) setExamPerf(perf);
        }
      } catch {
        // keep previous performance figures
      }
      try {
        const result = await endpoints.history({ page: 1, limit: 50 });
        const items = (result && result.events && result.events.items) || [];
        if (!cancelled) setLectureWatches(items.filter((e) => e.actionType === "LECTURE_WATCHED").slice(0, 20));
      } catch {
        // keep previous watches
      }
      try {
        const fresh = await endpoints.me();
        if (!cancelled && fresh && fresh.user) {
          setData(fresh);
          const freshId = fresh.user.userType === "student" ? fresh.user.id : null;
          if (freshId != null) {
            setLearningStats(loadLearningStats(freshId));
            setStatsLoadedFor(freshId);
          }
        }
      } catch {
        // keep previous account / subscription data
      }
      if (!cancelled) setLiveUpdatedAt(new Date());
    }

    function refreshThrottled() {
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 20000) {
        refreshLocal();
        return;
      }
      lastAutoRefreshRef.current = now;
      refreshLocal();
      refreshServer();
    }

    function onStorage(e) {
      try {
        if (e && e.key === learningStatsKey(studentId)) refreshThrottled();
      } catch {
        return;
      }
    }
    // Explicit data change (watch / submit / manual refresh): always full sync.
    function onStatsEvent() {
      lastAutoRefreshRef.current = Date.now();
      refreshLocal();
      refreshServer();
    }
    function onFocus() {
      refreshThrottled();
    }
    function onVisibility() {
      try {
        if (document.visibilityState === "visible") refreshThrottled();
      } catch {
        return;
      }
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("edu:learning-stats-updated", onStatsEvent);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("edu:learning-stats-updated", onStatsEvent);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [data]);

  if (loading) return <div className="page"><Loader label="Loading profile..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Profile</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const roles = data.activeRoles || [];
  const teachers = data.teachers || [];
  const nameByRole = {};
  const teacherByRole = {};
  for (const t of teachers) {
    if (t && t.id !== undefined) {
      nameByRole[`SUB${t.id}`] = t.name;
      teacherByRole[`SUB${t.id}`] = t;
    }
  }

  const isStudent = data.user?.userType === "student";
  const isTeacher = data.user?.userType === "teacher";
  const isAdmin = data.user?.userType === "admin";
  const watchedCount = learningStats.lessons.length;
  const totalSeconds = learningStats.lessons.reduce((sum, l) => sum + (Number.isFinite(l.seconds) ? l.seconds : 0), 0);
  const viewingHours = totalSeconds / 3600;
  const examAttempts = examPerf && Array.isArray(examPerf.attempts) ? examPerf.attempts : [];
  const examPercents = examAttempts.map((a) => a.percent).filter((p) => Number.isFinite(p));
  const quizAvg = averageQuizPercent(learningStats.quizzes);
  const quizCount = learningStats.quizzes.length;
  const examTotal = examPercents.reduce((s, p) => s + p, 0);
  const scoreCount = quizCount + examPercents.length;
  const average = scoreCount === 0 ? null : (((quizAvg ?? 0) * quizCount) + examTotal) / scoreCount;
  const proficiency = proficiencyFor(average);
  const totalLessons = learningStats.totalLessons ?? assignedTotal;
  const remainingCount = totalLessons != null ? Math.max(totalLessons - watchedCount, 0) : null;
  const completionPercent = totalLessons != null && totalLessons > 0
    ? Math.min((watchedCount / totalLessons) * 100, 100)
    : null;
  // ---- Dashboard derivations (presentation only, all values reuse existing stats) ----
  const passedExams = examAttempts.filter((a) => typeof a.percent === "number" && a.percent >= 50);
  const certCount = passedExams.length;
  // Lecture journey timeline (presentation only, additive): the most recent exam
  // results and watched lectures merged into one chronological strip, oldest →
  // newest. It reuses the arrays already loaded above — no extra fetches.
  const journeyTimeline = [];
  for (const a of examAttempts) {
    journeyTimeline.push({
      key: `ex-${a.examId}`,
      kind: "exam",
      title: a.examTitle || `Exam #${a.examId}`,
      at: a.submittedAt ? new Date(a.submittedAt) : null,
      badge: typeof a.percent === "number" ? `${Math.round(a.percent)}%` : null,
      ok: typeof a.percent === "number" && a.percent >= 50,
    });
  }
  for (const w of lectureWatches) {
    journeyTimeline.push({
      key: `wd-${w.id}`,
      kind: "watch",
      title: (w.details && (w.details.lectureTitle || `Lecture ${w.targetId}`)) || `Lecture ${w.targetId}`,
      at: w.timestamp ? new Date(w.timestamp) : null,
      badge: "Watched",
      ok: true,
    });
  }
  try {
    journeyTimeline.sort((x, y) => (x.at ? x.at.getTime() : 0) - (y.at ? y.at.getTime() : 0));
  } catch {
    // keep insertion order
  }
  const timelineSteps = journeyTimeline.slice(-5);
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthHours = Array.from({ length: 12 }, () => 0);
  const monthCount = Array.from({ length: 12 }, () => 0);
  try {
    const nowYear = new Date().getFullYear();
    for (const l of learningStats.lessons || []) {
      if (!l || !l.watchedAt) continue;
      const d = new Date(l.watchedAt);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== nowYear) continue;
      const h = Number.isFinite(l.seconds) ? l.seconds / 3600 : 0;
      monthHours[d.getMonth()] += h;
      monthCount[d.getMonth()] += 1;
    }
    for (const w of lectureWatches || []) {
      if (!w || !w.timestamp) continue;
      const d = new Date(w.timestamp);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== nowYear) continue;
      monthHours[d.getMonth()] += 1 / 60;
      monthCount[d.getMonth()] += 1;
    }
  } catch {
    // keep zeroed buckets
  }
  const monthBuckets = MONTH_LABELS.map((label, i) => ({ label, h: monthHours[i], count: monthCount[i] }));
  // Day view (presentation only): daily buckets for the last 14 days built
  // from the same watched-lecture sources as the monthly buckets — no fetches.
  const startOfDayMs = (value) => {
    const x = value instanceof Date ? value : new Date(value);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  };
  const startMs = startOfDayMs(new Date());
  const dayHours = Array.from({ length: 14 }, () => 0);
  const dayCount = Array.from({ length: 14 }, () => 0);
  const dayDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  try {
    for (const l of learningStats.lessons || []) {
      if (!l || !l.watchedAt) continue;
      const diff = Math.round((startMs - startOfDayMs(new Date(l.watchedAt))) / 86400000);
      if (diff < 0 || diff > 13) continue;
      dayHours[13 - diff] += Number.isFinite(l.seconds) ? l.seconds / 3600 : 0;
      dayCount[13 - diff] += 1;
    }
    for (const w of lectureWatches || []) {
      if (!w || !w.timestamp) continue;
      const diff = Math.round((startMs - startOfDayMs(new Date(w.timestamp))) / 86400000);
      if (diff < 0 || diff > 13) continue;
      dayHours[13 - diff] += 1 / 60;
      dayCount[13 - diff] += 1;
    }
  } catch {
    // keep zeroed day buckets
  }
  const dayBuckets = dayDates.map((d, i) => ({
    label: String(d.getDate()).padStart(2, "0"),
    h: dayHours[i],
    count: dayCount[i],
  }));
  const visibleBuckets =
    chartRange === "day" ? dayBuckets : chartRange === "half" ? monthBuckets.slice(-6) : monthBuckets;
  const bucketMax = Math.max(1, ...visibleBuckets.map((b) => b.h));
  const visibleOffset = chartRange === "half" ? 6 : 0;
  // The stored focus (`activeMonth`) keeps absolute month indexes for the
  // monthly views and plain day indexes for the Day view.
  const focusedFrom = (bi) => (chartRange === "day" ? bi : visibleOffset + bi);
  const focusedBucket =
    chartRange === "day"
      ? activeMonth != null && dayBuckets[activeMonth] ? dayBuckets[activeMonth] : null
      : activeMonth != null && monthBuckets[activeMonth] ? monthBuckets[activeMonth] : null;
  const dayKeys = new Set();
  try {
    for (const l of learningStats.lessons || []) {
      if (l && l.watchedAt) dayKeys.add(new Date(l.watchedAt).toDateString());
    }
    for (const a of examAttempts || []) {
      if (a && a.submittedAt) dayKeys.add(new Date(a.submittedAt).toDateString());
    }
    for (const w of lectureWatches || []) {
      if (w && w.timestamp) dayKeys.add(new Date(w.timestamp).toDateString());
    }
  } catch {
    // ignore
  }
  let streakDays = 0;
  try {
    const cursor = new Date();
    if (!dayKeys.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (dayKeys.has(cursor.toDateString())) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  } catch {
    streakDays = 0;
  }
  const badgeDefs = [
    { id: "first", icon: "🎓", title: "First Lesson", hint: watchedCount >= 1 ? "Complete your first course" : "Watch your first lecture", earned: watchedCount >= 1 },
    { id: "dedicated", icon: "📚", title: "Dedicated", hint: watchedCount >= 5 ? `Watched ${watchedCount} lectures` : "Watch 5 lectures", earned: watchedCount >= 5 },
    { id: "scholar", icon: "⭐", title: "Scholar", hint: average == null ? "Score 70%+ average" : `${average.toFixed(1)}% average`, earned: average != null && average >= 70 },
    { id: "marathon", icon: "🔥", title: "Marathon", hint: streakDays > 0 ? `Learned ${streakDays} day${streakDays === 1 ? "" : "s"} in a row` : "Learn 5 days in a row", earned: streakDays >= 5 || watchedCount >= 5 },
  ];
  const badgesEarned = badgeDefs.filter((b) => b.earned).length;
  const topCourses = (Array.isArray(teachers) ? teachers : []).slice(0, 2);
  const subtitleText = isStudent
    ? (streakDays > 1 ? `Keep learning and earn more badges to reach your goals. You're on a ${streakDays}-day streak!` : "Keep learning and earn more badges to reach your goals.")
    : isTeacher
      ? "Your teaching impact at a glance — subscribers, sessions and grades update live."
      : isAdmin
        ? "Full platform control — teachers, subscriptions, income, and the audit log."
        : "Your account overview.";
  // Header reporting period (presentation only): the current calendar month,
  // mirroring the date-range pill in the reference design.
  const rangeFrom = new Date();
  rangeFrom.setDate(1);
  const rangeTo = new Date(rangeFrom.getFullYear(), rangeFrom.getMonth() + 1, 0);
  const formatReportDay = (d) =>
    `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString(undefined, { month: "short" })} ${d.getFullYear()}`;
  const rangeLabel = `${formatReportDay(rangeFrom)} — ${formatReportDay(rangeTo)}`;
  const accountInitials = (data.user?.username || "?").trim().slice(0, 2).toUpperCase() || "?";
  const accountRoleLine = isStudent
    ? `Student · User ID ${data.user?.id}`
    : isTeacher
      ? `Teacher · User ID ${data.user?.id}`
      : isAdmin
        ? `Administrator · User ID ${data.user?.id}`
        : `User ID ${data.user?.id}`;
  // ---- Redesign derivations (presentation only, reuse the stats above) ----
  // Identity-card sub line mirrors the reference ("3rd year secondary · Accounting")
  // using the first subscribed teacher's grade class and subject.
  const firstTeacher = isStudent && teachers.length > 0 ? teachers[0] : null;
  const accountGradeLine =
    isStudent && (firstTeacher?.gradeClass || firstTeacher?.subject)
      ? [firstTeacher.gradeClass, firstTeacher.subject].filter(Boolean).join(" · ")
      : accountRoleLine;
  // Progress fraction per badge (0..1) used by tiles + the "next badge" bar.
  const badgeProgress = {
    first: Math.min(watchedCount, 1),
    dedicated: Math.min(watchedCount / 5, 1),
    scholar: average == null ? 0 : Math.min(average / 70, 1),
    marathon: Math.min(Math.max(watchedCount / 5, streakDays / 5), 1),
  };
  // Next (first unearned) badge drives the "NEXT BADGE" footer bar.
  const nextBadge = badgeDefs.find((b) => !b.earned) || null;
  let nextBadgeMsg = "";
  if (nextBadge) {
    if (nextBadge.id === "first") nextBadgeMsg = "watch your first lecture";
    else if (nextBadge.id === "dedicated") nextBadgeMsg = `watch ${Math.max(5 - watchedCount, 0)} more lecture${5 - watchedCount === 1 ? "" : "s"}`;
    else if (nextBadge.id === "scholar") nextBadgeMsg = average == null ? "reach a 70%+ average" : "keep your 70%+ average";
    else nextBadgeMsg = "learn 5 days in a row";
  }
  // Lecture-journey tabs (All / Exams / Watched) — counts match the shown rows.
  const journeyExamCount = Math.min(examAttempts.length, 10);
  const journeyWatchCount = lectureWatches.length;
  const journeyTabs = [
    { id: "all", label: "All", count: journeyExamCount + journeyWatchCount },
    { id: "exams", label: "Exams", count: journeyExamCount },
    { id: "watched", label: "Watched", count: journeyWatchCount },
  ];
  const journeyVisibleExams = journeyTab === "watched" ? [] : examAttempts.slice(0, 10);
  const journeyVisibleWatches = journeyTab === "exams" ? [] : lectureWatches;
  const journeyShown =
    (journeyTab === "watched" ? 0 : journeyExamCount) + (journeyTab === "exams" ? 0 : journeyWatchCount);
  // Password strength meter segments (0-4, purely visual).
  const pwScore = passwordStrength(newPassword);
  // Scrolls the profile page to the account / password section. Used by the
  // "Edit profile" button: this app has no profile-edit endpoint, so the button
  // takes the user to the only editable account data (the password form).
  function jumpToAccountSettings() {
    const target = accountSettingsRef.current;
    if (!target || typeof target.scrollIntoView !== "function") return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      target.scrollIntoView();
    }
  }
  return (
    <div className="page profile-wide">
      <div className="pf-shell">
        <header className="pf-top">
          <div className="pf-titleblock">
            <h1 className="pf-title">{isStudent ? "My Progress" : "Profile"}</h1>
            <p className="muted small pf-subtitle">{subtitleText}</p>
          </div>
          <div className="pf-top-side">
            {isStudent ? (
              <p className="pf-live" role="status" aria-live="polite">
                <span
                  className="pf-live-dot"
                  aria-hidden="true"
                  title={liveUpdatedAt ? `Updated ${liveUpdatedAt.toLocaleTimeString()}` : undefined}
                />
                Live · updates automatically
                <button
                  type="button"
                  className="pf-live-btn"
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent("edu:learning-stats-updated", { detail: { manual: true } }));
                    } catch {
                      window.location.reload();
                    }
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                    <path d="M20.5 11a8.5 8.5 0 1 1-2.4-6.0" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  Refresh now
                </button>
              </p>
            ) : null}
            <span className="pf-range" role="note" aria-label={`Reporting period ${rangeLabel}`}>
              <svg className="pf-range-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="3" y="4.5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {rangeLabel}
            </span>
          </div>
        </header>
        <section className="pf-kpis" role="list" aria-label="Progress summary">
          <div className="pf-account pf-kpi pf-kpi--identity" role="listitem">
            <span className="pf-account-avatar" aria-hidden="true">{accountInitials}</span>
            <div className="pf-account-main">
              <div className="pf-account-id">
                <strong className="account-username">{data.user?.username}</strong>
                <span className="muted small">{accountGradeLine}</span>
              </div>
              <div className="pf-account-actions">
                <button type="button" className="btn btn-dark btn-sm" onClick={jumpToAccountSettings}>
                  Edit profile
                </button>
              </div>
            </div>
          </div>
          {isStudent ? (
            <>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_CLOCK}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{viewingHours.toFixed(1)}<span className="pf-kpi-unit">h</span></strong>
                  <span className="pf-kpi-label">Learning time</span>
                  <span className="pf-kpi-hint">Actual time watched</span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_MEDAL}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{badgesEarned}/{badgeDefs.length}</strong>
                  <span className="pf-kpi-label">Badges earned</span>
                  <span className="pf-kpi-hint">
                    {badgeDefs.length - badgesEarned > 0 ? `${badgeDefs.length - badgesEarned} more to unlock` : "All unlocked. Great job!"}
                  </span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_TROPHY}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{certCount}</strong>
                  <span className="pf-kpi-label">Certificates</span>
                  <span className="pf-kpi-hint">{certCount > 0 ? `${certCount} exams passed` : "Pass an exam to earn one"}</span>
                </span>
              </div>
            </>
          ) : isTeacher ? (
            <>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_USERS}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{teacherStats ? (teacherStats.subscribers?.totalSubscribers ?? ((teacherStats.subscribers?.subscribers || []).length)) : "—"}</strong>
                  <span className="pf-kpi-label">Subscribers</span>
                  <span className="pf-kpi-hint">Active students</span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_SESSIONS}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{teacherStats ? (Array.isArray(teacherStats.exams) ? teacherStats.exams.reduce((s, e) => s + (Number.isFinite(e.attemptCount) ? e.attemptCount : 0), 0) : "—") : "—"}</strong>
                  <span className="pf-kpi-label">Exam sessions</span>
                  <span className="pf-kpi-hint">All-time submissions</span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_BOOKS}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{teacherStats && Array.isArray(teacherStats.exams) ? teacherStats.exams.length : "—"}</strong>
                  <span className="pf-kpi-label">Assignments</span>
                  <span className="pf-kpi-hint">Published exams</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_GRADCAP}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{teachers.length}</strong>
                  <span className="pf-kpi-label">Teachers</span>
                  <span className="pf-kpi-hint">Across the platform</span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_KEY}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{roles.length}</strong>
                  <span className="pf-kpi-label">Active roles</span>
                  <span className="pf-kpi-hint">Currently enabled</span>
                </span>
              </div>
              <div className="pf-kpi" role="listitem">
                <span className="pf-kpi-icon" aria-hidden="true">{ICON_IDCARD}</span>
                <span className="pf-kpi-body">
                  <strong className="pf-kpi-value">{data.user?.id ?? "—"}</strong>
                  <span className="pf-kpi-label">User ID</span>
                  <span className="pf-kpi-hint">Your account ID</span>
                </span>
              </div>
            </>
          )}
        </section>
        {isStudent ? (
          <>
          <section className="pf-grid pf-grid--learn" aria-label="Learning hours and current course">
            <div className="pf-card pf-chart-card">
              <div className="pf-card-head">
                <div>
                  <h2 className="pf-card-title">Learning hours</h2>
                  <p className="muted small pf-chart-sub">Hours watched and spent in exams · {new Date().getFullYear()}</p>
                </div>
                <div className="pf-toggle" role="group" aria-label="Chart range">
                  <button
                    type="button"
                    className={chartRange === "day" ? "pf-toggle-btn pf-toggle-btn--active" : "pf-toggle-btn"}
                    onClick={() => { setChartRange("day"); setActiveMonth(null); }}
                    aria-pressed={chartRange === "day"}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    className={chartRange === "month" ? "pf-toggle-btn pf-toggle-btn--active" : "pf-toggle-btn"}
                    onClick={() => { setChartRange("month"); setActiveMonth(null); }}
                    aria-pressed={chartRange === "month"}
                  >
                    Monthly
                  </button>
                </div>
              </div>
              <div className="pf-chart-top">
                <p className="muted small pf-legend">
                  <span className="pf-dot pf-dot--watch" aria-hidden="true" /> Watched
                  <span className="pf-dot pf-dot--exam" aria-hidden="true" /> Exams
                </p>
                <span className="pf-chart-total">{viewingHours.toFixed(1)}h total</span>
              </div>
              <div className="pf-chart-row">
                <div className="pf-axis" aria-hidden="true">
                  <span>{bucketMax.toFixed(1)}h</span>
                  <span>{(bucketMax / 2).toFixed(1)}h</span>
                  <span>0</span>
                </div>
                <div
                  className="pf-bars"
                  role="img"
                  aria-label={`Learning hours, total ${viewingHours.toFixed(1)} hours`}
                >
                  {visibleBuckets.map((b, bi) => {
                    const h = b.h;
                    const pct = Math.max(h > 0 ? 8 : 4, Math.round((h / bucketMax) * 100));
                    const isActive =
                      activeMonth != null &&
                      (chartRange === "day" ? activeMonth === bi : activeMonth === visibleOffset + bi);
                    return (
                      <button
                        key={b.label}
                        type="button"
                        className={isActive ? "pf-bar pf-bar--active" : "pf-bar"}
                        style={{ "--fill": `${pct}%` }}
                        onClick={() => setActiveMonth(isActive ? null : focusedFrom(bi))}
                        onMouseEnter={() => setActiveMonth(focusedFrom(bi))}
                        title={`${b.label}: ${h.toFixed(1)}h · ${b.count} activities`}
                        aria-label={`${b.label}: ${h.toFixed(1)} hours, ${b.count} activities`}
                      >
                        {isActive && h > 0 ? <span className="pf-bar-tip" aria-hidden="true">{h.toFixed(1)}h</span> : null}
                        <span className="pf-bar-track"><span className="pf-bar-fill" /></span>
                        <span className="pf-bar-label">{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="pf-chart-foot">
                <div className="pf-chips">
                  <span className="pf-chip"><span className="pf-chip-dot pf-chip-dot--amber" aria-hidden="true" />{viewingHours.toFixed(1)}h watched</span>
                  <span className="pf-chip"><span className="pf-chip-dot pf-chip-dot--check" aria-hidden="true">✓</span>{watchedCount} {watchedCount === 1 ? "Lecture" : "Lectures"} completed</span>
                </div>
                <p className="muted small pf-chart-live" aria-live="polite">
                  {focusedBucket
                    ? `${chartRange === "day" ? "Day" : "Month"} ${focusedBucket.label}: ${focusedBucket.h.toFixed(1)}h across ${focusedBucket.count} activities`
                    : "Hover a bar to see its breakdown"}
                </p>
              </div>
            </div>
            {topCourses.length === 0 ? (
              <div className="pf-card pf-course-card">
                <h2 className="pf-card-title">My Courses</h2>
                <EmptyState title="No courses yet" hint="Subscribe to a teacher to unlock their content." />
                <div className="btn-row">
                  <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teachers")}>
                    Browse teachers
                  </button>
                </div>
              </div>
            ) : (
              topCourses.map((teacher, idx) => {
                const pct = completionPercent == null ? 0 : Math.round(completionPercent);
                // "Up next" line: point at the next lecture index, or the
                // completed-course state. No extra data fetch — derived only.
                const upNextTitle =
                  totalLessons != null && completionPercent != null && completionPercent >= 100
                    ? "Course completed · rewatch any lecture"
                    : totalLessons != null
                      ? `Lecture ${Math.min(watchedCount + 1, totalLessons)} · continue learning`
                      : "Continue learning";
                return (
                  <div key={teacher?.id ?? idx} className="pf-card pf-course-card">
                    <div className="pf-course-top">
                      <span className="eyebrow pf-eyebrow pf-course-eyebrow">Current course</span>
                      <div className="pf-course-actions">
                        <button
                          type="button"
                          className="pf-course-go"
                          aria-label={`Go to ${teacher?.name || "course"}`}
                          onClick={() => teacher?.id != null && navigate(`/content/teacher/${teacher.id}`)}
                        >
                          ↗
                        </button>
                      </div>
                    </div>
                    <h2 className="pf-card-title pf-course-title">
                      {teacher?.subject ? `${teacher.subject} with ${teacher.name}` : (teacher?.name ? `Course with ${teacher.name}` : "My Course")}
                    </h2>
                    <p className="muted small pf-course-meta">
                      {totalLessons == null ? watchedCount : totalLessons} lectures · {watchedCount} completed
                    </p>
                    <div className="pf-tags">
                      {teacher?.subject ? <span className="pf-tag">{teacher.subject}</span> : null}
                      {teacher?.gradeClass ? <span className="pf-tag">{teacher.gradeClass}</span> : null}
                      <span className="pf-tag">{proficiency || "Beginner"}</span>
                    </div>
                    <div className="pf-course-progress">
                      <div className="pf-course-progress-head">
                        <span className="muted small">
                          Progress{totalLessons != null ? ` · ${Math.min(watchedCount, totalLessons)} / ${totalLessons}` : ""}
                        </span>
                        <strong className="pf-pct">{completionPercent == null ? "—" : `${pct}%`}</strong>
                      </div>
                      <div
                        className="pf-progress"
                        role="progressbar"
                        aria-valuenow={completionPercent == null ? 0 : Math.round(completionPercent)}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-label={`${teacher?.name || "Course"} progress`}
                      >
                        <span className="pf-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="pf-next">
                      <span className="pf-next-icon" aria-hidden="true">{ICON_PLAY}</span>
                      <span className="pf-next-text">
                        <span className="pf-next-label">Up next</span>
                        <strong>{upNextTitle}</strong>
                      </span>
                      <button
                        type="button"
                        className="btn pf-btn-amber pf-btn-sm-am"
                        onClick={() => teacher?.id != null && navigate(`/content/teacher/${teacher.id}`)}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
          <section className="pf-grid pf-grid--trophies" aria-label="Badges and certificates">
            <div className="pf-card pf-badges-card">
              <div className="pf-card-head">
                <div>
                  <h2 className="pf-card-title">Earned badges</h2>
                  <p className="muted small pf-card-sub">
                    {badgesEarned} of {badgeDefs.length} unlocked · keep going to collect them all
                  </p>
                </div>
                <span className="pf-count-pill pf-count-pill--soft"><span aria-hidden="true">✦</span> {badgesEarned} earned</span>
              </div>
              <div className="pf-badges-grid">
                {badgeDefs.map((b) => {
                  const p = badgeProgress[b.id] ?? 0;
                  const progressLabel =
                    b.id === "dedicated"
                      ? `${Math.min(watchedCount, 5)} / 5`
                      : b.id === "scholar"
                        ? (average == null ? "—" : `${average.toFixed(1)} / 70`)
                        : b.id === "marathon"
                          ? `${Math.min(viewingHours, 10).toFixed(1)} / 10h`
                          : "0 / 1";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={b.earned ? "pf-badge pf-badge--earned" : "pf-badge pf-badge--locked"}
                      title={`${b.title} — ${b.hint}`}
                      aria-label={`${b.title}: ${b.earned ? "earned" : "locked"} — ${b.hint}`}
                      onClick={() => navigate("/history")}
                    >
                      <span className="pf-badge-icon" aria-hidden="true">
                        {b.earned ? <span className="pf-badge-glyph">{b.icon}</span> : ICON_LOCK}
                      </span>
                      <strong className="pf-badge-title">{b.title}</strong>
                      <span className="muted small pf-badge-hint">{b.hint}</span>
                      {b.earned ? (
                        <span className="pf-badge-state pf-badge-state--on" aria-hidden="true">✓ Unlocked</span>
                      ) : (
                        <span className="pf-badge-state" aria-hidden="true">
                          <span className="pf-badge-progress-label">Progress</span>
                          <span className="pf-badge-progress"><span style={{ width: `${Math.round(p * 100)}%` }} /></span>
                          <span className="muted small pf-badge-progress-label">{progressLabel}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {nextBadge ? (
                <div className="pf-next-badge">
                  <span className="pf-next-badge-icon" aria-hidden="true"><span className="pf-badge-glyph">{nextBadge.icon}</span></span>
                  <span className="pf-next-badge-text">
                    <span className="pf-next-badge-label">Next badge</span>
                    <strong>{nextBadge.title} · {nextBadgeMsg}</strong>
                    <span className="pf-next-badge-bar"><span style={{ width: `${Math.round((badgeProgress[nextBadge.id] ?? 0) * 100)}%` }} /></span>
                  </span>
                  <button
                    type="button"
                    className="btn pf-btn-amber pf-btn-sm-am"
                    onClick={() => navigate("/my-lectures")}
                  >
                    Go to lectures
                  </button>
                </div>
              ) : null}
            </div>
            <div className="pf-card pf-certs-card">
              <div className="pf-card-head">
                <div>
                  <h2 className="pf-card-title">Certificates</h2>
                  <p className="muted small pf-card-sub">{certCount} earned · download or share</p>
                </div>
              </div>
              {passedExams.length === 0 ? (
                <p className="muted small">Pass an exam (≥ 50%) to earn your first certificate.</p>
              ) : (
                <>
                  <ul className="pf-certs-list">
                    {passedExams.slice(0, 4).map((a) => (
                      <li key={`cert-${a.examId}`}>
                        <button
                          type="button"
                          className="pf-cert"
                          onClick={() => navigate("/history")}
                          title={`View ${a.examTitle || `Exam #${a.examId}`} result`}
                        >
                          <span className="pf-cert-icon" aria-hidden="true">{ICON_MEDAL}</span>
                          <span className="pf-cert-text">
                            <strong>{a.examTitle || `Exam #${a.examId}`}</strong>
                            <span className="muted small">
                              Passed {formatDay(a.submittedAt)}{typeof a.percent === "number" ? ` · ${a.percent}%` : ""}
                            </span>
                          </span>
                          <span className="pf-cert-dl" aria-hidden="true" title="Opens your full history where this certificate lives.">
                            {ICON_DOWNLOAD}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="pf-view-all" onClick={() => navigate("/history")}>
                    View all {certCount} certificate{certCount === 1 ? "" : "s"}
                    <span aria-hidden="true">›</span>
                  </button>
                </>
              )}
            </div>
          </section>
          </> ) : null}
      <div className="form-card pf-legacy">
        <div className="account-hero" style={{ display: "none" }} aria-hidden="true">
          <span
            className="brand-mark"
            aria-hidden="true"
            style={{ width: "56px", height: "56px", fontSize: "1.6rem", flexShrink: 0 }}
          >
            {(data.user?.username || "?").trim().slice(0, 2).toUpperCase() || "?"}
          </span>
          <div className="account-id">
            <strong className="account-username">{data.user?.username}</strong>
            <span className="muted small">User ID: {data.user?.id}</span>
          </div>
          <span className={isAdmin ? "role-badge role-badge--admin" : "role-badge"}>{data.user?.userType}</span>
        </div>
        {isAdmin ? (
          <>
            <h2>Administration</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Full platform control — teachers, subscriptions, income, and the audit log.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/admin/dashboard")}>
                Admin dashboard
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/teachers")}>
                Teachers
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/subscribers")}>
                All Subscribers
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/income")}>
                Platform Income
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/logs")}>
                Log History
              </button>
            </div>
          </>
        ) : null}
        {/* Subscriptions apply to students only — admins never subscribe. */}
        {isStudent ? (
          <>
            <div className="pf-heading-row pf-heading-row--first">
              <h2>Active subscriptions</h2>
            </div>
            {roles.length === 0 ? (
              <EmptyState title="No active subscriptions" hint="Subscribe to a teacher to unlock their content." />
            ) : (
              <div className="teacher-sub-list">
                {roles.map((role) => {
                  const teacher = teacherByRole[role];
                  if (!teacher) {
                    return (
                      <div key={role} className="teacher-sub-card">
                        <span className="brand-mark" aria-hidden="true">E</span>
                        <div className="teacher-sub-info">
                          <strong>{role}</strong>
                        </div>
                      </div>
                    );
                  }
                  const initial = teacher.name ? teacher.name.trim().charAt(0).toUpperCase() : "M";
                  return (
                    <div key={role} className="teacher-sub-card">
                      <span className="brand-mark" aria-hidden="true">{initial}</span>
                      <div className="teacher-sub-info">
                        <strong>
                          <span className="muted">Mr. </span>
                          <span>{teacher.name}</span>
                        </strong>
                        <span className="muted small">Subject: {teacher.subject || "—"}{teacher.gradeClass ? ` · ${teacher.gradeClass}` : ""}</span>
                      </div>
                      <div className="teacher-sub-actions">
                        <span className="pf-pill-ok">Active subscription</span>
                        <button
                          type="button"
                          className="btn pf-btn-amber pf-btn-sm-am"
                          onClick={() => teacher?.id != null && navigate(`/content/teacher/${teacher.id}`)}
                        >
                          View lectures
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
        {isStudent ? (
          <>
            <div className="pf-heading-row">
              <h2>Learning statistics</h2>
              <span className="pf-readonly" role="note">
                <span className="pf-readonly-icon" aria-hidden="true">{ICON_LOCK}</span>
                Read-only
              </span>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Updated automatically from your exams and class attendance. These figures are read-only
              and cannot be edited here.
            </p>
            <div className="pf-stats-band">
              <div className="pf-stats-band-left">
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="pf-stat-head">
                      <span className="pf-sicon" aria-hidden="true">{ICON_PLAY}</span>
                      <span className="stat-card-label">Lectures watched</span>
                    </span>
                    <strong className="stat-card-value">{watchedCount}</strong>
                    <span className="muted small">Completed lectures</span>
                  </div>
                  <div className="stat-card">
                    <span className="pf-stat-head">
                      <span className="pf-sicon" aria-hidden="true">{ICON_BOOK}</span>
                      <span className="stat-card-label">Remaining sessions</span>
                    </span>
                    <strong className="stat-card-value">{remainingCount == null ? "—" : remainingCount}</strong>
                    <span className="muted small">{totalLessons == null ? "No total assigned yet" : `Of ${totalLessons} total`}</span>
                  </div>
                  <div className="stat-card">
                    <span className="pf-stat-head">
                      <span className="pf-sicon" aria-hidden="true">{ICON_CLOCK}</span>
                      <span className="stat-card-label">Viewing time</span>
                    </span>
                    <strong className="stat-card-value">{viewingHours.toFixed(1)}h</strong>
                    <span className="muted small">Actual time watched</span>
                  </div>
                  <div className="stat-card">
                    <span className="pf-stat-head">
                      <span className="pf-sicon" aria-hidden="true">{ICON_MEDAL}</span>
                      <span className="stat-card-label">Score average</span>
                    </span>
                    <strong className="stat-card-value">{average == null ? "—" : `${average.toFixed(1)}%`}</strong>
                    <span className="muted small">
                      {proficiency ? <span className="pf-pill-am">{proficiency}</span> : `From ${examAttempts.length} exams`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pf-stats-band-right">
                <div className="gauge-row">
                  <Gauge
                    label="Completion"
                    percent={completionPercent}
                    centerTop={completionPercent == null ? "—" : `${Math.round(completionPercent)}%`}
                    centerBottom={totalLessons == null ? "no total yet" : `${watchedCount}/${totalLessons}`}
                  />
                  <Gauge
                    label="Score average"
                    percent={average}
                    centerTop={average == null ? "—" : `${average.toFixed(1)}%`}
                    centerBottom={average == null ? `${examAttempts.length} exams` : "average"}
                  />
                </div>
              </div>
            </div>
            </>
          ) : null}
      </div>
      {isStudent ? (
        <>
          <div className="form-card pf-legacy">
            {/* Integrated lecture journey activity (additive — tracked watches + exam results). */}
            <div className="pf-heading-row pf-heading-row--first">
              <h2>Lecture journey</h2>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Lectures unlock in order: pass each exam (≥ 50%) to open its material and video. Watching is recorded here alongside exam results.
            </p>
            {examAttempts.length === 0 && lectureWatches.length === 0 ? (
              <EmptyState title="No lecture activity yet" hint="Open a lecture, pass its exam, then watch the video — it will appear here." />
            ) : (
              <>
                {timelineSteps.length > 0 ? (
                  <ol className="pf-timeline" aria-label="Recent learning journey">
                    {timelineSteps.map((step) => {
                      const JourneyDot = step.kind === "watch" ? ICON_PLAY : step.ok ? ICON_CHECK : ICON_ALERT;
                      return (
                        <li key={step.key} className={step.ok ? "pf-step pf-step--done" : "pf-step"}>
                          <span className="pf-step-marker" aria-hidden="true">{JourneyDot}</span>
                          <span className="pf-step-body">
                            <strong className="pf-step-title" title={step.title}>{step.title}</strong>
                            <span className="muted small pf-step-date">
                              {step.at ? formatDay(step.at) : "—"}
                              {step.badge ? ` · ${step.badge}` : ""}
                            </span>
                            <span className="pf-step-pill">{step.ok ? "Done" : "Up next · pass the exam"}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
                <div className="pf-journey-head">
                  <div className="pf-jtabs" role="group" aria-label="Filter activities">
                    {journeyTabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={journeyTab === t.id ? "pf-jtab pf-jtab--active" : "pf-jtab"}
                        aria-pressed={journeyTab === t.id}
                        onClick={() => setJourneyTab(t.id)}
                      >
                        {t.label}
                        <span className="pf-jtab-count">{t.count}</span>
                      </button>
                    ))}
                  </div>
                  <span className="muted small pf-journey-showing">Showing the latest {journeyShown} activities</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <caption className="muted small">Exams + watched lectures</caption>
                    <thead><tr><th scope="col">Activity</th><th scope="col">Score</th><th scope="col">Date</th></tr></thead>
                    <tbody>
                      {journeyVisibleExams.map((a) => (
                        <tr key={`exam-${a.examId}`}>
                          <td>
                            <span className="pf-act-cell">
                              <span className="pf-act-pill pf-act-pill--exam" aria-hidden="true"><span className="pf-act-ico">{ICON_CLOCK}</span>Exam</span>
                              <strong className="pf-act-title">{a.examTitle || `Exam #${a.examId}`}</strong>
                            </span>
                          </td>
                          <td>
                            {typeof a.percent === "number" ? (
                              <span className="pf-score-cell">
                                <strong>{Math.round(a.percent)}%</strong>
                                <span className="pf-score-bar"><span className="pf-score-fill" style={{ width: `${Math.min(Math.max(a.percent, 0), 100)}%` }} /></span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span className="pf-date-cell">
                              <span>{formatDay(a.submittedAt)}</span>
                              <span className={typeof a.percent === "number" && a.percent >= 50 ? "pf-row-ok" : "pf-row-ok pf-row-ok--muted"} aria-hidden="true">{ICON_CHECK}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {journeyVisibleWatches.map((w) => (
                        <tr key={`watch-${w.id}`}>
                          <td>
                            <span className="pf-act-cell">
                              <span className="pf-act-pill pf-act-pill--watch" aria-hidden="true"><span className="pf-act-ico">{ICON_PLAY}</span>Watched</span>
                              <strong className="pf-act-title">{(w.details && (w.details.lectureTitle || `Lecture ${w.targetId}`)) || `Lecture ${w.targetId}`}</strong>
                            </span>
                          </td>
                          <td className="muted">—</td>
                          <td>
                            <span className="pf-date-cell">
                              <span>{formatDay(w.timestamp)}</span>
                              <span className="pf-row-ok" aria-hidden="true">{ICON_CHECK}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
        ) : null}
        {isTeacher ? (
          <>
            <div className="form-card pf-legacy">
            <h2>Teaching statistics</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Same live style as the student statistics — subscribers, exam sessions, assignments and
              grade percentages update automatically whenever they change.
            </p>
            {teacherStatsLoading && !teacherStats ? (
              <Loader label="Loading teaching statistics..." />
            ) : teacherStatsError && !teacherStats ? (
              <ErrorBox error={teacherStatsError} onRetry={() => window.location.reload()} />
            ) : teacherStats ? (
              <TeacherStatistics
                dashboard={teacherStats.dashboard}
                subscribers={teacherStats.subscribers}
                exams={teacherStats.exams}
              />
            ) : null}
            </div>
          </>
        ) : null}
      <div className="form-card pf-legacy" ref={accountSettingsRef}>
        <div className="pf-heading-row pf-heading-row--first">
          <h2>Change password</h2>
          <span className="pf-key-badge" aria-hidden="true">{ICON_KEY}</span>
        </div>
        <p className="muted small pf-pw-subtitle" style={{ marginTop: 0 }}>
          Use at least 8 characters with letters, numbers, and a symbol!
        </p>
        {changeDone ? <div className="alert alert-success" role="status">{changeDone}</div> : null}
        {changeError ? <div className="alert alert-error" role="alert">{changeError.message}</div> : null}
        {confirmMismatch && !changeError ? (
          <div className="alert alert-error" role="alert">Passwords don't match — re-enter the new password in both fields.</div>
        ) : null}
        <form onSubmit={handleChangePassword} className="pf-password-form">
          <label className="field">
            <span>Current password</span>
            <span className="pf-input">
              <span className="pf-input-icon" aria-hidden="true">{ICON_KEY}</span>
              <input
                id="pf-current-password"
                type={pwVisible.current ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="pf-eye"
                onClick={() => setPwVisible((v) => ({ ...v, current: !v.current }))}
                aria-label="Reveal current entry"
                title="Show or hide the characters"
              >
                {pwVisible.current ? ICON_EYE_OFF : ICON_EYE}
              </button>
            </span>
          </label>
          <label className="field">
            <span>New password</span>
            <span className="pf-input">
              <span className="pf-input-icon" aria-hidden="true">{ICON_KEY}</span>
              <input
                id="pf-new-password"
                type={pwVisible.next ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="pf-eye"
                onClick={() => setPwVisible((v) => ({ ...v, next: !v.next }))}
                aria-label="Reveal new entry"
                title="Show or hide the characters"
              >
                {pwVisible.next ? ICON_EYE_OFF : ICON_EYE}
              </button>
            </span>
            <span className="pf-strength" title="Password strength" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i < pwScore ? "pf-strength-seg pf-strength-on" : "pf-strength-seg"} />
              ))}
            </span>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <span className="pf-input">
              <span className="pf-input-icon" aria-hidden="true">{ICON_KEY}</span>
              <input
                id="pf-confirm-password"
                type={pwVisible.confirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmMismatch) setConfirmMismatch(false);
                }}
                autoComplete="new-password"
                placeholder="Re-enter new password"
              />
              <button
                type="button"
                className="pf-eye"
                onClick={() => setPwVisible((v) => ({ ...v, confirm: !v.confirm }))}
                aria-label="Reveal confirmation"
                title="Show or hide the characters"
              >
                {pwVisible.confirm ? ICON_EYE_OFF : ICON_EYE}
              </button>
            </span>
          </label>
          <button type="submit" className="btn pf-btn-amber" disabled={changing}>
            {changing ? "Changing..." : "Update password"}
          </button>
        </form>
        <div className="pf-pw-note" role="note">
          <span className="pf-pw-note-icon" aria-hidden="true">{ICON_INFO}</span>
          <span>
            You'll stay logged in on this device; other devices will be asked to log in again.
            Pick a strong password you don't use anywhere else.
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
