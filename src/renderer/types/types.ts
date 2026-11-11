import type { RunResult } from "better-sqlite3";
import type { Settings } from "../../shared/contracts";
export type { Settings } from "../../shared/contracts";

export interface Attachment {
    id: string;
    response_id: string;
    file_path: string;
    type: string;
    created_at: string;
    url?: string;
}

export interface DbResponse {
    id: string;
    model: string;
    provider: string;
    prompt: string;
    system: string;
    response: string;
    conversation_id: string;
    parent_id: string;
    duration_ms: number;
    datetime_utc: string;
    temperature: number;
    top_p: number;
    attachments: string;
}

export interface Response {
    id: string;
    model: string;
    provider: string;
    prompt: string;
    system: string;
    response: string;
    conversation_id: string;
    parent_id: string;
    duration_ms: number;
    datetime_utc: string;
    temperature: number;
    top_p: number;
    attachments: string[];
}

export interface Conversation {
    id: string;
    title: string;
    created_at: string;
}

export interface DbInsertData {
    [key: string]: any;
}

export interface EmbeddingData {
    prompt_embedding: number[];
    response_embedding: number[];
    model: string;
}

export interface DbFunctions {
    ensureTable: () => void;
    insert: (tableName: string, data: DbInsertData) => RunResult;
    getAllConversations: () => Conversation[];
}

export interface AdminFunctions {
    backfillFTSData: () => Promise<void>;
}

export interface SimilarResponse {
    id: number;
    response_id: string;
    conversation_id: string;
    type: "prompt" | "response";
    prompt: string;
    response: string;
    text: string;
    distance: number;
    model: string;
    provider: string;
    datetime_utc: string;
}

export interface SpaceProps {
    // Conversation/Response data
    conversations: Conversation[];
    responses: Response[];

    // Data fetching/updating
    fetchConversations: () => void;
    fetchResponses: (conversationId: string) => Promise<Response[]>;
    setResponses: (responses: Response[]) => void;

    // Model settings
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    modelsByProvider: Record<string, string[]>;
    temperature: number;
    setTemperature: (temp: number) => void;
    topP: number;
    setTopP: (topP: number) => void;

    // Settings
    settings: Settings;
    saveSettings: (settings: Settings) => Promise<boolean>;
    modelErrors: Record<string, string>;
    refreshModels: () => Promise<void>;
    refreshingModels: boolean;
}

export interface ExpandedState {
    prompt: boolean;
    response: boolean;
    promptRaw: boolean;
    responseRaw: boolean;
}
