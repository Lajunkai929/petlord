function applicationActions({ showSettings, showStudio, showPet }) {
  return [
    { label: "设置…", accelerator: "CmdOrCtrl+,", click: () => showSettings() },
    { label: "打开 Studio", click: () => { void showStudio(); } },
    { label: "显示宠物", click: () => showPet() },
  ];
}

function installApplicationMenu({ Menu, appName = "PetLord", isMac = process.platform === "darwin", showSettings, showStudio, showPet }) {
  const actions = applicationActions({ showSettings, showStudio, showPet });
  const template = isMac
    ? [
        {
          label: appName,
          submenu: [
            { role: "about" },
            { type: "separator" },
            ...actions,
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]
    : [
        { label: appName, submenu: [...actions, { type: "separator" }, { role: "quit" }] },
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return template;
}

module.exports = { installApplicationMenu };
