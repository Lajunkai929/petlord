const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petLordStudio", {
  installPackage: (contents) => ipcRenderer.invoke("studio:install-package", contents),
  showRuntimeSettings: () => ipcRenderer.invoke("studio:show-runtime-settings"),
  showPet: () => ipcRenderer.invoke("studio:show-pet"),
  getTheme: () => ipcRenderer.invoke("studio:get-theme"),
  setTheme: (theme) => ipcRenderer.invoke("studio:set-theme", theme),
  onThemeChanged: (listener) => {
    const handler = (_event, theme) => listener(theme);
    ipcRenderer.on("studio:theme-changed", handler);
    return () => ipcRenderer.removeListener("studio:theme-changed", handler);
  },
  onOpenProject: (listener) => {
    const handler = (_event, projectId) => listener(String(projectId));
    ipcRenderer.on("studio:open-project", handler);
    return () => ipcRenderer.removeListener("studio:open-project", handler);
  },
});
