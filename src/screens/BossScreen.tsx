import { useEffect, useRef, useState } from "preact/hooks";
import type { WorkerClient } from "../workerClient";
import type { Boss, TestOutcome } from "../contracts";
import { CodeEditor, type CodeEditorHandle } from "../components/CodeEditor";
import { RunBar } from "../components/RunBar";
import { OutputStream, type OutputItem } from "../components/OutputStream";
import { PixelWord } from "../components/PixelWord";
import { IconBossBadge, IconCheckBig, IconCoil, IconSeal, IconX } from "../components/icons";
import { fireWhenReady } from "../lib/flashGate";
import { DegradedBootBanner } from "../components/DegradedBootBanner";

// BossScreen, L7: the loud-calm-loud arc. LOUD VS intro -> CALM focused fight (itemized checklist
// bound to hiddenTests groups) -> LOUD victory. F16: every transition routes through the global
// flash-cooldown gate (fireWhenReady), never a raw animation trigger.

export interface BossScreenProps {
  boss: Boss;
  worker: WorkerClient;
  reducedMotion?: boolean;
  inputCapable?: boolean;
  onVictory?: () => void;
  onExit?: () => void;
}

let runIdSeq = 0;

export function BossScreen({ boss, worker, reducedMotion, inputCapable = true, onVictory, onExit }: BossScreenProps) {
  const [phase, setPhase] = useState<"vsIntro" | "battle">("vsIntro");
  const [animate, setAnimate] = useState(false);
  const [code, setCode] = useState("def printReceipt(items):\n    total = 0\n    for name, price in items:\n        print(f\"{name}: {price}\")\n        total += price\n    # TODO: total line + empty cart\n");
  const [results, setResults] = useState<TestOutcome[] | null>(null);
  const [victory, setVictory] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [items, setItems] = useState<OutputItem[]>([]);
  const runIdRef = useRef<string | null>(null);
  const editorHandle = useRef<CodeEditorHandle>(null);

  useEffect(() => {
    const cancel = fireWhenReady("bossVsIntro", () => setAnimate(true));
    return cancel;
  }, []);

  useEffect(() => {
    const unsubscribe = worker.subscribe((msg) => {
      if (msg.t === "checkResult" && msg.runId === runIdRef.current) {
        setResults(msg.results);
        if (msg.passed) {
          fireWhenReady("bossVictory", () => {
            setVictory(true);
            if (!reducedMotion) {
              setSweep(true);
              setTimeout(() => setSweep(false), 900);
            }
          });
          onVictory?.();
        }
      } else if (msg.t === "stdout" && msg.runId === runIdRef.current) {
        setItems((prev) => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker, reducedMotion]);

  function runCode() {
    runIdSeq += 1;
    const runId = `boss-run-${runIdSeq}`;
    runIdRef.current = runId;
    worker.send({ t: "run", runId, code, mountFiles: [], namespace: "graded" });
  }

  function checkAll() {
    runIdSeq += 1;
    const runId = `boss-check-${runIdSeq}`;
    runIdRef.current = runId;
    worker.send({ t: "check", runId, code, mountFiles: [], hiddenTests: boss.hiddenTests });
  }

  function stopRun() {
    if (!runIdRef.current) return;
    worker.send({ t: "stop", runId: runIdRef.current });
  }

  const passCount = results?.filter((r) => r.passed).length ?? 0;
  const total = boss.hiddenTests.length;

  if (phase === "vsIntro") {
    return (
      <div class={`vs-screen${animate ? " anim" : ""}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "24px" }}>
        <PixelWord word={`${boss.name} AWAITS`} cell={6} color="#EDE4D3" label={`${boss.name} boss battle`} />
        <div class="vs-arena" style={{ marginTop: "24px" }}>
          <div class="vs-fighter">
            <div class="vs-badge"><IconCoil size={84} /></div>
            <PixelWord word="NIKO" cell={6} color="#F5C2CE" />
            <span class="dim-label">the coder</span>
          </div>
          <PixelWord word="VS" cell={20} color="#F5C2CE" />
          <div class="vs-fighter">
            <div class="vs-badge" style={{ borderColor: "rgba(224,165,76,.5)" }}>
              <IconBossBadge size={72} />
            </div>
            <PixelWord word={boss.name} cell={5} color="#E0A54C" />
            <span class="dim-label">boss</span>
          </div>
        </div>
        <p class="serif" style={{ maxWidth: "46ch", textAlign: "center", marginTop: "26px" }}>&ldquo;{boss.taunt}&rdquo;</p>
        <button type="button" class="btn btn-primary" style={{ marginTop: "24px" }} onClick={() => setPhase("battle")}>
          <PixelWord word="BEGIN" cell={5} color="#161311" />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div class="top-bar">
        <h1 class="serif" style={{ fontSize: "18px", margin: 0 }}>{boss.name}</h1>
        <div class="spacer" />
        {onExit && <button type="button" class="btn btn-ghost btn-small" onClick={onExit}>Close</button>}
      </div>
      <DegradedBootBanner inputCapable={inputCapable} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: "340px", flex: "0 0 340px", borderRight: "1px solid var(--line)", overflow: "auto", padding: "18px" }}>
          <p class="serif">{boss.brief}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" }}>
            <div style={{ flex: 1, height: "10px", borderRadius: "6px", background: "var(--panel-2)", border: "1px solid var(--line)", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--mint)", width: `${(passCount / total) * 100}%` }} />
            </div>
            <span class="mono dim-label">{passCount} of {total} checks pass</span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {boss.hiddenTests.map((test) => {
              const outcome = results?.find((r) => r.id === test.id);
              const state = outcome ? (outcome.passed ? "pass" : "fail") : "pending";
              return (
                <li key={test.id} class="card" style={{ display: "flex", gap: "11px", padding: "12px 10px", marginBottom: "8px" }}>
                  <span aria-hidden="true">{state === "pass" ? <IconCheckBig /> : state === "fail" ? <IconX /> : "○"}</span>
                  <span>
                    {test.message}
                    <span class="visually-hidden">, {state === "pass" ? "passing" : state === "fail" ? "failing" : "not yet checked"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div class="editor-bezel">
            <CodeEditor value={code} onChange={setCode} ariaLabel="Boss battle editor" handleRef={editorHandle} />
          </div>
          <RunBar running={false} onRun={runCode} onStop={stopRun} onCheck={checkAll} checkLabel="Check all" interruptCapable={inputCapable} />
          <OutputStream items={items} />
          {victory && (
            <div class={`card${sweep ? " sweep" : ""}`} style={{ margin: "12px", padding: "18px", borderColor: "rgba(123,216,143,.5)" }}>
              <span class={reducedMotion ? undefined : "seal-pop"}><IconSeal size={52} /></span>
              <h2 class="serif">You beat {boss.name}.</h2>
              <p>Not many people build this and get it working. You did. A seal just minted, and the unit is clear.</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" class="btn btn-primary btn-small">Open in Sandbox</button>
                <button type="button" class="btn btn-ghost btn-small">See your sheet</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
