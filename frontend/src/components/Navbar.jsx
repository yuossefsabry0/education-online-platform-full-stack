import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function destinationFor(userType) {
  if (userType === "admin") return "/admin/dashboard";
  if (userType === "teacher") return "/teacher/dashboard";
  return "/home";
}

export default function Navbar() {
  const { user, isAuthenticated, userType, logout } = useAuth();
  const navigate = useNavigate();

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
          <NavLink to="/teachers" className={({ isActive }) => (isActive ? "active" : "")}>
            Teachers
          </NavLink>
          {isAuthenticated && userType === "student" && (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              Profile
            </NavLink>
          )}
          {isAuthenticated && userType === "teacher" && (
            <NavLink to="/teacher/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
          )}
          {isAuthenticated && userType === "admin" && (
            <NavLink to="/admin/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <span className="nav-user" title={userType || ""}>
                {user?.username} <span className="role-badge">{userType}</span>
              </span>
              <button type="button" className="btn btn-dark btn-sm" onClick={handleLogout}>
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
