import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MySubscriptions from "./MySubscriptions.jsx";

const { mockMine, mockCancel } = vi.hoisted(() => ({ mockMine: vi.fn(), mockCancel: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      mySubscriptions: (...args) => mockMine(...args),
      cancelSubscription: (...args) => mockCancel(...args),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my-subscriptions"]}>
      <Routes>
        <Route path="/my-subscriptions" element={<MySubscriptions />} />
      </Routes>
    </MemoryRouter>
  );
}

function subRow() {
  return {
    subscriptions: [
      { id: 3, status: "ACTIVE", endDate: new Date().toISOString(), teacher: { id: 9, name: "T Nine", subject: "Math", gradeClass: "G1" } },
    ],
  };
}

beforeEach(() => {
  mockMine.mockReset();
  mockCancel.mockReset();
});

describe("MySubscriptions cancellation", () => {
  it("confirms then cancels and reloads the list", async () => {
    mockMine.mockResolvedValueOnce(subRow());
    mockMine.mockResolvedValueOnce({ subscriptions: [] });
    mockCancel.mockResolvedValueOnce({ message: "Subscription cancelled." });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));
    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith(3);
    });
    await waitFor(() => {
      expect(screen.getByText(/haven't subscribed/i)).toBeInTheDocument();
    });
  });

  it("surfaces cancellation errors", async () => {
    mockMine.mockResolvedValueOnce(subRow());
    mockCancel.mockRejectedValueOnce({
      response: { status: 409, data: { error: { code: "SUBSCRIPTION_NOT_ACTIVE", message: "Gone", details: null } } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));
    await waitFor(() => {
      expect(screen.getByText("Gone")).toBeInTheDocument();
    });
  });
});
