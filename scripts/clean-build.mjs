import { rmSync } from "node:fs";
rmSync(new URL("../.vite", import.meta.url), { recursive: true, force: true });
