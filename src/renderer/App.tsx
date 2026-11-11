import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Conversation, Response, Settings } from "./types/types";
import { modelKey } from "../shared/contracts";
import "@xyflow/react/dist/style.css";
import Space from "./components/Space";

export function App() {
  const [responses, setResponses] = useState<Response[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("delta.model") || "");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState("");
  const responseRequest = useRef(0);
  const fetchConversations = useCallback(async () => setConversations(await window.api.getConversations()), []);
  const fetchResponses = useCallback(async (id: string) => {
    const request = ++responseRequest.current;
    const data = await window.api.getResponses(id);
    if (request === responseRequest.current) setResponses(data);
    return data;
  }, []);
  const refreshModels = useCallback(async () => {
    setRefreshingModels(true);
    try {
      const catalog = await window.api.getModels();
      setModelsByProvider(catalog.modelsByProvider); setModelErrors(catalog.errors);
      const available = Object.entries(catalog.modelsByProvider).flatMap(([provider, models]) => models.map(m => modelKey(provider, m)));
      setSelectedModel(current => available.includes(current) ? current : available[0] || "");
    } catch { setModelErrors({ discovery: "Could not load models. Open Settings to check your providers." }); }
    finally { setRefreshingModels(false); }
  }, []);
  const saveSettings = useCallback(async (value: Settings) => {
    await window.api.saveSettings(value);
    setSettings(await window.api.getSettings());
    await refreshModels();
    return true;
  }, [refreshModels]);
  useEffect(() => { localStorage.setItem("delta.model", selectedModel); }, [selectedModel]);
  useEffect(() => {
    void Promise.all([window.api.getSettings().then(setSettings), fetchConversations()])
      .then(refreshModels).catch(() => setError("Your library or settings could not be opened. Reopen Delta to try again."));
  }, [fetchConversations, refreshModels]);
  if (error) return <main className="p-8" role="alert">{error}</main>;
  if (!settings) return <main className="p-8 text-gray-500">Opening Delta…</main>;
  return <ReactFlowProvider><Space
    responses={responses} setResponses={value => { responseRequest.current++; setResponses(value); }}
    conversations={conversations} fetchConversations={fetchConversations} fetchResponses={fetchResponses}
    selectedModel={selectedModel} setSelectedModel={setSelectedModel} modelsByProvider={modelsByProvider}
    modelErrors={modelErrors} refreshModels={refreshModels} refreshingModels={refreshingModels}
    temperature={temperature} setTemperature={setTemperature} topP={topP} setTopP={setTopP}
    settings={settings} saveSettings={saveSettings}
  /></ReactFlowProvider>;
}
