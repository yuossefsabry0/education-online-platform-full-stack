import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/AuthContext.jsx";
import Navbar from "./Navbar.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function ShowPath() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderBar(authValue) {
  useAuth.mockReturnValue(authValue);
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Navbar />
      <Routes>
        <Route path="/register" element={<ShowPath />} />
        <Route path="/admin/dashboard" element={<ShowPath />} />
        <Route path="/teacher/dashboard" element={<ShowPath />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Navbar Get Started", () => {
  it("sends logged-out visitors to registration", async () => {
    renderBar({ user: null, isAuthenticated: false, userType: null, logout: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /get started/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/register");
    });
  });
});
