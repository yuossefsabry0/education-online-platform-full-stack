import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function destinationFor(userType) {
  if (userType === "admin") return "/admin/dashboard";
  if (userType === "teacher") return "/teacher/dashboard";
  if (userType === "student") return "/home";
  return "/register";
}

export default function Navbar() {
  const { user, isAuthenticated, userType, logout } = useAuth();
  const navigate = useNavigate();
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

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/home" className="brand">
          <span className="brand-mark">E</span>
          <span className="brand-text">Education System</span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/home" className={({ isActive }) => (isActive ? "active" : "")}>
            Home
          </NavLink>
          {userType !== "teacher" ? (
            <NavLink to="/teachers" className={({ isActive }) => (isActive ? "active" : "")}>
              Teachers
            </NavLink>
          ) : null}
          {isAuthenticated && userType === "student" && (
            <NavLink to="/my-subscriptions" className={({ isActive }) => (isActive ? "active" : "")}>
              My Subscriptions
            </NavLink>
          )}
          {isAuthenticated && userType === "student" && (
            <NavLink to="/my-lectures" className={({ isActive }) => (isActive ? "active" : "")}>
              My Lectures
            </NavLink>
          )}
          {isAuthenticated && userType === "student" && (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              Profile
            </NavLink>
          )}
          {isAuthenticated && userType === "student" && (
            <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
              History
            </NavLink>
          )}
          {isAuthenticated && userType === "teacher" && (
            <NavLink to="/teacher/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
          )}
          {isAuthenticated && userType === "teacher" && (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              Profile
            </NavLink>
          )}
          {isAuthenticated && userType === "admin" && (
            <NavLink to="/admin/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Admin
            </NavLink>
          )}
          {isAuthenticated && userType === "admin" && (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              Profile
            </NavLink>
          )}
        </nav>
        <div className="nav-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm theme-toggle"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-pressed={isDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun preview-icon" aria-hidden="true" focusable="false">
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-moon preview-icon" aria-hidden="true" focusable="false">
                  <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
                </svg>
              )}
            </span>
            <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
          </button>
          {isAuthenticated ? (
            <>
              <span className="nav-user" title={userType || ""}>
                {userType === "admin"
                  ? `Welcome ${user?.name || user?.username || "there"} to the Admin Dashboard.`
                  : `Welcome, ${user?.name || user?.username || "there"}`}
              </span>
              <button type="button" className="btn btn-dark btn-sm" onClick={handleLogout}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out preview-icon" aria-hidden="true" focusable="false" style={{ verticalAlign: "-3px", marginRight: "0.4rem" }}>
                  <path d="m16 17 5-5-5-5" />
                  <path d="M21 12H9" />
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                </svg>
                Logout
              </button>
            </>
          ) : (
            <>
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
          )}
        </div>
      </div>
    </header>
  );
}
