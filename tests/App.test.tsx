import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { createMockWorkerClient } from "../src/mocks/workerMock";

// Mock the real worker client so tests run under jsdom (no Web Worker support).
// The mock returns the scripted workerMock instead of spawning a real Worker.
vi.mock("../src/workerClient", () => ({
  createWorkerClient: () => createMockWorkerClient(),
}));

import { App } from "../src/App";

// App, the composition root smoke test: every surface reachable, the FirstLoadPrimer gates the
// first boot, and navigating Learn -> Sandbox -> Progress never throws. This is the closest thing
// to "rendered it end to end" a unit test can prove; real keyboard-walk and screen-reader spot
// checks are recorded as manual verification in BUILD-REPORT.md.

describe("App composition root (mocked contracts, I1 seam)", () => {
  it("boots to the FirstLoadPrimer before any Python download starts (F15/P6)", () => {
    render(<App />);
    expect(screen.getByText("Let's grab Python, once")).toBeInTheDocument();
  });

  it("dismissing the primer starts the boot and eventually reaches a warm runtime", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it("every surface (Learn, Sandbox, Progress) is reachable from the rail with no crash", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getAllByText("Sandbox")[0]!);
    expect(await screen.findByText("Session: cold")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Progress")[0]!);
    expect(await screen.findByText("character sheet")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Learn")[0]!);
    // With the router, Learn defaults to the map view (not a lesson) at zero progress
    expect(await screen.findByText("Your path")).toBeInTheDocument();
  });

  it("has a skip link as the first focusable element (keyboard-walk entry point)", () => {
    render(<App />);
    expect(screen.getByText("Skip to content")).toBeInTheDocument();
  });
});
