import { useState } from "react";
import { Plus, Settings, PanelLeftClose, ChevronDown } from "lucide-react";
import ConversationsList from "./ConversationsList";
import type { Conversation } from "../types/types";

export default function Sidebar({ conversations, selectedId, onSelect, onNew, onDelete, onClose, onSettings, systemPrompt, setSystemPrompt, disabled }: {
  conversations: Conversation[]; selectedId: string; onSelect: (id: string, responseId?: string) => void;
  onNew: () => void; onDelete: () => void; onClose: () => void; onSettings: () => void;
  systemPrompt: string; setSystemPrompt: (value: string) => void; disabled: boolean;
}) {
  const [systemOpen, setSystemOpen] = useState(false);
  return <aside className="w-64 shrink-0 h-screen flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
    <header className="h-14 flex items-center justify-between px-4 shrink-0">
      <span className="font-semibold">Delta</span><div className="flex gap-1">
        <button className="message-action" title="Settings" onClick={onSettings}><Settings size={17} /></button>
        <button className="message-action" title="Hide Sidebar" onClick={onClose}><PanelLeftClose size={17} /></button>
      </div>
    </header>
    <div className="px-3 pb-3"><button className="secondary-button w-full flex items-center justify-center gap-2" disabled={disabled} onClick={onNew}><Plus size={16} />New Conversation</button></div>
    <div className="flex-1 min-h-0 overflow-auto px-3"><ConversationsList conversations={conversations} onSelect={onSelect} onDelete={onDelete} selectedConversationId={selectedId} disabled={disabled} /></div>
    <div className="p-3 border-t border-gray-200 dark:border-gray-800 text-sm">
      <button className="w-full flex justify-between items-center text-gray-500" onClick={() => setSystemOpen(!systemOpen)}>System Prompt<ChevronDown size={14} /></button>
      {systemOpen && <textarea aria-label="System Prompt" className="field resize-none h-28" value={systemPrompt} disabled={disabled} onChange={e => setSystemPrompt(e.target.value)} />}
    </div>
  </aside>;
}
