import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/AuthContext.jsx";
import NotificationsBell from "./NotificationsBell.jsx";

const { mockNotifications } = vi.hoisted(() => ({ mockNotifications: vi.fn() }));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api/client.js", () => ({
  endpoints: {
    notifications: (...args) => mockNotifications(...args),
  },
}));

function renderBell(authValue) {
  useAuth.mockReturnValue(authValue);
  return render(
    <MemoryRouter>
      <NotificationsBell />
    </MemoryRouter>
  );
}

describe("NotificationsBell", () => {
  it("opens the panel and shows backend notification details on click", async () => {
    mockNotifications.mockResolvedValueOnce({
      notifications: [
        {
          id: "lecture-1",
          type: "lecture",
          title: "New lecture released",
          message: "Intro to Algebra · Jane",
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          link: "/content/teacher/3/lectures/9",
        },
      ],
    });
    renderBell({
      user: { id: 2, username: "osama" },
      isAuthenticated: true,
      userType: "student",
    });
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.getByText("New lecture released")).toBeInTheDocument();
    });
    expect(screen.getByText(/Intro to Algebra/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new lecture released/i }));
    await waitFor(() => {
      expect(screen.getByText("View")).toBeInTheDocument();
    });
  });

  it("renders nothing for non-student accounts", () => {
    renderBell({ user: null, isAuthenticated: false, userType: null });
    expect(screen.queryByRole("button", { name: /notifications/i })).not.toBeInTheDocument();
  });

  it("shows a red dot until the icon is clicked, and works for teachers", async () => {
    mockNotifications.mockResolvedValueOnce({
      notifications: [
        {
          id: "announcement-1",
          type: "announcement",
          title: "Maintenance tonight",
          message: "Downtime at midnight",
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          link: null,
        },
      ],
    });
    const { container } = renderBell({
      user: { id: 7, username: "t1" },
      isAuthenticated: true,
      userType: "teacher",
    });
    await waitFor(() => {
      expect(container.querySelector(".notif-dot")).not.toBeNull();
    });
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.getByText("Maintenance tonight")).toBeInTheDocument();
    });
    // Marked as read on click: the red dot disappears immediately.
    expect(container.querySelector(".notif-dot")).toBeNull();
  });
});
