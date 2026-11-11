import { app, dialog } from "electron";
import { ipcMain } from "./ipc";
import { mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type Database from "better-sqlite3";
import db from "./db";
import { getEmbeddings } from "./models";

export async function exportLibrary(destination: string) {
  const temp = await mkdtemp(join(tmpdir(), "delta-backup-"));
  const dir = join(temp, "Delta Library");
  const connection = await db.client.acquireConnection() as Database.Database;
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir);
    await connection.backup(join(dir, "delta.db"));
    await cp(join(app.getPath("userData"), "delta_data", "attachments"), join(dir, "attachments"), { recursive: true });
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ format: "delta-library", version: 1, appVersion: app.getVersion(), createdAt: new Date().toISOString() }, null, 2));
    await promisify(execFile)("/usr/bin/ditto", ["-c", "-k", "--keepParent", dir, destination]);
  } finally {
    await db.client.releaseConnection(connection);
    await rm(temp, { recursive: true, force: true });
  }
}
export async function backfillEmbeddings() {
  const responses = await db("responses").whereNotExists(db("embeddings").whereRaw("embeddings.response_id = responses.id"));
  let count = 0;
  for (const response of responses) {
    const vectors = await getEmbeddings([response.prompt, response.response]);
    await db.transaction(async trx => {
      for (const [i, type] of ["prompt", "response"].entries()) {
        await trx("embeddings").insert({ response_id: response.id, embedding: Buffer.from(new Float32Array(vectors[i]).buffer), embedding_model: "nomic-embed-text", type });
      }
    });
    count++;
  }
  return count;
}
export function setupAdminHandlers() {
  ipcMain.handle("admin:exportLibrary", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export Delta Library", defaultPath: `Delta-Library-${new Date().toISOString().slice(0,10)}.zip`,
      filters: [{ name: "ZIP archive", extensions: ["zip"] }],
    });
    if (canceled || !filePath) return null;
    await exportLibrary(filePath);
    return filePath;
  });
  ipcMain.handle("admin:backfillFTSData", () => db.raw("INSERT INTO responses_fts(responses_fts) VALUES('rebuild')").then(() => undefined));
  ipcMain.handle("admin:backfillEmbeddings", backfillEmbeddings);
}
