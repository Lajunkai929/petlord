const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petLordDesktop", {
  close: () => ipcRenderer.invoke("runtime:close"),
  showSettings: () => ipcRenderer.invoke("runtime:show-settings"),
  hideSettings: () => ipcRenderer.invoke("runtime:hide-settings"),
  showPet: () => ipcRenderer.invoke("runtime:show-pet"),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke("runtime:set-ignore-mouse", ignore),
  movePetWindow: (input) => ipcRenderer.send("runtime:move-pet-window", input),
  getSettings: () => ipcRenderer.invoke("runtime:get-settings"),
  updateSettings: (patch) => ipcRenderer.invoke("runtime:update-settings", patch),
  choosePackage: () => ipcRenderer.invoke("runtime:choose-package"),
  loadPackage: () => ipcRenderer.invoke("runtime:load-package"),
  savePackage: (contents, options) => ipcRenderer.invoke("runtime:save-package", contents, options),
  listPackages: () => ipcRenderer.invoke("runtime:list-packages"),
  activatePackage: (key) => ipcRenderer.invoke("runtime:activate-package", key),
  removePackage: (key) => ipcRenderer.invoke("runtime:remove-package", key),
  listSubscriptionPackages: (serverUrl) => ipcRenderer.invoke("runtime:list-subscription-packages", serverUrl),
  downloadSubscriptionPackage: (serverUrl, publicationId) => ipcRenderer.invoke("runtime:download-subscription-package", serverUrl, publicationId),
  exportDiagnostics: () => ipcRenderer.invoke("runtime:export-diagnostics"),
  reportError: (input) => ipcRenderer.invoke("runtime:report-error", input),
  listAgentEvents: (input) => ipcRenderer.invoke("runtime:list-agent-events", input),
  acknowledgeAgentEvent: (id, input) => ipcRenderer.invoke("runtime:acknowledge-agent-event", id, input),
  simulateAgentEvent: (source, payload) => ipcRenderer.invoke("runtime:simulate-agent-event", source, payload),
  openAgentSession: (input) => ipcRenderer.invoke("runtime:open-agent-session", input),
  getAgentIntegrationStatus: () => ipcRenderer.invoke("runtime:agent-integration-status"),
  installAgentIntegration: (source) => ipcRenderer.invoke("runtime:install-agent-integration", source),
  pluginStorageGet: (pluginId, key) => ipcRenderer.invoke("runtime:plugin-storage-get", pluginId, key),
  pluginStorageSet: (pluginId, key, value) => ipcRenderer.invoke("runtime:plugin-storage-set", pluginId, key, value),
  pluginStorageRemove: (pluginId, key) => ipcRenderer.invoke("runtime:plugin-storage-remove", pluginId, key),
  onAgentEvent: (listener) => {
    const eventHandler = (_event, value) => listener(value);
    const updatedHandler = (_event, value) => listener(value);
    ipcRenderer.on("runtime:agent-event", eventHandler);
    ipcRenderer.on("runtime:agent-event-updated", updatedHandler);
    return () => {
      ipcRenderer.removeListener("runtime:agent-event", eventHandler);
      ipcRenderer.removeListener("runtime:agent-event-updated", updatedHandler);
    };
  },
  onClickThroughChanged: (listener) => {
    const handler = (_event, enabled) => listener(Boolean(enabled));
    ipcRenderer.on("runtime:click-through-changed", handler);
    return () => ipcRenderer.removeListener("runtime:click-through-changed", handler);
  },
  onSettingsChanged: (listener) => {
    const handler = (_event, settings) => listener(settings);
    ipcRenderer.on("runtime:settings-changed", handler);
    return () => ipcRenderer.removeListener("runtime:settings-changed", handler);
  },
  onPackageChanged: (listener) => {
    const handler = (_event, contents) => listener(contents);
    ipcRenderer.on("runtime:package-changed", handler);
    return () => ipcRenderer.removeListener("runtime:package-changed", handler);
  },
  onOpenPackageImport: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("runtime:open-package-import", handler);
    return () => ipcRenderer.removeListener("runtime:open-package-import", handler);
  },
});
