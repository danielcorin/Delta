import { Message, smoothStream, streamText } from "ai";
import { ipcMain } from "electron";
import { ulid } from "ulid";
import { insert } from "./db";
import { DbInsertData, EmbeddingData } from "src/renderer/types/types";
import { getEmbeddingProvider, getProvider, getProviderName } from "./models";
import { storeAttachment, StoredAttachment } from "./storage";

export function setupChatHandler() {
    ipcMain.on(
        "chat:start-stream",
        async (
            event,
            { messages, model, temperature, topP, systemPrompt }: {
                messages: Message[];
                model: string;
                temperature: number;
                topP: number;
                systemPrompt: string;
            },
        ) => {
            try {
                let conversationId = extractConversationId(messages);
                const provider = getProviderName(model);
                const responseId = ulid();

                let conversation: DbInsertData | undefined;
                if (!conversationId) {
                    conversationId = ulid();
                    conversation = {
                        id: conversationId,
                        title: messages[0].content,
                        created_at: new Date().toISOString(),
                    };
                }

                const parentId = extractParentId(messages);
                const annotations = [
                    { id: conversationId?.toString(), field: "conversationId" },
                    { id: responseId.toString(), field: "responseId" },
                    { id: parentId?.toString(), field: "parentId" },
                    { id: provider.toString(), field: "provider" },
                    { id: temperature.toString(), field: "temperature" },
                    { id: topP.toString(), field: "topP" },
                ];

                const newMessages = formatMessages(messages);
                const attachments = await handleAttachments(messages);

                const result = streamText({
                    model: getProvider(model),
                    temperature,
                    topP,
                    experimental_transform: smoothStream(),
                    messages: newMessages,
                    ...(systemPrompt?.trim() && { system: systemPrompt }), // Only include system if it has content
                    async onFinish(response) {
                        const prompt = messages[messages.length - 1].content;
                        const promptAnnotations =
                            messages[messages.length - 1].annotations;
                        await handleStreamComplete({
                            responseId,
                            model,
                            provider,
                            prompt,
                            systemPrompt,
                            response,
                            conversationId,
                            parentId,
                            temperature,
                            topP,
                            conversation,
                            attachments,
                            annotations: promptAnnotations,
                        });
                    },
                });

                let responseText = "";
                for await (const chunk of result.textStream) {
                    try {
                        responseText += chunk;
                        event.sender.send("chat:stream-data", {
                            value: chunk,
                            timestamp: Date.now(),
                        });
                    } catch (error) {
                        console.error("[Chat] Failed to send chunk:", error);
                    }
                }
                event.sender.send("chat:stream-complete", {
                    id: responseId,
                    role: "assistant",
                    content: responseText,
                    annotations: annotations,
                });
            } catch (error) {
                console.error("[Chat] Streaming error:", error);
                event.sender.send("chat:stream-error", error);
            }
        },
    );
}

function extractConversationId(messages: Message[]): string | null {
    const assistantMessage = messages.find((message) =>
        message.role === "assistant"
    );
    return assistantMessage?.annotations?.find((a) =>
        a.field === "conversationId"
    )?.id || null;
}

function extractParentId(messages: Message[]): string | null {
    const lastUserMessageIndex = messages.findLastIndex((m) =>
        m.role === "user"
    );
    const lastAssistantMessage = messages
        .slice(0, lastUserMessageIndex)
        .findLast((m) => m.role === "assistant");
    const parentId = lastAssistantMessage?.annotations?.find(
        (a) => a.field === "responseId",
    )?.id || null;
    return parentId;
}

function formatMessages(messages: Message[]) {
    return messages.map(formatMessage);
}

function formatMessage(message: Message) {
    const content = message.experimental_attachments?.length > 0
        ? [
            { type: "text", text: message.content },
            ...message.experimental_attachments.map((attachment) => ({
                type: "image",
                image: attachment.url,
            })),
        ]
        : [{ type: "text", text: message.content }];

    return {
        role: message.role,
        content,
    };
}

async function handleAttachments(
    messages: Message[],
): Promise<StoredAttachment[]> {
    const lastUserMessage = messages.findLast((message) =>
        message.role === "user"
    );
    if (!lastUserMessage?.experimental_attachments?.length) {
        return [];
    }

    const attachmentPromises = lastUserMessage.experimental_attachments.map((
        attachment,
    ) => storeAttachment(attachment));
    const storedAttachments = await Promise.all(attachmentPromises);
    return storedAttachments;
}

async function handleStreamComplete({
    responseId,
    model,
    provider,
    prompt,
    systemPrompt,
    response,
    conversationId,
    parentId,
    temperature,
    topP,
    conversation,
    attachments,
}: any) {
    const responseData = {
        id: responseId,
        model,
        provider,
        prompt,
        system: systemPrompt,
        response: response.text,
        conversation_id: conversationId,
        parent_id: parentId,
        duration_ms: 0,
        datetime_utc: new Date().toISOString(),
        temperature,
        top_p: topP,
    };

    let embeddingData: EmbeddingData | null = null;
    try {
        const embeddingProvider = getEmbeddingProvider(model);
        const embeddingsRes = await embeddingProvider.doEmbed({
            values: [prompt, response.text],
        });

        embeddingData = {
            prompt_embedding: embeddingsRes.embeddings[0],
            response_embedding: embeddingsRes.embeddings[1],
            model: "nomic-embed-text",
        };
    } catch (error) {
        console.error("Failed to generate embeddings:", error);
        embeddingData = null;
    }

    insert(responseData, embeddingData, conversation, attachments);
}
