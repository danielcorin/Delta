import { join } from "node:path";
import os from "node:os";
import type { Knex } from "knex";
import type Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export const getConfig = (filename: string, migrationsPath = join(process.cwd(), "src/main/migrations")): Knex.Config => ({
  client: "better-sqlite3",
  connection: { filename },
  pool: {
    min: 1, max: 1,
    afterCreate: (conn: Database.Database, cb: (error: Error | null, connection: Database.Database) => void) => {
      try {
        conn.pragma("journal_mode = WAL");
        conn.pragma("foreign_keys = ON");
        conn.loadExtension(sqliteVec.getLoadablePath().replace("app.asar/", "app.asar.unpacked/"));
        cb(null, conn);
      } catch (error) { cb(error as Error, conn); }
    },
  },
  useNullAsDefault: true,
  migrations: { directory: migrationsPath, loadExtensions: [".js"], extension: "js" },
});
export default getConfig(join(os.homedir(), "Library/Application Support/delta/delta_data/delta.db"));
