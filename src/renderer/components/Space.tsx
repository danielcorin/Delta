import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Controls, MiniMap, Background, useReactFlow, useNodesState, useEdgesState, type Node, type Edge } from "@xyflow/react";
import { PanelLeft, Settings, Maximize2, Minimize2 } from "lucide-react";
import type { SpaceProps, ExpandedState, Response } from "../types/types";
import type { Message } from "../../shared/contracts";
import { ConfigModal } from "./ConfigModal";
import ChatInterface from "./ChatInterface";
import Sidebar from "./Sidebar";
import NodeContent from "./NodeContent";
import { useChat } from "../hooks/useChat";
import { useSpaceLayout, FLOW_CONFIG } from "../hooks/useSpaceLayout";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { buildMessageChain } from "../hooks/useMessageManagement";

export default function Space(props: SpaceProps) {
  const { responses, setResponses, conversations, fetchConversations, fetchResponses, settings, saveSettings } = props;
  const flow = useReactFlow();
  const [sidebar, setSidebar] = useState(true);
  const [view, setView] = useState<"split" | "chat" | "canvas">("split");
  const [configOpen, setConfigOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, ExpandedState>>({});
  const [selected, setSelected] = useState("");
  const [conversation, setConversation] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a thoughtful conversation partner");
  const [images, setImages] = useState<string[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [deleting, setDeleting] = useState<string>();
  const [notice, setNotice] = useState("");
  const [split, setSplit] = useState(() => Number(localStorage.getItem("delta.split")) || 52);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selectionRequest = useRef(0);
  const needFit = useRef(true);
  const { getLayoutedElements } = useSpaceLayout();
  const { messages, input, handleInputChange, handleSubmit, setMessages, reload, retry, error, stop, isLoading } = useChat({
    body: { conversationId: conversation || undefined, model: props.selectedModel, temperature: props.temperature, topP: props.topP, systemPrompt, attachments: images },
    onFinish: message => {
      const id = message.annotations?.find(a => a.field === "conversationId")?.id;
      if (id) { setConversation(id); setSelected(message.id); void fetchResponses(id).catch(() => setNotice("Could not refresh the canvas.")); fetchConversations(); }
    },
  });
  const selectResponse = useCallback((response: Response, all = responses) => {
    if (isLoading) return;
    setSelected(response.id); setMessages(buildMessageChain(all, response));
    setSystemPrompt(response.system || ""); setImages([]);
  }, [responses, isLoading, setMessages]);
  const newConversation = useCallback(() => {
    if (isLoading || configOpen) return;
    selectionRequest.current++; setConversation(""); setSelected(""); setMessages([]); setResponses([]);
    setExpanded({}); setImages([]); needFit.current = true; setNotice("");
    textarea.current?.focus();
  }, [isLoading, configOpen, setMessages, setResponses]);
  const selectConversation = async (id: string, responseId?: string) => {
    if (isLoading) return;
    if (!id) { newConversation(); return; }
    const request = ++selectionRequest.current;
    try {
      const all = await fetchResponses(id);
      if (selectionRequest.current !== request) return;
      setConversation(id); setExpanded({}); needFit.current = true;
      const target = all.find(r => r.id === responseId) || all.at(-1);
      if (target) selectResponse(target, all);
      else { setMessages([]); setSelected(""); }
    } catch { setNotice("Could not open this conversation."); }
  };
  const branch = (message: Message, edited?: string) => {
    if (isLoading) return;
    const id = message.annotations?.find(a => a.field === "responseId")?.id;
    const response = responses.find(r => r.id === id);
    if (!response) return;
    const chain = buildMessageChain(responses, response).slice(0, -1);
    if (edited !== undefined) chain[chain.length - 1] = { ...chain.at(-1)!, content: edited };
    void reload(chain);
  };
  useKeyboardShortcuts(settings.shortcuts, {
    sidebar: () => { if (!configOpen) setSidebar(s => !s); },
    canvas: () => { if (!configOpen) setView(v => v === "canvas" ? "split" : "canvas"); },
    chat: () => { if (!configOpen) setView(v => v === "chat" ? "split" : "chat"); },
    newConversation, composer: () => { if (!configOpen) textarea.current?.focus(); },
    settings: () => setConfigOpen(true),
    search: () => { if (!configOpen) { setSidebar(true); requestAnimationFrame(() => document.getElementById("conversation-search")?.focus()); } },
  });
  useEffect(() => {
    const graphNodes: Node[] = responses.map(response => ({
      id: response.id, position: { x: 0, y: 0 }, selected: response.id === selected,
      style: { width: FLOW_CONFIG.nodeWidth }, data: { response,
        label: <NodeContent nodeId={response.id} response={response}
          expanded={expanded[response.id] || { prompt: false, response: false, promptRaw: false, responseRaw: false }}
          setExpandedNodes={setExpanded} onDelete={id => { if (!isLoading) setDeleting(id); }} /> },
    }));
    const ids = new Set(responses.map(r => r.id));
    const graphEdges: Edge[] = responses.filter(r => r.parent_id && ids.has(r.parent_id))
      .map(r => ({ id: r.parent_id + "-" + r.id, source: r.parent_id, target: r.id }));
    const layout = getLayoutedElements(graphNodes, graphEdges);
    setNodes(layout.nodes); setEdges(layout.edges);
    if (needFit.current && graphNodes.length) {
      needFit.current = false;
      requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 0.9 }));
    }
  }, [responses, selected, expanded, isLoading, getLayoutedElements, flow, setNodes, setEdges]);
  useEffect(() => {
    const fit = () => requestAnimationFrame(() => requestAnimationFrame(() => { if (view !== "chat") void flow.fitView({ padding: 0.2, maxZoom: 0.9 }); }));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [view, sidebar, conversation, flow]);
  const removeBranch = async () => {
    if (!deleting || isLoading) return;
    try {
      await window.api.deleteResponse(conversation, deleting);
      const all = await fetchResponses(conversation);
      setDeleting(undefined);
      if (all.length) selectResponse(all.at(-1)!, all);
      else { setMessages([]); setSelected(""); }
    } catch { setNotice("Could not delete this branch."); }
  };
  return <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    {sidebar && <Sidebar conversations={conversations} selectedId={conversation} onSelect={selectConversation} onNew={newConversation}
      onDelete={fetchConversations} onClose={() => setSidebar(false)} onSettings={() => setConfigOpen(true)}
      systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt} disabled={isLoading} />}
    <div className="flex flex-1 min-w-0 relative">
      {view !== "chat" && <section className="relative min-w-0" style={{ width: view === "canvas" ? "100%" : split + "%" }} aria-label="Conversation Canvas">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={(_e, node) => selectResponse(node.data.response as Response)}
          minZoom={0.1} maxZoom={2} nodesDraggable={false} nodesConnectable={false} colorMode="system"
          deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
          <Background gap={24} size={1} /><Controls showInteractive={false} /><MiniMap style={{ width: 100, height: 70 }} />
        </ReactFlow>
        {!responses.length && <div className="absolute inset-0 pointer-events-none flex items-center justify-center"><p className="text-sm text-gray-400">Your conversation branches appear here</p></div>}
        <div className="absolute top-3 left-3 flex gap-1">
          {!sidebar && <button className="toolbar-button" title="Show Sidebar" onClick={() => setSidebar(true)}><PanelLeft size={18} /></button>}
          {!sidebar && <button className="toolbar-button" title="Settings" onClick={() => setConfigOpen(true)}><Settings size={18} /></button>}
        </div>
        <button className="absolute top-3 right-3 toolbar-button" title={view === "canvas" ? "Show Chat" : "Expand Canvas"} onClick={() => setView(v => v === "canvas" ? "split" : "canvas")}>
          {view === "canvas" ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </section>}
      {view === "split" && <div role="separator" aria-label="Resize Canvas" aria-orientation="vertical" aria-valuenow={split} tabIndex={0}
        className="w-1 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-800 hover:bg-blue-500"
        onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { const value = Math.min(70, Math.max(30, split + (e.key === "ArrowLeft" ? -2 : 2))); setSplit(value); localStorage.setItem("delta.split", String(value)); } }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const bounds = e.currentTarget.parentElement!.getBoundingClientRect();
          const move = (event: PointerEvent) => { const value = Math.min(70, Math.max(30, (event.clientX - bounds.left) / bounds.width * 100)); setSplit(value); localStorage.setItem("delta.split", String(value)); };
          const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
          window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
        }} />}
      {view !== "canvas" && <section className="flex-1 min-w-0 relative" aria-label="Chat">
        <ChatInterface messages={messages} input={input} handleInputChange={handleInputChange} handleSubmit={handleSubmit}
          selectedModel={props.selectedModel} setSelectedModel={props.setSelectedModel} modelsByProvider={props.modelsByProvider}
          modelErrors={props.modelErrors} refreshModels={props.refreshModels} refreshingModels={props.refreshingModels}
          onMessageClick={m => { const id = m.annotations?.find(a => a.field === "responseId")?.id; const r = responses.find(r => r.id === id); if (r) selectResponse(r); }}
          temperature={props.temperature} setTemperature={props.setTemperature} topP={props.topP} setTopP={props.setTopP}
          onRegenerateClick={m => branch(m)} onEditMessage={(m, text) => branch(m, text)}
          droppedImages={images} setDroppedImages={setImages} error={error} chatTextareaRef={textarea}
          setIsConfigModalOpen={setConfigOpen} nodes={nodes} edges={edges} isLoading={isLoading} stop={stop} retry={() => void retry()} />
        <button className="absolute top-3 left-3 toolbar-button" title={view === "chat" ? "Show Canvas" : "Expand Chat"} onClick={() => setView(v => v === "chat" ? "split" : "chat")}>
          {view === "chat" ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </section>}
    </div>
    {notice && <div role="alert" className="fixed bottom-4 left-4 z-40 bg-red-50 text-red-700 p-3 rounded-lg text-sm" onClick={() => setNotice("")}>{notice}</div>}
    {configOpen && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="settings-shell bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 w-[660px] max-w-full">
        <ConfigModal settings={settings} saveSettings={saveSettings} onClose={() => setConfigOpen(false)} />
      </div>
    </div>}
    {deleting && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div role="alertdialog" aria-modal="true" aria-label="Delete Branch" className="p-6 rounded-xl bg-white dark:bg-gray-900 max-w-sm" onKeyDown={e => { if (e.key === "Escape") setDeleting(undefined); }}>
        <h2 className="font-semibold">Delete this branch?</h2><p className="text-sm text-gray-500 mt-2">This response, every response below it, and their images will be deleted. This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-5"><button autoFocus className="secondary-button" onClick={() => setDeleting(undefined)}>Cancel</button><button className="primary-button !bg-red-600" onClick={() => void removeBranch()}>Delete Branch</button></div>
      </div>
    </div>}
  </div>;
}
