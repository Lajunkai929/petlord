const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const { tmpdir } = require("node:os");
const execute = promisify(execFile);

// Arguments are argv data, never interpolated into AppleScript source.
const finderPositionScript = `on run argv
  set targetPath to item 1 of argv
  set targetX to (item 2 of argv) as integer
  set targetY to (item 3 of argv) as integer
  tell application "Finder"
    set targetItem to POSIX file targetPath as alias
    set desktop position of targetItem to {targetX, targetY}
    delay 0.15
    return desktop position of targetItem
  end tell
end run`;

function createDesktopWastePlatform({ platform = process.platform, run = execute, iconHelperPath, allowSwiftFallback = true } = {}) {
  const runChecked = async (executable, args) => {
    try { return await run(executable, args, { timeout: 15000, maxBuffer: 128 * 1024 }); }
    catch (error) { throw new Error(String(error.stderr || error.message || error).trim()); }
  };
  return {
    async setIcon(filePath, kind) {
      if (platform !== "darwin") throw new Error("Custom Desktop icons are currently supported only on macOS");
      if (iconHelperPath) {
        const available = await fs.access(iconHelperPath, constants.X_OK).then(() => true, () => false);
        if (available) return runChecked(iconHelperPath, [filePath, kind]);
      }
      if (!allowSwiftFallback) throw new Error(`Packaged compiled icon helper is missing or not executable: ${iconHelperPath ?? "no helper path configured"}`);
      // Swift cannot read Electron's virtual app.asar paths; extract this bundled helper.
      const temporary = await fs.mkdtemp(path.join(tmpdir(), "petlord-icon-helper-"));
      try {
        const helper = path.join(temporary, "icon.swift");
        await fs.writeFile(helper, await fs.readFile(path.join(__dirname, "desktop-waste-icon.swift")), { flag: "wx", mode: 0o600 });
        await runChecked("/usr/bin/swift", [helper, filePath, kind]);
      } finally { await fs.rm(temporary, { recursive: true, force: true }); }
    },
    async positionFile(filePath, position) {
      if (platform !== "darwin") throw new Error("Desktop icon positioning is currently supported only on macOS");
      // Finder uses Desktop coordinates. Secondary-monitor placement is best effort.
      // Desktop view-options queries can stall; only place and verify our own item.
      const result = await runChecked("/usr/bin/osascript", ["-e", finderPositionScript, filePath, String(Math.round(position.x)), String(Math.round(position.y))]);
      const confirmed = String(result?.stdout ?? "").trim().match(/^(-?\d+),\s*(-?\d+)$/);
      if (!confirmed) throw new Error("Finder did not confirm the file position");
      if (Number(confirmed[1]) !== Math.round(position.x) || Number(confirmed[2]) !== Math.round(position.y)) throw new Error("Finder adjusted the icon position; its arrangement or grid settings remain unchanged");
    },
  };
}
module.exports = { createDesktopWastePlatform, finderPositionScript };
