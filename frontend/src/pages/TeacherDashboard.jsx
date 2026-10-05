import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import UnifiedLectureWizard from "../components/UnifiedLectureWizard.jsx";
import LectureLayersEditor from "../components/LectureLayersEditor.jsx";
import LectureUnifiedCard from "../components/LectureUnifiedCard.jsx";
import TeacherStatistics from "../components/TeacherStatistics.jsx";
import { formatDate, formatPrice } from "../utils/format.js";

// Teacher role workflow (backend: content.controller behind /api/teacher):
// - GET /api/teacher/dashboard (own content grouped in sections)
// - GET /api/teacher/dashboard/subscribers
// - GET /api/teacher/dashboard/income { currentMonth, last3Months, year }
// - POST/PUT/DELETE /api/teacher/dashboard/content[/:contentId]
// Content body fields: { type: LECTURE|LESSON_CONTENT|HOMEWORK, title, body?, fileUrl?, isPublished? }
const CONTENT_TYPES = ["LECTURE", "LESSON_CONTENT", "HOMEWORK"];

const emptyForm = { type: "LECTURE", title: "", body: "", fileUrl: "", isPublished: true };

const emptyExamQuestion = () => ({ text: "", options: ["", "", "", ""], correctIndex: 0 });
const emptyExamForm = () => ({ title: "", lessonContentId: "", timeLimitMinutes: "10", isPublished: true, questions: [emptyExamQuestion()] });

export default function TeacherDashboard() {
  const [tab, setTab] = useState("content");
  const { push: pushToast } = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [subscribers, setSubscribers] = useState(null);
  const [income, setIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [dashPage, setDashPage] = useState(1);
  const [subStatus, setSubStatus] = useState("");
  const [subPage, setSubPage] = useState(1);
  const [exams, setExams] = useState([]);
  const [examForm, setExamForm] = useState(() => emptyExamForm());
  const [examSaving, setExamSaving] = useState(false);
  const [gradesExam, setGradesExam] = useState(null);
  const [grades, setGrades] = useState([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  // Layered editor for one previous lecture (additive — existing Edit untouched).
  const [layersEditId, setLayersEditId] = useState(null);
  // Unified lecture cards (additive — existing section tables stay below).
  const [unifiedExpandedId, setUnifiedExpandedId] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const subParams = { page: subPage, limit: 10 };
      if (subStatus) subParams.status = subStatus;
      const [dash, subs, inc, ex] = await Promise.all([
        endpoints.teacherDashboard({ limit: 50, page: dashPage }),
        endpoints.teacherSubscribers(subParams),
        endpoints.teacherIncome(),
        endpoints.teacherExams().catch(() => ({ exams: [] })),
      ]);
      setDashboard(dash);
      setSubscribers(subs);
      setIncome(inc);
      setExams(ex.exams || []);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function reloadExams() {
    try {
      const ex = await endpoints.teacherExams();
      setExams(ex.exams || []);
    } catch (err) {
      setFormError(toApiError(err));
    }
  }

  useEffect(() => {
    loadAll();
  }, [dashPage, subStatus, subPage]);

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      type: item.type,
      title: item.title,
      body: item.body || "",
      fileUrl: item.fileUrl || "",
      isPublished: item.isPublished !== false,
    });
    setFormError(null);
    requestAnimationFrame(() => {
      document.getElementById("teacher-content-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      type: form.type,
      title: form.title,
      body: form.body || undefined,
      fileUrl: form.fileUrl || undefined,
      isPublished: form.isPublished,
    };
    try {
      if (editingId) {
        await endpoints.teacherEditContent(editingId, body);
        pushToast("Content updated successfully.", "success");
      } else {
        const created = await endpoints.teacherAddContent(body);
        const createdTitle = created && created.content ? created.content.title : form.title;
        pushToast(`Content "${createdTitle}" added successfully.`, "success");
      }
      setForm(emptyForm);
      setEditingId(null);
      const dash = await endpoints.teacherDashboard({ limit: 50, page: dashPage });
      setDashboard(dash);
    } catch (err) {
      setFormError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contentId) {
    if (!window.confirm("Delete this content item?")) return;
    try {
      await endpoints.teacherDeleteContent(contentId);
      const dash = await endpoints.teacherDashboard({ limit: 50, page: dashPage });
      setDashboard(dash);
    } catch (err) {
      setFormError(toApiError(err));
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFormError(null);
    try {
      const saved = await endpoints.teacherUploadContent(file);
      setForm((f) => ({ ...f, fileUrl: saved.fileUrl }));
    } catch (err) {
      setFormError(toApiError(err));
    } finally {
      e.target.value = "";
    }
  }

  function updateExamQuestion(qi, patch) {
    setExamForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)),
    }));
  }

  function updateExamOption(qi, oi, value) {
    setExamForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
      ),
    }));
  }

  async function handleExamSave(e) {
    e.preventDefault();
    setFormError(null);
    const title = examForm.title.trim();
    if (!title) {
      setFormError({ message: "Exam title is required." });
      return;
    }
    const minutes = Number(examForm.timeLimitMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
      setFormError({ message: "Time limit must be between 1 and 120 minutes." });
      return;
    }
    const cleaned = [];
    if (examForm.lessonContentId === "") {
      setFormError({ message: "Please select the lesson this exam belongs to." });
      return;
    }
    for (const q of examForm.questions) {
      const entered = q.options.map((o) => o.trim());
      const correctText = entered[q.correctIndex];
      if (!q.text.trim()) {
        setFormError({ message: "Each question needs text." });
        return;
      }
      if (entered.some((o) => o === "")) {
        setFormError({ message: "All 4 options are required for each question — please fill every option." });
        return;
      }
      // The marked correct answer must itself have text, then its index is
      // remapped onto the non-empty options so grading matches intent.
      if (!correctText) {
        setFormError({ message: "Each question's marked correct answer must have option text." });
        return;
      }
      const options = entered.filter((o) => o !== "");
      if (options.length < 2) {
        setFormError({ message: "Each question needs at least 2 non-empty options." });
        return;
      }
      cleaned.push({ text: q.text.trim(), options, correctIndex: options.indexOf(correctText) });
    }
    if (cleaned.length === 0) {
      setFormError({ message: "An exam needs at least 1 question." });
      return;
    }
    setExamSaving(true);
    try {
      const created = await endpoints.teacherAddExam({
        title,
        lessonContentId: Number(examForm.lessonContentId),
        timeLimitSeconds: Math.round(minutes * 60),
        isPublished: examForm.isPublished,
        questions: cleaned,
      });
      setExamForm(emptyExamForm());
      await reloadExams();
      pushToast(
        `Exam "${created && created.exam ? created.exam.title : title}" added successfully with ${cleaned.length} ${cleaned.length === 1 ? "question" : "questions"}.`,
        "success"
      );
    } catch (err) {
      setFormError(toApiError(err));
    } finally {
      setExamSaving(false);
    }
  }

  async function handleExamDelete(examId) {
    if (!window.confirm("Delete this exam and all its grades?")) return;
    try {
      await endpoints.teacherDeleteExam(examId);
      if (gradesExam && gradesExam.id === examId) {
        setGradesExam(null);
        setGrades([]);
      }
      await reloadExams();
    } catch (err) {
      setFormError(toApiError(err));
    }
  }

  async function handleShowGrades(exam) {
    setGradesExam(exam);
    setGrades([]);
    setGradesLoading(true);
    try {
      const data = await endpoints.teacherExamGrades(exam.id);
      setGrades(data.grades || []);
    } catch (err) {
      setFormError(toApiError(err));
    } finally {
      setGradesLoading(false);
    }
  }

  if (loading) return <div className="page"><Loader label="Loading dashboard..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Teacher dashboard</h1>
        <ErrorBox error={error} onRetry={loadAll} />
      </div>
    );
  }

  const sections = dashboard.sections || [];
  const subs = subscribers.subscribers || [];
  const subPagination = subscribers.pagination || null;
  const allContent = sections.flatMap((s) => s.content || []);
  const lectures = allContent.filter((c) => c.type === "LECTURE");
  const now = new Date();
  const lessonsThisMonth = lectures.filter((c) => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const lessonsThisYear = lectures.filter((c) => {
    if (!c.createdAt) return false;
    return new Date(c.createdAt).getFullYear() === now.getFullYear();
  }).length;
  const studentsViewing = subscribers.totalSubscribers ?? subs.length;

  return (
    <div className="page">
      <h1>{dashboard.teacher ? `${dashboard.teacher.name} — Dashboard` : "Teacher dashboard"}</h1>
      <div className="stat-row lesson-stats" aria-label="Lesson statistics">
        <button type="button" className="stat stat-clickable" onClick={() => setTab("content")} title="View my content" aria-label={`Total lessons added: ${lectures.length}. View my content.`}>
          <span>Total lessons added</span><strong>{lectures.length}</strong>
        </button>
        <button type="button" className="stat stat-clickable" onClick={() => setTab("content")} title="View my content" aria-label={`Lessons added this month: ${lessonsThisMonth}. View my content.`}>
          <span>Lessons added this month</span><strong>{lessonsThisMonth}</strong>
        </button>
        <button type="button" className="stat stat-clickable" onClick={() => setTab("content")} title="View my content" aria-label={`Lessons added this year: ${lessonsThisYear}. View my content.`}>
          <span>Lessons added this year</span><strong>{lessonsThisYear}</strong>
        </button>
        <button type="button" className="stat stat-clickable" onClick={() => setTab("subscribers")} title="View subscribers" aria-label={`Students viewing lessons: ${studentsViewing}. View subscribers.`}>
          <span>Students viewing lessons</span><strong>{studentsViewing}</strong>
        </button>
      </div>
      {income ? (
        <div className="stat-row">
          <div className="stat"><span>Current month</span><strong>{formatPrice(income.income.currentMonth)}</strong></div>
          <div className="stat"><span>Last 3 months</span><strong>{formatPrice(income.income.last3Months)}</strong></div>
          <div className="stat"><span>This year</span><strong>{formatPrice(income.income.year)}</strong></div>
          <div className="stat"><span>Subscribers</span><strong>{subscribers.totalSubscribers}</strong></div>
        </div>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Teacher dashboard sections">
        {[["add-lecture", "Add Lecture"], ["content", "Content"], ["exams", "Exams"], ["statistics", "Statistics"], ["subscribers", "Subscribers"], ["income", "Income"]].map(([t, label]) => (
          <button
            key={t}
            type="button"
            id={`teacher-tab-${t}`}
            aria-controls="teacher-tabpanel"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "add-lecture" && (
        <UnifiedLectureWizard
          onCreated={async () => {
            try {
              const [dash, ex] = await Promise.all([
                endpoints.teacherDashboard({ limit: 50, page: dashPage }),
                endpoints.teacherExams().catch(() => ({ exams: [] })),
              ]);
              setDashboard(dash);
              setExams(ex.exams || []);
            } catch {
              return;
            }
          }}
        />
      )}

      {tab === "content" && (
        <>
          <h2>{editingId ? "Edit content" : "Add content"}</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Sequential tiers (integrated): students see the lecture title + details → “Go to Lecture” opens its exam →
            passing with ≥ 50% unlocks the lecture material (files) → “Watch Lecture” opens the video. Upload files or
            videos below (File URL / Upload file) and link each exam to its lecture in the Exams tab.
          </p>
          {formError ? <ErrorBox error={formError} /> : null}
          <form id="teacher-content-form" className="form-card" onSubmit={handleSave}>
            <div className="form-row">
              <label className="field">
                <span>Type</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required>
                  {CONTENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Published</span>
                <select
                  value={form.isPublished ? "yes" : "no"}
                  onChange={(e) => setForm({ ...form, isPublished: e.target.value === "yes" })}
                >
                  <option value="yes">Published</option>
                  <option value="no">Hidden</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Title</span>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="field">
              <span>Body</span>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
            </label>
            <label className="field">
              <span>File URL (optional)</span>
              <input type="text" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} />
            </label>
            <label className="field">
              <span>Upload file (optional, replaces File URL)</span>
              <input type="file" onChange={handleFileSelect} />
            </label>
            <div className="btn-row">
              <button type="submit" className="btn btn-dark" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add content"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <h2>My content</h2>
          {lectures.length > 0 ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.25rem" }}>Lectures — unified view ({lectures.length})</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Each lecture as a single item — click to reveal and edit its entry, files, video, exam and homework layers right here.
              </p>
              <div className="unified-lecture-list">
                {lectures.map((lecture, i) => (
                  <LectureUnifiedCard
                    key={lecture.id}
                    lecture={lecture}
                    index={i}
                    total={lectures.length}
                    allContent={allContent}
                    exams={exams}
                    expanded={unifiedExpandedId === lecture.id}
                    onToggle={() => setUnifiedExpandedId((cur) => (cur === lecture.id ? null : lecture.id))}
                    onSaved={async () => {
                      try {
                        const [dash, ex] = await Promise.all([
                          endpoints.teacherDashboard({ limit: 50, page: dashPage }),
                          endpoints.teacherExams().catch(() => ({ exams: [] })),
                        ]);
                        setDashboard(dash);
                        setExams(ex.exams || []);
                      } catch {
                        return;
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {sections.every((s) => (s.content || []).length === 0) ? (
            <EmptyState title="No content yet" hint="Add your first lecture, lesson content, or homework above." />
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                <h3>{section.label} ({section.pagination ? section.pagination.total : (section.content || []).length})</h3>
                {(section.content || []).length === 0 ? (
                  <EmptyState title={`No ${section.label.toLowerCase()} yet`} />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <caption className="muted small">{section.label}</caption>
                      <thead>
                        <tr><th scope="col">ID</th><th scope="col">Type</th><th scope="col">Title</th><th scope="col">Published</th><th scope="col">Actions</th></tr>
                      </thead>
                      <tbody>
                        {(section.content || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.type}</td>
                            <td>{item.title}</td>
                            <td>{item.isPublished ? "Yes" : "No"}</td>
                            <td>
                              <div className="btn-row">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                                {section.key === "lectures" || item.type === "LECTURE" ? (
                                  <button
                                    type="button"
                                    className="btn btn-dark btn-sm"
                                    title="Edit every student-visible layer (entry, files, video, exam)"
                                    onClick={() => {
                                      setLayersEditId(item.id);
                                      requestAnimationFrame(() => {
                                        document.getElementById("lecture-layers-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                      });
                                    }}
                                  >
                                    Layers
                                  </button>
                                ) : null}
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.pagination && section.pagination.totalPages > 1 ? (
                  <Pagination page={section.pagination.page} totalPages={section.pagination.totalPages} onChange={setDashPage} />
                ) : null}
              </div>
            ))
          )}
          {(() => {
            if (layersEditId == null) return null;
            const lecture = allContent.find((c) => c && c.id === layersEditId && c.type === "LECTURE");
            if (!lecture) return null;
            return (
              <LectureLayersEditor
                key={lecture.id}
                lecture={lecture}
                allContent={allContent}
                exams={exams}
                onClose={() => setLayersEditId(null)}
                onSaved={async () => {
                  try {
                    const [dash, ex] = await Promise.all([
                      endpoints.teacherDashboard({ limit: 50, page: dashPage }),
                      endpoints.teacherExams().catch(() => ({ exams: [] })),
                    ]);
                    setDashboard(dash);
                    setExams(ex.exams || []);
                  } catch {
                    return;
                  }
                }}
              />
            );
          })()}
        </>
      )}

      {tab === "exams" && (
        <>
          <h2>Create exam</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Exams appear in the assignment section for subscribed students. Set questions with
            multiple-choice options, mark the correct answer, and choose a time limit and lesson.
          </p>
          {formError ? <ErrorBox error={formError} /> : null}
          <form className="form-card" onSubmit={handleExamSave}>
            <div className="form-row">
              <label className="field">
                <span>Exam title</span>
                <input type="text" value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} required />
              </label>
              <label className="field">
                <span>Lesson (required)</span>
                <select value={examForm.lessonContentId} onChange={(e) => setExamForm({ ...examForm, lessonContentId: e.target.value })} required>
                  <option value="">Select a lesson…</option>
                  {lectures.map((l) => (
                    <option key={l.id} value={l.id}>{l.title} (ID {l.id})</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Time limit (minutes)</span>
                <input type="number" min="1" max="120" step="1" value={examForm.timeLimitMinutes} onChange={(e) => setExamForm({ ...examForm, timeLimitMinutes: e.target.value })} required />
              </label>
              <label className="field">
                <span>Published</span>
                <select
                  value={examForm.isPublished ? "yes" : "no"}
                  onChange={(e) => setExamForm({ ...examForm, isPublished: e.target.value === "yes" })}
                >
                  <option value="yes">Published</option>
                  <option value="no">Hidden</option>
                </select>
              </label>
            </div>
            {examForm.questions.map((q, qi) => (
              <div key={qi} className="exam-builder-question">
                <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Question {qi + 1}</h3>
                  {examForm.questions.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExamForm((f) => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <label className="field">
                  <span>Question text</span>
                  <input type="text" value={q.text} onChange={(e) => updateExamQuestion(qi, { text: e.target.value })} required />
                </label>
                {q.options.map((opt, oi) => (
                  <label key={oi} className="field">
                    <span>Option {oi + 1}{q.correctIndex === oi ? " (correct answer)" : ""}</span>
                    <input type="text" value={opt} onChange={(e) => updateExamOption(qi, oi, e.target.value)} required />
                  </label>
                ))}
                <label className="field">
                  <span>Correct answer</span>
                  <select value={q.correctIndex} onChange={(e) => updateExamQuestion(qi, { correctIndex: Number(e.target.value) })}>
                    {q.options.map((_, oi) => (
                      <option key={oi} value={oi}>Option {oi + 1}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExamForm((f) => ({ ...f, questions: [...f.questions, emptyExamQuestion()] }))}
              >
                Add question
              </button>
              <button type="submit" className="btn btn-dark btn-sm" disabled={examSaving}>
                {examSaving ? "Saving..." : "Create exam"}
              </button>
            </div>
          </form>

          <h2>My exams ({exams.length})</h2>
          {exams.length === 0 ? (
            <EmptyState title="No exams yet" hint="Create your first exam with the form above." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="muted small">Exams</caption>
                <thead>
                  <tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Questions</th><th scope="col">Time</th><th scope="col">Published</th><th scope="col">Actions</th></tr>
                </thead>
                <tbody>
                  {exams.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.id}</td>
                      <td>{exam.title}{exam.lesson ? ` · Lesson: ${exam.lesson.title}` : ""}</td>
                      <td>{exam.questionCount}</td>
                      <td>{Math.round((exam.timeLimitSeconds || 600) / 60)} min</td>
                      <td>{exam.isPublished ? "Yes" : "No"}</td>
                      <td>
                        <div className="btn-row">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleShowGrades(exam)}>Exam Grades</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleExamDelete(exam.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gradesExam ? (
            <div style={{ marginTop: "1.25rem" }}>
              <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Exam Grades — {gradesExam.title}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setGradesExam(null); setGrades([]); }}>
                  Close grades
                </button>
              </div>
              {gradesLoading ? (
                <Loader label="Loading grades..." />
              ) : grades.length === 0 ? (
                <EmptyState title="No attempts yet" hint="No student has submitted this exam." />
              ) : (
                <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                  <table className="data-table">
                    <caption className="muted small">Student scores for this exam session</caption>
                    <thead>
                      <tr><th scope="col">Student</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Score</th><th scope="col">Percent</th><th scope="col">Submitted</th></tr>
                    </thead>
                    <tbody>
                      {grades.map((g) => (
                        <tr key={g.attemptId}>
                          <td>{g.student ? g.student.name : "—"}</td>
                          <td>{g.student ? g.student.username : "—"}</td>
                          <td>{g.student ? g.student.email : "—"}</td>
                          <td>{g.correct}/{g.total}{g.timedOut ? " (time out)" : ""}</td>
                          <td>{g.percent}%</td>
                          <td>{g.submittedAt ? new Date(g.submittedAt).toLocaleString() : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {tab === "statistics" && (
        <TeacherStatistics dashboard={dashboard} subscribers={subscribers} exams={exams} />
      )}

      {tab === "subscribers" && (
        <>
          <h2>Subscribers ({subscribers.totalSubscribers})</h2>
          <form
            className="search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              setSubPage(1);
              loadAll();
            }}
          >
            <select value={subStatus} onChange={(e) => { setSubStatus(e.target.value); setSubPage(1); }} aria-label="Filter by status">
              <option value="">Active now</option>
              <option value="ACTIVE">Active status</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </form>
          {subs.length === 0 ? (
            <EmptyState title="No subscribers yet" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="muted small">Subscribers</caption>
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Price paid</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Date</th></tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.subscriptionId}>
                      <td>{s.name}</td>
                      <td>{s.username}</td>
                      <td>{s.email}</td>
                      <td>{formatPrice(s.pricePaid)}</td>
                      <td>{s.duration}</td>
                      <td>{s.status}</td>
                      <td>{formatDate(s.subscriptionDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {subPagination && subPagination.totalPages > 1 ? (
            <Pagination page={subPagination.page} totalPages={subPagination.totalPages} onChange={setSubPage} />
          ) : null}
        </>
      )}

      {tab === "income" && income ? (
        <div className="table-wrap" id="teacher-tabpanel">
          <table className="data-table">
            <caption className="muted small">Income by period</caption>
            <thead><tr><th scope="col">Period</th><th scope="col">Income</th></tr></thead>
            <tbody>
              <tr><td>Current month</td><td>{formatPrice(income.income.currentMonth)}</td></tr>
              <tr><td>Last 3 months</td><td>{formatPrice(income.income.last3Months)}</td></tr>
              <tr><td>This year</td><td>{formatPrice(income.income.year)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
