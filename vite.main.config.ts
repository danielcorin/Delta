import { defineConfig } from "vite";
export default defineConfig({
  build: { sourcemap: false, rollupOptions: { external: ["knex", "better-sqlite3", "sqlite-vec"], output: { inlineDynamicImports: true } } },
});
