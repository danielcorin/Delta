import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fixture = vi.hoisted(() => ({ dir: "" }));
vi.mock("electron", () => ({ app: { getPath: () => fixture.dir, isPackaged: false, getAppPath: () => process.cwd() } }));
vi.mock("../src/main/models", () => ({ getEmbeddings: () => Promise.reject(new Error("Ollama offline")) }));
let database: typeof import("../src/main/db");
beforeAll(async () => {
  fixture.dir = mkdtempSync(join(tmpdir(), "delta-db-"));
  mkdirSync(join(fixture.dir, "delta_data/attachments"), { recursive: true });
  database = await import("../src/main/db");
  await database.ensureTables();
});
afterAll(async () => { await database.db.destroy(); rmSync(fixture.dir, { recursive: true, force: true }); });
const response = (id: string, parent: string | null = null) => ({
  id, conversation_id: "conversation", parent_id: parent, model: "legacy-model", provider: "openai",
  prompt: "Café 東京: " + id, response: "A thoughtful response", datetime_utc: new Date().toISOString(), temperature: 0.7, top_p: 1,
});
describe("legacy library integration", () => {
  it("migrates idempotently, persists branches and retrieves image attachments", async () => {
    writeFileSync(join(fixture.dir, "delta_data/attachments/picture"), Buffer.from("fixture"));
    await database.insert(response("root"), undefined, { id: "conversation", title: "Legacy library", created_at: new Date().toISOString() }, [{ id: "image", file_path: "attachments/picture", type: "png" }]);
    await database.insert(response("child", "root"));
    await database.insert(response("sibling", "root"));
    await database.ensureTables();
    const rows = await database.getResponsesForConversation("conversation");
    expect(rows).toHaveLength(3);
    expect(rows[0].attachments).toEqual(["data:image/png;base64,Zml4dHVyZQ=="]);
    expect(await database.db.raw("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
  });
  it("supports Unicode, quoted/punctuation input, offsets, and offline combined search", async () => {
    expect(await database.findSimilarResponses("東京")).toHaveLength(3);
    expect(await database.findSimilarResponses('Café "root"')).toHaveLength(1);
    expect(await database.findSimilarResponses("   ")).toEqual([]);
    expect(await database.findSimilarResponses("thoughtful", 1, 1)).toHaveLength(1);
    expect(await database.findSimilarResponses("thoughtful", 10, 0, "combined")).toHaveLength(3);
    await expect(database.findSimilarResponses("thoughtful", 10, 0, "vector")).rejects.toThrow("offline");
  });
  it("deletes a subtree transactionally with summaries, embeddings and attachments", async () => {
    await database.insertSummary({ id: "summary", response_id: "root", conversation_id: "conversation", summary: "saved summary", created_at: new Date().toISOString(), type: "response" });
    await database.deleteResponse("conversation", "child");
    expect((await database.getResponsesForConversation("conversation")).map(r => r.id)).toEqual(["root", "sibling"]);
    await database.deleteResponse("conversation", "root");
    expect(await database.getResponsesForConversation("conversation")).toEqual([]);
    expect(await database.getSummariesByConversationId("conversation")).toEqual([]);
    expect(existsSync(join(fixture.dir, "delta_data/attachments/picture"))).toBe(false);
    expect(await database.findSimilarResponses("thoughtful")).toEqual([]);
  });
  it("keeps other conversations intact and cleans whole conversations", async () => {
    await database.insert({ ...response("other"), conversation_id: "other-conversation" }, undefined, { id: "other-conversation", title: "Other" });
    await database.deleteConversation("conversation");
    expect(await database.getAllConversations()).toHaveLength(1);
    expect(await database.getResponsesForConversation("other-conversation")).toHaveLength(1);
  });
});
