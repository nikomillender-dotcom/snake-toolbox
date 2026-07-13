import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { CheckResult } from "../src/components/CheckResult";
import type { TestOutcome } from "../src/contracts";

const passingResults: TestOutcome[] = [{ id: "t1", passed: true, message: "ok" }];
const failingResults: TestOutcome[] = [
  { id: "t1", passed: false, message: "you printed the name, but the shop wants the whole welcome line", actual: "Niko", expected: "Hi Niko, welcome to the ToolBox" }
];

describe("CheckResult (L2/3.4 auto-check flow)", () => {
  it("renders nothing (a calm, empty status region) before the first Check, but the role=status region itself is mounted (SF5)", () => {
    const { container } = render(<CheckResult outcome={null} stepId="s1" hints={[]} />);
    const region = container.querySelector('[role="status"]');
    expect(region).toBeInTheDocument();
    expect(region?.textContent).toBe("");
  });

  it("renders the mint pass state with a Next action, never inventing an outcome it wasn't given", () => {
    const onNext = vi.fn();
    render(<CheckResult outcome={{ passed: true, results: passingResults }} stepId="s1" hints={[]} onNext={onNext} />);
    expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next ->"));
    expect(onNext).toHaveBeenCalled();
  });

  it("renders the fail state with the friendly actual-vs-expected diff", () => {
    render(<CheckResult outcome={{ passed: false, results: failingResults }} stepId="s1" hints={["Put the whole sentence inside print()"]} />);
    expect(screen.getByText(/one requirement short/)).toBeInTheDocument();
    expect(screen.getByText("Hi Niko, welcome to the ToolBox")).toBeInTheDocument();
    expect(screen.getByText("Niko")).toBeInTheDocument();
  });

  it("hints are progressive: one reveal per tap, never all at once", () => {
    render(<CheckResult outcome={{ passed: false, results: failingResults }} stepId="s1" hints={["hint one", "hint two"]} />);
    expect(screen.queryByText("hint one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Hint"));
    expect(screen.getByText(/hint one/)).toBeInTheDocument();
    expect(screen.queryByText(/hint two/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Another hint"));
    expect(screen.getByText(/hint two/)).toBeInTheDocument();
  });

  it("model solution renders side-by-side with the learner's own code, only after asking for it", () => {
    render(<CheckResult outcome={{ passed: false, results: failingResults }} stepId="s1" hints={[]} modelSolution="print('model')" yourCode="print('mine')" />);
    expect(screen.queryByText("print('model')")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show me the solution"));
    expect(screen.getByText("print('model')")).toBeInTheDocument();
    expect(screen.getByText("print('mine')")).toBeInTheDocument();
  });

  // SF5 regression: the ephemeral hint/solution-reveal state must reset when stepId changes, since
  // the outer role="status" element no longer unmounts between steps (that unmount used to be what
  // reset this local state "for free").
  it("hint/solution reveal state resets when stepId changes (the outer region no longer unmounts to do this for free)", () => {
    const { rerender } = render(
      <CheckResult outcome={{ passed: false, results: failingResults }} stepId="s1" hints={["hint one"]} modelSolution="print('model')" />,
    );
    fireEvent.click(screen.getByText("Hint"));
    expect(screen.getByText(/hint one/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show me the solution"));
    expect(screen.getByText("print('model')")).toBeInTheDocument();

    // Simulate moving to a new step: outcome clears, stepId changes.
    rerender(<CheckResult outcome={null} stepId="s2" hints={["a different hint"]} modelSolution="print('other')" />);
    // Then the learner fails the new step's Check.
    rerender(<CheckResult outcome={{ passed: false, results: failingResults }} stepId="s2" hints={["a different hint"]} modelSolution="print('other')" />);
    expect(screen.queryByText(/hint one/)).not.toBeInTheDocument();
    expect(screen.queryByText("print('other')")).not.toBeInTheDocument(); // showSolution reset too
  });
});
