import { app } from "electron";
import { ipcMain } from "./ipc";
import fs from "node:fs";
import path from "node:path";
import { getAPIKey, getSettings } from "./settings";
import { discoverModels, embedTexts, languageModel } from "./providers";
import { splitModelKey, type ModelCatalog } from "../shared/contracts";

export function getModel(key: string) {
  const { provider, model } = splitModelKey(key);
  const settings = getSettings().providers.find(p => p.name === provider)!;
  return languageModel(settings, getAPIKey(provider), model);
}
export function getEmbeddings(values: string[]) {
  return embedTexts(getSettings().providers.find(p => p.name === "ollama")!, values);
}
let pending: Promise<ModelCatalog> | undefined;
export async function getModels(): Promise<ModelCatalog> {
  if (pending) return pending;
  pending = refresh();
  try { return await pending; } finally { pending = undefined; }
}
async function refresh(): Promise<ModelCatalog> {
  const file = path.join(app.getPath("userData"), "model-cache.json");
  let cache: Record<string, { endpoint: string; models: string[] }> = {};
  try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* A missing cache is normal. */ }
  const modelsByProvider: Record<string, string[]> = {};
  const errors: Record<string, string> = {};
  await Promise.all(getSettings().providers.filter(p => p.enabled).map(async p => {
    const key = getAPIKey(p.name);
    if (!key && !["ollama", "compatible"].includes(p.name)) {
      errors[p.name] = "Add an API key in Settings.";
      return;
    }
    let models: string[] = [];
    try {
      models = await discoverModels(p, key);
      cache[p.name] = { endpoint: p.baseURL, models };
    } catch (error) {
      errors[p.name] = error instanceof Error && error.message.startsWith("Model discovery")
        ? error.message : "Could not refresh models. Check the connection, or add a model ID in Settings.";
      if (cache[p.name]?.endpoint === p.baseURL && Array.isArray(cache[p.name].models)) models = cache[p.name].models;
    }
    modelsByProvider[p.name] = [...new Set([...p.manualModels, ...models])];
  }));
  fs.writeFileSync(file, JSON.stringify(cache), { mode: 0o600 });
  return { modelsByProvider, errors, fetchedAt: new Date().toISOString() };
}
export function setupModelsHandlers() { ipcMain.handle("models:get", getModels); }
