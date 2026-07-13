import { describe, expect, it } from "vitest";
import { filterNamespace, safeRepr, type RawNamespaceEntry } from "./nameInfoFilter.js";

const builtins = new Set(["print", "len", "sum", "range"]);

function entry(overrides: Partial<RawNamespaceEntry>): RawNamespaceEntry {
  return { name: "x", group: "variable", typeName: "int", computeRepr: () => "1", ...overrides };
}

describe("filterNamespace (F11)", () => {
  it("filters out dunders", () => {
    const raw = [entry({ name: "__name__" }), entry({ name: "x" })];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result.map((r) => r.name)).toEqual(["x"]);
  });

  it("filters out builtins", () => {
    const raw = [entry({ name: "len" }), entry({ name: "x" })];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result.map((r) => r.name)).toEqual(["x"]);
  });

  it("filters out reserved worker-injected names (js, pyodide)", () => {
    const raw = [entry({ name: "js" }), entry({ name: "pyodide" }), entry({ name: "x" })];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result.map((r) => r.name)).toEqual(["x"]);
  });

  it("keeps a genuine user import (group: import is a real, shown group)", () => {
    const raw = [entry({ name: "re", group: "import", typeName: "module" })];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result).toHaveLength(1);
    expect(result[0]?.group).toBe("import");
  });

  it("catches a raising __repr__ under try/except rather than crashing the snapshot", () => {
    const raw = [
      entry({
        name: "cursed",
        computeRepr: () => {
          throw new Error("boom");
        },
      }),
    ];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result[0]?.repr).toBe("<repr() raised an exception>");
  });

  it("caps repr length", () => {
    const long = "a".repeat(500);
    expect(safeRepr(() => long).length).toBeLessThan(250);
    expect(safeRepr(() => long).endsWith("...")).toBe(true);
  });

  it("marks fromCurrentRun by diffing against the previous snapshot's name set", () => {
    const raw = [entry({ name: "x" }), entry({ name: "y" })];
    const result = filterNamespace(raw, new Set(["x"]), builtins);
    const x = result.find((r) => r.name === "x")!;
    const y = result.find((r) => r.name === "y")!;
    expect(x.fromCurrentRun).toBe(false); // existed before this run
    expect(y.fromCurrentRun).toBe(true); // new this run
  });

  it("the count matches exactly what the user defined (no noise inflation)", () => {
    const raw = [
      entry({ name: "__doc__" }),
      entry({ name: "print" }),
      entry({ name: "js" }),
      entry({ name: "my_var" }),
      entry({ name: "my_func", group: "function", typeName: "function" }),
    ];
    const result = filterNamespace(raw, new Set(), builtins);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name).sort()).toEqual(["my_func", "my_var"]);
  });
});
