import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import type { ProviderSettings } from "../shared/contracts";
import { validateEndpoint } from "./settings-store";

export function languageModel(provider: ProviderSettings, apiKey: string, model: string) {
  const baseURL = validateEndpoint(provider.baseURL);
  if (!provider.enabled) throw new Error("This provider is disabled in Settings.");
  if (!apiKey && !["ollama", "compatible"].includes(provider.name)) throw new Error("Add an API key in Settings.");
  switch (provider.name) {
    case "openai": return createOpenAI({ apiKey, baseURL }).responses(model);
    case "anthropic": return createAnthropic({ apiKey, baseURL })(model);
    case "google": return createGoogleGenerativeAI({ apiKey, baseURL })(model);
    case "ollama": return createOpenAICompatible({ name: "ollama", baseURL: baseURL + "/v1", apiKey: apiKey || undefined }).chatModel(model);
    case "compatible": return createOpenAICompatible({ name: "compatible", baseURL, apiKey: apiKey || undefined }).chatModel(model);
  }
}
const listSchema = z.object({
  data: z.array(z.object({ id: z.string() })), has_more: z.boolean().optional(),
  last_id: z.string().nullable().optional(),
});
const googleSchema = z.object({
  models: z.array(z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() })).default([]),
  nextPageToken: z.string().optional(),
});
const ollamaSchema = z.object({ models: z.array(z.object({ name: z.string() })) });
export async function discoverModels(provider: ProviderSettings, apiKey: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const base = validateEndpoint(provider.baseURL);
  const headers: Record<string, string> = {};
  if (provider.name === "anthropic") { headers["x-api-key"] = apiKey; headers["anthropic-version"] = "2023-06-01"; }
  else if (provider.name === "google") headers["x-goog-api-key"] = apiKey;
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let cursor = "";
  const seen = new Set<string>();
  const models = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const url = new URL(base + (provider.name === "ollama" ? "/api/tags" : "/models"));
    if (cursor) url.searchParams.set(provider.name === "google" ? "pageToken" : "after", cursor);
    if (provider.name === "anthropic") url.searchParams.set("limit", "100");
    if (provider.name === "google") url.searchParams.set("pageSize", "1000");
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new Error(`Model discovery returned HTTP ${response.status}. Check the server URL and API key.`);
    const json: unknown = await response.json();
    if (provider.name === "ollama") {
      ollamaSchema.parse(json).models.forEach(m => models.add(m.name));
      break;
    }
    if (provider.name === "google") {
      const data = googleSchema.parse(json);
      data.models.filter(m => m.supportedGenerationMethods?.includes("generateContent"))
        .forEach(m => models.add(m.name.replace(/^models\//, "")));
      cursor = data.nextPageToken || "";
    } else {
      const data = listSchema.parse(json);
      data.data.filter(m => provider.name !== "openai" || !/(embed|whisper|tts|dall-e|moderation|transcri|realtime|audio|image|sora)/i.test(m.id))
        .forEach(m => models.add(m.id));
      cursor = data.has_more ? data.last_id || data.data.at(-1)?.id || "" : "";
    }
    if (!cursor) break;
    if (seen.has(cursor)) throw new Error("The model server repeated a page.");
    seen.add(cursor);
    if (page === 99) throw new Error("The model server returned too many pages.");
  }
  return [...models].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
export async function embedTexts(provider: ProviderSettings, values: string[]): Promise<number[][]> {
  const response = await fetch(validateEndpoint(provider.baseURL) + "/api/embed", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", input: values }),
    signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!response.ok) throw new Error("Local embeddings are unavailable. Install nomic-embed-text in Ollama.");
  return z.object({ embeddings: z.array(z.array(z.number())) }).parse(await response.json()).embeddings;
}
