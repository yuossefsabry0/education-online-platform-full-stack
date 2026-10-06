import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Student exam interface (backend: exam.controller behind /api/content):
// - GET /api/content/teacher/:teacherId/exams/:examId (questions, no answers)
// - POST .../submit { answers, timedOut } -> graded result with review
function formatSeconds(total) {
  const s = Math.max(total, 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function ScoreCircle({ percent }) {
  const size = 150;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="gauge" role="img" aria-label={`Score: ${Math.round(percent)} percent`}>
      <svg className="gauge-svg exam-score-circle" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
      <div className="gauge-center exam-score-center">
        <strong>{Math.round(percent)}%</strong>
      </div>
    </div>
  );
}

export default function ExamTake() {
  const { teacherId, examId } = useParams();
  const [searchParams] = useSearchParams();
  // Integrated journey: ?lectureId=.. present when launched via "Go to Lecture".
  // Pass threshold 50% unlocks material/video; otherwise Retry replaces Go to Lecture.
  const lectureId = searchParams.get("lectureId");
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("intro");
  const [answers, setAnswers] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const submitRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await endpoints.studentExam(teacherId, examId);
        if (cancelled) return;
        setExam(data.exam);
        setAnswers((data.exam.questions || []).map(() => null));
        setSecondsLeft(data.exam.timeLimitSeconds || 600);
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
  }, [teacherId, examId]);

  const doSubmit = useCallback(async (timedOut) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await endpoints.studentSubmitExam(teacherId, examId, {
        answers,
        timedOut: timedOut === true,
      });
      setResult(data.result);
      setShowDetails(false);
      setPhase("result");
      // Live linkage (additive): a submitted exam changes the profile's exam
      // performance, averages, certificates and badges — notify listeners.
      try {
        window.dispatchEvent(new CustomEvent("edu:learning-stats-updated", { detail: { examId } }));
      } catch {
        // non-browser environments (tests) — ignore
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSubmitting(false);
    }
  }, [answers, examId, submitting, teacherId]);

  useEffect(() => {
    submitRef.current = doSubmit;
  }, [doSubmit]);

  useEffect(() => {
    if (phase !== "taking") return;
    if (secondsLeft <= 0) {
      submitRef.current(true);
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, secondsLeft]);

  function choose(questionIndex, optionIndex) {
    setAnswers((prev) => prev.map((a, i) => (i === questionIndex ? optionIndex : a)));
  }

  if (loading) return <div className="page"><Loader label="Loading exam..." /></div>;
  if (error && !exam) {
    return (
      <div className="page">
        <h1>Exam</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
            Back to lessons
          </button>
        </div>
      </div>
    );
  }

  const questions = exam.questions || [];
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <div className="page page-narrow">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
        ← Back to lessons
      </button>
      <h1>{exam.title}</h1>
      <p className="muted">
        {questions.length} {questions.length === 1 ? "question" : "questions"} · Time limit {formatSeconds(exam.timeLimitSeconds || 600)}
        {exam.attemptCount ? ` · Previous attempts: ${exam.attemptCount}` : ""}
      </p>

      {phase === "intro" ? (
        <div className="form-card exam-intro">
          <h2 style={{ marginTop: 0 }}>{exam.title}</h2>
          <p className="muted">
            Answer all {questions.length} multiple-choice {questions.length === 1 ? "question" : "questions"} within{" "}
            {formatSeconds(exam.timeLimitSeconds || 600)}. Unanswered questions count as incorrect, and the exam
            submits automatically when time runs out.
          </p>
          <button
            type="button"
            className="btn btn-dark exam-start-btn"
            onClick={() => {
              setSecondsLeft(exam.timeLimitSeconds || 600);
              setPhase("taking");
            }}
          >
            Start Exam
          </button>
        </div>
      ) : null}

      {phase === "taking" ? (
        <>
          <div className={`exam-timer${secondsLeft <= 60 ? " exam-timer-low" : ""}`} role="timer" aria-label={`Time left: ${formatSeconds(secondsLeft)}`}>
            Time left: <strong>{formatSeconds(secondsLeft)}</strong>
            <span className="muted small"> · Answered {answeredCount}/{questions.length}</span>
          </div>
          {error ? <ErrorBox error={error} /> : null}
          <div className="content-list">
            {questions.map((q, qi) => (
              <article key={q.id} className="content-item">
                <h3 style={{ marginTop: 0 }}>Q{qi + 1}. {q.text}</h3>
                <div className="exam-options" role="radiogroup" aria-label={`Question ${qi + 1}`}>
                  {(q.options || []).map((opt, oi) => (
                    <label key={oi} className={`exam-option${answers[qi] === oi ? " exam-option-selected" : ""}`}>
                      <input
                        type="radio"
                        name={`exam-q-${q.id}`}
                        checked={answers[qi] === oi}
                        onChange={() => choose(qi, oi)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-dark" disabled={submitting} onClick={() => doSubmit(false)}>
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </>
      ) : null}

      {phase === "result" && result ? (
        <>
          <div className="form-card exam-result">
            <ScoreCircle percent={result.percent} />
            <div className="exam-progress" role="progressbar" aria-valuenow={Math.round(result.percent)} aria-valuemin="0" aria-valuemax="100" aria-label="Score progress">
              <div className="exam-progress-fill" style={{ width: `${Math.min(Math.max(result.percent, 0), 100)}%` }} />
            </div>
            <p className="muted center" style={{ marginBottom: 0 }}>
              {result.correct} correct out of {result.total}
              {result.timedOut ? " · Time expired — auto-submitted" : ""}
            </p>
            <div className="exam-result-boxes">
              <div className="exam-box exam-box-correct" role="status">
                <strong>{result.correct}</strong>
                <span>Correct answers</span>
              </div>
              <div className="exam-box exam-box-wrong" role="status">
                <strong>{result.total - result.correct}</strong>
                <span>Incorrect answers</span>
              </div>
            </div>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? "Hide Answer Details" : "View Answer Details"}
              </button>
            </div>
          </div>

          {showDetails ? (
            <div className="content-list" style={{ marginTop: "1rem" }}>
              {(result.review || []).map((r, i) => (
                <article key={r.id} className={`content-item exam-review${r.isCorrect ? " exam-review-correct" : " exam-review-wrong"}`}>
                  <h3 style={{ marginTop: 0 }}>Q{i + 1}. {r.text}</h3>
                  <div className="exam-options">
                    {(r.options || []).map((opt, oi) => {
                      const isAnswer = oi === r.correctIndex;
                      const isChosenWrong = oi === r.chosen && !r.isCorrect;
                      return (
                        <div
                          key={oi}
                          className={`exam-option exam-option-static${isAnswer ? " exam-option-answer" : ""}${isChosenWrong ? " exam-option-mine-wrong" : ""}`}
                        >
                          <span>{opt}</span>
                          {isAnswer ? <span className="role-badge">Correct answer</span> : null}
                          {isChosenWrong ? <span className="role-badge">Your answer</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  {r.chosen === null || r.chosen === undefined ? (
                    <p className="muted small" style={{ marginBottom: 0 }}>You did not answer this question.</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {questions.length === 0 && result.review.length === 0 ? (
            <EmptyState title="No questions" hint="This exam has no questions yet." />
          ) : null}

          {(() => {
            const passed = typeof result.percent === "number" ? result.percent >= 50 : false;
            function handleRetry() {
              setResult(null);
              setShowDetails(false);
              setAnswers((exam.questions || []).map(() => null));
              setSecondsLeft(exam.timeLimitSeconds || 600);
              setPhase("intro");
            }
            // Integrated tier rule: >=50% unlocks "Go to Lecture" (files layer on its
            // own path, then video layer on its own path), otherwise "Retry".
            const lectureTarget = lectureId
              ? `/content/teacher/${teacherId}/lectures/${lectureId}/files`
              : `/content/teacher/${teacherId}/lectures/${exam.lessonContentId || ""}`;
            const hasLectureTarget = Boolean(lectureId || exam.lessonContentId);
            return (
              <div className="btn-row" style={{ marginTop: "1.25rem" }}>
                {passed ? (
                  <>
                    {hasLectureTarget ? (
                      <button type="button" className="btn btn-dark" onClick={() => navigate(lectureTarget)}>
                        Go to Lecture
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
                      Back to lectures
                    </button>
                  </>
                ) : (
                  <>
                    <p className="muted small" style={{ width: "100%", margin: 0 }}>
                      Score below 50% — review the answers above, then retry the exam to unlock the lecture.
                    </p>
                    <button type="button" className="btn btn-dark" onClick={handleRetry}>
                      Retry
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
                      Back to lectures
                    </button>
                  </>
                )}
              </div>
            );
          })()}
        </>
      ) : null}
    </div>
  );
}
