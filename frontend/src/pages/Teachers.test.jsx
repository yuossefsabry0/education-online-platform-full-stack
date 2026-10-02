import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/AuthContext.jsx";
import Teachers from "./Teachers.jsx";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      listTeachers: (...args) => mockList(...args),
      searchTeachers: (...args) => mockList(...args),
    },
  };
});

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function ShowLocation() {
  const location = useLocation();
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="from">{location.state && location.state.from ? location.state.from : "none"}</div>
    </div>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/teachers"]}>
      <Routes>
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/login" element={<ShowLocation />} />
        <Route path="/content/teacher/:teacherId" element={<ShowLocation />} />
      </Routes>
    </MemoryRouter>
  );
}

function teacherRow() {
  return {
    teachers: [{ id: 11, name: "T Eleven", subject: "Math", gradeClass: "G" }],
    pagination: { page: 1, totalPages: 1 },
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockList.mockResolvedValue(teacherRow());
});

describe("Teachers guest content CTA", () => {
  it("routes guests through login preserving the intended content path", async () => {
    useAuth.mockReturnValue({ userType: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Eleven")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /view content/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/login");
      expect(screen.getByTestId("from")).toHaveTextContent("/content/teacher/11");
    });
  });

  it("keeps direct content navigation for students", async () => {
    useAuth.mockReturnValue({ userType: "student" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Eleven")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /view content/i }));
    await waitFor(() => {
      expect(screen.getByTestId("path")).toHaveTextContent("/content/teacher/11");
    });
  });
});
