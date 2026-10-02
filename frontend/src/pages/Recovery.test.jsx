import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "./ForgotPassword.jsx";
import ResetPassword from "./ResetPassword.jsx";
import VerifyEmail from "./VerifyEmail.jsx";

const { mockResetReq, mockResetConfirm, mockVerifyResend, mockVerifyConfirm } = vi.hoisted(() => ({
  mockResetReq: vi.fn(),
  mockResetConfirm: vi.fn(),
  mockVerifyResend: vi.fn(),
  mockVerifyConfirm: vi.fn(),
}));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      requestPasswordReset: (...args) => mockResetReq(...args),
      confirmPasswordReset: (...args) => mockResetConfirm(...args),
      resendVerification: (...args) => mockVerifyResend(...args),
      confirmVerification: (...args) => mockVerifyConfirm(...args),
    },
  };
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockResetReq.mockReset();
  mockResetConfirm.mockReset();
  mockVerifyResend.mockReset();
  mockVerifyConfirm.mockReset();
});

describe("password recovery pages", () => {
  it("requests a reset token with a generic confirmation", async () => {
    mockResetReq.mockResolvedValueOnce({ message: "If an account exists for this email, a reset token has been sent." });
    renderAt("/forgot-password");
    await userEvent.type(screen.getByLabelText(/email/i), "s@test.dev");
    await userEvent.click(screen.getByRole("button", { name: /send reset token/i }));
    await waitFor(() => {
      expect(mockResetReq).toHaveBeenCalledWith({ email: "s@test.dev" });
      expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    });
  });

  it("confirms a reset with token and new password", async () => {
    mockResetConfirm.mockResolvedValueOnce({ message: "Password reset. Please log in again." });
    renderAt("/reset-password?token=abc123");
    await userEvent.type(screen.getByLabelText(/new password/i), "brandnew1");
    await userEvent.click(screen.getByRole("button", { name: /^reset password$/i }));
    await waitFor(() => {
      expect(mockResetConfirm).toHaveBeenCalledWith({ token: "abc123", newPassword: "brandnew1" });
      expect(screen.getByText(/please log in again/i)).toBeInTheDocument();
    });
  });
});

describe("email verification page", () => {
  it("auto-confirms a token from the link", async () => {
    mockVerifyConfirm.mockResolvedValueOnce({ message: "Email verified." });
    renderAt("/verify-email?token=tok123");
    await waitFor(() => {
      expect(mockVerifyConfirm).toHaveBeenCalledWith({ token: "tok123" });
      expect(screen.getByText("Email verified.")).toBeInTheDocument();
    });
  });

  it("resends a token for an email address", async () => {
    mockVerifyResend.mockResolvedValueOnce({ message: "If an account exists for this email, a verification token has been sent." });
    renderAt("/verify-email");
    await userEvent.type(screen.getByLabelText(/email/i), "s@test.dev");
    await userEvent.click(screen.getByRole("button", { name: /resend verification token/i }));
    await waitFor(() => {
      expect(mockVerifyResend).toHaveBeenCalledWith({ email: "s@test.dev" });
    });
  });
});
