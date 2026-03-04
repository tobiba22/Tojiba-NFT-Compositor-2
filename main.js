const { app: electronApp, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let PORT;

// Prefs file lives in Electron's userData dir — persists across moves/reinstalls
const PREFS_PATH = path.join(electronApp.getPath("userData"), "prefs.json");

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")); } catch { return {}; }
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf8");
  } catch (e) { console.error("Failed to save prefs:", e.message); }
}

async function pickFolderDialog(parent, isChange) {
  const opts = {
    title: isChange ? "Change Project Folder" : "Choose Project Folder",
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: isChange ? "Use This Folder" : "Set as Project Folder",
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

async function getProjectFolder() {
  const prefs = loadPrefs();
  if (prefs.projectFolder && fs.existsSync(prefs.projectFolder)) {
    return prefs.projectFolder;
  }

  // First-run: welcome and ask for folder
  await dialog.showMessageBox({
    type: "info",
    title: "Tojiba NFT Compositor 2",
    message: "Welcome! Choose a Project Folder",
    detail: "Pick a folder where your layers, builds, and settings will be stored.\nYou can change this at any time inside the app.",
    buttons: ["Choose Folder"],
  });

  let folder = null;
  while (!folder) {
    folder = await pickFolderDialog(null, false);
    if (!folder) {
      const r = await dialog.showMessageBox({
        type: "warning",
        title: "No Folder Selected",
        message: "A project folder is required to continue.",
        buttons: ["Choose Folder", "Quit"],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response === 1) { electronApp.quit(); return null; }
    }
  }

  savePrefs({ ...loadPrefs(), projectFolder: folder });
  return folder;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Tojiba NFT Compositor 2",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

electronApp.whenReady().then(async () => {
  const projectFolder = await getProjectFolder();
  if (!projectFolder) return;

  process.env.USER_DATA_DIR = projectFolder;

  const {
    app: server,
    PORT: serverPort,
    onChangeFolderRequest,
    onOpenFolderRequest,
  } = require("./server");
  PORT = serverPort;

  // Let the UI trigger a folder-change dialog, then relaunch into the new folder
  onChangeFolderRequest(async () => {
    const folder = await pickFolderDialog(mainWindow, true);
    if (!folder) return false;
    savePrefs({ ...loadPrefs(), projectFolder: folder });
    electronApp.relaunch();
    electronApp.exit(0);
    return true;
  });

  // Let the UI open the project folder in Explorer / Finder
  onOpenFolderRequest(async () => {
    await shell.openPath(projectFolder);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on port ${PORT}`);
    createWindow();
  });

  electronApp.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

electronApp.on("window-all-closed", () => {
  electronApp.quit();
});
