import { buildPixelWord } from "../lib/pixelFont";

export interface PixelWordProps {
  word: string;
  /** px per glyph pixel. MUST be a positive integer (F21). */
  cell: number;
  color: string;
  shadowColor?: string;
  /** accessible name; defaults to the word itself as plain text (P13-adjacent: never markup) */
  label?: string;
  className?: string;
}

/**
 * Renders a word in the Snake ToolBox pixel display face. DISPLAY ONLY (F21): never use this for
 * body copy, code, or console text. Always carries a real accessible name via role="img" +
 * aria-label so the pixel rendering is never the only channel for the text (screen readers get
 * the plain string, not a silhouette of rectangles).
 */
export function PixelWord({ word, cell, color, shadowColor = "#0a0807", label, className }: PixelWordProps) {
  const { width, height, shadowRects, faceRects } = buildPixelWord(word, cell);
  return (
    <svg
      class={`pix${className ? ` ${className}` : ""}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shape-rendering="crispEdges"
      role="img"
      aria-label={label ?? word}
    >
      <g fill={shadowColor} dangerouslySetInnerHTML={{ __html: shadowRects }} />
      <g fill={color} dangerouslySetInnerHTML={{ __html: faceRects }} />
    </svg>
  );
}
