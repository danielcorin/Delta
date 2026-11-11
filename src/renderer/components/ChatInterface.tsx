import React, { useState, useRef, useEffect } from "react";
import { Copy, Download, Variable, RotateCw, SquarePen, Check, X, GitBranch } from "lucide-react";
import MarkdownWithSyntax from "./MarkdownWithSyntax";
import ChatInput from "./ChatInput";
import ImageModal from "./ImageModal";
import { ModelPicker } from "./ModelPicker";
import type { Message } from "../../shared/contracts";
import type { Node, Edge } from "@xyflow/react";
import type { Response } from "../types/types";

interface Props {
  messages: Message[]; input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e?: { preventDefault(): void }) => Promise<void>;
  selectedModel: string; setSelectedModel: (model: string) => void; modelsByProvider: Record<string, string[]>;
  onMessageClick: (message: Message) => void;
  temperature: number; setTemperature: (n: number) => void; topP: number; setTopP: (n: number) => void;
  onRegenerateClick: (message: Message) => void; onEditMessage: (message: Message, content: string) => void;
  droppedImages: string[]; setDroppedImages: React.Dispatch<React.SetStateAction<string[]>>;
  error?: Error; chatTextareaRef: React.RefObject<HTMLTextAreaElement>; setIsConfigModalOpen: (value: boolean) => void;
  nodes: Node[]; edges: Edge[]; isLoading: boolean; stop: () => void; retry: () => void;
  modelErrors: Record<string, string>; refreshModels: () => Promise<void>; refreshingModels: boolean;
}
export default function ChatInterface({
  messages, input, handleInputChange, handleSubmit, selectedModel, setSelectedModel, modelsByProvider,
  onMessageClick, temperature, setTemperature, topP, setTopP, onRegenerateClick, onEditMessage,
  droppedImages, setDroppedImages, error, chatTextareaRef, setIsConfigModalOpen, nodes, edges,
  isLoading, stop, retry, modelErrors, refreshModels, refreshingModels,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pinned.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const dismiss = (e: MouseEvent) => { if (!menu.current?.contains(e.target as HTMLElement)) setIsDownloadMenuOpen(false); };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  const copy = async (message: Message) => {
    await navigator.clipboard.writeText(message.content);
    setCopied(message.id); setTimeout(() => setCopied(""), 1200);
  };
  const handleDownloadChat = () => {
    if (messages.length === 0) return;

    const conversationId = messages[0]?.annotations?.find((a: any) => a.field === "conversationId")?.id;
    const formattedMessages = messages.map(message => ({
      role: message.role,
      content: [{ type: "text", text: message.content }]
    }));

    const blob = new Blob([JSON.stringify(formattedMessages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${conversationId || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsDownloadMenuOpen(false);
  };

  const handleDownloadCanvas = () => {
    if (nodes.length === 0) return;

    const conversationId = messages[0]?.annotations?.find((a: any) => a.field === "conversationId")?.id;

    const canvasNodes = nodes.map(node => {
      if (node.id === 'system-prompt') {
        return {
          id: node.id,
          type: 'text',
          x: node.position.x,
          y: node.position.y,
          width: node.style?.width || 550,
          height: node.style?.height || 150,
          text: `## System Prompt\n${node.data.text || ''}`
        };
      }

      const response = node.data.response as Response;
      return {
        id: node.id,
        type: 'text',
        x: node.position.x,
        y: node.position.y,
        width: node.style?.width || 550,
        height: node.style?.height || 150,
        text: `${response?.prompt ? `## User\n${response.prompt}\n\n` : ''}${response?.response ? `## ${response.model}\n${response.response}` : ''}`
      };
    });

    const canvasEdges = edges.map(edge => ({
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      fromEnd: 'none',
      toEnd: 'arrow'
    }));

    const canvasJson = {
      nodes: canvasNodes,
      edges: canvasEdges
    };

    const blob = new Blob([JSON.stringify(canvasJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas_${conversationId || 'export'}.canvas`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsDownloadMenuOpen(false);
  };
  const submit = async (e: { preventDefault(): void }) => {
    if (!input.trim() || isLoading || !selectedModel) { e.preventDefault(); return; }
    pinned.current = true;
    await handleSubmit(e);
    setDroppedImages([]);
  };
  return <div className="flex flex-col h-screen bg-white dark:bg-gray-900 min-w-0">
    <header className="h-14 shrink-0 flex items-center pl-12 pr-4 border-b border-gray-200 dark:border-gray-800 text-sm text-gray-500">
      {messages.length ? "Conversation" : "New conversation"}
    </header>
    {selectedImage && <ImageModal src={selectedImage} onClose={() => setSelectedImage(null)} />}
    <main ref={scroll} aria-label="Conversation" className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6"
      onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!messages.length && <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <GitBranch size={28} className="text-gray-400 mb-4" />
        <h1 className="text-lg font-medium">Explore a different direction</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs">Start a conversation, then branch from any response to try another idea or model.</p>
        {!selectedModel && !refreshingModels && <button type="button" className="primary-button mt-5" onClick={() => setIsConfigModalOpen(true)}>Set Up a Provider</button>}
      </div>}
      {messages.map(message => <article key={message.id} className={`group flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
        <div className={`max-w-full min-w-0 rounded-xl px-4 py-3 ${message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}>
          {editingMessageId === message.id ? <div>
            <textarea aria-label="Edit Message" autoFocus className="w-full min-w-52 bg-transparent resize-y focus:outline-none" value={editContent} onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setEditingMessageId(null); if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && editContent.trim()) { e.preventDefault(); onEditMessage(message, editContent); setEditingMessageId(null); } }} />
            <div className="flex justify-end gap-2"><button type="button" title="Cancel Edit" onClick={() => setEditingMessageId(null)}><X size={16} /></button>
              <button type="button" title="Branch with Edit" disabled={!editContent.trim()} onClick={() => { onEditMessage(message, editContent); setEditingMessageId(null); }}><Check size={16} /></button></div>
          </div> : <div className="break-words text-sm leading-relaxed">
            {message.experimental_attachments?.map((a, index) => <img key={index} src={a.url} alt={"Attachment " + (index + 1)} className="max-w-full max-h-60 rounded mb-2 cursor-pointer" onClick={() => setSelectedImage(a.url)} />)}
            <MarkdownWithSyntax>{message.content || (isLoading ? "…" : "Response stopped.")}</MarkdownWithSyntax>
          </div>}
        </div>
        <div className="flex gap-1 mt-1 text-gray-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
          <button type="button" className="message-action" title={copied === message.id ? "Copied" : "Copy Message"} onClick={() => void copy(message)}>{copied === message.id ? <Check size={14} /> : <Copy size={14} />}</button>
          {message.role === "assistant" ? <>
            <button type="button" className="message-action" title="Regenerate as Branch" disabled={isLoading} onClick={() => onRegenerateClick(message)}><RotateCw size={14} /></button>
            <button type="button" className="message-action" title="Continue from Here" disabled={isLoading} onClick={() => { onMessageClick(message); chatTextareaRef.current?.focus(); }}><GitBranch size={14} /></button>
          </> : <button type="button" className="message-action" title="Edit and Branch" disabled={isLoading} onClick={() => { setEditingMessageId(message.id); setEditContent(message.content); }}><SquarePen size={14} /></button>}
        </div>
      </article>)}
    </main>
    {error && <div role="alert" className="mx-4 mb-3 p-3 text-sm rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
      {error.message}<button type="button" className="underline ml-2" disabled={isLoading} onClick={retry}>Retry</button>
    </div>}
    <form onSubmit={submit} className="shrink-0 flex flex-col gap-3 p-4 border-t border-gray-200 dark:border-gray-800">
      {Object.keys(modelErrors).length > 0 && <div className="text-xs text-amber-700 dark:text-amber-400" role="status">
        {Object.entries(modelErrors).map(([provider, message]) => <div key={provider}>{provider}: {message}</div>)}
      </div>}
      <div className="flex items-center gap-2">
        <ModelPicker selected={selectedModel} onSelect={setSelectedModel} models={modelsByProvider} refresh={refreshModels} refreshing={refreshingModels} disabled={isLoading} />
        <button type="button" className="secondary-button !p-2" title="Model Settings" onClick={() => setShowSettings(!showSettings)}><Variable size={18} /></button>
        <div ref={menu} className="relative" onKeyDown={e => { if (e.key === "Escape") setIsDownloadMenuOpen(false); }}>
          <button type="button" className="secondary-button !p-2" title="Export Conversation" disabled={!messages.length} onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}><Download size={18} /></button>
          {isDownloadMenuOpen && <div className="absolute right-0 bottom-full mb-2 w-52 p-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg shadow-lg z-20 text-sm">
            <button type="button" className="menu-item" onClick={handleDownloadChat}>Export Chat JSON</button>
            <button type="button" className="menu-item" onClick={handleDownloadCanvas}>Export Obsidian Canvas</button>
          </div>}
        </div>
      </div>
      {showSettings && <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-3 text-sm space-y-2">
        <label className="flex items-center justify-between gap-3">Temperature<input aria-label="Temperature" className="field !w-20 !mt-0" type="number" min="0" max="2" step="0.1" value={temperature} onChange={e => { const n = Number(e.target.value); if (n >= 0 && n <= 2) setTemperature(n); }} /></label>
        <label className="flex items-center justify-between gap-3">Top P<input aria-label="Top P" className="field !w-20 !mt-0" type="number" min="0" max="1" step="0.05" value={topP} onChange={e => { const n = Number(e.target.value); if (n >= 0 && n <= 1) setTopP(n); }} /></label>
        <p className="text-xs text-gray-500">Top P below 1 replaces temperature. Reasoning models may use their own sampling defaults.</p>
      </div>}
      <ChatInput input={input} handleInputChange={handleInputChange} handleSubmit={submit} textareaRef={chatTextareaRef}
        droppedImages={droppedImages} setDroppedImages={setDroppedImages} disabled={!selectedModel} isLoading={isLoading} stop={stop} />
    </form>
  </div>;
}
