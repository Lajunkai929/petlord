import { spawn } from "node:child_process";

const rendererUrl = "http://127.0.0.1:4311";
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const response = await fetch(rendererUrl);
    if (response.ok) break;
  } catch {
    // Renderer is still starting.
  }
  if (attempt === 119) throw new Error(`Desktop renderer did not start at ${rendererUrl}.`);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const electron = spawn(command, ["run", "electron", "--workspace", "@petlord/desktop"], {
  stdio: "inherit",
  env: { ...process.env, PETLORD_DESKTOP_URL: rendererUrl },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => electron.kill(signal));
}

electron.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
