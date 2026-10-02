import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeacherContent from "./TeacherContent.jsx";

const { mockPage, mockSection } = vi.hoisted(() => ({
  mockPage: vi.fn(),
  mockSection: vi.fn(),
}));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: {
      contentPage: (...args) => mockPage(...args),
      contentSection: (...args) => mockSection(...args),
    },
  };
});

function renderAt(teacherId) {
  return render(
    <MemoryRouter initialEntries={[`/content/teacher/${teacherId}`]}>
      <Routes>
        <Route path="/content/teacher/:teacherId" element={<TeacherContent />} />
      </Routes>
    </MemoryRouter>
  );
}

function denied() {
  return {
    response: {
      status: 403,
      data: {
        success: false,
        data: null,
        error: { code: "SUBSCRIPTION_REQUIRED", message: "Denied", details: null },
      },
    },
  };
}

beforeEach(() => {
  mockPage.mockReset();
  mockSection.mockReset();
});

describe("TeacherContent", () => {
  it("does not fetch sections when the page is subscription locked", async () => {
    mockPage.mockRejectedValueOnce(denied());
    mockSection.mockResolvedValueOnce({ section: { key: "lectures", label: "Lectures", content: [] } });
    renderAt("7");
    await waitFor(() => {
      expect(screen.getByText(/subscription required/i)).toBeInTheDocument();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSection).not.toHaveBeenCalled();
  });

  it("loads sections when the page is accessible", async () => {
    mockPage.mockResolvedValueOnce({
      teacher: { id: 7, name: "T", subject: "M", gradeClass: "G" },
      sections: [{ key: "lectures", label: "Lectures" }],
    });
    mockSection.mockResolvedValueOnce({
      section: {
        key: "lectures",
        label: "Lectures",
        content: [
          { id: 1, title: "L1", body: "notes", fileUrl: "https://media.example.com/l1.mp4", createdAt: new Date().toISOString() },
          { id: 2, title: "L2", body: "", fileUrl: "javascript:alert(1)", createdAt: new Date().toISOString() },
        ],
      },
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    renderAt("7");
    await waitFor(() => {
      expect(mockSection).toHaveBeenCalledWith("7", "lectures", { page: 1, limit: 10, q: undefined });
    });
    await waitFor(() => {
      expect(screen.getByText("L1")).toBeInTheDocument();
    });
    const links = screen.getAllByRole("link", { name: /open attachment/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://media.example.com/l1.mp4");
  });

  it("requests further pages through the pagination control", async () => {
    mockPage.mockResolvedValueOnce({
      teacher: { id: 7, name: "T", subject: "M", gradeClass: "G" },
      sections: [{ key: "lectures", label: "Lectures" }],
    });
    mockSection.mockResolvedValue({
      section: {
        key: "lectures",
        label: "Lectures",
        content: [
          { id: 1, title: "L1", body: "", fileUrl: null, createdAt: new Date().toISOString() },
        ],
      },
      pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
    });
    renderAt("7");
    await waitFor(() => {
      expect(screen.getByText("L1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => {
      expect(mockSection).toHaveBeenCalledWith("7", "lectures", { page: 2, limit: 10, q: undefined });
    });
  });
});
