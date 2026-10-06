import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import NotificationsBell from "./NotificationsBell.jsx";

function destinationFor(userType) {
  if (userType === "admin") return "/admin/dashboard";
  if (userType === "teacher") return "/teacher/dashboard";
  if (userType === "student") return "/home";
  return "/register";
}

function getInitials(user) {
  const raw = (user?.name || user?.username || "").trim();
  if (!raw) return "••";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

export default function Navbar() {
  const { user, isAuthenticated, userType, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location?.pathname === "/login" || location?.pathname === "/register";
  const userInitials = getInitials(user);
  const userFullName = (user?.name || user?.username || "Profile").trim() || "Profile";
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem("edu-theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch {
      /* ignore storage errors */
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("edu-theme", theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme]);

  const isDark = theme === "dark";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  // Bottom floating nav items — same routes/labels as the top bar nav-links.
  // Top bar (brand, theme toggle, logout/login) is left untouched above.
  const bottomNavItems = [
    {
      to: "/home",
      label: "Home",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    ...(userType !== "teacher"
      ? [
          {
            to: "/teachers",
            label: "Teachers",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ),
          },
        ]
      : []),
    ...(isAuthenticated && userType === "student"
      ? [
          {
            to: "/my-subscriptions",
            label: "My Subscriptions",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
            ),
          },
          {
            to: "/my-lectures",
            label: "My Lectures",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            ),
          },
          {
            to: "/profile",
            label: "Profile",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
          },
          {
            to: "/history",
            label: "History",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            ),
          },
        ]
      : []),
    ...(isAuthenticated && userType === "teacher"
      ? [
          {
            to: "/teacher/dashboard",
            label: "Dashboard",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
            ),
          },
          {
            to: "/profile",
            label: "Profile",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
          },
        ]
      : []),
    ...(isAuthenticated && userType === "admin"
      ? [
          {
            to: "/admin/dashboard",
            label: "Admin",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ),
          },
          {
            to: "/profile",
            label: "Profile",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/home" className="brand">
          <span className="brand-mark">E</span>
          <span className="brand-text">Education System</span>
        </Link>
        <div className="nav-actions">
          {isAuthenticated ? (
            <>
            <NotificationsBell />
            <Link to="/profile" className="nav-user-chip" title={userFullName} aria-label={`Profile of ${userFullName}`}>
              <span className="nav-user-chip-avatar" aria-hidden="true">
                {userInitials}
              </span>
              <span className="nav-user-chip-text">
                <strong className="nav-user-chip-name">{userFullName}</strong>
                {userType ? <small className="nav-user-chip-role">{userType}</small> : null}
              </span>
            </Link>
            </>
          ) : isAuthPage ? (
            <>
              <button
                type="button"
                className="nav-icon-btn theme-toggle theme-toggle--icon-only"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-pressed={isDark}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                <span className="theme-toggle-icon" aria-hidden="true">
                  {isDark ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun preview-icon" aria-hidden="true" focusable="false">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-moon preview-icon" aria-hidden="true" focusable="false">
                      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
                    </svg>
                  )}
                </span>
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/login")}>
                Login
              </button>
              <button
                type="button"
                className="btn btn-dark btn-sm"
                onClick={() => navigate(destinationFor(userType))}
              >
                Get Started
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() => navigate(destinationFor(userType))}
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </header>
    {!isAuthPage ? (
    <nav className="bottom-nav" aria-label="Primary">
      {bottomNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? "bottom-nav-link active" : "bottom-nav-link")}
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="bottom-nav-link bottom-nav-link--button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-pressed={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
            </svg>
          )}
        </span>
        <span className="bottom-nav-label">{isDark ? "Light" : "Dark"}</span>
      </button>
      {!isAuthenticated ? (
        <button
          type="button"
          className="bottom-nav-link bottom-nav-link--button"
          onClick={() => navigate("/login")}
          aria-label="Login"
          title="Login"
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" x2="3" y1="12" y2="12" />
            </svg>
          </span>
          <span className="bottom-nav-label">Login</span>
        </button>
      ) : (
        <button
          type="button"
          className="bottom-nav-link bottom-nav-link--button"
          onClick={handleLogout}
          aria-label="Logout"
          title="Logout"
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            </svg>
          </span>
          <span className="bottom-nav-label">Logout</span>
        </button>
      )}
    </nav>
    ) : null}
    </>
  );
}
