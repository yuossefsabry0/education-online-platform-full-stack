import { useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox } from "./ui.jsx";
import { useToast } from "./Toast.jsx";
import LectureLayersEditor from "./LectureLayersEditor.jsx";

function markerFor(lectureId) {
  return `[lecture:${lectureId}]`;
}

function stripMarker(body, lectureId) {
  if (typeof body !== "string") return "";
  const marker = markerFor(lectureId);
  if (body.startsWith(marker)) return body.slice(marker.length).trimStart();
  return body;
}

function findHomeworkForLecture(allContent, lectureId) {
  if (!Array.isArray(allContent)) return [];
  return allContent.filter(
    (c) =>
      c &&
      c.type === "HOMEWORK" &&
      typeof c.body === "string" &&
      c.body.includes(markerFor(lectureId))
  );
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

function findLectureExams(exams, lectureId) {
  if (!Array.isArray(exams)) return [];
  return exams.filter((e) => e && Number(e.lessonContentId) === Number(lectureId));
}

function HomeworkBlock({ lecture, allContent, onSaved }) {
  const { push: pushToast } = useToast();
  const items = findHomeworkForLecture(allContent, lecture.id);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editFileUrl, setEditFileUrl] = useState("");
  const [editPublished, setEditPublished] = useState(true);

  async function uploadTo(setter, e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const saved = await endpoints.teacherUploadContent(file);
      setter(saved.fileUrl);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function refreshParent() {
    if (typeof onSaved === "function") {
      try {
        await onSaved();
      } catch {
        return;
      }
    }
  }

  async function handleAdd() {
    if (!title.trim()) {
      setError({ message: "Homework title is required." });
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await endpoints.teacherAddContent({
        type: "HOMEWORK",
        title: title.trim(),
        body: `${markerFor(lecture.id)} ${note || "Homework assignment"}`,
        fileUrl: fileUrl || undefined,
        isPublished: published,
      });
      pushToast(`Homework "${title.trim()}" added to lecture "${lecture.title}".`, "success");
      setTitle("");
      setNote("");
      setFileUrl("");
      setPublished(true);
      setShowAdd(false);
      await refreshParent();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditTitle(item.title || "");
    setEditNote(stripMarker(item.body, lecture.id));
    setEditFileUrl(item.fileUrl || "");
    setEditPublished(item.isPublished !== false);
    setError(null);
  }

  async function handleEditSave(item) {
    if (!editTitle.trim()) {
      setError({ message: "Homework title is required." });
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await endpoints.teacherEditContent(item.id, {
        title: editTitle.trim(),
        body: `${markerFor(lecture.id)} ${editNote || "Homework assignment"}`,
        fileUrl: editFileUrl === "" ? null : editFileUrl,
        isPublished: editPublished,
      });
      pushToast(`Homework "${editTitle.trim()}" updated.`, "success");
      setEditingId(null);
      await refreshParent();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete homework "${item.title}" from this lecture?`)) return;
    setError(null);
    try {
      await endpoints.teacherDeleteContent(item.id);
      pushToast(`Homework "${item.title}" deleted.`, "success");
      if (editingId === item.id) setEditingId(null);
      await refreshParent();
    } catch (err) {
      setError(toApiError(err));
    }
  }

  return (
    <div className="unified-layer">
      <p className="eyebrow">Homework layer · lecture assignment</p>
      <p className="muted small" style={{ marginTop: 0 }}>
        Assignments linked to this lecture — students see them with the lecture.
        {items.length ? <span className="layer-badge layer-badge-ready">{items.length} linked ✓</span> : <span className="layer-badge layer-badge-missing">None linked yet</span>}
      </p>
      {error ? <ErrorBox error={error} /> : null}
      {items.length === 0 ? (
        <EmptyState title="No homework linked yet" hint="Add the first assignment for this lecture below — older unlinked homework stays in the tables underneath." />
      ) : (
        <div className="content-list">
          {items.map((item) => (
            <article key={item.id} className="content-item">
              {editingId === item.id ? (
                <>
                  <label className="field">
                    <span>Homework title</span>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Instructions (shown to students)</span>
                    <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} />
                  </label>
                  <label className="field">
                    <span>Attachment URL</span>
                    <input type="text" value={editFileUrl} onChange={(e) => setEditFileUrl(e.target.value)} placeholder="Upload below or paste a link" />
                  </label>
                  <label className="field">
                    <span>Upload attachment</span>
                    <input type="file" onChange={(e) => uploadTo(setEditFileUrl, e)} disabled={uploading} />
                  </label>
                  <label className="field">
                    <span>Published</span>
                    <select value={editPublished ? "yes" : "no"} onChange={(e) => setEditPublished(e.target.value === "yes")}>
                      <option value="yes">Published</option>
                      <option value="no">Hidden</option>
                    </select>
                  </label>
                  <div className="btn-row">
                    <button type="button" className="btn btn-dark btn-sm" disabled={saving} onClick={() => handleEditSave(item)}>
                      {saving ? "Saving…" : "Save homework"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ marginTop: 0 }}>{item.title}</h3>
                  {stripMarker(item.body, lecture.id) ? <p style={{ whiteSpace: "pre-wrap" }}>{stripMarker(item.body, lecture.id)}</p> : null}
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {item.fileUrl ? "Attachment ✓ · " : "No attachment · "}{item.isPublished ? "Published" : "Hidden"}
                  </p>
                  <div className="btn-row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(item)}>Delete</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {showAdd ? (
        <div className="form-card">
          <label className="field">
            <span>Homework title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Worksheet 1" />
          </label>
          <label className="field">
            <span>Instructions (shown to students)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          <label className="field">
            <span>Attachment URL (optional)</span>
            <input type="text" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Upload below or paste a link" />
          </label>
          <label className="field">
            <span>Upload attachment (optional)</span>
            <input type="file" onChange={(e) => uploadTo(setFileUrl, e)} disabled={uploading} />
          </label>
          <label className="field">
            <span>Published</span>
            <select value={published ? "yes" : "no"} onChange={(e) => setPublished(e.target.value === "yes")}>
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </select>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-dark btn-sm" disabled={saving || uploading} onClick={handleAdd}>
              {saving ? "Adding…" : "Add homework to lecture"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(true); setError(null); }}>
            + Add homework to this lecture
          </button>
        </div>
      )}
    </div>
  );
}

// One previous lecture as a single unified item (additive — existing section
// tables underneath stay untouched). Clicking the header expands every linked
// part: entry, files, video and exam (via the layered editor) plus the
// lecture homework layer, each editable inline without leaving the view.
export default function LectureUnifiedCard({ lecture, index, total, allContent, exams, expanded, onToggle, onSaved }) {
  const files = findFilesCompanion(allContent, lecture.id);
  const lectureExams = findLectureExams(exams, lecture.id);
  const homework = findHomeworkForLecture(allContent, lecture.id);
  const hasVideo = Boolean(lecture.fileUrl);
  const readyCount = [true, Boolean(files && files.fileUrl), hasVideo, lectureExams.length > 0, homework.length > 0].filter(Boolean).length;

  return (
    <article className={`unified-lecture${expanded ? " unified-lecture-open" : ""}`}>
      <button
        type="button"
        className="unified-lecture-head"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} lecture ${lecture.title}`}
      >
        <span className="brand-mark" aria-hidden="true">{index + 1}</span>
        <span className="unified-lecture-titles">
          <strong>{lecture.title}</strong>
          <span className="muted small">
            Lecture {index + 1} of {total} · ID {lecture.id} · {lecture.isPublished ? "Published" : "Hidden"}
            {" · "}Entry ✓ · Files {files && files.fileUrl ? "✓" : "—"} · Video {hasVideo ? "✓" : "—"} · Exam {lectureExams.length > 0 ? "✓" : "—"} · Homework {homework.length > 0 ? `${homework.length} ✓` : "—"}
            {" · "}{readyCount}/5 layers ready
          </span>
        </span>
        <span className="unified-lecture-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded ? (
        <div className="unified-lecture-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Everything linked to this lecture, editable here — no need to visit separate sections.
          </p>
          <LectureLayersEditor
            key={`unified-${lecture.id}`}
            lecture={lecture}
            allContent={allContent}
            exams={exams}
            onClose={onToggle}
            onSaved={onSaved}
          />
          <HomeworkBlock lecture={lecture} allContent={allContent} onSaved={onSaved} />
        </div>
      ) : null}
    </article>
  );
}
