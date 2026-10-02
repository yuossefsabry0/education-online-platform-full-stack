import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.jsx";

function renderAt(authValue, initialPath) {
  useAuth.mockReturnValue(authValue);
  return render(
    <MemoryRouter initialEntries={[initialPath || "/content/teacher/5"]}>
      <Routes>
        <Route
          path="/content/teacher/5"
          element={
            <ProtectedRoute allow={["student"]}>
              <div>Secret page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/home" element={<div>Home page</div>} />
        <Route path="/teacher/dashboard" element={<div>Teacher home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("renders children for an allowed role", () => {
    renderAt({ isAuthenticated: true, userType: "student", authenticating: false });
    expect(screen.getByText("Secret page")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", () => {
    renderAt({ isAuthenticated: false, userType: null, authenticating: false });
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects a denied role to its fallback", () => {
    renderAt({ isAuthenticated: true, userType: "teacher", authenticating: false });
    expect(screen.getByText("Teacher home")).toBeInTheDocument();
  });
});
