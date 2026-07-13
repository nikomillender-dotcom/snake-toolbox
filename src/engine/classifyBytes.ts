// classifyBytes: shared helper for determining whether raw bytes are valid UTF-8 text
// or binary data. Used by keepRemoteReconcile (S5) and PyodideEngine.drainFiles (S6)
// to ensure ONE consistent classification logic. The rule:
//   1. Try TextDecoder with { fatal: true, ignoreBOM: true } (rejects invalid UTF-8, preserves BOM)
//   2. Re-encode and compare byte-for-byte (catches decode/re-encode divergence)
//   3. On match: return { kind: "text", text }
//   4. On mismatch or decode failure: return { kind: "binary" }

export type ByteClassification =
  | { kind: "text"; text: string }
  | { kind: "binary" };

export function classifyBytes(bytes: Uint8Array): ByteClassification {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const text = decoder.decode(bytes);
    const reEncoded = new TextEncoder().encode(text);
    if (reEncoded.length === bytes.length && reEncoded.every((b, i) => b === bytes[i])) {
      return { kind: "text", text };
    }
    return { kind: "binary" };
  } catch {
    return { kind: "binary" };
  }
}
