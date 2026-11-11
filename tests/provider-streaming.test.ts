import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { streamText } from "ai";
import { languageModel } from "../src/main/providers";
import { defaultSettings } from "../src/main/settings-store";
let server: Server;
let base: string;
const seen: { url: string; headers: Record<string, unknown>; body: any }[] = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    seen.push({ url: req.url!, headers: req.headers, body: JSON.parse(raw) });
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const event = (data: unknown) => res.write("data: " + JSON.stringify(data) + "\n\n");
    if (req.url === "/v1/responses") {
      event({ type: "response.created", response: { id: "response", created_at: 1, model: "fixture" } });
      event({ type: "response.output_item.added", output_index: 0, item: { type: "message", id: "item" } });
      event({ type: "response.output_text.delta", item_id: "item", output_index: 0, delta: "Hello OpenAI" });
      event({ type: "response.completed", response: { usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } } });
    } else if (req.url === "/v1/messages") {
      event({ type: "message_start", message: { id: "message", model: "fixture", role: "assistant", usage: { input_tokens: 2 } } });
      event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello Anthropic" } });
      event({ type: "content_block_stop", index: 0 });
      event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } });
      event({ type: "message_stop" });
    } else {
      event({ candidates: [{ content: { parts: [{ text: "Hello Google" }], role: "model" }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2, totalTokenCount: 4 } });
    }
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
it.each([
  [0, "OpenAI", "/v1/responses", "authorization"],
  [1, "Anthropic", "/v1/messages", "x-api-key"],
  [2, "Google", "/v1/models/fixture:streamGenerateContent?alt=sse", "x-goog-api-key"],
] as const)("streams provider %s over its native protocol", async (index, name, endpoint, header) => {
  const provider = { ...defaultSettings().providers[index], enabled: true, baseURL: base };
  const errors: unknown[] = [];
  const result = streamText({
    model: languageModel(provider, "fixture-key", "fixture"), prompt: "Hello", maxRetries: 0, maxOutputTokens: 256,
    onError: ({ error }) => { errors.push(error); },
  });
  let text = ""; for await (const part of result.textStream) text += part;
  expect(errors).toEqual([]);
  expect(text).toBe("Hello " + name);
  expect(seen.at(-1)?.url).toBe(endpoint);
  expect(seen.at(-1)?.headers[header]).toContain("fixture-key");
});
