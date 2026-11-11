import { app, BrowserWindow, Menu, shell, session } from "electron";
import path from "node:path";
import { setupChatHandler } from "./chat";
import { db, ensureTables } from "./db";
import { initAttachmentStorage } from "./storage";
import { setupConversationsHandlers } from "./conversations";
import { setupSearchHandlers } from "./search";
import { setupModelsHandlers } from "./models";
import { initializeSettings, setupSettingsHandlers } from "./settings";
import { setupAdminHandlers } from "./admin";

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 880, minHeight: 600,
    show: !process.env.DELTA_HEADLESS,
    backgroundColor: "#18181b",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", event => event.preventDefault());
  win.webContents.on("context-menu", (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = params.dictionarySuggestions.map(label => ({ label, click: () => win.webContents.replaceMisspelling(label) }));
    if (params.misspelledWord) items.push({ label: "Add to Dictionary", click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: "separator" });
    if (params.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" });
    else if (params.selectionText) items.push({ role: "copy" });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  if (process.env.DELTA_SMOKE_REPORT && process.env.DELTA_HOME) {
    win.webContents.once("did-finish-load", async () => {
      try {
        const { writeFile } = await import("node:fs/promises");
        const version = await db.raw("SELECT vec_version() AS version");
        const bridge = await win.webContents.executeJavaScript("typeof window.api?.getConversations === 'function'");
        if (!bridge || !version[0]?.version) throw new Error("Smoke check failed");
        await writeFile(process.env.DELTA_SMOKE_REPORT!, JSON.stringify({ ok: true, version: app.getVersion(), arch: process.arch, sqliteVec: version[0].version, bridge }));
        await db.destroy();
        app.exit(0);
      } catch {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(process.env.DELTA_SMOKE_REPORT!, JSON.stringify({ ok: false }));
        app.exit(1);
      }
    });
  }
}
export async function startApplication() {
  await initAttachmentStorage();
  initializeSettings();
  await ensureTables();
  setupSettingsHandlers(); setupChatHandler(); setupConversationsHandlers();
  setupModelsHandlers(); setupSearchHandlers(); setupAdminHandlers();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const dev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [
      `default-src 'self'; script-src 'self'${dev ? " 'unsafe-inline'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'${dev ? " ws://localhost:* http://localhost:*" : ""}; object-src 'none'; base-uri 'none'; frame-src 'none'`
    ] } });
  });
  const action = (name: string) => () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:action", name);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Delta", submenu: [{ role: "about" }, { type: "separator" }, { label: "Settings…", click: action("settings") }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "File", submenu: [{ label: "New Conversation", click: action("newConversation") }, { type: "separator" }, { role: "close" }] },
    { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
    { role: "help", submenu: [{ label: "Delta on GitHub", click: () => { void shell.openExternal("https://github.com/danielcorin/Delta"); } }] },
  ]));
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  app.on("window-all-closed", () => { /* Remain in the Dock on macOS. */ });
}
