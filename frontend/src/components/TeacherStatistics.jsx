import { useEffect, useMemo, useState } from "react";
import { endpoints } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "./ui.jsx";

const PASS_PERCENT = 50;

// Same circular gauge as the student profile (identical classes/markup):
// surrounding progress ring fills with the percentage, value inside the circle.
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

// Teacher statistics mirroring the student profile style (additive — the top
// stat rows and every tab are untouched). Every figure derives live from the
// dashboard props (content, subscribers, exams) plus per-exam grades, so it
// recomputes automatically whenever that data changes; grades refetch whenever
// the exam list changes or the teacher hits Refresh.
export default function TeacherStatistics({ dashboard, subscribers, exams }) {
  const [gradesByExam, setGradesByExam] = useState({});
  const [gradesTick, setGradesTick] = useState(0);

  const examIdsKey = useMemo(
    () => (Array.isArray(exams) ? exams.map((e) => e.id).sort((a, b) => a - b).join(",") : ""),
    [exams]
  );

  useEffect(() => {
    if (!examIdsKey) {
      setGradesByExam({});
      return;
    }
    let cancelled = false;
    async function loadGrades() {
      const ids = examIdsKey.split(",").map(Number);
      setGradesByExam((prev) => {
        const next = {};
        for (const id of ids) next[id] = prev[id] || { loading: true, error: null, grades: null };
        return next;
      });
      await Promise.all(
        ids.map(async (id) => {
          try {
            const data = await endpoints.teacherExamGrades(id);
            if (!cancelled) {
              setGradesByExam((prev) => ({ ...prev, [id]: { loading: false, error: null, grades: data.grades || [] } }));
            }
          } catch (err) {
            if (!cancelled) {
              setGradesByExam((prev) => ({ ...prev, [id]: { loading: false, error: err, grades: null } }));
            }
          }
        })
      );
    }
    loadGrades();
    return () => {
      cancelled = true;
    };
  }, [examIdsKey, gradesTick]);

  const stats = useMemo(() => {
    const sections = (dashboard && dashboard.sections) || [];
    const allContent = sections.flatMap((s) => s.content || []);
    const lectures = allContent.filter((c) => c.type === "LECTURE");
    const publishedCount = allContent.filter((c) => c.isPublished !== false).length;
    const publishedPercent = allContent.length === 0 ? null : (publishedCount / allContent.length) * 100;

    const examList = Array.isArray(exams) ? exams : [];
    const lecturesWithExam = new Set(examList.map((e) => Number(e.lessonContentId)).filter((n) => Number.isFinite(n)));
    const coveragePercent =
      lectures.length === 0 ? null : (lectures.filter((l) => lecturesWithExam.has(Number(l.id))).length / lectures.length) * 100;

    const sessions = examList.reduce((s, e) => s + (Number.isFinite(e.attemptCount) ? e.attemptCount : 0), 0);
    const subscriberCount = subscribers && typeof subscribers.totalSubscribers === "number"
      ? subscribers.totalSubscribers
      : ((subscribers && subscribers.subscribers) || []).length;

    const allPercents = [];
    const perExam = examList.map((exam) => {
      const entry = gradesByExam[exam.id];
      const grades = entry && Array.isArray(entry.grades) ? entry.grades : null;
      const percents = grades
        ? grades.map((g) => g.percent).filter((p) => Number.isFinite(p))
        : [];
      for (const p of percents) allPercents.push(p);
      const avg = percents.length === 0 ? null : percents.reduce((s, p) => s + p, 0) / percents.length;
      const passed = percents.filter((p) => p >= PASS_PERCENT).length;
      return {
        id: exam.id,
        title: exam.title,
        sessions: exam.attemptCount ?? 0,
        avg,
        passPercent: percents.length === 0 ? null : (passed / percents.length) * 100,
        loading: !entry || entry.loading,
      };
    });
    const averageGrade = allPercents.length === 0 ? null : allPercents.reduce((s, p) => s + p, 0) / allPercents.length;
    const passRate =
      allPercents.length === 0 ? null : (allPercents.filter((p) => p >= PASS_PERCENT).length / allPercents.length) * 100;

    return {
      lectures: lectures.length,
      contentItems: allContent.length,
      publishedPercent,
      coveragePercent,
      sessions,
      subscriberCount,
      assignments: examList.length,
      averageGrade,
      passRate,
      perExam,
      attempts: allPercents.length,
    };
  }, [dashboard, subscribers, exams, gradesByExam]);

  const gradesLoading = stats.perExam.some((p) => p.loading);
  const gradesError = Object.values(gradesByExam).some((e) => e && e.error);

  return (
    <div>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>Teaching statistics</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Linked live to your subscribers, exam sessions and assignment grades — updates automatically whenever they change.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGradesTick((t) => t + 1)}>
          Refresh grades
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card-label">Subscribers</span>
          <strong className="stat-card-value">{stats.subscriberCount}</strong>
          <span className="muted small">Students viewing lessons</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Exam sessions</span>
          <strong className="stat-card-value">{stats.sessions}</strong>
          <span className="muted small">Completed exam sittings</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Assignments</span>
          <strong className="stat-card-value">{stats.assignments}</strong>
          <span className="muted small">Published exams</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Grade average</span>
          <strong className="stat-card-value">{stats.averageGrade == null ? "—" : `${stats.averageGrade.toFixed(1)}%`}</strong>
          <span className="muted small">{stats.attempts === 0 ? "No sittings yet" : `From ${stats.attempts} sittings`}</span>
        </div>
      </div>

      <div className="gauge-row">
        <Gauge
          label="Grade average"
          percent={stats.averageGrade}
          centerTop={stats.averageGrade == null ? "—" : `${stats.averageGrade.toFixed(1)}%`}
          centerBottom={stats.attempts === 0 ? "no sittings yet" : `${stats.attempts} sittings`}
        />
        <Gauge
          label="Pass rate"
          percent={stats.passRate}
          centerTop={stats.passRate == null ? "—" : `${Math.round(stats.passRate)}%`}
          centerBottom={`≥ ${PASS_PERCENT}% to pass`}
        />
        <Gauge
          label="Exam coverage"
          percent={stats.coveragePercent}
          centerTop={stats.coveragePercent == null ? "—" : `${Math.round(stats.coveragePercent)}%`}
          centerBottom={stats.lectures === 0 ? "no lectures yet" : `${stats.assignments}/${stats.lectures} lectures`}
        />
        <Gauge
          label="Published"
          percent={stats.publishedPercent}
          centerTop={stats.publishedPercent == null ? "—" : `${Math.round(stats.publishedPercent)}%`}
          centerBottom={stats.contentItems === 0 ? "no content yet" : `${stats.contentItems} items`}
        />
      </div>

      <h3 style={{ marginBottom: "0.25rem" }}>Assignment exams</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Overall grade percentage for each assignment exam, from live sittings.
      </p>
      {gradesError ? <ErrorBox error={{ message: "Some live grades could not be loaded." }} onRetry={() => setGradesTick((t) => t + 1)} /> : null}
      {stats.assignments === 0 ? (
        <EmptyState title="No assignments yet" hint="Create your first exam from the Exams tab — its grades will appear here." />
      ) : gradesLoading && stats.attempts === 0 ? (
        <Loader label="Loading grades..." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="muted small">Per-exam overall grades</caption>
            <thead>
              <tr><th scope="col">Assignment</th><th scope="col">Sessions</th><th scope="col">Average</th><th scope="col">Pass rate</th></tr>
            </thead>
            <tbody>
              {stats.perExam.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.sessions}</td>
                  <td>
                    {row.loading ? (
                      <span className="muted small">Loading…</span>
                    ) : row.avg == null ? (
                      <span className="muted small">No sittings yet</span>
                    ) : (
                      <span style={{ display: "block", minWidth: "140px" }}>
                        <strong>{row.avg.toFixed(1)}%</strong>
                        <span className="exam-progress" role="progressbar" aria-valuenow={Math.round(row.avg)} aria-valuemin="0" aria-valuemax="100" aria-label={`${row.title} average`} style={{ marginTop: "0.25rem" }}>
                          <span className="exam-progress-fill" style={{ display: "block", width: `${Math.min(Math.max(row.avg, 0), 100)}%` }} />
                        </span>
                      </span>
                    )}
                  </td>
                  <td>{row.loading ? <span className="muted small">…</span> : row.passPercent == null ? "—" : `${Math.round(row.passPercent)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {gradesLoading ? <p className="muted small">Refreshing live grades…</p> : null}
    </div>
  );
}
