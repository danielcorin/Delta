import fs from "node:fs";
import path from "node:path";
import { defaultShortcuts, providerNames, settingsSchema, type Settings } from "../shared/contracts";

export interface SecretCipher { encryptString(value: string): Buffer; decryptString(value: Buffer): string }
const endpoints = {
  openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta", ollama: "http://localhost:11434",
  compatible: "http://localhost:1234/v1",
};
export function defaultSettings(): Settings {
  return { providers: providerNames.map(name => ({ name, enabled: name === "ollama",
    baseURL: endpoints[name], manualModels: [] })), shortcuts: { ...defaultShortcuts }, embeddings: false };
}
export function validateEndpoint(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error("Server URL cannot contain credentials, a query, or a fragment.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Use HTTPS for remote servers, or HTTP on localhost.");
  }
  return url.href.replace(/\/$/, "");
}
function atomicJSON(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

export class SettingsStore {
  constructor(private configFile: string, private secretsFile: string, private cipher: SecretCipher) {}
  private readSecrets(): Record<string, string> {
    if (!fs.existsSync(this.secretsFile)) return {};
    return JSON.parse(this.cipher.decryptString(Buffer.from(fs.readFileSync(this.secretsFile, "utf8"), "base64")));
  }
  private writeSecrets(secrets: Record<string, string>) {
    if (!Object.keys(secrets).length) { fs.rmSync(this.secretsFile, { force: true }); return; }
    const encrypted = this.cipher.encryptString(JSON.stringify(secrets));
    if (this.cipher.decryptString(encrypted) !== JSON.stringify(secrets)) throw new Error("Could not verify encrypted credentials.");
    fs.mkdirSync(path.dirname(this.secretsFile), { recursive: true, mode: 0o700 });
    const temp = this.secretsFile + ".tmp";
    fs.writeFileSync(temp, encrypted.toString("base64"), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, this.secretsFile);
  }
  get(): Settings {
    const data = fs.existsSync(this.configFile)
      ? settingsSchema.parse(JSON.parse(fs.readFileSync(this.configFile, "utf8"))) : defaultSettings();
    const secrets = this.readSecrets();
    return { ...data, providers: data.providers.map(({ apiKey: _key, ...p }) => ({ ...p, hasKey: !!secrets[p.name] })) };
  }
  key(name: string) { return this.readSecrets()[name] || ""; }
  save(input: Settings) {
    const settings = settingsSchema.parse(input);
    const secrets = this.readSecrets();
    for (const provider of settings.providers) {
      provider.baseURL = validateEndpoint(provider.baseURL);
      if (provider.apiKey !== undefined) {
        if (provider.apiKey.trim()) secrets[provider.name] = provider.apiKey.trim();
        else delete secrets[provider.name];
      }
      delete provider.apiKey;
      delete provider.hasKey;
    }
    this.writeSecrets(secrets);
    atomicJSON(this.configFile, settings);
  }
  migrate(legacyFile: string) {
    if (!fs.existsSync(legacyFile)) return;
    const old = JSON.parse(fs.readFileSync(legacyFile, "utf8")) as Record<string, string>;
    if (!Object.keys(old).some(k => ["openai", "openAI", "anthropic", "google", "ollamaUrl"].includes(k))) return;
    const settings = this.get();
    for (const p of settings.providers) {
      const key = old[p.name] || (p.name === "openai" ? old.openAI : "");
      if (key && !p.hasKey) { p.apiKey = key; p.enabled = true; }
      if (p.name === "ollama" && old.ollamaUrl) p.baseURL = validateEndpoint(old.ollamaUrl);
    }
    this.save(settings); // Verified encrypted storage is durable before removing plaintext.
    for (const key of ["openai", "openAI", "anthropic", "google", "ollamaUrl"]) delete old[key];
    atomicJSON(legacyFile, old);
  }
}
