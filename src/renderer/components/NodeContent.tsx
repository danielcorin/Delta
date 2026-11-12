import { Copy, Trash2, ChevronDown, ChevronRight, Code } from "lucide-react";
import type { ExpandedState, Response } from "../types/types";
import ExpandableContent from "./ExpandableContent";
import type { Dispatch, SetStateAction } from "react";
export default function NodeContent({ nodeId, response, expanded, setExpandedNodes, onDelete }: {
  nodeId: string; response: Response; expanded: ExpandedState;
  setExpandedNodes: Dispatch<SetStateAction<Record<string, ExpandedState>>>; onDelete: (id: string) => void;
}) {
  const toggle = (field: keyof ExpandedState) => setExpandedNodes(prev => ({ ...prev, [nodeId]: { ...expanded, [field]: !expanded[field] } }));
  // React Flow must leave wheel gestures to this scroller and its nested code blocks.
  return <div className="nowheel text-left text-gray-900 dark:text-gray-100" onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onDelete(nodeId); }}>
    {(["prompt", "response"] as const).map(part => <div key={part} className={`group p-3 ${part === "prompt" ? "bg-blue-50 dark:bg-blue-950/40 border-b border-gray-200 dark:border-gray-700" : "bg-white dark:bg-gray-800"}`}>
      <div className="flex justify-between gap-3 items-center mb-2">
        <span className="text-xs text-gray-500 break-all">{part === "prompt" ? "You" : response.model}</span>
        <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
          <button title="Copy" className="message-action" onClick={e => { e.stopPropagation(); void navigator.clipboard.writeText(response[part]); }}><Copy size={13} /></button>
          <button title="Toggle Markdown Source" className="message-action" onClick={e => { e.stopPropagation(); toggle(part === "prompt" ? "promptRaw" : "responseRaw"); }}><Code size={13} /></button>
          {response[part].length > 300 && <button title="Expand Text" className="message-action" onClick={e => { e.stopPropagation(); toggle(part); }}>{expanded[part] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}
          {part === "prompt" && <button title="Delete Branch" className="message-action" onClick={e => { e.stopPropagation(); onDelete(nodeId); }}><Trash2 size={13} /></button>}
        </div>
      </div>
      <ExpandableContent content={response[part]} attachments={part === "prompt" ? response.attachments : undefined}
        isExpanded={expanded[part]} onToggle={() => toggle(part)} showRaw={expanded[part === "prompt" ? "promptRaw" : "responseRaw"]}
        onToggleRaw={() => toggle(part === "prompt" ? "promptRaw" : "responseRaw")} />
    </div>)}
  </div>;
}
