import knex from "knex";
import { getEmbeddings } from "./models";
import { deleteAttachment, getAttachment } from "./storage";
import { app } from "electron";
import { join, dirname } from "node:path";
import { getConfig } from "../../knexfile";

import {
    Attachment,
    Conversation,
    DbInsertData,
    DbResponse,
    EmbeddingData,
    Response,
    SimilarResponse,
} from "src/renderer/types/types";

const filename = join(app.getPath("userData"), "delta_data", "delta.db");
console.log(`Using database at ${filename}`);

const config = getConfig(filename, app.getAppPath().endsWith(".asar") ? join(dirname(app.getAppPath()), "migrations") : join(app.getAppPath(), "src/main/migrations"));

export const db: knex.Knex = knex(config);


export async function ensureTables(): Promise<void> {
    try {
        console.log("Running database migrations...");
        await db.migrate.latest(config.migrations);
        console.log("Database migrations completed successfully");
    } catch (error) {
        console.error("Migration failed:", error);
        throw error;
    }
}

export async function insert(
    response: DbInsertData,
    embeddings?: EmbeddingData,
    conversation?: DbInsertData,
    attachments?: { id: string; file_path: string; type: string }[],
): Promise<void> {
    await db.transaction(async (trx) => {
        if (conversation && Object.keys(conversation).length > 0) {
            await trx("conversations").insert(conversation);
        }

        if (Object.keys(response).length > 0) {
            await trx("responses").insert(response);
        }

        if (embeddings) {
            await trx("embeddings").insert([
                {
                    response_id: response.id,
                    embedding: Buffer.from(
                        new Float32Array(embeddings.prompt_embedding).buffer,
                    ),
                    embedding_model: embeddings.model,
                    type: "prompt",
                },
                {
                    response_id: response.id,
                    embedding: Buffer.from(
                        new Float32Array(embeddings.response_embedding).buffer,
                    ),
                    embedding_model: embeddings.model,
                    type: "response",
                },
            ]);
        }

        if (attachments && attachments.length > 0) {
            await trx("attachments").insert(
                attachments.map((attachment) => ({
                    id: attachment.id,
                    response_id: response.id,
                    file_path: attachment.file_path,
                    type: attachment.type,
                    created_at: new Date().toISOString(),
                })),
            );
        }
    });
}

export async function getAllConversations(): Promise<Conversation[]> {
    return await db("conversations")
        .orderBy("created_at", "desc");
}

export async function getResponsesForConversation(
    conversationId: string,
): Promise<Response[]> {
    const responses = await db("responses")
        .select(
            "responses.*",
            db.raw(`json_group_array(
                json_object(
                    'id', attachments.id,
                    'response_id', attachments.response_id,
                    'file_path', attachments.file_path,
                    'type', attachments.type,
                    'created_at', attachments.created_at
                )
            ) FILTER (WHERE attachments.id IS NOT NULL) as attachments`),
        )
        .leftJoin("attachments", "responses.id", "attachments.response_id")
        .where("responses.conversation_id", conversationId)
        .groupBy("responses.id")
        .orderBy("responses.datetime_utc", "asc") as DbResponse[];

    return await Promise.all(responses.map(async (response) => {
        const attachments = JSON.parse(
            response.attachments || "[]",
        ) as Attachment[];
        const base64Attachments = await Promise.all(
            attachments.map(async (attachment) => {
                const data = await getAttachment(attachment.file_path);
                return `data:image/${attachment.type};base64,${
                    Buffer.from(data).toString("base64")
                }`;
            }),
        );
        return {
            ...response,
            attachments: base64Attachments,
        };
    }));
}

export async function deleteResponse(
    conversationId: string,
    responseId: string,
): Promise<void> {
    const files: string[] = [];
    await db.transaction(async trx => {
        const rows = await trx.raw(`
          WITH RECURSIVE subtree(id) AS (
            SELECT id FROM responses WHERE id = ? AND conversation_id = ?
            UNION SELECT r.id FROM responses r JOIN subtree s ON r.parent_id = s.id WHERE r.conversation_id = ?
          ) SELECT id FROM subtree
        `, [responseId, conversationId, conversationId]) as { id: string }[];
        const ids = rows.map(r => r.id);
        const attachments = await trx("attachments").whereIn("response_id", ids).select("file_path");
        files.push(...attachments.map(a => a.file_path as string));
        for (const table of ["summaries", "embeddings", "attachments"]) await trx(table).whereIn("response_id", ids).delete();
        await trx("responses").whereIn("id", ids).delete();
    });
    await Promise.all(files.map(file => deleteAttachment(file).catch(() => undefined)));
}

export async function deleteConversation(
    conversationId: string,
): Promise<void> {
    await db.transaction(async (trx) => {
        const attachments = await trx("attachments")
            .select("file_path")
            .whereIn(
                "response_id",
                trx("responses")
                    .select("id")
                    .where("conversation_id", conversationId),
            );

        await trx("summaries").where("conversation_id", conversationId).delete();

        await trx("embeddings")
            .whereIn(
                "response_id",
                trx("responses")
                    .select("id")
                    .where("conversation_id", conversationId),
            )
            .delete();

        await trx("attachments")
            .whereIn(
                "response_id",
                trx("responses")
                    .select("id")
                    .where("conversation_id", conversationId),
            )
            .delete();

        await trx("responses")
            .where("conversation_id", conversationId)
            .delete();

        await trx("conversations")
            .where("id", conversationId)
            .delete();
        // Only remove files once the transaction has committed.
        trx.executionPromise.then(() => Promise.all(attachments.map(a => deleteAttachment(a.file_path).catch(() => undefined)))).catch(() => undefined);
    });
}

export async function findSimilarResponses(
    query: string,
    limit = 10,
    offset = 0,
    searchType: "vector" | "text" | "combined" = "combined",
): Promise<SimilarResponse[]> {
    if (!query.trim()) return [];
    limit = Math.max(1, Math.min(100, Math.floor(limit)));
    offset = Math.max(0, Math.floor(offset));
    let vectorResults: SimilarResponse[] = [];
    let ftsResults: SimilarResponse[] = [];

    if (searchType === "vector" || searchType === "combined") {
      try {
        const embeddings = await getEmbeddings([query]);
        const queryEmbedding = Buffer.from(new Float32Array(embeddings[0]).buffer);

        vectorResults = await db.raw(
            `
            WITH vector_matches AS (
                SELECT
                    e.id, e.response_id, e.type, r.prompt, r.response, r.conversation_id,
                    r.model, r.provider, r.datetime_utc,
                    CASE WHEN e.type = 'prompt' THEN r.prompt ELSE r.response END as text,
                    vec_distance_cosine(e.embedding, ?) as distance
                FROM embeddings e
                JOIN responses r ON e.response_id = r.id
                WHERE e.embedding_model = 'nomic-embed-text' AND length(e.embedding) = length(?)
                ORDER BY distance
                LIMIT ?
            )
            SELECT * FROM vector_matches
        `,
            [queryEmbedding, queryEmbedding, (offset + limit) * 2],
        );
      } catch (error) {
        if (searchType === "vector") throw error;
        // Combined search still provides useful text results without Ollama.
      }
    }

    if (searchType === "text" || searchType === "combined") {
        const sanitizedQuery = query.trim().split(/\s+/u).map(token => '"' + token.replace(/"/g, '""') + '"').join(" AND ");
        ftsResults = await db.raw(
            `
            WITH fts_matches AS (
                SELECT
                    NULL as id, r.id as response_id,
                    CASE
                        WHEN instr(r.prompt, ?) > 0 THEN 'prompt'
                        ELSE 'response'
                    END as type,
                    r.prompt, r.response, r.conversation_id, r.model, r.provider, r.datetime_utc,
                    CASE
                        WHEN instr(r.prompt, ?) > 0 THEN r.prompt
                        ELSE r.response
                    END as text,
                    bm25(responses_fts) as distance
                FROM responses_fts
                JOIN responses r ON responses_fts.id = r.id
                WHERE responses_fts MATCH ?
                ORDER BY distance
                LIMIT ?
            )
            SELECT * FROM fts_matches
        `,
            [query, query, sanitizedQuery, (offset + limit) * 2],
        );
    }

    if (searchType === "combined") {
        // Rank fusion: BM25 and cosine distance do not share a numeric scale.
        vectorResults.forEach((r, i) => { r.distance = i / Math.max(1, vectorResults.length); });
        ftsResults.forEach((r, i) => { r.distance = i / Math.max(1, ftsResults.length); });
    }

    const seenIds = new Set<string>();
    const combinedResults = [...vectorResults, ...ftsResults]
        .sort((a, b) => a.distance - b.distance)
        .filter((result) => {
            if (!seenIds.has(result.response_id)) {
                seenIds.add(result.response_id);
                return true;
            }
            return false;
        });

    return combinedResults.slice(offset, offset + limit);
}

export async function insertSummary(data: {
    id: string;
    response_id: string;
    conversation_id: string;
    summary: string;
    created_at: string;
    type: string;
}): Promise<void> {
    await db("summaries").insert(data);
}

export async function getSummariesByConversationId(
    conversationId: string,
): Promise<{
    id: string;
    response_id: string;
    conversation_id: string;
    summary: string;
    created_at: string;
    type: string;
}[]> {
    return await db("summaries")
        .where({ conversation_id: conversationId })
        .orderBy("created_at", "desc");
}

export async function getSummaryForResponse(responseId: string): Promise<
    {
        id: string;
        response_id: string;
        conversation_id: string;
        summary: string;
        created_at: string;
    } | undefined
> {
    return await db("summaries")
        .where({ response_id: responseId })
        .first();
}

export async function deleteSummary(id: string): Promise<void> {
    await db("summaries").where({ id }).delete();
}

export default db;
