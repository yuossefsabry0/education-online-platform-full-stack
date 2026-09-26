import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="page page-narrow">
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      <button type="button" className="btn btn-dark" onClick={() => navigate("/home")}>
        Go home
      </button>
    </div>
  );
}
