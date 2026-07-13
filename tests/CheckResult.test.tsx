import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { CheckResult } from "../src/components/CheckResult";
import type { TestOutcome } from "../src/contracts";

const passingResults: TestOutcome[] = [{ id: "t1", passed: true, message: "ok" }];
const failingResults: TestOutcome[] = [
  { id: "t1", passed: false, message: "you printed the name, but the shop wants the whole welcome line", actual: "Niko", expected: "Hi Niko, welcome to the ToolBox" }
];

describe("CheckResult (L2/3.4 auto-check flow)", () => {
  it("renders the mint pass state with a Next action, never inventing an outcome it wasn't given", () => {
    const onNext = vi.fn();
    render(<CheckResult passed results={passingResults} hints={[]} onNext={onNext} />);
    expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next ->"));
    expect(onNext).toHaveBeenCalled();
  });

  it("renders the fail state with the friendly actual-vs-expected diff", () => {
    render(<CheckResult passed={false} results={failingResults} hints={["Put the whole sentence inside print()"]} />);
    expect(screen.getByText(/one requirement short/)).toBeInTheDocument();
    expect(screen.getByText("Hi Niko, welcome to the ToolBox")).toBeInTheDocument();
    expect(screen.getByText("Niko")).toBeInTheDocument();
  });

  it("hints are progressive: one reveal per tap, never all at once", () => {
    render(<CheckResult passed={false} results={failingResults} hints={["hint one", "hint two"]} />);
    expect(screen.queryByText("hint one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Hint"));
    expect(screen.getByText(/hint one/)).toBeInTheDocument();
    expect(screen.queryByText(/hint two/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Another hint"));
    expect(screen.getByText(/hint two/)).toBeInTheDocument();
  });

  it("model solution renders side-by-side with the learner's own code, only after asking for it", () => {
    render(<CheckResult passed={false} results={failingResults} hints={[]} modelSolution="print('model')" yourCode="print('mine')" />);
    expect(screen.queryByText("print('model')")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show me the solution"));
    expect(screen.getByText("print('model')")).toBeInTheDocument();
    expect(screen.getByText("print('mine')")).toBeInTheDocument();
  });
});
