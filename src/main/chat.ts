import { streamText, type ModelMessage, APICallError } from "ai";
import type { WebContents } from "electron";
import { ipcMain } from "./ipc";
import { ulid } from "ulid";
import { db, insert } from "./db";
import { getSettings } from "./settings";
import { getModel, getEmbeddings } from "./models";
import { storeAttachment, deleteAttachment, type StoredAttachment } from "./storage";
import { splitModelKey, streamRequestSchema, type Message, type StreamRequest } from "../shared/contracts";

const active = new Map<number, { requestId: string; controller: AbortController }>();
function send(sender: WebContents, channel: string, value: unknown) {
  if (!sender.isDestroyed()) sender.send(channel, value);
}
export function formatMessages(messages: Message[]): ModelMessage[] {
  return messages.map(m => m.role === "assistant"
    ? { role: "assistant", content: m.content }
    : { role: "user", content: m.experimental_attachments?.length
      ? [{ type: "text", text: m.content }, ...m.experimental_attachments.map(a => ({ type: "image" as const, image: a.url }))]
      : m.content });
}
function annotation(message: Message | undefined, field: string) {
  return message?.annotations?.find(a => a.field === field)?.id || null;
}
function errorMessage(error: unknown) {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return "The provider rejected your API key. Check Settings.";
    if (error.statusCode === 429) return "The provider is rate limiting requests or your balance is exhausted. Try again later.";
    if (error.statusCode === 404) return "This model is unavailable. Refresh models or choose another model.";
    return `The provider could not complete this request${error.statusCode ? " (HTTP " + error.statusCode + ")" : ""}. Try another model or check Settings.`;
  }
  return "The response could not be completed. Check the provider connection and try again.";
}
async function run(sender: WebContents, request: StreamRequest, controller: AbortController) {
  const { requestId, messages, temperature, topP, systemPrompt } = request;
  const { provider, model } = splitModelKey(request.model);
  const lastUser = messages.at(-1)!;
  if (lastUser.role !== "user") throw new Error("A request must end with a user message.");
  const parent = messages.slice(0, -1).findLast(m => m.role === "assistant");
  // A regenerated root keeps its original conversation, even without an assistant ancestor.
  const existingConversation = request.conversationId || annotation(lastUser, "conversationId") || annotation(parent, "conversationId");
  const conversationId = existingConversation || ulid();
  const responseId = ulid();
  const parentId = annotation(parent, "responseId");
  const started = Date.now();
  const attachments: StoredAttachment[] = [];
  let text = "";
  let persisted = false;
  let streamError: unknown;
  try {
    for (const a of lastUser.experimental_attachments || []) attachments.push(await storeAttachment(a));
    const reasoning = provider === "openai" && /^(o\d|gpt-[5-9])/i.test(model);
    const result = streamText({
      model: getModel(request.model), messages: formatMessages(messages),
      ...(systemPrompt.trim() ? { system: systemPrompt } : {}),
      ...(reasoning ? {} : topP < 1 ? { topP } : { temperature }),
      abortSignal: controller.signal, maxRetries: 0,
      onError: ({ error }) => { streamError = error; }, // SDK default logs request bodies; never log conversation content.
    });
    try {
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          text += part.text;
          send(sender, "chat:stream-data", { requestId, value: part.text });
        } else if (part.type === "error") { streamError = part.error; }
      }
    } catch (error) { if (!controller.signal.aborted) streamError = error; }
    if (!text && streamError) throw streamError;
    if (!text && !controller.signal.aborted) throw new Error("No text returned.");
    await insert({
      id: responseId, model, provider, prompt: lastUser.content, system: systemPrompt,
      response: text, conversation_id: conversationId, parent_id: parentId,
      duration_ms: Date.now() - started, datetime_utc: new Date().toISOString(), temperature, top_p: topP,
    }, undefined, existingConversation ? undefined : {
      id: conversationId, title: lastUser.content.slice(0, 160), created_at: new Date().toISOString(),
    }, attachments);
    persisted = true;
    if (getSettings().embeddings && text) {
      // Search indexing is optional and never delays saving or completing a response.
      void getEmbeddings([lastUser.content, text]).then(vectors => db.transaction(async trx => {
        if (!await trx("responses").where("id", responseId).first()) return;
        for (const [i, type] of ["prompt", "response"].entries()) await trx("embeddings").insert({
          response_id: responseId, embedding: Buffer.from(new Float32Array(vectors[i]).buffer), embedding_model: "nomic-embed-text", type,
        });
      })).catch(() => undefined);
    }
    const message: Message = {
      id: responseId, role: "assistant", content: text,
      annotations: [
        { field: "conversationId", id: conversationId }, { field: "responseId", id: responseId },
        { field: "parentId", id: parentId }, { field: "provider", id: provider },
        { field: "temperature", id: String(temperature) }, { field: "topP", id: String(topP) },
      ],
    };
    send(sender, "chat:stream-complete", { requestId, message, cancelled: controller.signal.aborted });
    if (streamError) send(sender, "chat:stream-error", { requestId, message: errorMessage(streamError) + " The partial response was saved." });
  } finally {
    if (!persisted) await Promise.all(attachments.map(a => deleteAttachment(a.file_path).catch(() => undefined)));
  }
}
export function setupChatHandler() {
  ipcMain.on("chat:stop-stream", (event, requestId: string) => {
    const current = active.get(event.sender.id);
    if (current?.requestId === requestId) current.controller.abort();
  });
  ipcMain.on("chat:start-stream", async (event, input: unknown) => {
    const parsed = streamRequestSchema.safeParse(input);
    if (!parsed.success) {
      send(event.sender, "chat:stream-error", { requestId: (input as Partial<StreamRequest>)?.requestId, message: "Invalid request. Check the message and attachments." });
      return;
    }
    const request = parsed.data;
    const sender = event.sender;
    const previous = active.get(sender.id);
    if (previous) {
      send(sender, "chat:stream-error", { requestId: request.requestId, message: "Wait for the current response to stop." });
      return;
    }
    const controller = new AbortController();
    active.set(sender.id, { requestId: request.requestId, controller });
    const abort = () => controller.abort();
    sender.once("destroyed", abort);
    try { await run(sender, request, controller); }
    catch (error) { send(sender, "chat:stream-error", { requestId: request.requestId, message: errorMessage(error) }); }
    finally { active.delete(sender.id); if (!sender.isDestroyed()) sender.removeListener("destroyed", abort); }
  });
}
