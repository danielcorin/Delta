import { z } from "zod";

export const providerNames = ["openai", "anthropic", "google", "ollama", "compatible"] as const;
export const providerLabels: Record<ProviderName, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", ollama: "Ollama", compatible: "OpenAI Compatible",
};
export type ProviderName = typeof providerNames[number];
export const providerSchema = z.object({
  name: z.enum(providerNames),
  enabled: z.boolean(),
  baseURL: z.string().max(2048),
  manualModels: z.array(z.string().trim().min(1).max(200)).max(100),
  apiKey: z.string().max(4096).optional(),
  hasKey: z.boolean().optional(),
});
export const defaultShortcuts = {
  sidebar: "alt+s", canvas: "alt+f", chat: "alt+c", newConversation: "mod+n",
  composer: "alt+l", settings: "mod+comma", search: "mod+f",
};
export const settingsSchema = z.object({
  providers: z.array(providerSchema).length(5).refine(p => new Set(p.map(x => x.name)).size === 5, "Duplicate provider"),
  shortcuts: z.record(z.enum(Object.keys(defaultShortcuts) as [keyof typeof defaultShortcuts, ...(keyof typeof defaultShortcuts)[]]), z.string().min(1).max(80)),
  embeddings: z.boolean(),
});
export type ProviderSettings = z.infer<typeof providerSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export interface Attachment { url: string; contentType?: string; name?: string }
export interface Annotation { field: string; id: string | null }
export interface Message {
  id: string; role: "user" | "assistant"; content: string; createdAt?: Date;
  annotations?: Annotation[]; experimental_attachments?: Attachment[];
}
const messageSchema = z.object({
  id: z.string().max(200), role: z.enum(["user", "assistant"]), content: z.string().max(2_000_000),
  annotations: z.array(z.object({ field: z.string(), id: z.string().nullable() })).optional(),
  experimental_attachments: z.array(z.object({
    url: z.string().max(14_000_000).regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/),
    contentType: z.string().optional(), name: z.string().optional(),
  })).max(8).optional(),
});
export const streamRequestSchema = z.object({
  requestId: z.string().uuid(), conversationId: z.string().max(100).optional(), messages: z.array(messageSchema).min(1).max(2000),
  model: z.string().min(1).max(400), temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1), systemPrompt: z.string().max(100_000),
});
export type StreamRequest = z.infer<typeof streamRequestSchema>;
export interface StreamChunk { requestId: string; value: string }
export interface StreamComplete { requestId: string; message: Message; cancelled: boolean }
export interface StreamError { requestId: string; message: string }
export interface ModelCatalog { modelsByProvider: Record<string, string[]>; errors: Record<string, string>; fetchedAt: string }
export const modelKey = (provider: string, model: string) => `${provider}::${model}`;
export function splitModelKey(key: string): { provider: ProviderName; model: string } {
  const at = key.indexOf("::");
  const provider = z.enum(providerNames).parse(key.slice(0, at));
  const model = key.slice(at + 2);
  if (at < 1 || !model.trim()) throw new Error("Choose a model in the model picker.");
  return { provider, model };
}
