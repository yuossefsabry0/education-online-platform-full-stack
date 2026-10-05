import { useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

function markerFor(lectureId) {
  return `[lecture:${lectureId}]`;
}

function stripMarker(body, lectureId) {
  if (typeof body !== "string") return "";
  const marker = markerFor(lectureId);
  if (body.startsWith(marker)) return body.slice(marker.length).trimStart();
  return body;
}

function findFilesCompanion(allContent, lectureId) {
  if (!Array.isArray(allContent)) return null;
  return (
    allContent.find(
      (c) =>
        c &&
        c.type === "LESSON_CONTENT" &&
        typeof c.body === "string" &&
        c.body.includes(markerFor(lectureId))
    ) || null
  );
}

function findLectureExam(exams, lectureId) {
  if (!Array.isArray(exams)) return null;
  return exams.find((e) => e && Number(e.lessonContentId) === Number(lectureId)) || null;
}

function LayerSteps({ layer, onSelect }) {
  const labels = ["Lecture", "Files", "Video", "Exam"];
  return (
    <ol className="wizard-steps" aria-label="Edit lecture layers">
      {labels.map((label, i) => {
        const n = i + 1;
        const cls = n === layer ? "wizard-step active" : "wizard-step";
        return (
          <li key={label} className={cls} aria-current={n === layer ? "step" : undefined}>
            <button
              type="button"
              className="wizard-step-btn"
              onClick={() => onSelect(n)}
              aria-label={`Edit ${label} layer`}
            >
              <span className="wizard-dot" aria-hidden="true">{n}</span>
              <span>Layer {n} · {label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// Layered editor for one previously added lecture (additive — the existing
// single-row Edit form and Exams tab are untouched). Every layer the student
// sees gets its own editing surface: Layer 1 entry (title/details/visibility),
// Layer 2 files companion (LESSON_CONTENT marked "[lecture:<id>]"), Layer 3
// video (LECTURE fileUrl), Layer 4 exam metadata. All saves reuse the existing
// validated endpoints (teacherEditContent / teacherAddContent / teacherEditExam).
export default function LectureLayersEditor({ lecture, allContent, exams, onClose, onSaved }) {
  const { push: pushToast } = useToast();
  const companion = findFilesCompanion(allContent, lecture.id);
  const exam = findLectureExam(exams, lecture.id);

  const [layer, setLayer] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [layerError, setLayerError] = useState(null);

  const [entryTitle, setEntryTitle] = useState(lecture.title || "");
  const [entryBody, setEntryBody] = useState(lecture.body || "");
  const [entryPublished, setEntryPublished] = useState(lecture.isPublished !== false);

  const [filesTitle, setFilesTitle] = useState(companion ? companion.title || "" : "");
  const [filesNote, setFilesNote] = useState(companion ? stripMarker(companion.body, lecture.id) : "");
  const [filesUrl, setFilesUrl] = useState(companion ? companion.fileUrl || "" : "");
  const [filesPublished, setFilesPublished] = useState(companion ? companion.isPublished !== false : entryPublished);

  const [videoUrl, setVideoUrl] = useState(lecture.fileUrl || "");

  const [examTitle, setExamTitle] = useState(exam ? exam.title || "" : "");
  const [examMinutes, setExamMinutes] = useState(
    exam && exam.timeLimitSeconds ? String(Math.round(Number(exam.timeLimitSeconds) / 60)) : "10"
  );
  const [examPublished, setExamPublished] = useState(exam ? exam.isPublished !== false : true);

  async function refreshParent() {
    if (typeof onSaved === "function") {
      try {
        await onSaved();
      } catch {
        return;
      }
    }
  }

  async function uploadTo(setter, e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setLayerError(null);
    setUploading(true);
    try {
      const saved = await endpoints.teacherUploadContent(file);
      setter(saved.fileUrl);
    } catch (err) {
      setLayerError(toApiError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function saveEntry() {
    const title = entryTitle.trim();
    if (!title) {
      setLayerError({ message: "Lecture title is required." });
      return;
    }
    if (title.length > 255) {
      setLayerError({ message: "Lecture title must be at most 255 characters." });
      return;
    }
    setLayerError(null);
    setSaving(true);
    try {
      await endpoints.teacherEditContent(lecture.id, {
        title,
        body: entryBody || null,
        isPublished: entryPublished,
      });
      pushToast(`Lecture "${title}" entry updated — students see the new title and details.`, "success");
      await refreshParent();
    } catch (err) {
      setLayerError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveFiles() {
    setLayerError(null);
    setSaving(true);
    try {
      if (companion) {
        await endpoints.teacherEditContent(companion.id, {
          title: filesTitle.trim() || companion.title,
          body: `${markerFor(lecture.id)} ${filesNote || "Lecture files"}`,
          fileUrl: filesUrl === "" ? null : filesUrl,
          isPublished: filesPublished,
        });
        pushToast("Files layer updated — students see it on the lecture files path.", "success");
      } else {
        if (!filesUrl) {
          setLayerError({ message: "Upload or paste the files URL first, then save." });
          setSaving(false);
          return;
        }
        await endpoints.teacherAddContent({
          type: "LESSON_CONTENT",
          title: filesTitle.trim() || `${entryTitle.trim() || lecture.title} — Files`,
          body: `${markerFor(lecture.id)} ${filesNote || "Lecture files"}`,
          fileUrl: filesUrl,
          isPublished: filesPublished,
        });
        pushToast("Files layer added — students now unlock it on the lecture files path.", "success");
      }
      await refreshParent();
    } catch (err) {
      setLayerError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveVideo() {
    setLayerError(null);
    setSaving(true);
    try {
      await endpoints.teacherEditContent(lecture.id, {
        fileUrl: videoUrl === "" ? null : videoUrl,
      });
      pushToast(
        videoUrl ? "Video layer updated — students see it on the lecture video path." : "Video layer cleared — students see “Video coming soon”.",
        "success"
      );
      await refreshParent();
    } catch (err) {
      setLayerError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveExam() {
    if (!exam) return;
    const title = examTitle.trim();
    if (!title) {
      setLayerError({ message: "Exam title is required." });
      return;
    }
    const minutes = Number(examMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
      setLayerError({ message: "Time limit must be between 1 and 120 minutes." });
      return;
    }
    setLayerError(null);
    setSaving(true);
    try {
      await endpoints.teacherEditExam(exam.id, {
        title,
        timeLimitSeconds: Math.round(minutes * 60),
        isPublished: examPublished,
      });
      pushToast(`Exam "${title}" updated — students face the new title, time limit and visibility.`, "success");
      await refreshParent();
    } catch (err) {
      setLayerError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="lecture-layers-editor" className="form-card layers-editor">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 0 }}>
        <p className="eyebrow" style={{ margin: 0 }}>Edit layers · {lecture.title} (ID {lecture.id})</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close layers editor
        </button>
      </div>
      <h3 style={{ marginBottom: "0.25rem" }}>Edit every student-visible layer</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each layer below matches exactly what students unlock in order: entry → exam → files → video.
        Saving a layer notifies you and refreshes the tables underneath.
      </p>
      <LayerSteps layer={layer} onSelect={(n) => { setLayer(n); setLayerError(null); }} />
      {layerError ? <ErrorBox error={layerError} /> : null}

      {layer === 1 ? (
        <div>
          <p className="muted small">Student path: lecture entry — title + details + “Go to Lecture”.</p>
          <label className="field">
            <span>Lecture title</span>
            <input type="text" value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} required />
          </label>
          <label className="field">
            <span>Lecture details</span>
            <textarea value={entryBody} onChange={(e) => setEntryBody(e.target.value)} rows={4} />
          </label>
          <label className="field">
            <span>Published</span>
            <select value={entryPublished ? "yes" : "no"} onChange={(e) => setEntryPublished(e.target.value === "yes")}>
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-dark btn-sm" disabled={saving} onClick={saveEntry}>
              {saving ? "Saving…" : "Save entry layer"}
            </button>
          </div>
        </div>
      ) : null}

      {layer === 2 ? (
        <div>
          <p className="muted small">
            Student path: <strong>…/lectures/{lecture.id}/files</strong> — documents only.
            {companion ? <span className="layer-badge layer-badge-ready">Files layer exists ✓</span> : <span className="layer-badge layer-badge-missing">No files layer yet</span>}
          </p>
          <label className="field">
            <span>Files title</span>
            <input
              type="text"
              value={filesTitle}
              onChange={(e) => setFilesTitle(e.target.value)}
              placeholder={`${entryTitle.trim() || lecture.title} — Files`}
            />
          </label>
          <label className="field">
            <span>Files note (shown to students)</span>
            <input type="text" value={filesNote} onChange={(e) => setFilesNote(e.target.value)} placeholder="e.g. Slides + worksheet" />
          </label>
          <label className="field">
            <span>Files URL</span>
            <input type="text" value={filesUrl} onChange={(e) => setFilesUrl(e.target.value)} placeholder="Upload below or paste a link" />
          </label>
          <label className="field">
            <span>Upload files</span>
            <input type="file" onChange={(e) => uploadTo(setFilesUrl, e)} disabled={uploading} />
          </label>
          {filesUrl ? <p className="muted small">Attached files: {filesUrl}</p> : null}
          <label className="field">
            <span>Published</span>
            <select value={filesPublished ? "yes" : "no"} onChange={(e) => setFilesPublished(e.target.value === "yes")}>
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-dark btn-sm" disabled={saving || uploading} onClick={saveFiles}>
              {saving ? "Saving…" : companion ? "Save files layer" : "Add files layer"}
            </button>
          </div>
        </div>
      ) : null}

      {layer === 3 ? (
        <div>
          <p className="muted small">
            Student path: <strong>…/lectures/{lecture.id}/video</strong> — video only.
            {videoUrl ? <span className="layer-badge layer-badge-ready">Video attached ✓</span> : <span className="layer-badge layer-badge-missing">No video yet</span>}
          </p>
          <label className="field">
            <span>Video URL (empty clears the layer)</span>
            <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Upload below or paste a video link" />
          </label>
          <label className="field">
            <span>Upload video</span>
            <input type="file" accept="video/*" onChange={(e) => uploadTo(setVideoUrl, e)} disabled={uploading} />
          </label>
          {videoUrl ? <p className="muted small">Attached video: {videoUrl}</p> : null}
          <div className="btn-row">
            <button type="button" className="btn btn-dark btn-sm" disabled={saving || uploading} onClick={saveVideo}>
              {saving ? "Saving…" : "Save video layer"}
            </button>
            {videoUrl ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setVideoUrl("")}>
                Clear video
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {layer === 4 ? (
        <div>
          <p className="muted small">
            Student path: lecture exam — title, time limit and visibility gate the files and video paths (≥ 50% to pass).
          </p>
          {!exam ? (
            <p className="muted small">
              No exam linked to this lecture yet. Create one from the Exams tab (select this lecture as the lesson)
              or the Add Lecture tab — questions themselves are managed there.
            </p>
          ) : (
            <>
              <p className="muted small">
                Editing: <strong>{exam.title}</strong> (ID {exam.id})
                <span className="layer-badge layer-badge-ready">{exam.questionCount ?? "?"} questions</span>
              </p>
              <label className="field">
                <span>Exam title</span>
                <input type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} required />
              </label>
              <label className="field">
                <span>Time limit (minutes)</span>
                <input type="number" min="1" max="120" step="1" value={examMinutes} onChange={(e) => setExamMinutes(e.target.value)} required />
              </label>
              <label className="field">
                <span>Published</span>
                <select value={examPublished ? "yes" : "no"} onChange={(e) => setExamPublished(e.target.value === "yes")}>
                  <option value="yes">Published</option>
                  <option value="no">Hidden</option>
                </select>
              </label>
              <div className="btn-row">
                <button type="button" className="btn btn-dark btn-sm" disabled={saving} onClick={saveExam}>
                  {saving ? "Saving…" : "Save exam layer"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
