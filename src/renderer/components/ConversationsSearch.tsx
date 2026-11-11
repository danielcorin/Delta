import { useEffect, useRef, useState } from "react";
import type { SimilarResponse } from "../types/types";

export function ConversationsSearch({ onSearchResults, onClearSearch }: { onSearchResults: (results: SimilarResponse[]) => void; onClearSearch: () => void }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"text" | "combined" | "vector">("text");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const callbacks = useRef({ onSearchResults, onClearSearch });
  callbacks.current = { onSearchResults, onClearSearch };
  useEffect(() => {
    const id = ++request.current;
    setError("");
    if (!query.trim()) { callbacks.current.onClearSearch(); setBusy(false); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      window.api.findSimilarResponses({ query, searchType: mode, limit: 50 }).then(results => {
        if (request.current === id) callbacks.current.onSearchResults(results);
      }).catch(() => { if (request.current === id) setError(mode === "vector" ? "Semantic search needs Ollama and an indexed library." : "Search could not complete."); })
        .finally(() => { if (request.current === id) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [query, mode]);
  return <div>
    <input id="conversation-search" type="search" aria-label="Search Conversations" className="field !mt-0" placeholder="Search conversations…" value={query}
      onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }} />
    {query && <select aria-label="Search Mode" className="text-xs mt-2 bg-transparent text-gray-500" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
      <option value="text">Text</option><option value="combined">Text + Semantic</option><option value="vector">Semantic</option>
    </select>}
    {busy && <span className="text-xs text-gray-500 ml-2">Searching…</span>}
    {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
  </div>;
}
