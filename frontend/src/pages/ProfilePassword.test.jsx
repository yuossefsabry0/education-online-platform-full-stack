import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/AuthContext.jsx";
import Profile from "./Profile.jsx";

const { mockMe, mockChange } = vi.hoisted(() => ({ mockMe: vi.fn(), mockChange: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      me: (...args) => mockMe(...args),
      changePassword: (...args) => mockChange(...args),
    },
  };
});

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockMe.mockReset();
  mockChange.mockReset();
  useAuth.mockReturnValue({ logout: vi.fn() });
  mockMe.mockResolvedValue({
    user: { userType: "student", id: 1, username: "s1" },
    activeRoles: [],
    teachers: [],
  });
});

describe("Profile password change", () => {
  it("submits current and new passwords then returns to login", async () => {
    mockChange.mockResolvedValueOnce({ message: "Password changed. Please log in again." });
    const logout = vi.fn();
    useAuth.mockReturnValue({ logout });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Change password", { selector: "h2" })).toBeInTheDocument();
    });
    await userEvent.type(screen.getByLabelText(/current password/i), "old12345");
    await userEvent.type(screen.getByLabelText(/new password/i), "new12345");
    await userEvent.click(screen.getByRole("button", { name: /^change password$/i }));
    await waitFor(() => {
      expect(mockChange).toHaveBeenCalledWith({ currentPassword: "old12345", newPassword: "new12345" });
    });
    await waitFor(() => {
      expect(logout).toHaveBeenCalled();
      expect(screen.getByText("Login page")).toBeInTheDocument();
    });
  });

  it("shows backend errors without navigating", async () => {
    mockChange.mockRejectedValueOnce({
      response: { status: 401, data: { error: { code: "INVALID_CURRENT_PASSWORD", message: "Wrong", details: null } } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Change password", { selector: "h2" })).toBeInTheDocument();
    });
    await userEvent.type(screen.getByLabelText(/current password/i), "bad");
    await userEvent.type(screen.getByLabelText(/new password/i), "new12345");
    await userEvent.click(screen.getByRole("button", { name: /^change password$/i }));
    await waitFor(() => {
      expect(screen.getByText("Wrong")).toBeInTheDocument();
    });
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
