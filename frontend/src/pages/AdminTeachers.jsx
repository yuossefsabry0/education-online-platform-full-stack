import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import TeacherImage from "../components/TeacherImage.jsx";
import { EmptyState, ErrorBox, FieldError, Loader, Pagination } from "../components/ui.jsx";

// Admin teachers workflow:
// - Browse: GET /api/teachers (admin token -> full data) + GET /api/teachers/search?q=
// - Add: POST /api/admin/teachers { name, username, email, password, subject,
//        gradeClass, price1Month, price3Months, price6Months, price1Year }
// Detail/edit/delete/content live on /admin/teachers/:teacherId.
const priceFields = ["price1Month", "price3Months", "price6Months", "price1Year"];

export default function AdminTeachers() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "", username: "", email: "", password: "", subject: "", gradeClass: "",
    price1Month: "", price3Months: "", price6Months: "", price1Year: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formOk, setFormOk] = useState(null);

  const fetchTeachers = useCallback(async (q, p) => {
    setLoading(true);
    setError(null);
    try {
      const data = q
        ? await endpoints.searchTeachers({ q, page: p, limit: 9 })
        : await endpoints.listTeachers({ page: p, limit: 9 });
      setTeachers(data.teachers || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers(appliedQuery, page);
  }, [fetchTeachers, appliedQuery, page]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);
    for (const f of priceFields) {
      if (form[f] === "" || form[f] === null || form[f] === undefined) {
        setFormError({ message: `${f} is required`, details: [{ field: f, message: `${f} is required` }] });
        return;
      }
      if (!Number.isFinite(Number(form[f]))) {
        setFormError({ message: `${f} must be a number`, details: [{ field: f, message: `${f} must be a number` }] });
        return;
      }
    }
    setSaving(true);
    const body = {
      name: form.name,
      username: form.username,
      email: form.email,
      password: form.password,
      subject: form.subject,
      gradeClass: form.gradeClass,
      price1Month: Number(form.price1Month),
      price3Months: Number(form.price3Months),
      price6Months: Number(form.price6Months),
      price1Year: Number(form.price1Year),
    };
    try {
      const result = await endpoints.adminAddTeacher(body);
      setFormOk(`Teacher "${result.teacher.username}" created.`);
      setForm({
        name: "", username: "", email: "", password: "", subject: "", gradeClass: "",
        price1Month: "", price3Months: "", price6Months: "", price1Year: "",
      });
      fetchTeachers(appliedQuery, page);
    } catch (err) {
      setFormError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Teachers</h1>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedQuery(query.trim());
        }}
      >
        <input
          type="search"
          placeholder="Search teachers by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search teachers"
        />
        <button type="submit" className="btn btn-dark">Search</button>
        {appliedQuery ? (
          <button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setAppliedQuery(""); setPage(1); }}>
            Clear
          </button>
        ) : null}
      </form>

      {loading ? (
        <Loader label="Loading teachers..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={() => fetchTeachers(appliedQuery, page)} />
      ) : teachers.length === 0 ? (
        <EmptyState title="No teachers found" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="muted small">Teachers</caption>
              <thead>
                <tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Subject</th><th scope="col">Grade</th><th scope="col">Active</th><th scope="col">Actions</th></tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td>{t.username || "—"}</td>
                    <td>{t.subject}</td>
                    <td>{t.gradeClass}</td>
                    <td>{t.isActive === undefined ? "—" : t.isActive ? "Yes" : "No"}</td>
                    <td>
                      <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate(`/admin/teachers/${t.id}`)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination?.page || page} totalPages={pagination?.totalPages || 0} onChange={setPage} />
        </>
      )}

      <h2>Add teacher</h2>
      {formError ? (
        <div className="alert alert-error" role="alert">
          {formError.message}
          {["name", "username", "email", "password", "subject", "gradeClass", ...priceFields].map((f) => (
            <FieldError key={f} details={formError.details} field={f} />
          ))}
        </div>
      ) : null}
      {formOk ? <div className="alert alert-success" role="status">{formOk}</div> : null}
      <form className="form-card" onSubmit={handleAdd}>
        <div className="form-row">
          <label className="field"><span>Name</span>
            <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </label>
          <label className="field"><span>Username</span>
            <input type="text" value={form.username} onChange={(e) => update("username", e.target.value)} required />
          </label>
        </div>
        <div className="form-row">
          <label className="field"><span>Email</span>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </label>
          <label className="field"><span>Password</span>
            <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" required />
          </label>
        </div>
        <div className="form-row">
          <label className="field"><span>Subject</span>
            <input type="text" value={form.subject} onChange={(e) => update("subject", e.target.value)} required />
          </label>
          <label className="field"><span>Grade / class</span>
            <input type="text" value={form.gradeClass} onChange={(e) => update("gradeClass", e.target.value)} required />
          </label>
        </div>
        <div className="form-row-4">
          {priceFields.map((f) => (
            <label key={f} className="field"><span>{f}</span>
              <input type="number" min="0" step="0.01" value={form[f]} onChange={(e) => update(f, e.target.value)} required />
            </label>
          ))}
        </div>
        <button type="submit" className="btn btn-dark" disabled={saving}>
          {saving ? "Adding..." : "Add teacher"}
        </button>
      </form>

      <div className="teacher-grid" style={{ marginTop: "2rem" }}>
        {teachers.slice(0, 3).map((t) => (
          <article key={t.id} className="teacher-card">
            <div className="card-media img-zoom"><TeacherImage teacher={t} /></div>
            <div className="teacher-card-body"><h3>{t.name}</h3><p className="muted">{t.subject}</p></div>
          </article>
        ))}
      </div>
    </div>
  );
}
