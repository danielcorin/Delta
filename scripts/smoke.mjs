import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const bundle = path.resolve(process.argv[2] || "out/Delta-darwin-" + process.arch + "/Delta.app");
const home = await mkdtemp(path.join(tmpdir(), "delta-smoke-"));
const report = path.join(home, "report.json");
try {
  const child = spawn(path.join(bundle, "Contents/MacOS/Delta"), [], {
    env: { ...process.env, DELTA_HOME: home, DELTA_HEADLESS: "1", DELTA_SMOKE_REPORT: report },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  clearTimeout(timer);
  if (status !== 0) throw new Error("Packaged app failed to start: " + stderr + await readFile(report, "utf8").catch(() => "No smoke report."));
  const result = JSON.parse(await readFile(report, "utf8"));
  if (!result.ok) throw new Error("Packaged smoke check failed.");
  console.log(JSON.stringify(result));
} finally { await rm(home, { recursive: true, force: true }); }
