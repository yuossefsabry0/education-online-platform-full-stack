import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";
import { formatDate, formatPrice } from "../utils/format.js";

// Student "My Subscriptions" dashboard.
// Data sources (existing endpoints only):
// - GET /api/subscriptions/mine  -> the student's currently active subscriptions
//   (id, duration, startDate, endDate, status, teacher). Drives the plan cards,
//   stats and the cancel action.
// - GET /api/user/history        -> optional enrichment (all statuses + price).
//   Powers the "Expired" tab, the payment history panel and the total-paid
//   stat. Degrades gracefully when unavailable (tests, offline, permissions).
// Actions link to existing routes: teacher content (/content/teacher/:id),
// renewal/resubscribe (/teachers/:id/subscribe), browse (/teachers), billing
// history (/history) and support (/contact). Cancelling keeps the existing
// confirmation modal and POST /api/subscriptions/:id/cancel flow.

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 14;

const DURATION_LABEL = {
  ONE_MONTH: "1 month",
  THREE_MONTHS: "3 months",
  SIX_MONTHS: "6 months",
  ONE_YEAR: "1 year",
};

const AVATAR_HUES = [258, 160, 340, 24, 200, 130];

function durationLabel(duration) {
  if (!duration) return null;
  return DURATION_LABEL[duration] || String(duration).toLowerCase();
}

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function hueFor(id, name) {
  const seed = Number.isFinite(Number(id)) ? Number(id) : String(name || "").length;
  return AVATAR_HUES[Math.abs(seed) % AVATAR_HUES.length];
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysLeftOf(endDate) {
  const end = parseDate(endDate);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / DAY_MS));
}

function statusOf(sub) {
  const status = sub && sub.status;
  if (status === "EXPIRED" || status === "CANCELLED") return status;
  const days = daysLeftOf(sub && sub.endDate);
  if (days === null) return "ACTIVE";
  if (days === 0) return "EXPIRING_TODAY";
  if (days <= SOON_DAYS) return "EXPIRING";
  return "ACTIVE";
}

function isActiveLike(sub) {
  const st = statusOf(sub);
  return st === "ACTIVE" || st === "EXPIRING" || st === "EXPIRING_TODAY";
}

function planProgress(sub) {
  const start = parseDate(sub.startDate);
  const end = parseDate(sub.endDate);
  if (!start || !end) return null;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = Date.now() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function mergeItems(activeSubs, historyItems) {
  const byId = new Map();
  for (const h of historyItems) {
    if (!h || h.id === undefined) continue;
    byId.set(h.id, { ...h, teacher: { ...(h.teacher || {}) } });
  }
  for (const s of activeSubs) {
    if (!s || s.id === undefined) continue;
    const prev = byId.get(s.id);
    if (prev) {
      byId.set(s.id, {
        ...prev,
        ...s,
        price: s.price !== undefined && s.price !== null ? s.price : prev.price,
        teacher: { ...prev.teacher, ...(s.teacher || {}) },
      });
    } else {
      byId.set(s.id, { ...s, teacher: { ...(s.teacher || {}) } });
    }
  }
  return Array.from(byId.values());
}

function sortItems(list) {
  return [...list].sort((a, b) => {
    const aAct = isActiveLike(a) ? 0 : 1;
    const bAct = isActiveLike(b) ? 0 : 1;
    if (aAct !== bAct) return aAct - bAct;
    if (aAct === 0) {
      const aEnd = parseDate(a.endDate);
      const bEnd = parseDate(b.endDate);
      return (aEnd ? aEnd.getTime() : Infinity) - (bEnd ? bEnd.getTime() : Infinity);
    }
    const aStart = parseDate(a.startDate);
    const bStart = parseDate(b.startDate);
    return (bStart ? bStart.getTime() : 0) - (aStart ? aStart.getTime() : 0);
  });
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default function MySubscriptions() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("active");
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.mySubscriptions();
      const active = (data && data.subscriptions) || [];
      setSubscriptions(active);
      if (typeof endpoints.history === "function") {
        try {
          const hist = await endpoints.history({ limit: 50 });
          const items = hist && hist.subscriptions && hist.subscriptions.items;
          setHistoryItems(Array.isArray(items) ? items : []);
        } catch {
          setHistoryItems([]);
        }
      }
    } catch (err) {
      setSubscriptions([]);
      setHistoryItems([]);
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    if (confirmingId === null) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setConfirmingId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmingId]);

  async function handleCancel(subscriptionId) {
    setActionError(null);
    setCancelling(true);
    try {
      await endpoints.cancelSubscription(subscriptionId);
      setConfirmingId(null);
      await loadMine();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setCancelling(false);
    }
  }

  const items = useMemo(
    () => sortItems(mergeItems(subscriptions, historyItems)),
    [subscriptions, historyItems]
  );
  const activeItems = useMemo(() => items.filter(isActiveLike), [items]);
  const expiringItems = useMemo(
    () => activeItems.filter((s) => statusOf(s) !== "ACTIVE"),
    [activeItems]
  );
  const expiredItems = useMemo(
    () => items.filter((s) => statusOf(s) === "EXPIRED"),
    [items]
  );

  const tabs = [
    { key: "active", label: "Active", count: activeItems.length },
    { key: "expiring", label: "Expiring soon", count: expiringItems.length },
    { key: "expired", label: "Expired", count: expiredItems.length },
    { key: "all", label: "All", count: items.length },
  ];

  const visibleItems =
    tab === "expiring"
      ? expiringItems
      : tab === "expired"
        ? expiredItems
        : tab === "all"
          ? items
          : activeItems;

  const stats = useMemo(() => {
    const soon = [...expiringItems].sort((a, b) => {
      const aEnd = parseDate(a.endDate);
      const bEnd = parseDate(b.endDate);
      return (aEnd ? aEnd.getTime() : Infinity) - (bEnd ? bEnd.getTime() : Infinity);
    });
    const next = soon[0] || null;
    const totalDays = activeItems.reduce(
      (sum, s) => sum + (daysLeftOf(s.endDate) || 0),
      0
    );
    const paidSource = historyItems.length
      ? historyItems
      : items.filter((s) => s.price !== undefined && s.price !== null);
    const totalPaid = paidSource.reduce(
      (sum, s) => sum + (Number(s.price) || 0),
      0
    );
    return {
      activeCount: activeItems.length,
      activeNames: activeItems.length
        ? `With ${activeItems
            .map((s) => (s.teacher && s.teacher.name) || null)
            .filter(Boolean)
            .slice(0, 3)
            .join(" · ")}`
        : "No active teachers yet",
      soonCount: soon.length,
      soonHint: next
        ? `${(next.teacher && next.teacher.name) || "Teacher"} · ${formatDate(next.endDate)}`
        : "Nothing in the next 14 days",
      totalDays,
      totalPaid: formatPrice(totalPaid),
      paidCount: paidSource.length,
    };
  }, [activeItems, expiringItems, historyItems, items]);

  const upcomingRenewals = useMemo(() => activeItems.slice(0, 4), [activeItems]);
  const paymentRows = useMemo(
    () =>
      [...historyItems]
        .sort((a, b) => {
          const aStart = parseDate(a.startDate);
          const bStart = parseDate(b.startDate);
          return (bStart ? bStart.getTime() : 0) - (aStart ? aStart.getTime() : 0);
        })
        .slice(0, 4),
    [historyItems]
  );

  const confirmingSub = items.find((s) => s.id === confirmingId) || null;

  function renderCard(sub) {
    const teacher = sub.teacher || {};
    const st = statusOf(sub);
    const days = daysLeftOf(sub.endDate);
    const progress = planProgress(sub);
    const dur = durationLabel(sub.duration);
    const active = isActiveLike(sub);
    const badge =
      st === "EXPIRED"
        ? { label: "Expired", className: "msb-badge--expired" }
        : st === "CANCELLED"
          ? { label: "Cancelled", className: "msb-badge--cancelled" }
          : st === "EXPIRING_TODAY"
            ? { label: "Expires today", className: "msb-badge--soon" }
            : st === "EXPIRING"
              ? {
                  label: `Expires in ${plural(days, "day")}`,
                  className: "msb-badge--soon",
                }
              : { label: "Active", className: "msb-badge--active" };
    const renewing = active && st !== "ACTIVE";

    return (
      <article key={sub.id} className="msb-card">
        <span
          className="msb-avatar"
          style={{ "--msb-hue": hueFor(sub.id, teacher.name) }}
          aria-hidden="true"
        >
          {initialsOf(teacher.name)}
        </span>
        <div className="msb-body">
          <div className="msb-top">
            <div className="msb-identity">
              <h3>{teacher.name}</h3>
              <p className="muted small">
                {teacher.subject || "Teacher"}
                {teacher.gradeClass ? ` · ${teacher.gradeClass}` : ""}
              </p>
            </div>
            <div className="msb-badges">
              {dur ? <span className="msb-duration">{dur}</span> : null}
              <span className={`msb-badge ${badge.className}`}>{badge.label}</span>
            </div>
          </div>
          <div className="msb-progress">
            <div className="msb-progress-head">
              <span className="muted small">
                {active ? "Time left" : "Plan ended"}
              </span>
              <strong>
                {active
                  ? days === null
                    ? "—"
                    : days === 0
                      ? "Ends today"
                      : `${plural(days, "day")} left`
                  : "0 days left"}
              </strong>
            </div>
            {progress !== null ? (
              <div
                className="msb-track"
                role="progressbar"
                aria-label={`Plan progress for ${teacher.name || "teacher"}`}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="msb-fill" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <div className="msb-range muted small">
              {sub.startDate ? formatDate(sub.startDate) : "—"} →{" "}
              {sub.endDate ? formatDate(sub.endDate) : "—"}
              {sub.price !== undefined && sub.price !== null
                ? ` · Paid ${formatPrice(sub.price)}`
                : ""}
            </div>
          </div>
        </div>
        <div className="msb-actions">
          {active ? (
            <>
              {renewing ? (
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => navigate(`/teachers/${teacher.id}/subscribe`)}
                >
                  Renew now
                </button>
              ) : null}
              <button
                type="button"
                className={renewing ? "btn btn-ghost btn-sm" : "btn btn-dark btn-sm"}
                onClick={() => navigate(`/content/teacher/${teacher.id}`)}
              >
                Continue learning
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmingId(sub.id)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() => navigate(`/teachers/${teacher.id}/subscribe`)}
            >
              Resubscribe
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="page msb-page">
      <header className="msb-head">
        <div className="msb-head-text">
          <span className="eyebrow">My subscriptions</span>
          <h1>Everything you&rsquo;re learning, in one place</h1>
          <p className="muted">
            Track plan status, time left and progress for each teacher.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-dark"
          onClick={() => navigate("/teachers")}
        >
          + Subscribe to a teacher
        </button>
      </header>

      {actionError ? <ErrorBox error={actionError} /> : null}

      {loading ? (
        <Loader label="Loading your subscriptions..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={loadMine} />
      ) : (
        <>
          <div className="msb-stats">
            <div className="msb-stat">
              <span className="msb-stat-label">Active plans</span>
              <strong className="msb-stat-value">{stats.activeCount}</strong>
              <span className="msb-stat-hint muted small">{stats.activeNames}</span>
            </div>
            <div className="msb-stat msb-stat--soon">
              <span className="msb-stat-label">Expiring soon</span>
              <strong className="msb-stat-value">{stats.soonCount}</strong>
              <span className="msb-stat-hint muted small">{stats.soonHint}</span>
            </div>
            <div className="msb-stat">
              <span className="msb-stat-label">Days of access</span>
              <strong className="msb-stat-value">{stats.totalDays}</strong>
              <span className="msb-stat-hint muted small">
                Across {plural(stats.activeCount, "active plan")}
              </span>
            </div>
            <div className="msb-stat">
              <span className="msb-stat-label">Total paid</span>
              <strong className="msb-stat-value">{stats.totalPaid}</strong>
              <span className="msb-stat-hint muted small">
                Across {plural(stats.paidCount, "subscription")}
              </span>
            </div>
          </div>

          <div className="msb-grid">
            <div className="msb-main">
              <div className="msb-tabs" role="group" aria-label="Filter subscriptions">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={tab === t.key ? "msb-tab msb-tab--active" : "msb-tab"}
                    aria-pressed={tab === t.key}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                    <span className="msb-count">{t.count}</span>
                  </button>
                ))}
              </div>

              {items.length === 0 ? (
                <EmptyState
                  title="You haven't subscribed to any instructors yet"
                  hint="Browse qualified teachers, choose a plan, and unlock their lectures, lesson content, and homework."
                  action={
                    <div
                      className="btn-row"
                      style={{ justifyContent: "center", marginTop: "0.75rem" }}
                    >
                      <button
                        type="button"
                        className="btn btn-dark btn-sm"
                        onClick={() => navigate("/teachers")}
                      >
                        Browse teachers
                      </button>
                    </div>
                  }
                />
              ) : visibleItems.length === 0 ? (
                <p className="muted small msb-list-empty">Nothing in this tab yet.</p>
              ) : (
                <div className="msb-list">{visibleItems.map(renderCard)}</div>
              )}
            </div>

            <aside className="msb-side">
              <section className="msb-panel">
                <h2 className="msb-side-title">Upcoming renewals</h2>
                {upcomingRenewals.length === 0 ? (
                  <p className="muted small">No plans up for renewal right now.</p>
                ) : (
                  upcomingRenewals.map((sub) => {
                    const teacher = sub.teacher || {};
                    const dur = durationLabel(sub.duration);
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        className="msb-side-row"
                        onClick={() => navigate(`/teachers/${teacher.id}/subscribe`)}
                        title={`Renew ${teacher.name || "plan"}`}
                      >
                        <span className="msb-side-main">
                          <strong>
                            {teacher.name ? `Mr. ${teacher.name}` : "Teacher"}
                          </strong>
                          <span className="muted small">{dur || "Plan"}</span>
                        </span>
                        <span className="msb-side-amount">
                          {sub.endDate ? formatDate(sub.endDate) : "—"}
                        </span>
                      </button>
                    );
                  })
                )}
              </section>

              <section className="msb-panel">
                <h2 className="msb-side-title">Payment history</h2>
                {paymentRows.length === 0 ? (
                  <p className="muted small">No payments recorded yet.</p>
                ) : (
                  paymentRows.map((sub) => {
                    const teacher = sub.teacher || {};
                    const dur = durationLabel(sub.duration);
                    return (
                      <div key={sub.id} className="msb-side-row msb-side-row--static">
                        <span className="msb-side-main">
                          <strong>
                            {teacher.subject || teacher.name || "Teacher"}
                            {dur ? ` · ${dur}` : ""}
                          </strong>
                          <span className="muted small">
                            {sub.startDate ? formatDate(sub.startDate) : "—"} ·{" "}
                            {String(sub.status || "ACTIVE").toLowerCase()}
                          </span>
                        </span>
                        <span className="msb-side-amount">
                          {sub.price !== undefined && sub.price !== null
                            ? formatPrice(sub.price)
                            : "—"}
                        </span>
                      </div>
                    );
                  })
                )}
                <button
                  type="button"
                  className="msb-side-foot"
                  onClick={() => navigate("/history")}
                >
                  View full history →
                </button>
              </section>

              <section className="msb-panel msb-help">
                <h2 className="msb-side-title">Need billing help?</h2>
                <p className="muted small">
                  Payment not confirmed or a plan not unlocked? Our team replies in
                  minutes.
                </p>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => navigate("/contact")}
                >
                  Contact support
                </button>
              </section>
            </aside>
          </div>
        </>
      )}

      {confirmingSub ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!cancelling) setConfirmingId(null);
          }}
        >
          <div
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-sub-title"
            aria-describedby="cancel-sub-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="modal-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3 1.8 20.2h20.4L12 3zm0 6.2v4.4m0 2.9v.1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 id="cancel-sub-title">Cancel subscription?</h2>
            <p id="cancel-sub-desc" className="muted">
              You are about to cancel your subscription
              {confirmingSub.teacher && confirmingSub.teacher.name ? (
                <> with <strong>Mr. {confirmingSub.teacher.name}</strong></>
              ) : null}
              . You will immediately lose access to their lectures, lesson content, and homework.
              This action cannot be undone.
            </p>
            <div className="btn-row modal-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={cancelling}
                onClick={() => setConfirmingId(null)}
              >
                Keep my subscription
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={cancelling}
                onClick={() => handleCancel(confirmingSub.id)}
              >
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
