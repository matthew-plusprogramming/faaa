import * as vscode from "vscode";
import * as crypto from "crypto";

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("FAAA is watching your failures 👀");

  const soundUri = vscode.Uri.joinPath(
    context.extensionUri,
    "sounds",
    "faaa.mp3",
  );

  function playSound() {
    if (panel) {
      panel.webview.postMessage({ command: "play" });
      return;
    }

    panel = vscode.window.createWebviewPanel(
      "faaaAudio",
      "FAAA",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "sounds"),
        ],
      },
    );

    const webviewSoundUri = panel.webview.asWebviewUri(soundUri);
    const nonce = crypto.randomBytes(16).toString("hex");

    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; media-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
</head>
<body>
  <p>FAAA is active — this tab plays audio on failure.</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let audioBuffer = null;
    let audioCtx = null;

    async function init() {
      audioCtx = new AudioContext();
      const resp = await fetch("${webviewSoundUri}");
      const data = await resp.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(data);
      play();
    }

    function play() {
      if (!audioCtx || !audioBuffer) return;
      if (audioCtx.state === "suspended") audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start(0);
    }

    window.addEventListener("message", (e) => {
      if (e.data.command === "play") play();
    });

    init();
  </script>
</body>
</html>`;

    panel.onDidDispose(() => {
      panel = undefined;
    });
  }

  // Method 1: VS Code Task failures
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.exitCode === undefined || e.exitCode === 0) return;
      if (e.exitCode === 130) return;

      playSound();
    }),
  );

  // Method 2: Terminal commands (shell integration)
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((e) => {
      if (e.exitCode === undefined || e.exitCode === 0) return;

      // 130 = Ctrl+C (SIGINT), user intentionally cancelled
      if (e.exitCode === 130) return;

      // Skip agent/extension-owned terminals
      const terminalName = e.terminal.name.toLowerCase();
      const agentTerminals = [
        "agent",
        "copilot",
        "claude",
        "task",
        "extension",
      ];
      if (agentTerminals.some((name) => terminalName.includes(name))) return;

      // Skip package installs — Ctrl+C on these also exits with code 1 on Mac
      const cmd = e.execution.commandLine.value.toLowerCase().trim();
      const ignore = [
        "npm i",
        "npm install",
        "yarn install",
        "yarn add",
        "pnpm install",
        "pnpm add",
        "pip install",
        "brew",
      ];
      if (ignore.some((c) => cmd.startsWith(c))) return;

      playSound();
    }),
  );
}

export function deactivate() {
  if (panel) {
    panel.dispose();
    panel = undefined;
  }
}
