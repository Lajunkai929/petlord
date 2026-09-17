const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { chmod, copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { gunzipSync } = require("node:zlib");

const bundledPackageKey = "petlord-bundled-companion.petlord";

async function pathExists(target) {
  return stat(target).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error));
}

async function atomicWrite(target, contents, mode) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, mode === undefined ? undefined : { mode });
  await rename(temporary, target);
  if (mode !== undefined) await chmod(target, mode);
}

async function provisionDefaultPackage({ dataDirectory, defaultPackagePath }) {
  const activeKeyPath = path.join(dataDirectory, "active-package.txt");
  const packagesDirectory = path.join(dataDirectory, "packages");
  const activeKey = await readFile(activeKeyPath, "utf8").then((value) => value.trim(), (error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  await mkdir(packagesDirectory, { recursive: true });
  const installedKeys = (await readdir(packagesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".petlord"))
    .map((entry) => entry.name)
    .sort();
  let selectedKey = activeKey && path.basename(activeKey) === activeKey && installedKeys.includes(activeKey)
    ? activeKey : installedKeys[0];
  const legacyPackagePath = path.join(dataDirectory, "active-desktop-pet.petlord");
  if (!selectedKey && await pathExists(legacyPackagePath)) {
    const migratedKey = "migrated-active.petlord";
    await copyFile(legacyPackagePath, path.join(packagesDirectory, migratedKey));
    selectedKey = migratedKey;
  }
  // Once editable, the bundled pet belongs to the local library. An app update
  // must not restore a second copy or replace the user's work.
  let sampleKey;
  for (const key of installedKeys.filter((key) => /^petlord-bundled-companion(?:-[a-f0-9]{16})?\.petlord$/.test(key))) {
    const installed = await readFile(path.join(packagesDirectory, key));
    let bundle;
    try {
      const contents = installed[0] === 0x1f && installed[1] === 0x8b
        ? gunzipSync(installed, { maxOutputLength: 224 * 1024 * 1024 }) : installed;
      bundle = JSON.parse(contents.toString("utf8"));
    } catch { continue; }
    // Local apply keeps this package key but assigns the editable project ID.
    // Any native pet already in the bundled namespace satisfies provisioning.
    if (bundle.format === "petlord-package" && Array.isArray(bundle.manifest?.states)
      && bundle.manifest.states.some((state) => state?.nativePixel?.width > 0 && state.nativePixel?.height > 0)) {
      sampleKey = key;
      break;
    }
  }
  if (sampleKey) {
    selectedKey ??= sampleKey;
    if (selectedKey !== activeKey) await atomicWrite(activeKeyPath, selectedKey, 0o600);
    return selectedKey;
  }
  const sample = await readFile(defaultPackagePath);
  sampleKey = bundledPackageKey;
  // A user may have reused the old built-in filename. Preserve those bytes too.
  const existing = await readFile(path.join(packagesDirectory, sampleKey)).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing && !existing.equals(sample)) {
    sampleKey = `petlord-bundled-companion-${createHash("sha256").update(sample).digest("hex").slice(0, 16)}.petlord`;
  }
  await writeFile(path.join(packagesDirectory, sampleKey), sample, { flag: "wx", mode: 0o600 }).catch(error => {
    if (error.code !== "EEXIST") throw error;
  });
  selectedKey ??= sampleKey;
  if (selectedKey !== activeKey) await atomicWrite(activeKeyPath, selectedKey, 0o600);
  return selectedKey;
}

function createManagedWindowController(createWindow) {
  let currentWindow;

  function ensure(showInitially) {
    if (!currentWindow || currentWindow.isDestroyed()) {
      currentWindow = createWindow(showInitially);
      const createdWindow = currentWindow;
      createdWindow.on("closed", () => {
        if (currentWindow === createdWindow) currentWindow = undefined;
      });
      return { window: currentWindow, created: true };
    }
    return { window: currentWindow, created: false };
  }

  return {
    initialize() {
      return ensure(false).window;
    },
    show() {
      const result = ensure(true);
      if (!result.created) {
        result.window.show();
        result.window.focus();
      }
      return result.window;
    },
    current() {
      return currentWindow;
    },
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function cmdQuote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function createCliLauncher({ dataDirectory, electronPath, cliPath, name = "petlord-design" }) {
  const binDirectory = path.join(dataDirectory, "bin");
  const descriptorPath = path.join(dataDirectory, "design-connection.json");
  await mkdir(binDirectory, { recursive: true });
  if (process.platform === "win32") {
    const launcherPath = path.join(binDirectory, `${name}.cmd`);
    const contents = `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${cmdQuote(electronPath)} ${cmdQuote(cliPath)} --connection ${cmdQuote(descriptorPath)} %*\r\n`;
    await atomicWrite(launcherPath, contents, 0o700);
    return launcherPath;
  }
  const launcherPath = path.join(binDirectory, name);
  const contents = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${shellQuote(electronPath)} ${shellQuote(cliPath)} --connection ${shellQuote(descriptorPath)} "$@"\n`;
  await atomicWrite(launcherPath, contents, 0o700);
  return launcherPath;
}

function createStudioHost(options) {
  const {
    BrowserWindow,
    ipcMain,
    session,
    dataDirectory,
    studioDirectory,
    cliPath,
    electronPath,
    ffmpegPath,
    foregroundMaskerPath,
    installPackage,
    getInstalledPackageStatus,
    showRuntimeSettings,
    showPet,
  } = options;
  const descriptorPath = path.join(dataDirectory, "design-connection.json");
  const serviceModulePath = options.serviceModulePath;
  const preloadPath = options.preloadPath ?? path.join(__dirname, "studio-preload.cjs");
  const partition = options.partition ?? "petlord-studio";
  let service;
  let startup;
  let studioWindow;
  let authToken;
  let connection;
  let studioOrigin;
  let closing = false;
  let shutdown;

  async function resolveStartServer() {
    if (options.startServer) return options.startServer;
    const module = await import(pathToFileURL(serviceModulePath).href);
    if (typeof module.startPetLordServer !== "function") throw new Error("PetLord service bundle does not export startPetLordServer().");
    return module.startPetLordServer;
  }

  async function start() {
    if (closing) throw new Error("PetLord Studio service is shutting down.");
    if (connection) return connection;
    if (startup) return startup;
    startup = (async () => {
      authToken = randomBytes(32).toString("hex");
      await mkdir(dataDirectory, { recursive: true });
      const startServer = await resolveStartServer();
      service = await startServer({
        host: "127.0.0.1",
        port: 0,
        runtimeDataDirectory: path.join(dataDirectory, "design-runtime"),
        studioDirectory,
        installedPackagesDirectory: path.join(dataDirectory,"packages"),
        authToken,
        ffmpegPath,
        foregroundMaskerPath,
        installPackage,
        getInstalledPackageStatus,
      });
      connection = { protocolVersion: 1, baseUrl: service.url, token: authToken, pid: process.pid };
      studioOrigin = new URL(service.url).origin;
      await atomicWrite(descriptorPath, `${JSON.stringify(connection, null, 2)}\n`, 0o600);
      await createCliLauncher({ dataDirectory, electronPath, cliPath });
      if (options.mcpPath) await createCliLauncher({ dataDirectory, electronPath, cliPath: options.mcpPath, name: "petlord-mcp" });
      return connection;
    })().catch(async (error) => {
      startup = undefined;
      connection = undefined;
      studioOrigin = undefined;
      if (service) await service.close().catch(() => undefined);
      service = undefined;
      await unlink(descriptorPath).catch(() => undefined);
      throw error;
    });
    return startup;
  }

  async function showStudio(projectId) {
    const activeConnection = await start();
    if (studioWindow && !studioWindow.isDestroyed()) {
      if (projectId) studioWindow.webContents.send("studio:open-project", String(projectId));
      studioWindow.show();
      studioWindow.focus();
      return studioWindow;
    }

    const studioSession = session.fromPartition(partition);
    const createdWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1024,
      minHeight: 720,
      backgroundColor: options.getTheme?.() === "dark" ? "#201c19" : "#faf8f4",
      title: "PetLord Studio",
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition,
        preload: preloadPath,
      },
    });
    studioWindow = createdWindow;
    const navigationAllowed = (target) => {
      try {
        return new URL(target).origin === studioOrigin;
      } catch {
        return false;
      }
    };
    const restrictNavigation = (event, target) => {
      if (!navigationAllowed(target)) event.preventDefault();
    };
    createdWindow.webContents.on("will-navigate", restrictNavigation);
    createdWindow.webContents.on("will-redirect", restrictNavigation);
    createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    createdWindow.once("ready-to-show", () => createdWindow.show());
    createdWindow.on("close", (event) => {
      if (options.isQuitting?.()) return;
      event.preventDefault();
      createdWindow.hide();
    });
    createdWindow.on("closed", () => {
      if (studioWindow === createdWindow) studioWindow = undefined;
    });
    try {
      await studioSession.cookies.set({
        url: activeConnection.baseUrl,
        name: "petlord_session",
        value: activeConnection.token,
        httpOnly: true,
        sameSite: "strict",
      });
      let target = activeConnection.baseUrl;
      if (projectId) {
        const projectTarget = new URL(activeConnection.baseUrl);
        projectTarget.searchParams.set("page", "edit");
        projectTarget.searchParams.set("project", String(projectId));
        target = projectTarget.toString();
      }
      await createdWindow.loadURL(target);
      return createdWindow;
    } catch (error) {
      if (studioWindow === createdWindow) studioWindow = undefined;
      if (!createdWindow.isDestroyed()) createdWindow.destroy();
      throw error;
    }
  }

  function assertStudioSender(event) {
    let senderOrigin;
    try {
      senderOrigin = new URL(event?.senderFrame?.url).origin;
    } catch {
      senderOrigin = undefined;
    }
    if (!studioWindow || studioWindow.isDestroyed() || event?.sender !== studioWindow.webContents || senderOrigin !== studioOrigin) {
      if (event?.sender === studioWindow?.webContents && senderOrigin !== studioOrigin) {
        throw new Error("Studio bridge call did not come from the PetLord Studio origin.");
      }
      throw new Error("Studio bridge call did not come from the PetLord Studio window.");
    }
  }

  ipcMain.handle("studio:install-package", (event, contents) => {
    assertStudioSender(event);
    return installPackage(contents);
  });
  ipcMain.handle("studio:show-runtime-settings", (event) => {
    assertStudioSender(event);
    return showRuntimeSettings();
  });
  ipcMain.handle("studio:show-pet", (event) => {
    assertStudioSender(event);
    return showPet();
  });
  ipcMain.handle("studio:get-theme", event => { assertStudioSender(event); return options.getTheme?.() ?? "light"; });
  ipcMain.handle("studio:set-theme", (event, theme) => {
    assertStudioSender(event);
    if (theme !== "light" && theme !== "dark") throw new Error("Invalid theme.");
    return options.setTheme?.(theme) ?? theme;
  });

  async function close() {
    if (shutdown) return shutdown;
    closing = true;
    shutdown = (async () => {
      if (startup) await startup.catch(() => undefined);
      const activeService = service;
      service = undefined;
      startup = undefined;
      connection = undefined;
      studioOrigin = undefined;
      if (studioWindow && !studioWindow.isDestroyed()) studioWindow.destroy?.();
      studioWindow = undefined;
      try {
        if (activeService) await activeService.close();
      } finally {
        await unlink(descriptorPath).catch((error) => {
          if (error?.code !== "ENOENT") throw error;
        });
      }
    })();
    return shutdown;
  }

  async function syncInstalledPackages() { await start(); return service?.syncInstalledPackages?.(); }
  async function openInstalledPackage(packageKey) {
    await start();
    await service?.syncInstalledPackages?.();
    const bindings = await service?.getInstalledPackageBindings?.();
    const binding = bindings?.find(candidate => candidate.packageKey === String(packageKey));
    if (!binding) throw new Error("这个本机宠物尚未关联到可编辑项目。");
    return showStudio(binding.projectId);
  }
  function notifyTheme(theme) {
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send("studio:theme-changed", theme);
      studioWindow.setBackgroundColor?.(theme === "dark" ? "#201c19" : "#faf8f4");
    }
  }
  return { start, showStudio, openInstalledPackage, close, syncInstalledPackages, notifyTheme };
}

module.exports = {
  createCliLauncher,
  createManagedWindowController,
  createStudioHost,
  provisionDefaultPackage,
};
