import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Conversation, SimilarResponse } from "../types/types";
import { ConversationsSearch } from "./ConversationsSearch";
import { formatDateTime } from "../services/datetime";

export default function ConversationsList({ conversations, onSelect, onDelete, selectedConversationId, disabled }: {
  conversations: Conversation[]; onSelect: (id: string, responseId?: string) => void; onDelete: () => void;
  selectedConversationId: string; disabled: boolean;
}) {
  const [results, setResults] = useState<SimilarResponse[] | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [error, setError] = useState("");
  const remove = async () => {
    if (!deleting) return;
    try {
      await window.api.deleteConversation(deleting.id);
      if (deleting.id === selectedConversationId) onSelect("");
      setDeleting(null); onDelete();
    } catch { setError("Could not delete this conversation."); }
  };
  return <div>
    <ConversationsSearch onSearchResults={setResults} onClearSearch={() => setResults(null)} />
    <div className="mt-3 space-y-1">
      {results === null ? conversations.map(c => <div key={c.id} className={`group relative rounded-lg ${c.id === selectedConversationId ? "bg-gray-200/70 dark:bg-gray-800" : "hover:bg-gray-100 dark:hover:bg-gray-800/60"}`}
        onContextMenu={e => { if (!disabled) { e.preventDefault(); setDeleting(c); } }}>
        <button disabled={disabled} className="w-full text-left p-3 pr-8" onClick={() => onSelect(c.id)}>
          <div className="text-sm line-clamp-2 break-words">{c.title || "Untitled conversation"}</div>
          <div className="text-xs text-gray-500 mt-1">{formatDateTime(c.created_at)}</div>
        </button>
        <button title="Delete Conversation" disabled={disabled} className="absolute right-1 top-3 p-1 text-gray-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150" onClick={() => setDeleting(c)}><Trash2 size={14} /></button>
      </div>) : results.map(r => <button key={r.response_id} disabled={disabled} className="block w-full text-left rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => onSelect(r.conversation_id, r.response_id)}>
        <div className="text-xs text-gray-500 mb-1">{r.type === "prompt" ? "You" : r.model}</div><div className="text-sm line-clamp-3">{r.text}</div>
      </button>)}
      {(results?.length === 0 || (results === null && !conversations.length)) && <p className="text-sm text-gray-500 p-3">{results ? "No matching conversations." : "Your conversations will appear here."}</p>}
    </div>
    {deleting && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.currentTarget === e.target) setDeleting(null); }}>
      <div role="alertdialog" aria-modal="true" aria-label="Delete Conversation" className="bg-white dark:bg-gray-900 p-6 rounded-xl max-w-sm" onKeyDown={e => { if (e.key === "Escape") setDeleting(null); }}>
        <h2 className="font-semibold">Delete this conversation?</h2><p className="text-sm text-gray-500 mt-2">All branches and attached images in “{deleting.title.slice(0,80)}” will be deleted. This cannot be undone.</p>
        {error && <p role="alert" className="text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><button autoFocus className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button><button className="primary-button !bg-red-600" onClick={() => void remove()}>Delete</button></div>
      </div>
    </div>}
  </div>;
}
