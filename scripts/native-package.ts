import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// npm installs only the host's optional sqlite-vec binary. Cross-builds need the
// target package, fetched from the lockfile and integrity-checked before unpacking.
export async function installTargetVector(buildPath: string, arch: string) {
  const name = "sqlite-vec-darwin-" + arch;
  const lock = JSON.parse(await readFile(path.join(process.cwd(), "package-lock.json"), "utf8"));
  const pkg = lock.packages["node_modules/" + name];
  if (!pkg?.resolved || !pkg?.integrity?.startsWith("sha512-")) throw new Error("Missing locked native package: " + name);
  const dest = path.join(buildPath, "node_modules", name);
  await mkdir(dest, { recursive: true });
  const response = await fetch(pkg.resolved, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("Could not download " + name);
  const bytes = Buffer.from(await response.arrayBuffer());
  const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
  if (integrity !== pkg.integrity) throw new Error("Integrity check failed for " + name);
  const archive = path.join(buildPath, "native-package.tgz");
  await writeFile(archive, bytes);
  try { await promisify(execFile)("/usr/bin/tar", ["-xzf", archive, "--strip-components=1", "-C", dest]); }
  finally { await rm(archive); }
}
