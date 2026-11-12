import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultSettings } from "../../src/main/settings-store";
import { execFileSync } from "node:child_process";

let app: ElectronApplication, page: Page, server: Server, home: string;
let port: number;
const requests: { url: string; body: any }[] = [];
const errors: string[] = [];
const scrollFixture = "# Scroll regression\n\n```text\n" + "wide code content ".repeat(30) + "\n```\n\n" +
  Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: scroll this conversation turn without moving or zooming the canvas.`).join("\n\n");
test.beforeAll(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "delta-e2e-"));
  server = createServer(async (req, res) => {
    if (req.url === "/api/tags") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models: [{ name: "local-fixture" }] })); return; }
    if (req.url === "/v1/models") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ data: [{ id: "fixture-model" }, { id: "fixture-second" }] })); return; }
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); requests.push({ url: req.url!, body: input });
    if (input.messages.at(-1).content === "fail") { res.writeHead(401); res.end("No credentials"); return; }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (content: string, finish: string | null = null) => res.write("data: " + JSON.stringify({
      id: "fixture-response", object: "chat.completion.chunk", created: 1, model: input.model,
      choices: [{ index: 0, delta: { content }, finish_reason: finish }],
    }) + "\n\n");
    if (input.messages.at(-1).content === scrollFixture) {
      chunk(scrollFixture, "stop"); res.end("data: [DONE]\n\n"); return;
    }
    chunk("A branching conversation ");
    if (input.messages.at(-1).content === "slow") {
      const timer = setInterval(() => chunk("continues "), 100);
      res.on("close", () => clearInterval(timer));
    } else {
      chunk("can explore many directions.", "stop"); res.end("data: [DONE]\n\n");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
  const settings = defaultSettings();
  settings.providers.forEach(p => { p.enabled = p.name === "compatible"; });
  settings.providers[4].baseURL = `http://127.0.0.1:${port}/v1`;
  settings.providers[3].baseURL = `http://127.0.0.1:${port}`;
  await mkdir(path.join(home, "config"), { recursive: true });
  await writeFile(path.join(home, "config/config.json"), JSON.stringify(settings));
  const arch = process.env.DELTA_ARCH || process.arch;
  app = await electron.launch({
    args: [path.resolve(`out/Delta-darwin-${arch}/Delta.app/Contents/Resources/app.asar`)],
    env: { ...process.env, DELTA_HOME: home, DELTA_HEADLESS: "1" },
  });
  app.process().stderr?.on("data", data => { const s = String(data); if (s.includes("Error")) errors.push(s); });
  page = await app.firstWindow();
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("button", { name: "Choose Model" })).toContainText("fixture-model");
});
test.afterAll(async () => {
  await app?.close();
  server?.closeAllConnections();
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await rm(home, { recursive: true, force: true });
});
test("chat, branching, cancellation, settings, search, backup and screenshots", async () => {
  await page.getByRole("button", { name: "Choose Model" }).click();
  await page.getByRole("textbox", { name: "Search Models" }).fill("second");
  await page.getByRole("option", { name: "fixture-second" }).click();
  await expect(page.getByRole("button", { name: "Choose Model" })).toContainText("fixture-second");
  await page.evaluate(() => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], "fixture.png", { type: "image/png" }));
    document.querySelector('textarea[aria-label="Message"]')!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(page.getByAltText("Attached image 1")).toBeVisible();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Explore this idea");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.locator("article").last()).toContainText("can explore many directions.");
  await expect(page.getByRole("button", { name: "Stop Response" })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.api.getConversations())).toHaveLength(1);
  const conversations = await page.evaluate(() => window.api.getConversations());
  const id = conversations[0].id;
  await expect.poll(async () => page.evaluate(id => window.api.getResponses(id), id)).toHaveLength(1);

  const initial = await page.evaluate(id => window.api.getResponses(id), id);
  expect(initial[0].attachments).toHaveLength(1);
  expect(requests[0].body.messages.at(-1).content[1].type).toBe("image_url");

  // Editing the root creates a sibling in the same conversation, not a second conversation.
  await page.getByTitle("Edit and Branch").first().click();
  await page.getByRole("textbox", { name: "Edit Message" }).fill("Explore a different angle");
  await page.getByTitle("Branch with Edit").click();
  await expect.poll(async () => page.evaluate(id => window.api.getResponses(id), id)).toHaveLength(2);
  expect(await page.evaluate(() => window.api.getConversations())).toHaveLength(1);
  const roots = await page.evaluate(id => window.api.getResponses(id), id);
  expect(roots.every(r => r.parent_id === null)).toBe(true);

  await page.getByRole("textbox", { name: "Message", exact: true }).fill("slow");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.getByRole("button", { name: "Stop Response" })).toBeVisible();
  await expect(page.locator("article").last()).toContainText("continues");
  await page.getByRole("button", { name: "Stop Response" }).click();
  await expect(page.getByRole("button", { name: "Stop Response" })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(id => window.api.getResponses(id), id)).toHaveLength(3);
  const afterStop = await page.evaluate(id => window.api.getResponses(id), id);
  expect(afterStop.at(-1)?.response).toContain("continues");

  // Explicitly selected provider URL is used for both discovery and inference.
  const settings = await page.evaluate(() => window.api.getSettings());
  settings.providers.forEach(p => { p.enabled = p.name === "ollama"; });
  await page.evaluate(s => window.api.saveSettings(s), settings);
  await page.reload();
  await expect(page.getByRole("button", { name: "Choose Model" })).toContainText("local-fixture");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Ollama endpoint check");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.locator("article").last()).toContainText("many directions");
  expect(requests.at(-1)?.url).toBe("/v1/chat/completions");
  expect(requests.at(-1)?.body.model).toBe("local-fixture");

  // Error recovery does not save a bogus assistant response.
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("fail");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.getByRole("alert")).toContainText("API key");

  await page.getByRole("searchbox", { name: "Search Conversations" }).fill("different");
  await expect(page.getByRole("button", { name: /Explore a different angle/ })).toBeVisible();
  await page.getByRole("button", { name: /Explore a different angle/ }).click();
  await expect(page.locator("article")).toHaveCount(2);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({ path: "test-results/delta-dark.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: "test-results/delta-light.png" });

  // Settings remains reachable in chat-only view, traps focus, and works at the minimum window size.
  await page.getByTitle("Expand Chat").click();
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "OpenAI Compatible", exact: true }).click();
  await page.getByLabel("API Key", { exact: false }).fill("fixture-only-key");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  const sanitized = await page.evaluate(() => window.api.getSettings());
  expect(JSON.stringify(sanitized)).not.toContain("fixture-only-key");
  expect(await readFile(path.join(home, "config/config.json"), "utf8")).not.toContain("fixture-only-key");
  expect(await readFile(path.join(home, "data/credentials.enc"), "utf8")).not.toContain("fixture-only-key");
  await page.keyboard.press("Meta+,");
  await page.getByRole("tab", { name: "shortcuts" }).click();
  await page.screenshot({ path: "test-results/delta-shortcuts.png" });
  await page.getByRole("tab", { name: "providers" }).click();
  await page.screenshot({ path: "test-results/delta-settings.png" });

  // Dialog is mocked only to select a destination; the real backup code and SQLite snapshot run.
  const destination = path.join(home, "backup.zip");
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, destination);
  await page.getByRole("tab", { name: "data" }).click();
  await page.getByRole("button", { name: "Export Library…" }).click();
  await expect(page.getByRole("status")).toContainText("Library exported.");
  const entries = execFileSync("/usr/bin/unzip", ["-l", destination], { encoding: "utf8" });
  expect(entries).toContain("delta.db"); expect(entries).toContain("manifest.json"); expect(entries).toContain("attachments/"); expect(entries).not.toContain("credentials");
  execFileSync("/usr/bin/ditto", ["-x", "-k", destination, path.join(home, "restored")]);
  const dbPath = path.join(home, "restored", "Delta Library", "delta.db");
  expect(execFileSync("/usr/bin/sqlite3", [dbPath, "PRAGMA integrity_check"], { encoding: "utf8" }).trim()).toBe("ok");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(880, 600));
  await page.getByTitle("Show Canvas").click();
  await page.screenshot({ path: "test-results/delta-compact.png" });
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.screenshot({ path: "test-results/delta-compact-settings.png" });
  await page.keyboard.press("Escape");
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getType() === "window")!.setZoomFactor(1.25));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const zoomed = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString("base64"));
  await writeFile("test-results/delta-large-text.png", Buffer.from(zoomed, "base64"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors.filter(e => !e.includes("net::ERR_CONNECTION_REFUSED"))).toEqual([]);
});

test("wheel scrolling uses the canvas for collapsed nodes and content for expanded nodes", async () => {
  await page.reload();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setZoomFactor(1); window.setSize(1280, 800);
  });
  await expect(page.getByRole("button", { name: "Choose Model" })).toContainText(/fixture/);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(scrollFixture);
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.getByRole("button", { name: "Stop Response" })).toHaveCount(0);
  const node = page.locator(".react-flow__node").first();
  await expect(node).toContainText("Paragraph 30");
  const scroller = node.locator(":scope > .text-left");
  const viewport = page.locator(".react-flow__viewport");
  const wheel = async (x: number, y: number) => {
    const handled = page.evaluate(() => new Promise<void>(resolve => document.addEventListener("wheel", () => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, { once: true, capture: true })));
    await page.mouse.wheel(x, y);
    await handled;
  };

  // Collapsed previews pass wheel gestures to the canvas, even over their content.
  const expectCanvasScroll = async () => {
    const before = await viewport.getAttribute("style");
    await scroller.hover();
    await wheel(0, 80);
    await expect(viewport).not.toHaveAttribute("style", before!);
    expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);
  };
  await expectCanvasScroll();
  await node.getByTitle("Expand Text").first().click();
  await expect.poll(() => scroller.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(500);
  const transform = await viewport.getAttribute("style");

  // Native horizontal scrolling in a nested fenced code block.
  const code = node.locator("pre > div").first();
  await expect.poll(() => code.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);
  await code.hover();
  await wheel(200, 0);
  await expect.poll(() => code.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(viewport).toHaveAttribute("style", transform!);

  // Wheel over rendered prose scrolls the node, not the graph.
  await scroller.hover({ position: { x: 20, y: 280 } });
  await wheel(0, 250);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(viewport).toHaveAttribute("style", transform!);
  await page.screenshot({ path: "test-results/delta-node-scroll.png" });

  // Momentum at the bottom must not suddenly zoom the canvas; reverse still works.
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const bottom = await scroller.evaluate(el => el.scrollTop);
  await wheel(0, 250);
  await expect(viewport).toHaveAttribute("style", transform!);
  await wheel(0, -200);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeLessThan(bottom);
  await expect(viewport).toHaveAttribute("style", transform!);
  await scroller.evaluate(el => { el.scrollTop = 0; });
  await wheel(0, -250);
  await expect(viewport).toHaveAttribute("style", transform!);

  // Expanding either part is enough: collapsing the prompt while the response
  // remains expanded must still keep wheel gestures inside the node.
  await node.getByTitle("Expand Text").nth(1).click();
  await node.getByTitle("Expand Text").first().click();
  await scroller.evaluate(el => { el.scrollTop = 0; });
  await scroller.hover({ position: { x: 20, y: 180 } });
  await wheel(0, 250);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(viewport).toHaveAttribute("style", transform!);

  // Collapsing the last expanded part hands scrolling back to the canvas.
  await node.getByTitle("Expand Text").nth(1).click();
  await expectCanvasScroll();
  // Showing Markdown source does not itself count as expanding the node.
  await node.getByTitle("Toggle Markdown Source").first().click();
  await expectCanvasScroll();

  // The canvas's usual wheel-to-zoom behavior is unchanged outside a node.
  const canvas = page.getByRole("region", { name: "Conversation Canvas" });
  await canvas.hover({ position: { x: 80, y: 100 } });
  const beforeCanvasScroll = await viewport.getAttribute("style");
  await wheel(0, 150);
  await expect(viewport).not.toHaveAttribute("style", beforeCanvasScroll!);
  expect(errors.filter(e => !e.includes("net::ERR_CONNECTION_REFUSED"))).toEqual([]);
});
