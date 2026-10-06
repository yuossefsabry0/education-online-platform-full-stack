import { useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

const emptyWizardQuestion = () => ({ text: "", options: ["", "", "", ""], correctIndex: 0 });

function emptyWizard() {
  return {
    lectureTitle: "",
    lectureBody: "",
    isPublished: true,
    // Distinct layers: files layer (LESSON_CONTENT companion) vs video layer
    // (LECTURE fileUrl). Never merged into one field.
    filesUrl: "",
    filesNote: "",
    videoUrl: "",
    includeExam: true,
    examTitle: "",
    timeLimitMinutes: "10",
    examPublished: true,
    questions: [emptyWizardQuestion()],
  };
}

function WizardSteps({ step }) {
  const labels = ["Lecture", "Files", "Video", "Exam", "Review"];
  return (
    <ol className="wizard-steps" aria-label="Add lecture progress">
      {labels.map((label, i) => {
        const n = i + 1;
        const cls = n < step ? "wizard-step done" : n === step ? "wizard-step active" : "wizard-step";
        return (
          <li key={label} className={cls} aria-current={n === step ? "step" : undefined}>
            <span className="wizard-dot" aria-hidden="true">{n < step ? "✓" : n}</span>
            <span>Layer {n} · {label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Unified layered "Add Lecture" wizard (additive — existing content/exam forms untouched).
// One lecture unit, organized in distinct layers mirroring the student journey:
// Layer 1 lecture info -> Layer 2 files (LESSON_CONTENT companion) ->
// Layer 3 video (LECTURE fileUrl) -> Layer 4 exam (required) -> Review & create.
// Every field on every layer is mandatory — the wizard blocks progress and
// creation until nothing is empty.
// Uses the existing validated endpoints sequentially (teacherAddContent + teacherAddExam),
// so backend validation, ownership and logging stay exactly as before.
export default function UnifiedLectureWizard({ onCreated }) {
  const { push: pushToast } = useToast();
  const [form, setForm] = useState(() => emptyWizard());
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [created, setCreated] = useState(null);

  function setPatch(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function updateQuestion(qi, patch) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)),
    }));
  }

  function updateOption(qi, oi, value) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
      ),
    }));
  }

  function validateStep(target) {
    if (target === 1) {
      if (!form.lectureTitle.trim()) return "Lecture title is required — it cannot be empty.";
      if (form.lectureTitle.trim().length > 255) return "Lecture title must be at most 255 characters.";
      if (!form.lectureBody.trim()) return "Lecture details are required — they cannot be empty.";
      if ((form.lectureBody || "").length > 65535) return "Lecture details must be at most 65535 characters.";
      return null;
    }
    if (target === 2) {
      if (!form.filesUrl.trim()) return "Lecture files are required — upload a file or paste a link.";
      if (!form.filesNote.trim()) return "Files note is required — it cannot be empty.";
      return null;
    }
    if (target === 3) {
      if (!form.videoUrl.trim()) return "Lecture video is required — upload a video or paste a link.";
      return null;
    }
    if (target === 4) {
      if (!form.examTitle.trim()) return "Exam title is required — it cannot be empty.";
      if (form.examTitle.trim().length > 255) return "Exam title must be at most 255 characters.";
      const minutes = Number(form.timeLimitMinutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
        return "Time limit must be between 1 and 120 minutes.";
      }
      if (form.questions.length < 1) return "An exam needs at least 1 question — every question field must be filled.";
      for (const q of form.questions) {
        if (!q.text.trim()) return "Each exam question needs text.";
        if (q.options.some((o) => !o.trim())) {
          return "All 4 options are required for each question — please fill every option.";
        }
        if (!q.options[q.correctIndex] || !q.options[q.correctIndex].trim()) {
          return "Each question's marked correct answer must have option text.";
        }
      }
      return null;
    }
    return null;
  }

  function goNext() {
    setStepError(null);
    const problem = validateStep(step);
    if (problem) {
      setStepError({ message: problem });
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  async function handleLayerUpload(e, layer) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStepError(null);
    setUploading(true);
    try {
      const saved = await endpoints.teacherUploadContent(file);
      if (layer === "video") setPatch({ videoUrl: saved.fileUrl });
      else setPatch({ filesUrl: saved.fileUrl });
    } catch (err) {
      setStepError(toApiError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleCreate() {
    setStepError(null);
    const p1 = validateStep(1);
    if (p1) {
      setStep(1);
      setStepError({ message: p1 });
      return;
    }
    const p2 = validateStep(2);
    if (p2) {
      setStep(2);
      setStepError({ message: p2 });
      return;
    }
    const pv = validateStep(3);
    if (pv) {
      setStep(3);
      setStepError({ message: pv });
      return;
    }
    const p3 = validateStep(4);
    if (p3) {
      setStep(4);
      setStepError({ message: p3 });
      return;
    }
    setCreating(true);
    try {
      // Distinct layers: video goes on the LECTURE row; files go on a
      // LESSON_CONTENT companion marked "[lecture:<id>]" (resolved by journey).
      setProgress("Creating lecture (video layer)…");
      const lectureRes = await endpoints.teacherAddContent({
        type: "LECTURE",
        title: form.lectureTitle.trim(),
        body: form.lectureBody || undefined,
        fileUrl: form.videoUrl || undefined,
        isPublished: form.isPublished,
      });
      const lecture = lectureRes && lectureRes.content ? lectureRes.content : null;
      const lectureId = lecture ? lecture.id : null;

      let filesInfo = null;
      if (lectureId) {
        setProgress("Adding files layer…");
        try {
          const filesRes = await endpoints.teacherAddContent({
            type: "LESSON_CONTENT",
            title: `${form.lectureTitle.trim()} — Files`,
            body: `[lecture:${lectureId}] ${form.filesNote.trim()}`,
            fileUrl: form.filesUrl.trim(),
            isPublished: form.isPublished,
          });
          const filesRow = filesRes && filesRes.content ? filesRes.content : null;
          filesInfo = { id: filesRow ? filesRow.id : null, fileUrl: form.filesUrl.trim() };
        } catch (filesErr) {
          const apiErr = toApiError(filesErr);
          pushToast(
            `Lecture "${form.lectureTitle.trim()}" added, but the files layer failed: ${apiErr.message}. You can add the files layer later.`,
            "error"
          );
        }
      }

      let examInfo = null;
      if (lectureId) {
        setProgress("Adding exam layer…");
        const cleaned = form.questions.map((q) => {
          const entered = q.options.map((o) => o.trim());
          const correctText = entered[q.correctIndex];
          return { text: q.text.trim(), options: entered, correctIndex: entered.indexOf(correctText) };
        });
        try {
          const examRes = await endpoints.teacherAddExam({
            title: form.examTitle.trim(),
            lessonContentId: Number(lectureId),
            timeLimitSeconds: Math.round(Number(form.timeLimitMinutes) * 60),
            isPublished: form.examPublished,
            questions: cleaned,
          });
          const exam = examRes && examRes.exam ? examRes.exam : null;
          examInfo = { id: exam ? exam.id : null, title: form.examTitle.trim(), count: cleaned.length };
        } catch (examErr) {
          // Lecture already created — keep it and inform the teacher (no rollback,
          // matching the existing separate-flow behaviour).
          const apiErr = toApiError(examErr);
          pushToast(
            `Lecture "${form.lectureTitle.trim()}" added, but the exam layer failed: ${apiErr.message}. Open the Exam tab to retry.`,
            "error"
          );
          setStepError(apiErr);
          setProgress("");
          setCreating(false);
          if (typeof onCreated === "function") onCreated({ lecture, exam: null, partial: true });
          return;
        }
      }

      const summary = {
        lectureId,
        lectureTitle: form.lectureTitle.trim(),
        hasFiles: Boolean(filesInfo && filesInfo.fileUrl),
        hasVideo: Boolean(form.videoUrl),
        files: filesInfo,
        exam: examInfo,
        published: form.isPublished,
      };
      setCreated(summary);
      pushToast(
        `Lecture "${summary.lectureTitle}" added successfully${examInfo ? ` with exam "${examInfo.title}" (${examInfo.count} ${examInfo.count === 1 ? "question" : "questions"})` : ""}${summary.hasFiles ? " + files layer" : ""}${summary.hasVideo ? " + video layer" : ""}. Students unlock each layer on its own path: exam → files → video.`,
        "success"
      );
      if (typeof onCreated === "function") onCreated({ lecture, exam: examInfo, partial: false });
    } catch (err) {
      setStepError(toApiError(err));
    } finally {
      setProgress("");
      setCreating(false);
    }
  }

  function handleAddAnother() {
    setForm(emptyWizard());
    setStep(1);
    setStepError(null);
    setCreated(null);
  }

  if (created) {
    return (
      <div className="form-card wizard-success" role="status">
        <div className="wizard-success-icon" aria-hidden="true">✓</div>
        <h3 style={{ marginBottom: "0.25rem" }}>Lecture added successfully</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          “{created.lectureTitle}” is now one unified unit — students see it in order:
          lecture → exam → material → video.
        </p>
        <div className="wizard-summary">
          <div><strong>Lecture:</strong> {created.lectureTitle} (ID {created.lectureId}){created.published ? "" : " · Hidden"}</div>
          <div><strong>Files layer:</strong> {created.hasFiles ? "Attached ✓ (own path)" : "None yet — you can add it later"}</div>
          <div><strong>Video layer:</strong> {created.hasVideo ? "Attached ✓ (own path)" : "None yet — you can add it later"}</div>
          <div><strong>Exam:</strong> {created.exam ? `${created.exam.title} · ${created.exam.count} ${created.exam.count === 1 ? "question" : "questions"} ✓` : "Skipped"}</div>
        </div>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-dark btn-sm" onClick={handleAddAnother}>
            Add another lecture
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.25rem" }}>Add lecture — unified layers</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        One lecture, distinct layers — exactly how students experience it on separate paths:
        lecture details → files → video → exam (≥ 50% unlocks the rest).
      </p>
      <WizardSteps step={step} />
      {stepError ? <ErrorBox error={stepError} /> : null}

      {step === 1 ? (
        <div className="form-card">
          <p className="eyebrow">Layer 1 · Lecture</p>
          <label className="field">
            <span>Lecture title</span>
            <input type="text" value={form.lectureTitle} onChange={(e) => setPatch({ lectureTitle: e.target.value })} placeholder="e.g. Fractions — Part 1" required />
          </label>
          <label className="field">
            <span>Lecture details (required)</span>
            <textarea value={form.lectureBody} onChange={(e) => setPatch({ lectureBody: e.target.value })} rows={4} placeholder="What will students learn? Shown next to the title." required />
          </label>
          <label className="field">
            <span>Published</span>
            <select value={form.isPublished ? "yes" : "no"} onChange={(e) => setPatch({ isPublished: e.target.value === "yes" })}>
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </select>
          </label>
          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-dark btn-sm" onClick={goNext}>Continue to files layer →</button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="form-card">
          <p className="eyebrow">Layer 2 · Lecture files (separate layer, required)</p>
          <p className="muted small" style={{ marginTop: 0 }}>
            Slides, notes and documents live here — on their own student path, unlocked after the exam. Every field is required.
          </p>
          <label className="field">
            <span>Files URL (required)</span>
            <input type="text" value={form.filesUrl} onChange={(e) => setPatch({ filesUrl: e.target.value })} placeholder="Upload below or paste a link" required />
          </label>
          <label className="field">
            <span>Files note (required)</span>
            <input type="text" value={form.filesNote} onChange={(e) => setPatch({ filesNote: e.target.value })} placeholder="e.g. Slides + worksheet" required />
          </label>
          <label className="field">
            <span>Upload files (required if no link pasted)</span>
            <input type="file" onChange={(e) => handleLayerUpload(e, "files")} disabled={uploading} />
          </label>
          {uploading ? <p className="muted small">Uploading…</p> : null}
          {form.filesUrl ? <p className="muted small">Attached files: {form.filesUrl}</p> : null}
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← Back</button>
            <button type="button" className="btn btn-dark btn-sm" onClick={goNext}>Continue to video layer →</button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="form-card">
          <p className="eyebrow">Layer 3 · Lecture video (separate layer, required)</p>
          <p className="muted small" style={{ marginTop: 0 }}>
            The lecture video lives here — on its own student path after the files layer. A video is required.
          </p>
          <label className="field">
            <span>Video URL (required)</span>
            <input type="text" value={form.videoUrl} onChange={(e) => setPatch({ videoUrl: e.target.value })} placeholder="Upload below or paste a video link" required />
          </label>
          <label className="field">
            <span>Upload video (required if no link pasted)</span>
            <input type="file" accept="video/*" onChange={(e) => handleLayerUpload(e, "video")} disabled={uploading} />
          </label>
          {uploading ? <p className="muted small">Uploading…</p> : null}
          {form.videoUrl ? <p className="muted small">Attached video: {form.videoUrl}</p> : null}
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>← Back</button>
            <button type="button" className="btn btn-dark btn-sm" onClick={goNext}>Continue to exam →</button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="form-card">
          <p className="eyebrow">Layer 4 · Exam (required)</p>
          <p className="muted small" style={{ marginTop: 0 }}>
            Every lecture needs an exam — students need ≥ 50% to unlock material + video. Every field below is required.
          </p>
          {(
            <>
              <div className="form-row">
                <label className="field">
                  <span>Exam title (required)</span>
                  <input type="text" value={form.examTitle} onChange={(e) => setPatch({ examTitle: e.target.value })} placeholder="e.g. Fractions — Part 1 exam" required />
                </label>
                <label className="field">
                  <span>Time limit (minutes)</span>
                  <input type="number" min="1" max="120" step="1" value={form.timeLimitMinutes} onChange={(e) => setPatch({ timeLimitMinutes: e.target.value })} required />
                </label>
              </div>
              <label className="field">
                <span>Exam published</span>
                <select value={form.examPublished ? "yes" : "no"} onChange={(e) => setPatch({ examPublished: e.target.value === "yes" })}>
                  <option value="yes">Published</option>
                  <option value="no">Hidden</option>
                </select>
              </label>
              {form.questions.map((q, qi) => (
                <div key={qi} className="exam-builder-question">
                  <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>Question {qi + 1}</h3>
                    {form.questions.length > 1 ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }))}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label className="field">
                    <span>Question text</span>
                    <input type="text" value={q.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })} required />
                  </label>
                  {q.options.map((opt, oi) => (
                    <label key={oi} className="field">
                      <span>Option {oi + 1}{q.correctIndex === oi ? " (correct answer)" : ""}</span>
                      <input type="text" value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} required />
                    </label>
                  ))}
                  <label className="field">
                    <span>Correct answer</span>
                    <select value={q.correctIndex} onChange={(e) => updateQuestion(qi, { correctIndex: Number(e.target.value) })}>
                      {q.options.map((_, oi) => (
                        <option key={oi} value={oi}>Option {oi + 1}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <div className="btn-row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, questions: [...f.questions, emptyWizardQuestion()] }))}>
                  Add question
                </button>
              </div>
            </>
          )}
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(3)}>← Back</button>
            <button type="button" className="btn btn-dark btn-sm" onClick={goNext}>Review →</button>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="form-card">
          <p className="eyebrow">Layer 5 · Review &amp; create</p>
          <div className="wizard-summary">
            <div><strong>Lecture:</strong> {form.lectureTitle.trim() || "—"}{form.isPublished ? "" : " · Hidden"}</div>
            {form.lectureBody ? <div><strong>Details:</strong> {form.lectureBody.slice(0, 140)}{form.lectureBody.length > 140 ? "…" : ""}</div> : null}
            <div><strong>Files layer:</strong> {form.filesUrl || "None"}{form.filesNote ? ` · ${form.filesNote.slice(0, 80)}` : ""}</div>
            <div><strong>Video layer:</strong> {form.videoUrl || "None"}</div>
            <div><strong>Exam:</strong> {`${form.examTitle.trim() || "—"} · ${form.questions.length} ${form.questions.length === 1 ? "question" : "questions"} · ${form.timeLimitMinutes} min`}</div>
          </div>
          {progress ? <p className="muted small" role="status">{progress}</p> : null}
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={creating} onClick={() => setStep(4)}>← Back</button>
            <button type="button" className="btn btn-dark" disabled={creating} onClick={handleCreate}>
              {creating ? "Creating…" : "Create lecture"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
