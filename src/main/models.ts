import { ipcMain } from "electron";
import { ollama } from "ollama-ai-provider";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { apiKeys, DEFAULT_OLLAMA_URL } from "./settings";

const getAnthropicProvider = () => {
    const key = apiKeys.get("anthropic");
    console.log("[Models] Anthropic API key status:", key ? "Present" : "Missing");
    return key
        ? createAnthropic({ apiKey: key })
        : anthropic;
};

const getGoogleProvider = () =>
    apiKeys.get("google")
        ? createGoogleGenerativeAI({ apiKey: apiKeys.get("google") })
        : google;

const getOpenAIProvider = () =>
    apiKeys.get("openai")
        ? createOpenAI({ apiKey: apiKeys.get("openai") })
        : openai;

const getOllamaModels = async () => {
    try {
        const ollamaUrl = apiKeys.get("ollamaUrl") || DEFAULT_OLLAMA_URL;
        const response = await fetch(`${ollamaUrl}/api/tags`);
        if (!response.ok) {
            return {};
        }
        const data = await response.json();
        return data.models.reduce(
            (
                acc: Record<
                    string,
                    { provider: typeof ollama; providerName: string }
                >,
                model: { name: string },
            ) => {
                acc[model.name] = { provider: ollama, providerName: "ollama" };
                return acc;
            },
            {},
        );
    } catch {
        return {};
    }
};

export async function checkOllamaStatus(url: string = DEFAULT_OLLAMA_URL) {
    try {
        const response = await fetch(`${url}/api/tags`);
        return response.ok;
    } catch {
        return false;
    }
}

const baseModelProviders = {
    "gemini-1.5-flash-latest": {
        get provider() {
            return getGoogleProvider();
        },
        providerName: "google",
    },
    "gemini-1.5-pro-latest": {
        get provider() {
            return getGoogleProvider();
        },
        providerName: "google",
    },

    "claude-4-sonnet-20250514": {
        get provider() {
            return getAnthropicProvider();
        },
        providerName: "anthropic",
    },
    "claude-4-opus-20250514": {
        get provider() {
            return getAnthropicProvider();
        },
        providerName: "anthropic",
    },

    "gpt-4o": {
        get provider() {
            return getOpenAIProvider();
        },
        providerName: "openai",
    },
    "gpt-4o-mini": {
        get provider() {
            return getOpenAIProvider();
        },
        providerName: "openai",
    },
    "o1-preview": {
        get provider() {
            return getOpenAIProvider();
        },
        providerName: "openai",
    },
    "o1-mini": {
        get provider() {
            return getOpenAIProvider();
        },
        providerName: "openai",
    },
} as const;

let modelProviders = baseModelProviders;

const refreshModelProviders = async () => {
    const ollamaModels = await getOllamaModels();
    modelProviders = {
        ...baseModelProviders,
        ...ollamaModels,
    };
};

export type SupportedModel = keyof typeof baseModelProviders;

export function getProvider(model: string) {
    if (model in modelProviders) {
        try {
            const providerConfig = modelProviders[model as SupportedModel];
            const provider = providerConfig.provider;
            console.log(`[Models] Getting provider for model: ${model}, provider type: ${typeof provider}`);

            if (typeof provider === "function") {
                return provider(model);
            }

            if (typeof provider === "object") {
                if (typeof (provider as any).messages === "function") {
                    return (provider as any).messages(model);
                }
                if (typeof (provider as any).chat === "function") {
                    return (provider as any).chat(model);
                }
                if (typeof (provider as any).languageModel === "function") {
                    return (provider as any).languageModel(model);
                }
            }

            return provider as any;
        } catch (error) {
            console.error(`[Models] Error getting provider for ${model}:`, error);
            throw error;
        }
    }
    throw new Error(`Unsupported model: ${model}`);
}

export function getProviderName(model: string) {
    if (model in modelProviders) {
        return modelProviders[model as SupportedModel].providerName;
    }
    throw new Error(`Unsupported model: ${model}`);
}

export function getEmbeddingProvider(_model: string) {
    return ollama.textEmbeddingModel("nomic-embed-text");
}

const getModelsHandler = async () => {
    try {
        await refreshModelProviders();
        const modelsByProvider: Record<string, string[]> = {};

        Object.entries(modelProviders).forEach(([model, { providerName }]) => {
            if (!modelsByProvider[providerName]) {
                modelsByProvider[providerName] = [];
            }
            modelsByProvider[providerName].push(model);
        });

        return {
            models: Object.keys(modelProviders),
            modelsByProvider,
        };
    } catch (error) {
        console.error("Error fetching models:", error);
        throw new Error("Failed to fetch models");
    }
};

export function setupModelsHandlers() {
    ipcMain.handle("models:get", getModelsHandler);
    ipcMain.handle(
        "models:checkOllama",
        async (_event, url) => checkOllamaStatus(url),
    );
}
