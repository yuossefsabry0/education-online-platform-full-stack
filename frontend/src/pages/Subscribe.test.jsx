import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Subscribe from "./Subscribe.jsx";

const { mockPlans, mockConfirm } = vi.hoisted(() => ({
  mockPlans: vi.fn(),
  mockConfirm: vi.fn(),
}));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      subscriptionPlans: (...args) => mockPlans(...args),
      confirmPayment: (...args) => mockConfirm(...args),
    },
  };
});

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ userType: "student" }),
}));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/teachers/5/subscribe"]}>
      <Routes>
        <Route path="/teachers/:teacherId/subscribe" element={<Subscribe />} />
      </Routes>
    </MemoryRouter>
  );
}

function plansPayload(active) {
  return {
    teacher: { id: 5, name: "T Five", subject: "Math", gradeClass: "G" },
    plans: [{ duration: "ONE_MONTH", label: "1 Month", price: "60.00" }],
    hasActiveSubscription: active,
    activeSubscription: active ? { endDate: new Date().toISOString() } : null,
  };
}

beforeEach(() => {
  mockPlans.mockReset();
  mockConfirm.mockReset();
});

describe("Subscribe", () => {
  it("renders plans and confirms payment", async () => {
    mockPlans.mockResolvedValueOnce(plansPayload(false));
    mockConfirm.mockResolvedValueOnce({ message: "Payment confirmed. Subscription activated." });
    renderAt();
    await waitFor(() => {
      expect(screen.getByText("1 Month")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /confirm payment/i }));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith({ teacherId: 5, duration: "ONE_MONTH" });
    });
    await waitFor(() => {
      expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /go to content/i })).toBeInTheDocument();
    });
  });

  it("shows the already-subscribed state instead of the form", async () => {
    mockPlans.mockResolvedValueOnce(plansPayload(true));
    renderAt();
    await waitFor(() => {
      expect(screen.getByText(/already have an active subscription/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /confirm payment/i })).not.toBeInTheDocument();
  });
});
