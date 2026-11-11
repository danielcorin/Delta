import path from "node:path";
import os from "node:os";
import { app, safeStorage } from "electron";
import { ipcMain } from "./ipc";
import { SettingsStore } from "./settings-store";
import type { Settings } from "../shared/contracts";

let store: SettingsStore;
export function initializeSettings() {
  const configDir = process.env.DELTA_HOME ? path.join(process.env.DELTA_HOME, "config") : path.join(os.homedir(), ".config", "delta");
  store = new SettingsStore(path.join(configDir, "config.json"), path.join(app.getPath("userData"), "credentials.enc"), {
    encryptString(value) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Unlock your login Keychain to save API keys.");
      return safeStorage.encryptString(value);
    },
    decryptString: value => safeStorage.decryptString(value),
  });
  store.migrate(path.join(app.getPath("userData"), "delta_data", "config.json"));
}
export const getSettings = () => store.get();
export const getAPIKey = (name: string) => store.key(name);
export function setupSettingsHandlers() {
  ipcMain.handle("settings:get", () => store.get());
  ipcMain.handle("settings:save", (_event, settings: Settings) => { store.save(settings); return true; });
}
