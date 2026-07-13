// PredictionField, grading-interaction-spec G1: the predictOutput/traceTable capture surface.
// Explicitly NOT the code editor (it is styled to echo the OutputStream, mono ligature face,
// CLI-white-on-dark, so it reads as "what the stage would show," not "more code to write"),
// multi-line (expected is often multi-line), and autocorrect/smart-quotes/smart-dashes OFF (a
// smart quote silently breaks a correct prediction like {'a': 2, 'b': 1}). No KeyRow here (G1):
// this is plain output text, not code.

export interface PredictionFieldProps {
  value: string;
  onChange: (next: string) => void;
}

export function PredictionField({ value, onChange }: PredictionFieldProps) {
  const rows = Math.max(1, value.split("\n").length);
  return (
    <div class="predict-console">
      <div class="dim-label" style={{ padding: "10px 14px 6px" }}>your prediction</div>
      <textarea
        class="predict-textarea mono"
        aria-label="Your prediction"
        aria-multiline="true"
        placeholder="Type what the console would show."
        spellcheck={false}
        autocorrect="off"
        autocapitalize="off"
        autocomplete="off"
        rows={rows}
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />
    </div>
  );
}
