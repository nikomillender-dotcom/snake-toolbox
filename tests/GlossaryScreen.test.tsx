import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { GlossaryScreen } from "../src/screens/GlossaryScreen";
import type { GlossaryView } from "../src/contracts";

const view: GlossaryView = {
  discovered: 1,
  total: 2,
  entries: [
    { id: "t1", term: "traceback", definition: "the error report", kind: "concept", strand: "debug", sourceModuleId: "m03", sourceLessonId: "m03-l1", unlocked: true },
    { id: "t2", term: "decorator", definition: "a wrapper", kind: "concept", strand: "design", sourceModuleId: "m06", sourceLessonId: "m06-l1", unlocked: false }
  ]
};

describe("GlossaryScreen (L13, D13 accessibility)", () => {
  it("shows the N of M discovered count", () => {
    render(<GlossaryScreen view={view} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("an unlocked entry is a labelled link that deep-links to its source lesson", () => {
    const onOpen = vi.fn();
    render(<GlossaryScreen view={view} onOpenLesson={onOpen} />);
    const link = screen.getByRole("link", { name: "traceback" });
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith("m03-l1");
  });

  it("D13: a locked entry is announced as 'locked, not yet discovered', never a bare visual blur", () => {
    render(<GlossaryScreen view={view} />);
    expect(screen.getByLabelText("locked, not yet discovered")).toBeInTheDocument();
  });

  it("D13: the silhouette bar is decorative (aria-hidden), the SR text carries the lock state instead", () => {
    render(<GlossaryScreen view={view} />);
    const lockedItem = screen.getByLabelText("locked, not yet discovered");
    const silhouette = lockedItem.querySelector(".silhouette-bar");
    expect(silhouette).toHaveAttribute("aria-hidden", "true");
  });

  it("search filters the unlocked list and announces a result count", () => {
    render(<GlossaryScreen view={view} />);
    const search = screen.getByLabelText("Search the words you have found");
    fireEvent.input(search, { target: { value: "trace" } });
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("never renders a locked term as a tappable link (nothing to link to yet)", () => {
    render(<GlossaryScreen view={view} />);
    expect(screen.queryByRole("link", { name: "decorator" })).not.toBeInTheDocument();
  });
});
