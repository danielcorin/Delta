import { ipcMain } from "./ipc";
import {
    deleteConversation,
    deleteResponse,
    getAllConversations,
    getResponsesForConversation,
} from "./db";

const getAllConversationsHandler = async () => {
    try {
        const conversations = getAllConversations();
        return conversations;
    } catch (error) {
        console.error("Error fetching conversations:", error);
        throw new Error("Failed to fetch conversations");
    }
};

const getResponsesHandler = async (_event: any, conversationId: string) => {
    try {
        const responses = await getResponsesForConversation(conversationId);
        return responses;
    } catch (error) {
        console.error("Error fetching responses:", error);
        throw new Error("Failed to fetch responses");
    }
};

const deleteConversationHandler = async (
    _event: any,
    conversationId: string,
) => {
    try {
        await deleteConversation(conversationId);
        return { success: true };
    } catch (error) {
        console.error("Error deleting conversation:", error);
        throw new Error("Failed to delete conversation");
    }
};

const deleteResponseHandler = async (
    _event: any,
    { conversationId, responseId }: {
        conversationId: string;
        responseId: string;
    },
) => {
    try {
        await deleteResponse(conversationId, responseId);
        return { success: true };
    } catch (error) {
        console.error("Error deleting response:", error);
        throw new Error("Failed to delete response");
    }
};

export function setupConversationsHandlers() {
    ipcMain.handle("conversations:get", getAllConversationsHandler);
    ipcMain.handle("conversations:getResponses", getResponsesHandler);
    ipcMain.handle("conversations:delete", deleteConversationHandler);
    ipcMain.handle("conversations:deleteResponse", deleteResponseHandler);
}
