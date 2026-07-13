import { useState } from "preact/hooks";
import type { ConnectResult } from "../contracts";

// GitHubConnectSheet, L8/L14: the guided Connect sheet. The PAT is write-only into the vault seam
// (this component never stores or displays the raw token after submit, never logs it, F6). D8: the
// copy GUIDES the two-repo scope (public portfolio + private backup); it never claims the app can
// enforce or verify what the user picked on github.com.

export interface GitHubConnectSheetProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string, repoName: string) => Promise<ConnectResult>;
  needsReconnect?: boolean;
}

export function GitHubConnectSheet({ open, onClose, onConnect, needsReconnect }: GitHubConnectSheetProps) {
  const [token, setToken] = useState("");
  const [repoName, setRepoName] = useState("snake-toolbox-portfolio");
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [connecting, setConnecting] = useState(false);

  if (!open) return null;

  async function submit() {
    setConnecting(true);
    const outcome = await onConnect(token, repoName);
    setResult(outcome);
    setConnecting(false);
    setToken(""); // never keep the raw value around after handoff to the vault seam (F6)
  }

  return (
    <div class="dialog-overlay">
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="gh-heading" style={{ maxWidth: "480px" }}>
        <h2 id="gh-heading" class="serif">{needsReconnect ? "Reconnect GitHub" : "Connect your GitHub"}</h2>
        {needsReconnect ? (
          <p>
            Your key needs a refresh, that's all, nothing was lost. Paste a fresh token below and
            you're back up in about a minute.
          </p>
        ) : (
          <p>
            Your finished projects go public; your progress backup stays private. This key covers
            both. Give this key those two repos on github.com, nothing else.
          </p>
        )}
        <label class="dim-label" htmlFor="gh-repo">Portfolio repo name</label>
        <input id="gh-repo" class="editor-textarea" style={{ background: "var(--panel-2)", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}
          value={repoName} onInput={(e) => setRepoName((e.target as HTMLInputElement).value)} />
        <label class="dim-label" htmlFor="gh-token">Personal access token</label>
        <input id="gh-token" type="password" class="editor-textarea" style={{ background: "var(--panel-2)", borderRadius: "8px", padding: "10px" }}
          value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} autocomplete="off" />
        <button type="button" class="btn btn-ghost btn-small" style={{ marginTop: "8px" }} onClick={() => setShowWalkthrough((s) => !s)}>
          {showWalkthrough ? "Hide" : "Show me how"}
        </button>
        {showWalkthrough && (
          <ol class="prose" style={{ fontSize: "14px" }}>
            <li>On github.com, go to Settings -&gt; Developer settings -&gt; Fine-grained tokens.</li>
            <li>Create a token scoped to two repos: your portfolio repo and a private backup repo (e.g. snake-toolbox-save).</li>
            <li>Grant Contents: read/write and Metadata: read.</li>
            <li>Paste the token here. We never show it again after this screen.</li>
          </ol>
        )}
        {result && !result.ok && (
          <div class="banner warn" role="alert">
            {result.error === "invalidToken" && "That token did not check out. Double check you copied the whole thing."}
            {result.error === "scope" && "That token is missing a permission it needs (Contents read/write)."}
            {result.error === "network" && "Could not reach GitHub right now. We'll keep this ready to try again."}
            {result.error === "expired" && "That key has already expired. Renewing takes about a minute, here's how."}
          </div>
        )}
        {result?.ok && (
          <div class="banner info" role="status">Connected. Your repo is at {result.repoUrl}.</div>
        )}
        <div class="row">
          <button type="button" class="btn btn-ghost btn-small" onClick={onClose}>Close</button>
          <button type="button" class="btn btn-primary btn-small" onClick={submit} disabled={connecting || token.length === 0}>
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
