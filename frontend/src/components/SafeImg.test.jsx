import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafeImg, { initialOf } from "./SafeImg.jsx";
import TeacherImage from "./TeacherImage.jsx";

describe("SafeImg", () => {
  it("renders the remote image first", () => {
    render(<SafeImg src="https://example.com/a.png" alt="Demo pic" label="Demo" />);
    expect(screen.getByRole("img", { name: "Demo pic" })).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("falls back to the local initial avatar on provider failure", () => {
    render(<SafeImg src="https://example.com/missing.png" alt="Demo pic" label="Demo" />);
    fireEvent.error(screen.getByRole("img", { name: "Demo pic" }));
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("derives initials deterministically", () => {
    expect(initialOf("  ahmed ")).toBe("A");
    expect(initialOf("")).toBe("E");
  });
});

describe("TeacherImage", () => {
  it("keeps the remote primary and degrades to the teacher initial", () => {
    render(<TeacherImage teacher={{ id: 3, name: "Carlos" }} />);
    const img = screen.getByRole("img", { name: /carlos/i });
    expect(img).toHaveAttribute("src", "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=640&q=70");
    fireEvent.error(img);
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
