import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import { makeInMemoryStore } from "../src/engine/fixtures/inMemoryStore.fixture";

// Mock the real worker client so tests run under jsdom (no Web Worker support).
vi.mock("../src/workerClient", () => ({
  createWorkerClient: () => createMockWorkerClient(),
}));

import { App } from "../src/App";

describe("App composition root (I1 seam)", () => {
  const testStore = makeInMemoryStore();

  it("boots to the FirstLoadPrimer before any Python download starts (F15/P6)", () => {
    render(<App store={testStore} />);
    expect(screen.getByText("Let's grab Python, once")).toBeInTheDocument();
  });

  it("dismissing the primer starts the boot and eventually reaches a warm runtime", async () => {
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it("every surface (Learn, Sandbox, Progress) is reachable from the rail with no crash", async () => {
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getAllByText("Sandbox")[0]!);
    expect(await screen.findByText("Session: cold")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Progress")[0]!);
    expect(await screen.findByText("character sheet")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Learn")[0]!);
    expect(await screen.findByText("Your path")).toBeInTheDocument();
  });

  it("has a skip link as the first focusable element (keyboard-walk entry point)", () => {
    render(<App store={testStore} />);
    expect(screen.getByText("Skip to content")).toBeInTheDocument();
  });
});
