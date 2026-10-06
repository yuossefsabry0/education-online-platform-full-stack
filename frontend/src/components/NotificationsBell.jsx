import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { endpoints } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const TYPE_META = {
  lecture: { label: "Lecture", className: "notif-icon--lecture" },
  subscription: { label: "Subscription", className: "notif-icon--subscription" },
  payment: { label: "Payment", className: "notif-icon--payment" },
  expiry: { label: "Expiry", className: "notif-icon--expiry" },
  login: { label: "Login", className: "notif-icon--login" },
  announcement: { label: "Announcement", className: "notif-icon--announcement" },
  photo: { label: "Photo", className: "notif-icon--photo" },
};

function typeIcon(type) {
  if (type === "lecture") {
    return (
      <svg {...spreadProps()}>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  }
  if (type === "subscription") {
    return (
      <svg {...spreadProps()}>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (type === "payment") {
    return (
      <svg {...spreadProps()}>
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    );
  }
  if (type === "expiry") {
    return (
      <svg {...spreadProps()}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </svg>
    );
  }
  if (type === "announcement") {
    return (
      <svg {...spreadProps()}>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    );
  }
  if (type === "photo") {
    return (
      <svg {...spreadProps()}>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    );
  }
  return (
    <svg {...spreadProps()}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" x2="3" y1="12" y2="12" />
    </svg>
  );
}

// Minimal helper: turn an SVG attribute string into a props object.
// Keeps every icon on the same 16px stroke-2 style without new dependencies.
function spreadProps() {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(Math.floor((Date.now() - then) / 1000), 0);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function seenKey(userId) {
  return `edu-notif-seen-${userId ?? "anon"}`;
}

export default function NotificationsBell() {
  const { user, isAuthenticated, userType } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [seenAt, setSeenAt] = useState(() => {
    try {
      return localStorage.getItem(seenKey(user && user.id)) || null;
    } catch {
      return null;
    }
  });
  const wrapRef = useRef(null);

  const canView = isAuthenticated && (userType === "student" || userType === "teacher");

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    async function load() {
      try {
        if (typeof endpoints.notifications !== "function") return;
        const data = await endpoints.notifications({ limit: 20 });
        if (!cancelled && data && Array.isArray(data.notifications)) {
          setItems(data.notifications);
        }
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canView]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  if (!canView) return null;

  const unread = seenAt
    ? items.filter((n) => new Date(n.timestamp) > new Date(seenAt)).length
    : items.length;

  function markSeen() {
    try {
      const now = new Date().toISOString();
      localStorage.setItem(seenKey(user && user.id), now);
      setSeenAt(now);
    } catch {
      /* ignore storage errors */
    }
  }

  function toggleOpen() {
    if (open) {
      setOpen(false);
      setExpandedId(null);
    } else {
      // Notifications count as read the moment the icon is clicked.
      markSeen();
      setOpen(true);
    }
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="nav-icon-btn"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="notif-dot" aria-hidden="true" />
        ) : null}
      </button>
      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <span className="notif-back" aria-hidden="true">←</span>
            <strong>Notifications</strong>
            {unread > 0 ? <span className="notif-count">{unread} new</span> : null}
          </div>
          {items.length === 0 ? (
            <p className="muted small notif-empty">No notifications yet.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.login;
                const expanded = expandedId === n.id;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={expanded ? "notif-item expanded" : "notif-item"}
                      onClick={() => setExpandedId(expanded ? null : n.id)}
                      aria-expanded={expanded}
                      aria-label={`${n.title}, ${relativeTime(n.timestamp)}`}
                    >
                      <span className={`notif-icon ${meta.className}`} aria-hidden="true">
                        {typeIcon(n.type)}
                      </span>
                      <span className="notif-text">
                        <strong className="notif-title">{n.title}</strong>
                        <span className="muted small notif-sub">{n.message}</span>
                        {expanded ? (
                          <span className="muted small notif-detail">
                            {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}
                            {n.link ? (
                              <>
                                {" · "}
                                <Link
                                  to={n.link}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen(false);
                                  }}
                                >
                                  View
                                </Link>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="muted small notif-time">{relativeTime(n.timestamp)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
