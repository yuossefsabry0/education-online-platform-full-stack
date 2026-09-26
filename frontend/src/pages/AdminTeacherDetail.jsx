import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Single-teacher admin workspace (all real admin endpoints for one teacher):
// - GET /api/admin/teachers/:teacherId -> { teacher (profile+contents+subscriptions), role }
// - PUT /api/admin/teachers/:teacherId (partial profile/prices/password)
// - DELETE /api/admin/teachers/:teacherId (soft-delete; blocked with active subscribers)
// - POST/PUT/DELETE /api/admin/teachers/:teacherId/content[/:contentId]
// - GET /api/admin/teachers/:teacherId/subscribers (per-teacher subscribers)
const CONTENT_TYPES = ["LECTURE", "LESSON_CONTENT", "HOMEWORK"];
const editableFields = ["name", "username", "email", "subject", "gradeClass", "price1Month", "price3Months", "price6Months", "price1Year"];

export default function AdminTeacherDetail() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [noticeError, setNoticeError] = useState(null);

  const [editForm, setEditForm] = useState({});
  const [editTouched, setEditTouched] = useState(false);
  const [contentForm, setContentForm] = useState({ type: "LECTURE", title: "", body: "", fileUrl: "", isPublished: true });
  const [editingContentId, setEditingContentId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([
        endpoints.adminTeacherDetail(teacherId),
        endpoints.adminTeacherSubscribers(teacherId, { page: 1, limit: 20 }),
      ]);
      setDetail(d);
      setSubs(s);
      setEditForm({});
      setEditTouched(false);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  function flashOk(msg) {
    setNotice(msg);
    setNoticeError(null);
  }
  function flashErr(err) {
    setNotice(null);
    setNoticeError(toApiError(err).message);
  }

  async function handleEdit(e) {
    e.preventDefault();
    const body = {};
    for (const key of [...editableFields, "password"]) {
      const value = editForm[key];
      if (value === undefined || value === "") continue;
      body[key] = key.startsWith("price") ? Number(value) : value;
    }
    if (Object.keys(body).length === 0) return;
    try {
      await endpoints.adminEditTeacher(teacherId, body);
      flashOk("Teacher updated.");
      load();
    } catch (err) {
      flashErr(err);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Soft-delete this teacher? Blocked while they have active subscribers.")) return;
    try {
      const result = await endpoints.adminDeleteTeacher(teacherId);
      flashOk(result.message || "Teacher deleted.");
      load();
    } catch (err) {
      flashErr(err);
    }
  }

  async function handleContentSave(e) {
    e.preventDefault();
    const body = {
      type: contentForm.type,
      title: contentForm.title,
      body: contentForm.body || undefined,
      fileUrl: contentForm.fileUrl || undefined,
      isPublished: contentForm.isPublished,
    };
    try {
      if (editingContentId) {
        await endpoints.adminEditContent(teacherId, editingContentId, body);
        flashOk("Content updated.");
      } else {
        await endpoints.adminAddContent(teacherId, body);
        flashOk("Content added.");
      }
      setContentForm({ type: "LECTURE", title: "", body: "", fileUrl: "", isPublished: true });
      setEditingContentId(null);
      load();
    } catch (err) {
      flashErr(err);
    }
  }

  async function handleContentDelete(contentId) {
    if (!window.confirm("Delete this content item?")) return;
    try {
      await endpoints.adminDeleteContent(teacherId, contentId);
      flashOk("Content deleted.");
      load();
    } catch (err) {
      flashErr(err);
    }
  }

  if (loading) return <div className="page"><Loader label="Loading teacher..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Teacher</h1>
        <ErrorBox error={error} onRetry={load} />
      </div>
    );
  }

  const teacher = detail.teacher || {};
  const contents = teacher.contents || [];
  const subscriptions = teacher.subscriptions || [];

  return (
    <div className="page">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/teachers")}>
        ← Back to teachers
      </button>
      <h1>{teacher.name} <span className="muted">({detail.role})</span></h1>
      {notice ? <div className="alert alert-success" role="status">{notice}</div> : null}
      {noticeError ? <div className="alert alert-error" role="alert">{noticeError}</div> : null}

      <h2>Profile</h2>
      <div className="table-wrap">
        <table className="data-table">
          <tbody>
            <tr><th>ID</th><td>{teacher.id}</td></tr>
            <tr><th>Username</th><td>{teacher.username}</td></tr>
            <tr><th>Email</th><td>{teacher.email}</td></tr>
            <tr><th>Subject</th><td>{teacher.subject}</td></tr>
            <tr><th>Grade</th><td>{teacher.gradeClass}</td></tr>
            <tr><th>Prices (1m / 3m / 6m / 1y)</th>
              <td>{[teacher.price1Month, teacher.price3Months, teacher.price6Months, teacher.price1Year].map(String).join(" / ")}</td></tr>
            <tr><th>Active</th><td>{teacher.isActive ? "Yes" : "No"}</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Edit teacher</h2>
      <form className="form-card" onSubmit={handleEdit}>
        <div className="form-row">
          {["name", "username", "email", "subject", "gradeClass"].map((f) => (
            <label key={f} className="field"><span>{f} (current: {String(teacher[f] ?? "—")})</span>
              <input
                type="text"
                value={editForm[f] || ""}
                placeholder={String(teacher[f] ?? "")}
                onChange={(e) => { setEditForm({ ...editForm, [f]: e.target.value }); setEditTouched(true); }}
              />
            </label>
          ))}
        </div>
        <div className="form-row">
          <label className="field"><span>New password (optional)</span>
            <input
              type="password"
              value={editForm.password || ""}
              autoComplete="new-password"
              onChange={(e) => { setEditForm({ ...editForm, password: e.target.value }); setEditTouched(true); }}
            />
          </label>
          {["price1Month", "price3Months", "price6Months", "price1Year"].map((f) => (
            <label key={f} className="field"><span>{f} (current: {String(teacher[f] ?? "—")})</span>
              <input
                type="number" min="0" step="0.01"
                value={editForm[f] || ""}
                onChange={(e) => { setEditForm({ ...editForm, [f]: e.target.value }); setEditTouched(true); }}
              />
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-dark" disabled={!editTouched}>Save changes</button>
          <button type="button" className="btn btn-ghost" onClick={handleDelete}>Delete teacher</button>
        </div>
      </form>

      <h2>Content ({contents.length})</h2>
      <form className="form-card" onSubmit={handleContentSave}>
        <h3>{editingContentId ? `Edit content #${editingContentId}` : "Add content"}</h3>
        <div className="form-row">
          <label className="field"><span>Type</span>
            <select value={contentForm.type} onChange={(e) => setContentForm({ ...contentForm, type: e.target.value })}>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="field"><span>Published</span>
            <select value={contentForm.isPublished ? "yes" : "no"} onChange={(e) => setContentForm({ ...contentForm, isPublished: e.target.value === "yes" })}>
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </select>
          </label>
        </div>
        <label className="field"><span>Title</span>
          <input type="text" value={contentForm.title} onChange={(e) => setContentForm({ ...contentForm, title: e.target.value })} required />
        </label>
        <label className="field"><span>Body</span>
          <textarea rows={3} value={contentForm.body} onChange={(e) => setContentForm({ ...contentForm, body: e.target.value })} />
        </label>
        <label className="field"><span>File URL</span>
          <input type="text" value={contentForm.fileUrl} onChange={(e) => setContentForm({ ...contentForm, fileUrl: e.target.value })} />
        </label>
        <div className="btn-row">
          <button type="submit" className="btn btn-dark">{editingContentId ? "Save" : "Add"}</button>
          {editingContentId ? (
            <button type="button" className="btn btn-ghost" onClick={() => { setEditingContentId(null); setContentForm({ type: "LECTURE", title: "", body: "", fileUrl: "", isPublished: true }); }}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {contents.length === 0 ? (
        <EmptyState title="No content" hint="Add the first item with the form above." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Published</th><th>Actions</th></tr></thead>
            <tbody>
              {contents.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{c.type}</td><td>{c.title}</td>
                  <td>{c.isPublished ? "Yes" : "No"}</td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button" className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingContentId(c.id);
                          setContentForm({ type: c.type, title: c.title, body: c.body || "", fileUrl: c.fileUrl || "", isPublished: c.isPublished !== false });
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleContentDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Subscribers ({subs ? subs.totalSubscribers : subscriptions.length})</h2>
      {(subs ? subs.subscribers : []).length === 0 && subscriptions.length === 0 ? (
        <EmptyState title="No subscribers" hint="Nobody has subscribed with this teacher yet." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Student</th><th>Duration</th><th>Price</th><th>Status</th><th>Period</th></tr></thead>
            <tbody>
              {(subs && subs.subscribers.length ? subs.subscribers : subscriptions.map((s) => ({
                id: s.id, duration: s.duration, price: s.price, status: s.status,
                startDate: s.startDate, endDate: s.endDate,
                student: s.student, teacher: null, teacherRole: s.teacherRole,
              }))).map((s) => (
                <tr key={s.id}>
                  <td>{s.student ? `${s.student.name} (${s.student.username})` : "—"}</td>
                  <td>{s.duration}</td><td>{String(s.price)}</td><td>{s.status}</td>
                  <td>{new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
