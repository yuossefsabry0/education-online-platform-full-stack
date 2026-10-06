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
  const [chartRange, setChartRange] = useState("year");
  const [activeMonth, setActiveMonth] = useState(null);
  // Live linkage (additive): timestamp of the last dashboard sync + throttle
  // guard so background focus/visibility events never spam the backend.
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const lastAutoRefreshRef = useRef(0);

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangeError(null);
    setChangeDone(null);
    setChanging(true);
    try {
      const result = await endpoints.changePassword({ currentPassword, newPassword });
      const doneMessage = result.message || "Password changed. Please log in again.";
      setChangeDone(doneMessage);
      setCurrentPassword("");
      setNewPassword("");
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
  const maxMonthHours = Math.max(1, ...monthHours);
  const visibleMonths = chartRange === "half" ? MONTH_LABELS.slice(-6) : MONTH_LABELS;
  const visibleOffset = chartRange === "half" ? 6 : 0;
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
    { id: "first", icon: "🎓", title: "First Lesson", hint: "Complete your first course", earned: watchedCount >= 1 },
    { id: "explorer", icon: "📚", title: "Explorer", hint: `Watched ${watchedCount} lessons`, earned: watchedCount >= 5 },
    { id: "scholar", icon: "⭐", title: "Scholar", hint: average == null ? "Score 70%+ average" : `${average.toFixed(1)}% average`, earned: average != null && average >= 70 },
    { id: "streak", icon: "🔥", title: `${Math.max(streakDays, 5)}-Day Streak`, hint: streakDays > 0 ? `Learned ${streakDays} day${streakDays === 1 ? "" : "s"} in a row` : "Learn 5 days in a row", earned: streakDays >= 5 || watchedCount >= 5 },
  ];
  const badgesEarned = badgeDefs.filter((b) => b.earned).length;
  const topCourses = (Array.isArray(teachers) ? teachers : []).slice(0, 2);
  const subtitleText = isStudent
    ? (streakDays > 1 ? `Keep learning and earn more XP today. You're on a ${streakDays}-day streak!` : "Keep learning and earn more XP today. You're doing great!")
    : isTeacher
      ? "Your teaching impact at a glance — subscribers, sessions and grades update live."
      : isAdmin
        ? "Full platform control — teachers, subscriptions, income, and the audit log."
        : "Your account overview.";
  return (
    <div className="page profile-wide">
      <div className="pf-shell">
        <header className="pf-top">
          <div className="pf-titleblock">
            <h1 className="pf-title">{isStudent ? "My Progress" : "Profile"}</h1>
            <p className="muted small pf-subtitle">{subtitleText}</p>
            {isStudent ? (
              <p className="pf-live" role="status" aria-live="polite">
                <span className="pf-live-dot" aria-hidden="true" />
                Live · updates automatically
                {liveUpdatedAt ? ` · Updated ${liveUpdatedAt.toLocaleTimeString()}` : ""}
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
                  Refresh now
                </button>
              </p>
            ) : null}
            <div className="account-hero pf-identity">
              <span
                className="brand-mark pf-avatar"
                aria-hidden="true"
              >
                {(data.user?.username || "?").trim().slice(0, 2).toUpperCase() || "?"}
              </span>
              <div className="account-id">
                <strong className="account-username">{data.user?.username}</strong>
                <span className="muted small">User ID: {data.user?.id}</span>
              </div>
              <span className={isAdmin ? "role-badge role-badge--admin" : "role-badge"}>{data.user?.userType}</span>
            </div>
          </div>
          <div className="pf-kpis" role="list" aria-label="Progress summary">
            {isStudent ? (
              <>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{viewingHours.toFixed(1)}h</strong>
                  <span className="muted small">Learning time</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{badgesEarned}</strong>
                  <span className="muted small">Badges earned</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{certCount}</strong>
                  <span className="muted small">Certificates</span>
                </div>
              </>
            ) : isTeacher ? (
              <>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{teacherStats ? (teacherStats.subscribers?.totalSubscribers ?? ((teacherStats.subscribers?.subscribers || []).length)) : "—"}</strong>
                  <span className="muted small">Subscribers</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{teacherStats ? (Array.isArray(teacherStats.exams) ? teacherStats.exams.reduce((s, e) => s + (Number.isFinite(e.attemptCount) ? e.attemptCount : 0), 0) : "—") : "—"}</strong>
                  <span className="muted small">Exam sessions</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{teacherStats && Array.isArray(teacherStats.exams) ? teacherStats.exams.length : "—"}</strong>
                  <span className="muted small">Assignments</span>
                </div>
              </>
            ) : (
              <>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{teachers.length}</strong>
                  <span className="muted small">Teachers</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{roles.length}</strong>
                  <span className="muted small">Active roles</span>
                </div>
                <div className="pf-kpi" role="listitem">
                  <strong className="pf-kpi-value">{data.user?.id ?? "—"}</strong>
                  <span className="muted small">User ID</span>
                </div>
              </>
            )}
          </div>
        </header>
        {isStudent ? (
          <section className="pf-grid" aria-label="Progress overview">
            <div className="pf-card pf-chart-card">
              <div className="pf-card-head">
                <div>
                  <h2 className="pf-card-title">Learning Hours</h2>
                  <p className="muted small pf-legend">
                    <span className="pf-dot pf-dot--watch" aria-hidden="true" /> Watched
                    <span className="pf-dot pf-dot--exam" aria-hidden="true" /> Exams
                    <span className="pf-legend-sep">·</span> {viewingHours.toFixed(1)}h total
                  </p>
                </div>
                <div className="pf-toggle" role="group" aria-label="Chart range">
                  <button
                    type="button"
                    className={chartRange === "half" ? "pf-toggle-btn pf-toggle-btn--active" : "pf-toggle-btn"}
                    onClick={() => { setChartRange("half"); setActiveMonth(null); }}
                    aria-pressed={chartRange === "half"}
                  >
                    6M
                  </button>
                  <button
                    type="button"
                    className={chartRange === "year" ? "pf-toggle-btn pf-toggle-btn--active" : "pf-toggle-btn"}
                    onClick={() => { setChartRange("year"); setActiveMonth(null); }}
                    aria-pressed={chartRange === "year"}
                  >
                    Monthly
                  </button>
                </div>
              </div>
              <div className="pf-bars" role="img" aria-label={`Monthly learning hours, total ${viewingHours.toFixed(1)} hours`}>
                {visibleMonths.map((label, vi) => {
                  const mi = visibleOffset + vi;
                  const h = monthHours[mi];
                  const pct = Math.max(h > 0 ? 8 : 4, Math.round((h / maxMonthHours) * 100));
                  const isActive = activeMonth === mi;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={isActive ? "pf-bar pf-bar--active" : "pf-bar"}
                      style={{ "--fill": `${pct}%` }}
                      onClick={() => setActiveMonth(isActive ? null : mi)}
                      onMouseEnter={() => setActiveMonth(mi)}
                      title={`${label}: ${h.toFixed(1)}h · ${monthCount[mi]} activities`}
                      aria-label={`${label}: ${h.toFixed(1)} hours, ${monthCount[mi]} activities`}
                    >
                      <span className="pf-bar-track"><span className="pf-bar-fill" /></span>
                      <span className="pf-bar-label">{label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="muted small pf-chart-foot" aria-live="polite">
                {activeMonth != null
                  ? `${MONTH_LABELS[activeMonth]}: ${monthHours[activeMonth].toFixed(1)}h across ${monthCount[activeMonth]} activities`
                  : `Actual time watched · ${watchedCount} lessons completed`}
              </p>
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
                return (
                  <div key={teacher?.id ?? idx} className="pf-card pf-course-card">
                    <div className="pf-course-top">
                      <button
                        type="button"
                        className="pf-course-more"
                        aria-label={`Open ${teacher?.name || "course"}`}
                        onClick={() => teacher?.id != null && navigate(`/content/teacher/${teacher.id}`)}
                      >
                        ⋯
                      </button>
                      <button
                        type="button"
                        className="pf-course-go"
                        aria-label={`Go to ${teacher?.name || "course"}`}
                        onClick={() => teacher?.id != null && navigate(`/content/teacher/${teacher.id}`)}
                      >
                        ↗
                      </button>
                    </div>
                    <h2 className="pf-card-title pf-course-title">
                      {teacher?.subject ? `${teacher.subject}${teacher?.name ? ` with ${teacher.name}` : ""}` : (teacher?.name ? `Course with ${teacher.name}` : "My Course")}
                    </h2>
                    <p className="muted small pf-course-meta">
                      {watchedCount} Hours · {totalLessons == null ? `${watchedCount} Lessons` : `${totalLessons} Lessons`}
                    </p>
                    <div className="pf-tags">
                      <span className="pf-tag">{proficiency || "Beginner"}</span>
                      {teacher?.subject ? <span className="pf-tag">{teacher.subject}</span> : null}
                      {teacher?.gradeClass ? <span className="pf-tag">{teacher.gradeClass}</span> : <span className="pf-tag">Lessons</span>}
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
                    <div className="pf-course-foot">
                      <span className="muted small">{completionPercent == null ? "OnProgress" : `OnProgress · ${watchedCount}/${totalLessons ?? watchedCount}`}</span>
                      <strong className="pf-pct">{completionPercent == null ? "—" : `${pct}%`}</strong>
                    </div>
                  </div>
                );
              })
            )}
            <div className="pf-card pf-badges-card">
              <h2 className="pf-card-title">Earned Badges</h2>
              <div className="pf-badges-grid">
                {badgeDefs.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={b.earned ? "pf-badge pf-badge--earned" : "pf-badge pf-badge--locked"}
                    title={`${b.title} — ${b.hint}`}
                    aria-label={`${b.title}: ${b.earned ? "earned" : "locked"} — ${b.hint}`}
                    onClick={() => navigate("/history")}
                  >
                    <span className="pf-badge-icon" aria-hidden="true">{b.earned ? b.icon : "🔒"}</span>
                    <strong className="pf-badge-title">{b.earned ? b.title : "Locked"}</strong>
                    <span className="muted small pf-badge-hint">{b.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pf-card pf-certs-card">
              <h2 className="pf-card-title">Certificates</h2>
              {passedExams.length === 0 ? (
                <p className="muted small">Pass an exam (≥ 50%) to earn your first certificate.</p>
              ) : (
                <ul className="pf-certs-list">
                  {passedExams.slice(0, 4).map((a) => (
                    <li key={`cert-${a.examId}`}>
                      <button
                        type="button"
                        className="pf-cert"
                        onClick={() => navigate("/history")}
                        title={`View ${a.examTitle || `Exam #${a.examId}`} result`}
                      >
                        <span className="pf-cert-icon" aria-hidden="true">🎖️</span>
                        <span className="pf-cert-text">
                          <strong>{a.examTitle || `Exam #${a.examId}`}</strong>
                          <span className="muted small">
                            Issued {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : "recently"} · {typeof a.percent === "number" ? `${a.percent}%` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
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
            <h2>Active subscriptions</h2>
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
                      <span className="role-badge">Subscribed</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
        {isStudent ? (
          <>
            <h2>Learning statistics</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Updated automatically from your exams and class attendance. These figures are read-only
              and cannot be edited here.
            </p>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-card-label">Lessons watched</span>
                <strong className="stat-card-value">{watchedCount}</strong>
                <span className="muted small">Completed lessons</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Remaining lessons</span>
                <strong className="stat-card-value">{remainingCount == null ? "—" : remainingCount}</strong>
                <span className="muted small">{totalLessons == null ? "No total assigned yet" : `Of ${totalLessons} total`}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Viewing time</span>
                <strong className="stat-card-value">{viewingHours.toFixed(1)}h</strong>
                <span className="muted small">Actual time watched</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-label">Score average</span>
                <strong className="stat-card-value">{average == null ? "—" : `${average.toFixed(1)}%`}</strong>
                <span className="muted small">
                  {proficiency ? <span className="role-badge">{proficiency}</span> : `From ${examAttempts.length} exams`}
                </span>
              </div>
            </div>
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
                centerBottom={proficiency ?? `${examAttempts.length} exams`}
              />
            </div>
            {/* Integrated lecture journey activity (additive — tracked watches + exam results). */}
            <h3 style={{ marginBottom: "0.25rem" }}>Lecture journey</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Lectures unlock in order: pass each exam (≥ 50%) to open its material and video. Watching is recorded here alongside exam results.
            </p>
            {examAttempts.length === 0 && lectureWatches.length === 0 ? (
              <EmptyState title="No lecture activity yet" hint="Open a lecture, pass its exam, then watch the video — it will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="muted small">Exams + watched lectures</caption>
                  <thead><tr><th scope="col">Activity</th><th scope="col">Score / Date</th></tr></thead>
                  <tbody>
                    {examAttempts.slice(0, 10).map((a) => (
                      <tr key={`exam-${a.examId}`}>
                        <td>Exam — {a.examTitle || `#${a.examId}`}{typeof a.percent === "number" && a.percent >= 50 ? " ✓" : ""}</td>
                        <td>{typeof a.percent === "number" ? `${a.percent}%` : "—"}{a.submittedAt ? ` · ${new Date(a.submittedAt).toLocaleDateString()}` : ""}</td>
                      </tr>
                    ))}
                    {lectureWatches.map((w) => (
                      <tr key={`watch-${w.id}`}>
                        <td>Watched — {(w.details && (w.details.lectureTitle || `Lecture ${w.targetId}`)) || `Lecture ${w.targetId}`} ✓</td>
                        <td>{w.timestamp ? new Date(w.timestamp).toLocaleDateString() : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
        {isTeacher ? (
          <>
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
          </>
        ) : null}
        <h2>Change password</h2>
        {changeDone ? <div className="alert alert-success" role="status">{changeDone}</div> : null}
        {changeError ? <div className="alert alert-error" role="alert">{changeError.message}</div> : null}
        <form onSubmit={handleChangePassword}>
          <label className="field">
            <span>Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
          </label>
          <button type="submit" className="btn btn-dark" disabled={changing}>
            {changing ? "Changing..." : "Change password"}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
