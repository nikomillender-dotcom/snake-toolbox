// Base64 helpers, portable to both a real browser main thread and Node test runs (both have
// global btoa/atob and TextEncoder/TextDecoder; no Buffer dependency, since this code must also
// work correctly if ever loaded outside Node).
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes);
}

export function base64ToUtf8(base64: string): string {
  const bytes = base64ToBytes(base64);
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a FileBlob's content (whichever of text/bytes is present) to base64 for the GitHub API. */
export function fileBlobToBase64(file: { text?: string; bytes?: Uint8Array }): string {
  if (file.text !== undefined) return utf8ToBase64(file.text);
  if (file.bytes !== undefined) return bytesToBase64(file.bytes);
  return "";
}
