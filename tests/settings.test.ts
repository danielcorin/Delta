import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SettingsStore, defaultSettings, validateEndpoint } from "../src/main/settings-store";

const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delta-settings-")); dirs.push(dir);
  const config = path.join(dir, "config.json"), secrets = path.join(dir, "keys.enc");
  // Deliberately non-cryptographic fixture; production uses Electron's Keychain-backed safeStorage.
  const cipher = { encryptString: (s: string) => Buffer.from(s.split("").reverse().join("")),
    decryptString: (b: Buffer) => b.toString().split("").reverse().join("") };
  return { dir, config, secrets, store: new SettingsStore(config, secrets, cipher) };
}
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
describe("settings migration and secret boundary", () => {
  it("migrates legacy keys once, keeps existing credentials, and scrubs plaintext only after verification", () => {
    const f = fixture(), legacy = path.join(f.dir, "legacy.json");
    fs.writeFileSync(legacy, JSON.stringify({ openAI: "dummy-old-key", ollamaUrl: "http://localhost:1234" }));
    f.store.migrate(legacy);
    expect(f.store.key("openai")).toBe("dummy-old-key");
    expect(f.store.get().providers.find(p => p.name === "ollama")?.baseURL).toBe("http://localhost:1234");
    expect(fs.readFileSync(legacy, "utf8")).not.toContain("dummy-old-key");
    expect(fs.readFileSync(f.config, "utf8")).not.toContain("dummy-old-key");
    expect(fs.readFileSync(f.secrets, "utf8")).not.toContain("dummy-old-key");
    expect(JSON.stringify(f.store.get())).not.toContain("dummy-old-key");
    f.store.migrate(legacy);
    expect(f.store.key("openai")).toBe("dummy-old-key");
    expect(fs.statSync(f.secrets).mode & 0o777).toBe(0o600);
  });
  it("keeps keys on ordinary saves, removes them explicitly, and fails closed on corrupt storage", () => {
    const f = fixture(), settings = defaultSettings();
    settings.providers[0].apiKey = "dummy-key"; f.store.save(settings);
    f.store.save(f.store.get()); expect(f.store.key("openai")).toBe("dummy-key");
    const next = f.store.get(); next.providers[0].apiKey = ""; f.store.save(next);
    expect(f.store.get().providers[0].hasKey).toBe(false);
    fs.writeFileSync(f.secrets, "corrupt"); expect(() => f.store.get()).toThrow();
  });
  it("never removes the legacy key when encryption fails", () => {
    const f = fixture(), legacy = path.join(f.dir, "legacy.json");
    fs.writeFileSync(legacy, JSON.stringify({ anthropic: "dummy-key" }));
    const store = new SettingsStore(f.config, f.secrets, { encryptString: () => { throw new Error("Locked"); }, decryptString: () => "" });
    expect(() => store.migrate(legacy)).toThrow("Locked");
    expect(fs.readFileSync(legacy, "utf8")).toContain("dummy-key");
  });
  it("rejects invalid settings before writing keys", () => {
    const f = fixture(), settings = defaultSettings();
    settings.providers[0].baseURL = "http://example.com"; settings.providers[0].apiKey = "dummy-key";
    expect(() => f.store.save(settings)).toThrow("HTTPS");
    expect(fs.existsSync(f.secrets)).toBe(false);
  });
});
describe("endpoint validation", () => {
  it.each(["http://localhost:11434/", "http://127.0.0.1:1234/v1", "https://api.example.com/v1"])("allows %s", url => expect(validateEndpoint(url)).not.toMatch(/\/$/));
  it.each(["file:///tmp", "http://example.com", "https://user:secret@example.com", "https://example.com?key=secret", "https://example.com/#key"])("rejects %s", url => expect(() => validateEndpoint(url)).toThrow());
});
