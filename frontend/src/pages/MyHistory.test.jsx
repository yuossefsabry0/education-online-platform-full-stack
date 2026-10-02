import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyHistory from "./MyHistory.jsx";

const { mockHistory } = vi.hoisted(() => ({ mockHistory: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: { history: (...args) => mockHistory(...args) },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <Routes>
        <Route path="/history" element={<MyHistory />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockHistory.mockReset();
});

describe("MyHistory", () => {
  it("renders scoped subscriptions and events", async () => {
    mockHistory.mockResolvedValueOnce({
      subscriptions: {
        items: [{ id: 1, duration: "ONE_MONTH", status: "ACTIVE", startDate: new Date().toISOString(), teacherRole: "SUB9", teacher: { id: 9, name: "T Nine" } }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
      events: {
        items: [{ id: 2, actionType: "SUBSCRIPTION_CREATED", timestamp: new Date().toISOString() }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
      expect(screen.getByText("SUBSCRIPTION_CREATED")).toBeInTheDocument();
    });
    expect(mockHistory).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it("shows empty states without leaking data", async () => {
    mockHistory.mockResolvedValueOnce({
      subscriptions: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
      events: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no subscription records/i)).toBeInTheDocument();
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });
});
