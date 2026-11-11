import { ipcMain } from "./ipc";
import { findSimilarResponses } from "./db";

interface SearchOptions {
    query: string;
    searchType?: "vector" | "text" | "combined";
    limit?: number;
    offset?: number;
}

const searchResponsesHandler = async (_event: any, options: SearchOptions) => {
    try {
        const { query, searchType = "text", limit = 10, offset = 0 } = options;
        return await findSimilarResponses(query, limit, offset, searchType);
    } catch (error) {
        console.error("Error searching responses:", error);
        throw new Error("Failed to search responses");
    }
};

export function setupSearchHandlers() {
    ipcMain.handle("search:find", searchResponsesHandler);
}
