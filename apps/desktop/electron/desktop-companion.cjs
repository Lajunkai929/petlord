const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { createDesktopWastePlatform } = require("./desktop-waste-platform.cjs");

const digest = value => createHash("sha256").update(value).digest("hex");
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const validBounds = bounds => validPoint(bounds) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.width > 0 && bounds.height > 0;
const errorText = error => error instanceof Error ? error.message : String(error);

/** Main-process only: all directories and OS operations are supplied by trusted wiring. */
function createDesktopWasteAdapter({ desktopPath, stateDirectory, trashItem, iconHelperPath, allowSwiftFallback = true, platform = createDesktopWastePlatform({ iconHelperPath, allowSwiftFallback }) }) {
  if (!path.isAbsolute(desktopPath) || !path.isAbsolute(stateDirectory)) throw new Error("Desktop and state directories must be absolute paths");
  const ledgerPath = path.join(stateDirectory, "desktop-waste-owned.json");
  let ledger, desktop, queue = Promise.resolve();
  const serialized = operation => { const next = queue.then(operation); queue = next.catch(() => undefined); return next; };
  async function load() {
    if (ledger) return;
    desktop = await fs.realpath(desktopPath);
    if (!(await fs.stat(desktop)).isDirectory()) throw new Error("Desktop path is not a directory");
    await fs.mkdir(stateDirectory, { recursive: true });
    let loaded;
    try { loaded = JSON.parse(await fs.readFile(ledgerPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw new Error(`Cannot read owned-file registry: ${errorText(error)}`); }
    if (loaded && (loaded.version !== 1 || !Array.isArray(loaded.entries) || loaded.entries.some(entry => !entry || !/^[a-f0-9-]{36}$/.test(entry.id) || entry.filename !== `PetLord-${entry.kind}-${entry.id}.txt` || !["poop", "pee"].includes(entry.kind) || typeof entry.actionHash !== "string"))) throw new Error("Owned-file registry is invalid; refusing to replace it");
    ledger = loaded ?? { version: 1, entries: [] };
  }
  async function persist() {
    const temporary = `${ledgerPath}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(ledger, null, 2), { flag: "wx", mode: 0o600 }); await fs.rename(temporary, ledgerPath); }
    finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
  const publicRecord = entry => ({ id: entry.id, kind: entry.kind, path: path.join(desktop, entry.filename), createdAt: entry.createdAt, status: entry.status, warnings: entry.warnings ?? [] });
  async function matchesOwned(entry) {
    const target = path.join(desktop, entry.filename);
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || !entry.fingerprint || stat.ino !== entry.fingerprint.ino || stat.dev !== entry.fingerprint.dev || stat.size !== entry.fingerprint.size) return false;
      return digest(await fs.readFile(target)) === entry.fingerprint.hash;
    } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }
  return {
    create(input) { return serialized(async () => {
      try {
        const { actionId, kind, position } = input ?? {};
        if (typeof actionId !== "string" || !actionId || actionId.length > 256 || !["poop", "pee"].includes(kind) || !validPoint(position)) throw new Error("Invalid completed waste action");
        await load();
        const actionHash = digest(actionId);
        const existing = ledger.entries.find(entry => entry.actionHash === actionHash);
        if (existing) return { ok: !["reserved", "failed"].includes(existing.status), duplicate: true, ...publicRecord(existing), ...(existing.error ? { error: existing.error } : {}) };
        const id = randomUUID();
        const entry = { id, kind, actionHash, filename: `PetLord-${kind}-${id}.txt`, createdAt: new Date().toISOString(), status: "reserved", warnings: [] };
        // Reserve the action durably before touching Desktop; a crash cannot replay it.
        ledger.entries.push(entry); await persist();
        const target = path.join(desktop, entry.filename);
        const text = `PetLord ${kind === "poop" ? "💩" : "尿渍"}\nCreated: ${entry.createdAt}\nOwned ID: ${id}\nThis plain-text keepsake can be moved to Trash.\n`;
        try {
          const handle = await fs.open(target, "wx", 0o600);
          try { await handle.writeFile(text, "utf8"); await handle.sync(); const stat = await handle.stat(); entry.fingerprint = { ino: stat.ino, dev: stat.dev, size: stat.size, hash: digest(text) }; }
          finally { await handle.close(); }
          entry.status = "created"; await persist();
        } catch (error) { entry.status = "failed"; entry.error = `Cannot create Desktop file: ${errorText(error)}`; await persist(); return { ok: false, ...publicRecord(entry), error: entry.error }; }
        try { await platform.setIcon(target, kind); } catch (error) { entry.warnings.push(`Custom icon: ${errorText(error)}`); }
        try { await platform.positionFile(target, position); } catch (error) { entry.warnings.push(`Desktop position: ${errorText(error)}`); }
        await persist();
        return { ok: true, ...publicRecord(entry) };
      } catch (error) { return { ok: false, error: errorText(error) }; }
    }); },
    list() { return serialized(async () => {
      try { await load(); return { ok: true, files: await Promise.all(ledger.entries.map(async entry => ({ ...publicRecord(entry), ownedFilePresent: entry.status === "created" && await matchesOwned(entry) }))) }; }
      catch (error) { return { ok: false, files: [], error: errorText(error) }; }
    }); },
    trashOwned(id) { return serialized(async () => {
      try {
        await load();
        const entry = ledger.entries.find(candidate => candidate.id === id);
        if (!entry || entry.status !== "created") throw new Error("This ID is not an active PetLord-owned file");
        if (!await matchesOwned(entry)) throw new Error("Owned file is missing or was replaced/modified; nothing was trashed");
        if (typeof trashItem !== "function") throw new Error("System Trash integration is unavailable");
        await trashItem(path.join(desktop, entry.filename));
        entry.status = "trashed"; await persist();
        return { ok: true, ...publicRecord(entry) };
      } catch (error) { return { ok: false, error: errorText(error) }; }
    }); },
  };
}

/** One instance per pet window. Action IDs identify an actual playback, never a frame. */
function createDesktopCompanionController({ getBounds, getWorkArea, setBounds, getWastePosition = bounds => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }), isDragging = () => false, isWasteEnabled = () => false, wasteAdapter, onResult = () => undefined, onMovement = () => undefined, speed = 100, initialFacing = "left" }) {
  let active, direction = initialFacing === "right" ? 1 : -1, fractionalX;
  const consumed = new Set();
  const interrupt = () => {
    if (active) {
      consumed.add(active.actionId);
      // Idle/dig/run loops are frequent; only recent playback IDs belong in memory.
      // Waste actions additionally use the persistent adapter ledger above.
      if (consumed.size > 4096) consumed.delete(consumed.values().next().value);
    }
    active = undefined; fractionalX = undefined;
  };
  return {
    interrupt,
    async handleAction(event) {
      if (!event || typeof event.actionId !== "string" || !event.actionId || event.actionId.length > 256 || typeof event.semanticKey !== "string") return { ok: false, error: "Invalid desktop action event" };
      const { actionId, semanticKey, phase } = event;
      if (phase === "started") {
        if (consumed.has(actionId)) return { ok: true, ignored: true };
        if (active?.actionId === actionId) return { ok: true, ignored: true };
        interrupt(); active = { actionId, semanticKey };
        return { ok: true, facing: direction < 0 ? "left" : "right" };
      }
      if (!active || active.actionId !== actionId || active.semanticKey !== semanticKey) return { ok: true, ignored: true };
      if (phase === "interrupted") { interrupt(); return { ok: true }; }
      if (phase !== "completed") return { ok: false, error: "Invalid desktop action phase" };
      interrupt();
      if (!["poop", "pee"].includes(semanticKey) || !isWasteEnabled() || isDragging()) return { ok: true, skipped: true };
      const bounds = getBounds();
      if (!validBounds(bounds)) return { ok: false, error: "Pet bounds unavailable at action completion" };
      let result;
      try {
        const requested = getWastePosition(bounds, semanticKey), area = getWorkArea(bounds);
        if (!validPoint(requested) || !validBounds(area)) throw new Error("Waste position or monitor work area is unavailable/non-finite");
        const position = { x: Math.round(Math.max(area.x, Math.min(area.x + area.width, requested.x))), y: Math.round(Math.max(area.y, Math.min(area.y + area.height, requested.y))) };
        result = await wasteAdapter.create({ actionId, kind: semanticKey, position });
      }
      catch (error) { result = { ok: false, error: errorText(error) }; }
      onResult(result); return result;
    },
    tick(deltaMs) {
      if (!active || active.semanticKey !== "run") return null;
      if (isDragging()) { interrupt(); return null; }
      const bounds = getBounds(), area = getWorkArea(bounds);
      if (!validBounds(bounds) || !validBounds(area) || !Number.isFinite(deltaMs) || deltaMs <= 0) return null;
      const minimum = area.x, maximum = Math.max(minimum, area.x + area.width - bounds.width);
      const previous = fractionalX !== undefined && Math.abs(bounds.x - Math.round(fractionalX)) <= 1 ? fractionalX : bounds.x;
      const requested = previous + direction * Math.max(0, Number.isFinite(speed) ? speed : 100) * Math.min(deltaMs, 250) / 1000;
      fractionalX = Math.max(minimum, Math.min(maximum, requested));
      if (requested <= minimum) direction = 1;
      else if (requested >= maximum) direction = -1;
      const next = { ...bounds, x: Math.round(fractionalX), y: Math.round(Math.max(area.y, Math.min(area.y + area.height - bounds.height, bounds.y))) };
      setBounds(next);
      const movement = { bounds: next, facing: direction < 0 ? "left" : "right" };
      onMovement(movement); return movement;
    },
  };
}
module.exports = { createDesktopCompanionController, createDesktopWasteAdapter };
