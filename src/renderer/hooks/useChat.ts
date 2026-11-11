import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../../shared/contracts";
import { parseBase64ToAttachment } from "../services/attachment";

interface UseChatOptions {
  body: { conversationId?: string; model: string; temperature: number; topP: number; systemPrompt: string; attachments: string[] };
  onFinish?: (message: Message) => void;
}
export function useChat({ body, onFinish }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(() => localStorage.getItem("delta.draft") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const active = useRef<string | null>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => { localStorage.setItem("delta.draft", input); }, [input]);
  useEffect(() => {
    const offData = window.api.onStreamData(({ requestId, value }) => {
      if (active.current !== requestId) return;
      setMessages(prev => {
        const last = prev.at(-1);
        if (last?.role === "assistant") return [...prev.slice(0, -1), { ...last, content: last.content + value }];
        return [...prev, { id: requestId, role: "assistant", content: value }];
      });
    });
    const offComplete = window.api.onStreamComplete(({ requestId, message }) => {
      if (active.current !== requestId) return;
      setIsLoading(false);
      setMessages(prev => {
        const chain = prev.at(-1)?.role === "assistant" ? prev.slice(0, -1) : [...prev];
        if (chain.at(-1)?.role === "user") chain[chain.length - 1] = { ...chain.at(-1)!, annotations: message.annotations };
        return [...chain, message];
      });
      finish.current?.(message);
    });
    const offError = window.api.onStreamError(({ requestId, message }) => {
      if (active.current !== requestId) return;
      setError(new Error(message)); setIsLoading(false);
    });
    return () => {
      if (active.current) window.api.stopStream(active.current);
      offData(); offComplete(); offError();
    };
  }, []);
  const reload = useCallback(async (next?: Message[]) => {
    if (isLoading) return null;
    const chain = next || messages;
    if (!chain.length || chain.at(-1)?.role !== "user") return null;
    const requestId = crypto.randomUUID();
    active.current = requestId;
    setError(undefined); setIsLoading(true); setMessages(chain);
    window.api.startStream({ ...body, messages: chain, requestId });
    return chain.at(-1)!.content;
  }, [body, messages, isLoading]);
  const handleSubmit = useCallback(async (event?: { preventDefault(): void }) => {
    event?.preventDefault();
    if (!input.trim() || isLoading || !body.model) return;
    const message: Message = {
      id: crypto.randomUUID(), role: "user", content: input,
      annotations: messages.at(-1)?.annotations || [],
      experimental_attachments: body.attachments.map(parseBase64ToAttachment),
    };
    setInput("");
    await reload([...messages, message]);
  }, [input, isLoading, body, messages, reload]);
  const stop = useCallback(() => { if (active.current) window.api.stopStream(active.current); }, []);
  const retry = useCallback(() => {
    const chain = messages.at(-1)?.role === "assistant" ? messages.slice(0, -1) : messages;
    return reload(chain);
  }, [messages, reload]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInput(e.target.value), []);
  const replaceMessages = useCallback((next: Message[]) => { active.current = null; setMessages(next); setError(undefined); }, []);
  return { messages, input, handleInputChange, handleSubmit, setMessages: replaceMessages, reload, retry, error, stop, isLoading };
}
