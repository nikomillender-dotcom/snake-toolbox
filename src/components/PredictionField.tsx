// PredictionField, grading-interaction-spec G1: the predictOutput/traceTable capture surface.
// Explicitly NOT the code editor (it is styled to echo the OutputStream, mono ligature face,
// CLI-white-on-dark, so it reads as "what the stage would show," not "more code to write"),
// multi-line (expected is often multi-line). No KeyRow here (G1): this is plain output text, not
// code.
//
// SF3 (Frederick full-gate should-fix, corrects a wrong claim this comment used to make): the
// spellcheck/autocorrect/autocapitalize/autocomplete attributes below do NOT disable iOS Safari's
// Smart Punctuation (there is no HTML attribute that does). On an iPad, a typed straight quote or
// dash can still get silently rewritten to a curly quote or en dash as the learner types, which
// would otherwise break a correct prediction like {'a': 2, 'b': 1}. The actual fix lives in
// gradeAnswer.ts's normalizeOutput: it normalizes smart punctuation back to straight quotes/
// hyphens on BOTH sides before comparing, so this field does not need to fight the OS to be
// gradeable correctly; it is a defense the grader owns, not the input.

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
