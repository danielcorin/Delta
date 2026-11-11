import { app, dialog } from "electron";
import path from "node:path";

// The original app used the lowercase package name for its data directory.
// Set this before importing any database/settings modules.
app.setPath("userData", process.env.DELTA_HOME
  ? path.resolve(process.env.DELTA_HOME, "data")
  : path.join(app.getPath("appData"), "delta"));
app.name = "Delta";
if (process.env.DELTA_HEADLESS && process.platform === "darwin") app.setActivationPolicy("prohibited");

app.whenReady().then(async () => {
  const { startApplication } = await import("./main/application");
  await startApplication();
}).catch(async (error) => {
  if (process.env.DELTA_SMOKE_REPORT) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(process.env.DELTA_SMOKE_REPORT, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Startup failed" }));
    app.exit(1);
    return;
  }
  dialog.showErrorBox("Delta Could Not Start", "Your library has not been reset. Check available disk space and that your login Keychain is unlocked, then reopen Delta.");
  app.exit(1);
});
