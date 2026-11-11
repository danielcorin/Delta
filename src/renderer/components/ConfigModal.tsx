import { useEffect, useRef, useState } from "react";
import { defaultShortcuts, providerLabels, type Settings, type ProviderSettings } from "../../shared/contracts";

interface Props { settings: Settings; saveSettings: (settings: Settings) => Promise<boolean>; onClose: () => void }
const shortcutLabels: Record<keyof typeof defaultShortcuts, string> = {
  sidebar: "Toggle Sidebar", canvas: "Toggle Canvas", chat: "Toggle Chat", newConversation: "New Conversation",
  composer: "Focus Message", settings: "Open Settings", search: "Search Conversations",
};
export function ConfigModal({ settings, saveSettings, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(() => structuredClone(settings));
  const [tab, setTab] = useState<"providers" | "shortcuts" | "data">("providers");
  const [provider, setProvider] = useState(settings.providers[0].name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  const current = draft.providers.find(p => p.name === provider)!;
  const update = (patch: Partial<ProviderSettings>) => setDraft(s => ({ ...s, providers: s.providers.map(p => p.name === provider ? { ...p, ...patch } : p) }));
  const operation = async (run: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await run(); } catch (err) { setError(err instanceof Error ? err.message : "Could not complete this action."); }
    finally { setBusy(false); }
  };
  const save = () => operation(async () => { await saveSettings(draft); onClose(); });
  return <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title"
    className="settings-dialog text-gray-900 dark:text-gray-100" onKeyDown={e => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const focusable = Array.from(root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'));
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
    <h2 id="settings-title" className="text-lg font-semibold">Settings</h2>
    <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 my-4" role="tablist">
      {(["providers", "shortcuts", "data"] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
        className={`pb-2 capitalize border-b-2 ${tab === t ? "border-blue-500" : "border-transparent text-gray-500"}`}>{t}</button>)}
    </div>
    <div className="settings-content">
      {tab === "providers" && <div className="flex gap-5">
        <div className="w-40 shrink-0 space-y-1">
          {draft.providers.map(p => <button key={p.name} onClick={() => setProvider(p.name)}
            className={`block w-full text-left rounded px-2 py-2 text-sm ${p.name === provider ? "bg-gray-100 dark:bg-gray-800" : "text-gray-500"}`}>{providerLabels[p.name]}</button>)}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={current.enabled} onChange={e => update({ enabled: e.target.checked })} />Show {providerLabels[provider]} models</label>
          <label className="field-label">Server URL<input className="field" type="url" value={current.baseURL} onChange={e => update({ baseURL: e.target.value })} /></label>
          <label className="field-label">API Key {current.hasKey && <button type="button" className="float-right text-xs text-red-600 font-normal" onClick={() => update({ apiKey: "", hasKey: false })}>Remove Saved Key</button>}
            <input className="field" type="password" autoComplete="off" value={current.apiKey ?? ""} placeholder={current.hasKey ? "Leave blank to keep the saved key" : provider === "ollama" || provider === "compatible" ? "Optional" : "Paste API key"}
              onChange={e => update({ apiKey: e.target.value || undefined })} />
          </label>
          <label className="field-label">Additional Model IDs
            <textarea className="field h-16 resize-none" placeholder="One model ID per line" value={current.manualModels.join("\n")}
              onChange={e => update({ manualModels: e.target.value.split("\n") })} onBlur={() => update({ manualModels: current.manualModels.map(m => m.trim()).filter(Boolean) })} />
          </label>
          <p className="text-xs text-gray-500">Models refresh from the provider. Add an ID here if its server does not list it. Keys stay in macOS-protected storage.</p>
        </div>
      </div>}
      {tab === "shortcuts" && <div className="space-y-2">
        {Object.entries(shortcutLabels).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-6 text-sm">{label}
          <input className="field !w-44 !mt-0" value={draft.shortcuts[key as keyof typeof defaultShortcuts]}
            onChange={e => setDraft(s => ({ ...s, shortcuts: { ...s.shortcuts, [key]: e.target.value } }))} /></label>)}
        <div className="flex justify-between pt-3 text-xs text-gray-500"><span>Use mod for ⌘, alt for ⌥, and + between keys.</span>
          <button onClick={() => setDraft(s => ({ ...s, shortcuts: { ...defaultShortcuts } }))}>Restore Defaults</button></div>
      </div>}
      {tab === "data" && <div className="space-y-5 text-sm">
        <div><h3 className="font-medium">Your library stays on this Mac</h3><p className="text-gray-500 mt-1">Export a complete ZIP with the database and images. API keys are never included.</p>
          <button className="secondary-button mt-3" disabled={busy} onClick={() => operation(async () => { const file = await window.api.admin.exportLibrary(); if (file) setNotice("Library exported."); })}>Export Library…</button></div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="flex gap-2"><input type="checkbox" checked={draft.embeddings} onChange={e => setDraft(s => ({ ...s, embeddings: e.target.checked }))} />Index new responses for semantic search</label>
          <p className="text-gray-500 mt-2">Optional. Requires Ollama and nomic-embed-text. Text search always works without it.</p>
          <button className="secondary-button mt-3" disabled={busy} onClick={() => operation(async () => { const n = await window.api.admin.backfillEmbeddings(); setNotice(`Indexed ${n} responses.`); })}>Index Existing Responses</button>
        </div>
        <button className="secondary-button" disabled={busy} onClick={() => operation(async () => { await window.api.admin.backfillFTSData(); setNotice("Text search index rebuilt."); })}>Rebuild Text Search</button>
      </div>}
    </div>
    <div className="min-h-8 text-sm mt-3" role="status">{error ? <span className="text-red-600">{error}</span> : notice}</div>
    <div className="flex justify-end gap-3">
      <button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="primary-button min-w-28" disabled={busy} onClick={save}>{busy ? "Working…" : "Save Changes"}</button>
    </div>
  </div>;
}
