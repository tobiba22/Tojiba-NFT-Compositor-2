const { app: electronApp, BrowserWindow } = require("electron");
const { app: server, PORT } = require("./server");

let mainWindow;

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

electronApp.whenReady().then(() => {
  server.listen(PORT, () => {
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
