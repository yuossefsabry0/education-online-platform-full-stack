import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MySubscriptions from "./MySubscriptions.jsx";

const { mockMine } = vi.hoisted(() => ({ mockMine: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: { mySubscriptions: (...args) => mockMine(...args) },
  };
});

function ShowPath() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my-subscriptions"]}>
      <Routes>
        <Route path="/my-subscriptions" element={<MySubscriptions />} />
        <Route path="/content/teacher/:teacherId" element={<ShowPath />} />
        <Route path="/teachers" element={<ShowPath />} />
      </Routes>
    </MemoryRouter>
  );
}

function denied() {
  return {
    response: {
      status: 401,
      data: { success: false, data: null, error: { code: "UNAUTHORIZED", message: "Auth", details: null } },
    },
  };
}

beforeEach(() => {
  mockMine.mockReset();
});

describe("MySubscriptions", () => {
  it("lists subscriptions with teacher details", async () => {
    mockMine.mockResolvedValueOnce({
      subscriptions: [
        { id: 3, endDate: new Date().toISOString(), teacher: { id: 9, name: "T Nine", subject: "Math", gradeClass: "G1" } },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /view content/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/content/teacher/9");
    });
  });

  it("shows the empty state with a browse action", async () => {
    mockMine.mockResolvedValueOnce({ subscriptions: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/haven't subscribed/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /browse teachers/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/teachers");
    });
  });

  it("shows the error state", async () => {
    mockMine.mockRejectedValueOnce(denied());
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Auth")).toBeInTheDocument();
    });
  });
});
