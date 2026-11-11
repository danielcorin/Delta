import { describe, expect, it, vi } from "vitest";
import { discoverModels, languageModel } from "../src/main/providers";
import { defaultSettings } from "../src/main/settings-store";
import { modelKey, splitModelKey, streamRequestSchema } from "../src/shared/contracts";

describe("provider discovery boundaries", () => {
  it("paginates Anthropic with its own headers and keeps provider-qualified IDs distinct", async () => {
    const provider = defaultSettings().providers[1];
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id: "first" }], has_more: true, last_id: "first" }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "second" }], has_more: false }));
    expect(await discoverModels(provider, "fixture-key", fetcher)).toEqual(["first", "second"]);
    expect(String(fetcher.mock.calls[1][0])).toContain("after=first");
    expect(fetcher.mock.calls[0][1].headers["x-api-key"]).toBe("fixture-key");
    expect(modelKey("openai", "same")).not.toBe(modelKey("compatible", "same"));
    expect(splitModelKey("compatible::org/model")).toEqual({ provider: "compatible", model: "org/model" });
  });
  it("filters Gemini models by generateContent support and paginates without putting keys in URLs", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ models: [
      { name: "models/embedding", supportedGenerationMethods: ["embedContent"] },
      { name: "models/generative", supportedGenerationMethods: ["generateContent"] },
    ], nextPageToken: "next" })).mockResolvedValueOnce(Response.json({ models: [{ name: "models/new", supportedGenerationMethods: ["generateContent"] }] }));
    expect(await discoverModels(defaultSettings().providers[2], "fixture-key", fetcher)).toEqual(["generative", "new"]);
    expect(String(fetcher.mock.calls[1][0])).toContain("pageToken=next");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("fixture-key");
  });
  it("uses the configured Ollama URL and rejects malformed catalogs", async () => {
    const provider = { ...defaultSettings().providers[3], baseURL: "http://localhost:19999" };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ models: [{ name: "local-model" }] }));
    expect(await discoverModels(provider, "", fetcher)).toEqual(["local-model"]);
    expect(String(fetcher.mock.calls[0][0])).toBe("http://localhost:19999/api/tags");
    await expect(discoverModels(provider, "", vi.fn().mockResolvedValue(Response.json({ secret: "not-models" })))).rejects.toThrow();
  });
  it("rejects failed responses without leaking provider response bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("dummy-secret-in-body", { status: 401 }));
    await expect(discoverModels(defaultSettings().providers[0], "key", fetcher)).rejects.toThrow("HTTP 401");
    await expect(discoverModels(defaultSettings().providers[0], "key", fetcher)).rejects.not.toThrow("dummy-secret");
  });
  it("rejects repeated pagination", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: [{ id: "a" }], has_more: true, last_id: "a" }));
    await expect(discoverModels(defaultSettings().providers[1], "key", fetcher)).rejects.toThrow("repeated");
  });
  it("does not silently read environment credentials for disabled or unconfigured providers", () => {
    expect(() => languageModel(defaultSettings().providers[0], "", "any")).toThrow("disabled");
    expect(() => languageModel({ ...defaultSettings().providers[0], enabled: true }, "", "any")).toThrow("API key");
  });
  it("rejects remote attachment URLs at the IPC boundary", () => {
    expect(streamRequestSchema.safeParse({ requestId: crypto.randomUUID(), model: "openai::x", temperature: 0.7, topP: 1, systemPrompt: "", messages: [
      { id: "1", role: "user", content: "Hi", experimental_attachments: [{ url: "file:///etc/passwd" }] },
    ] }).success).toBe(false);
  });
});
