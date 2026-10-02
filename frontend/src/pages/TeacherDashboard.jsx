import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Teacher role workflow (backend: content.controller behind /api/teacher):
// - GET /api/teacher/dashboard (own content grouped in sections)
// - GET /api/teacher/dashboard/subscribers
// - GET /api/teacher/dashboard/income { currentMonth, last3Months, year }
// - POST/PUT/DELETE /api/teacher/dashboard/content[/:contentId]
// Content body fields: { type: LECTURE|LESSON_CONTENT|HOMEWORK, title, body?, fileUrl?, isPublished? }
const CONTENT_TYPES = ["LECTURE", "LESSON_CONTENT", "HOMEWORK"];

const emptyForm = { type: "LECTURE", title: "", body: "", fileUrl: "", isPublished: true };

export default function TeacherDashboard() {
  const [tab, setTab] = useState("content");
  const [dashboard, setDashboard] = useState(null);
  const [subscribers, setSubscribers] = useState(null);
  const [income, setIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dash, subs, inc] = await Promise.all([
        endpoints.teacherDashboard({ limit: 50 }),
        endpoints.teacherSubscribers(),
        endpoints.teacherIncome(),
      ]);
      setDashboard(dash);
      setSubscribers(subs);
      setIncome(inc);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

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
      } else {
        await endpoints.teacherAddContent(body);
      }
      setForm(emptyForm);
      setEditingId(null);
      const dash = await endpoints.teacherDashboard({ limit: 50 });
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
      const dash = await endpoints.teacherDashboard({ limit: 50 });
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
  const allContent = sections.flatMap((s) => s.content || []);
  const subs = subscribers.subscribers || [];

  return (
    <div className="page">
      <h1>{dashboard.teacher ? `${dashboard.teacher.name} — Dashboard` : "Teacher dashboard"}</h1>
      {income ? (
        <div className="stat-row">
          <div className="stat"><span>Current month</span><strong>{income.income.currentMonth}</strong></div>
          <div className="stat"><span>Last 3 months</span><strong>{income.income.last3Months}</strong></div>
          <div className="stat"><span>This year</span><strong>{income.income.year}</strong></div>
          <div className="stat"><span>Subscribers</span><strong>{subscribers.totalSubscribers}</strong></div>
        </div>
      ) : null}

      <div className="tabs">
        {["content", "subscribers", "income"].map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          <h2>{editingId ? "Edit content" : "Add content"}</h2>
          {formError ? <ErrorBox error={formError} /> : null}
          <form className="form-card" onSubmit={handleSave}>
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
          {allContent.length === 0 ? (
            <EmptyState title="No content yet" hint="Add your first lecture, lesson content, or homework above." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>ID</th><th>Type</th><th>Title</th><th>Published</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {allContent.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.type}</td>
                      <td>{item.title}</td>
                      <td>{item.isPublished ? "Yes" : "No"}</td>
                      <td>
                        <div className="btn-row">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "subscribers" && (
        <>
          <h2>Subscribers ({subscribers.totalSubscribers})</h2>
          {subs.length === 0 ? (
            <EmptyState title="No subscribers yet" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Username</th><th>Email</th><th>Price paid</th><th>Duration</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.subscriptionId}>
                      <td>{s.name}</td>
                      <td>{s.username}</td>
                      <td>{s.email}</td>
                      <td>{String(s.pricePaid)}</td>
                      <td>{s.duration}</td>
                      <td>{s.status}</td>
                      <td>{new Date(s.subscriptionDate).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "income" && income ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Period</th><th>Income</th></tr></thead>
            <tbody>
              <tr><td>Current month</td><td>{income.income.currentMonth}</td></tr>
              <tr><td>Last 3 months</td><td>{income.income.last3Months}</td></tr>
              <tr><td>This year</td><td>{income.income.year}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
