import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyLectures from "./MyLectures.jsx";

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
    <MemoryRouter initialEntries={["/my-lectures"]}>
      <Routes>
        <Route path="/my-lectures" element={<MyLectures />} />
        <Route path="/content/teacher/:teacherId" element={<ShowPath />} />
        <Route path="/teachers" element={<ShowPath />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockMine.mockReset();
});

describe("MyLectures", () => {
  it("navigates straight to lectures with a single subscription", async () => {
    mockMine.mockResolvedValueOnce({
      subscriptions: [
        { id: 3, teacher: { id: 9, name: "T Nine", subject: "Math", gradeClass: "G1" } },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/content/teacher/9");
    });
  });

  it("shows a teacher picker with several subscriptions", async () => {
    mockMine.mockResolvedValueOnce({
      subscriptions: [
        { id: 3, teacher: { id: 9, name: "T Nine", subject: "Math", gradeClass: "G1" } },
        { id: 4, teacher: { id: 10, name: "T Ten", subject: "English", gradeClass: "G2" } },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
    });
    expect(screen.getByText("T Ten")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /view lectures/i })[1]);
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/content/teacher/10");
    });
  });

  it("shows an empty state with a browse action", async () => {
    mockMine.mockResolvedValueOnce({ subscriptions: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no lectures yet/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /browse teachers/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/teachers");
    });
  });
});
