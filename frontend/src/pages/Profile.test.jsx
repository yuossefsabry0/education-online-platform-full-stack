import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "./Profile.jsx";

const { mockMe } = vi.hoisted(() => ({ mockMe: vi.fn() }));

vi.mock("../api/client.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    endpoints: { me: (...args) => mockMe(...args) },
  };
});

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ logout: async () => {} }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
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
  mockMe.mockReset();
});

describe("Profile", () => {
  it("shows teacher names instead of raw role codes", async () => {
    mockMe.mockResolvedValueOnce({
      user: { userType: "student", id: 1, username: "s1" },
      activeRoles: ["SUB9"],
      teachers: [{ id: 9, name: "T Nine", subject: "Math", gradeClass: "G1" }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("T Nine")).toBeInTheDocument();
    });
    expect(screen.queryByText("SUB9")).not.toBeInTheDocument();
  });

  it("falls back to the raw code when a name is missing", async () => {
    mockMe.mockResolvedValueOnce({
      user: { userType: "student", id: 1, username: "s1" },
      activeRoles: ["SUB9"],
      teachers: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("SUB9")).toBeInTheDocument();
    });
  });

  it("keeps the empty and error states", async () => {
    mockMe.mockResolvedValueOnce({
      user: { userType: "student", id: 1, username: "s1" },
      activeRoles: [],
      teachers: [],
    });
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no active subscriptions/i)).toBeInTheDocument();
    });
    unmount();
    mockMe.mockRejectedValueOnce(denied());
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Auth")).toBeInTheDocument();
    });
  });
});
