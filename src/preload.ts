import { contextBridge, ipcRenderer } from "electron";
import type { Settings, StreamRequest, StreamChunk, StreamComplete, StreamError } from "./shared/contracts";
import type { Conversation, Response, SimilarResponse } from "./renderer/types/types";
import type { ModelCatalog } from "./shared/contracts";

function listen<T>(channel: string, callback: (value: T) => void) {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}
const api = {
  startStream: (request: StreamRequest) => ipcRenderer.send("chat:start-stream", request),
  stopStream: (requestId: string) => ipcRenderer.send("chat:stop-stream", requestId),
  onStreamData: (callback: (value: StreamChunk) => void) => listen("chat:stream-data", callback),
  onStreamComplete: (callback: (value: StreamComplete) => void) => listen("chat:stream-complete", callback),
  onStreamError: (callback: (value: StreamError) => void) => listen("chat:stream-error", callback),
  onMenu: (callback: (action: string) => void) => listen("menu:action", callback),
  getConversations: (): Promise<Conversation[]> => ipcRenderer.invoke("conversations:get"),
  getResponses: (conversationId: string): Promise<Response[]> => ipcRenderer.invoke("conversations:getResponses", conversationId),
  deleteConversation: (conversationId: string): Promise<{ success: boolean }> => ipcRenderer.invoke("conversations:delete", conversationId),
  deleteResponse: (conversationId: string, responseId: string): Promise<{ success: boolean }> => ipcRenderer.invoke("conversations:deleteResponse", { conversationId, responseId }),
  getModels: (): Promise<ModelCatalog> => ipcRenderer.invoke("models:get"),
  findSimilarResponses: (options: { query: string; searchType?: "vector" | "text" | "combined"; limit?: number; offset?: number }): Promise<SimilarResponse[]> => ipcRenderer.invoke("search:find", options),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: Settings): Promise<boolean> => ipcRenderer.invoke("settings:save", settings),
  admin: {
    exportLibrary: (): Promise<string | null> => ipcRenderer.invoke("admin:exportLibrary"),
    backfillFTSData: (): Promise<void> => ipcRenderer.invoke("admin:backfillFTSData"),
    backfillEmbeddings: (): Promise<number> => ipcRenderer.invoke("admin:backfillEmbeddings"),
  },
};
contextBridge.exposeInMainWorld("api", api);
export type DeltaAPI = typeof api;
