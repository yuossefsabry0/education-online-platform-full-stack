import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// UI-only route guard. The backend remains the authority for auth/z;
// API 401/403 responses are handled by the api layer and pages.
export default function ProtectedRoute({ allow, children }) {
  const { isAuthenticated, userType, authenticating } = useAuth();
  const location = useLocation();

  if (authenticating) {
    return (
      <div className="page">
        <div className="loader" role="status" aria-label="Loading" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (allow && !allow.includes(userType)) {
    const fallback = userType === "admin" ? "/admin/dashboard" : userType === "teacher" ? "/teacher/dashboard" : "/home";
    return <Navigate to={fallback} replace />;
  }
  return children;
}
