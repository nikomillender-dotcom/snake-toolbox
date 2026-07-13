// Namespace snapshot filtering (CONTRACT 1 comment, F11, backend B3). Pure and side-effect-free:
// - builtins, dunders, and worker-injected "noise" names are filtered out so the count matches
//   what Niko thinks he defined,
// - repr is computed under try/except (a custom __repr__ can raise, block, or run code) and
//   length-capped,
// - fromCurrentRun is a diff against the PREVIOUS snapshot's name set.
//
// The set of "builtin names" to exclude is passed in, never hardcoded here: the real PyodideEngine
// computes it once at boot from actual Python introspection (dir(builtins)), and tests/fixtures
// supply their own small fixture set. This keeps the filter correct regardless of which CPython
// build is pinned.
export interface RawNamespaceEntry {
  name: string;
  group: "import" | "function" | "variable";
  typeName: string;
  computeRepr: () => string;
}

export interface NameInfoLike {
  name: string;
  group: "import" | "function" | "variable";
  typeName: string;
  repr: string;
  fromCurrentRun: boolean;
}

export const DEFAULT_RESERVED_NAMES: ReadonlySet<string> = new Set([
  "js",
  "pyodide",
  "__builtins__",
]);

const DUNDER_PATTERN = /^__.*__$/;
const REPR_CAP = 200;

export function isDunder(name: string): boolean {
  return DUNDER_PATTERN.test(name);
}

export function safeRepr(compute: () => string): string {
  try {
    const value = compute();
    return value.length > REPR_CAP ? value.slice(0, REPR_CAP) + "..." : value;
  } catch {
    // F11: a custom __repr__ can raise; never let that crash the namespace snapshot.
    return "<repr() raised an exception>";
  }
}

export function filterNamespace(
  rawEntries: readonly RawNamespaceEntry[],
  previousNames: ReadonlySet<string>,
  builtinNames: ReadonlySet<string>,
  reservedNames: ReadonlySet<string> = DEFAULT_RESERVED_NAMES,
): NameInfoLike[] {
  return rawEntries
    .filter((e) => !isDunder(e.name) && !reservedNames.has(e.name) && !builtinNames.has(e.name))
    .map((e) => ({
      name: e.name,
      group: e.group,
      typeName: e.typeName,
      repr: safeRepr(e.computeRepr),
      fromCurrentRun: !previousNames.has(e.name),
    }));
}
