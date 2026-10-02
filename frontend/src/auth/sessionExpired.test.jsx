import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext.jsx";

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      refresh: vi.fn().mockRejectedValue(new Error("no session")),
      me: vi.fn().mockRejectedValue(new Error("no session")),
    },
  };
});

function ShowLogin() {
  const location = useLocation();
  return <div>Login from:{location.state && location.state.from ? location.state.from : "none"}</div>;
}

describe("session expiry redirect", () => {
  it("redirects to login preserving the requested path", async () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/content/teacher/5"]}>
        <AuthProvider>
          <Routes>
            <Route path="/content/teacher/5" element={<div>Secret page</div>} />
            <Route path="/login" element={<ShowLogin />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("Secret page")).toBeInTheDocument();
    });
    window.dispatchEvent(
      new CustomEvent("edu:session-expired", { detail: { from: "/content/teacher/5" } })
    );
    await waitFor(() => {
      expect(screen.getByText("Login from:/content/teacher/5")).toBeInTheDocument();
    });
  });
});
