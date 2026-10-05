import { useEffect, useState } from "react";
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
  // Teaching statistics (additive, teacher profile only): same live component as
  // the teacher dashboard Statistics tab, fed by the teacher endpoints.
  const [teacherStats, setTeacherStats] = useState(null);
  const [teacherStatsLoading, setTeacherStatsLoading] = useState(false);
  const [teacherStatsError, setTeacherStatsError] = useState(null);

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
  const totalLessons = learningStats.totalLessons;
  const remainingCount = totalLessons != null ? Math.max(totalLessons - watchedCount, 0) : null;
  const completionPercent = totalLessons != null && totalLessons > 0
    ? Math.min((watchedCount / totalLessons) * 100, 100)
    : null;
  return (
    <div className="page page-narrow">
      <h1>Profile</h1>
      <div className="form-card">
        <div className="account-hero">
          <span
            className="brand-mark"
            aria-hidden="true"
            style={{ width: "56px", height: "56px", fontSize: "1.6rem", flexShrink: 0 }}
          >
            {(data.user?.username || "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="account-id">
            <strong className="account-username">{data.user?.username}</strong>
            <span className="muted small">User ID: {data.user?.id}</span>
          </div>
          <span className="role-badge">{data.user?.userType}</span>
        </div>
        {/* Subscriptions apply to students only — hidden for teacher accounts. */}
        {!isTeacher ? (
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
  );
}
