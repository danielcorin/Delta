import type { Message } from "../../shared/contracts";
import type { Response } from "../types/types";

export const createMessageAnnotations = (response: Response) => [
  { field: "responseId", id: response.id }, { field: "conversationId", id: response.conversation_id },
  { field: "parentId", id: response.parent_id }, { field: "provider", id: response.provider },
  { field: "temperature", id: String(response.temperature) }, { field: "topP", id: String(response.top_p) },
];
export function buildMessageChain(responses: Response[], start: Response): Message[] {
  const chain: Response[] = [];
  const visited = new Set<string>();
  const lookup = new Map(responses.map(r => [r.id, r]));
  let current: Response | undefined = start;
  while (current && !visited.has(current.id)) {
    visited.add(current.id); chain.unshift(current); current = lookup.get(current.parent_id);
  }
  return chain.flatMap(response => [
    { id: "user-" + response.id, role: "user" as const, content: response.prompt, createdAt: new Date(response.datetime_utc),
      experimental_attachments: response.attachments?.map(url => ({ url, contentType: url.split(";")[0].slice(5) })),
      annotations: createMessageAnnotations(response) },
    { id: "assistant-" + response.id, role: "assistant" as const, content: response.response, createdAt: new Date(response.datetime_utc), annotations: createMessageAnnotations(response) },
  ]);
}
