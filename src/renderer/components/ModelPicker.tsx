import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { modelKey, providerLabels, type ProviderName } from "../../shared/contracts";

export function ModelPicker({ selected, onSelect, models, refresh, refreshing, disabled }: {
  selected: string; onSelect: (key: string) => void; models: Record<string, string[]>;
  refresh: () => Promise<void>; refreshing: boolean; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as HTMLElement)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return <div ref={root} className="relative min-w-0 flex-1" onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); setOpen(false); root.current?.querySelector("button")?.focus(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (buttons.length) { e.preventDefault(); buttons[(current + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus(); }
    }
  }}>
    <button type="button" disabled={disabled} aria-label="Choose Model" aria-expanded={open} className="w-full flex items-center gap-2 text-left rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm"
      onClick={() => { setOpen(!open); setQuery(""); }}>
      <span className="flex-1 truncate">{selected.split("::")[1] || (refreshing ? "Loading models…" : "Choose a model")}</span><ChevronDown size={14} />
    </button>
    {open && <div className="absolute bottom-full mb-2 left-0 w-full min-w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-30 p-2">
      <div className="flex items-center gap-2"><input autoFocus aria-label="Search Models" className="field !mt-0" placeholder="Search models…" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" title="Refresh Models" disabled={refreshing} onClick={() => void refresh()} className="p-2"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button></div>
      <div role="listbox" aria-label="Models" className="max-h-64 overflow-auto mt-2">
        {Object.entries(models).map(([provider, items]) => {
          const filtered = items.filter(m => (provider + " " + m).toLowerCase().includes(query.toLowerCase()));
          return filtered.length ? <div key={provider}><div className="px-2 py-1 text-xs text-gray-500">{providerLabels[provider as ProviderName] || provider}</div>
            {filtered.map(model => <button type="button" role="option" aria-selected={selected === modelKey(provider, model)} key={model}
              className="block w-full text-left px-2 py-2 rounded text-sm break-all hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800"
              onClick={() => { onSelect(modelKey(provider, model)); setOpen(false); }}>{model}</button>)}</div> : null;
        })}
        {!Object.values(models).flat().some(m => m.toLowerCase().includes(query.toLowerCase())) && <p className="text-sm text-gray-500 p-2">No matching models.</p>}
      </div>
    </div>}
  </div>;
}
