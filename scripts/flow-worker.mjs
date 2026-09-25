#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { console.error("Missing Playwright. Install: npm install -D playwright"); process.exit(1); }

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.APP_API_SECRET || process.env.NEXT_PUBLIC_APP_API_SECRET || "";
const FLOW_URL = process.env.FLOW_URL || "https://labs.google/fx/tools/flow";
const PROFILE_DIR = process.env.FLOW_PROFILE || path.join(process.cwd(), ".flow-profile");
const DOWNLOAD_DIR = process.env.FLOW_DOWNLOAD_DIR || path.join(os.tmpdir(), "pinbatch-flow-downloads");
const DEBUG_PORT = Number(process.env.FLOW_DEBUG_PORT || 9222);
const DEBUG_SELECTORS = /^(1|true|yes)$/i.test(process.env.FLOW_DEBUG_SELECTORS || '');
const CHROME_PATH = process.env.FLOW_CHROME_PATH || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");

if (!APP_URL || !API_SECRET) { console.error("APP_URL aur APP_API_SECRET required hain."); process.exit(1); }
await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
const headers = { "Content-Type": "application/json", "x-api-secret": API_SECRET };
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function api(pathname, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${APP_URL}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
      const text = await response.text(); let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
      if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
      return data;
    } catch (err) {
      lastError = err;
      if (attempt === 3) break;
      await sleep(1500 * (2 ** attempt) + Math.floor(Math.random() * 750));
    }
  }
  throw lastError || new Error("Request failed");
}
async function firstVisible(page, selectors, timeout = 2500) {
  for (const selector of selectors) {
    try { const loc = page.locator(selector).first(); if (await loc.isVisible({ timeout })) return loc; } catch {}
  }
  return null;
}
async function waitForPromptEditor(page) {
  let editor = await firstVisible(page, [
    'textarea[placeholder*="create" i]', 'textarea[placeholder*="prompt" i]', 'textarea',
    '[contenteditable="true"]', 'input[placeholder*="create" i]'
  ], 3000);
  if (editor) return editor;
  const newProject = await firstVisible(page, ['button:has-text("New project")', 'text=New project'], 1500);
  if (newProject) { await newProject.click().catch(() => {}); await sleep(1800); }
  return firstVisible(page, ['textarea[placeholder*="create" i]', 'textarea[placeholder*="prompt" i]', 'textarea', '[contenteditable="true"]'], 5000);
}
async function ensureLoggedIn(page) {
  await page.goto(FLOW_URL, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  let editor = await waitForPromptEditor(page);
  if (editor) return editor;
  console.log("\nGoogle Flow login/project screen detected. Browser mein manually login karo.");
  console.log("Login ke baad terminal mein ENTER press karo...");
  await new Promise(resolve => process.stdin.once("data", resolve));
  editor = await waitForPromptEditor(page);
  if (!editor) throw new Error("Flow prompt editor nahi mila.");
  return editor;
}

async function debugFlowControls(page, reason = '') {
  if (!DEBUG_SELECTORS) return;
  const controls = await page.locator('button, [role="button"], textarea, [contenteditable="true"]').evaluateAll(els => els.map((el, i) => ({
    i, tag: el.tagName.toLowerCase(), text: (el.innerText || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', disabled: !!el.disabled,
    icons: Array.from(el.querySelectorAll('mat-icon')).map(x => (x.textContent || '').trim()).filter(Boolean).join('|')
  })));
  console.log(`\n[Flow selector debug] ${reason}`);
  console.log(JSON.stringify(controls, null, 2));
}

async function openGenerationSettings(page) {
  // In current Flow UI the ratio + generation-count controls live inside the
  // generation settings popover opened by the model pill (e.g. "Nano Banana 2").
  // Do not use loose aria-label*=ratio selectors: Flow's "Start generation"
  // button can contain the word "generation" and was being selected before.
  const modelPills = page.getByText(/Nano Banana 2/i);
  const count = await modelPills.count().catch(() => 0);
  for (let i = count - 1; i >= 0; i--) {
    const pill = modelPills.nth(i);
    if (!(await pill.isVisible().catch(() => false))) continue;
    try {
      await pill.click({ timeout: 5000 });
      await sleep(500);
      const ratio = page.getByText('9:16', { exact: true }).last();
      if (await ratio.isVisible({ timeout: 1500 }).catch(() => false)) return true;
    } catch {}
  }

  // Fallback: locate a visible button whose own accessible name is specifically
  // a settings/aspect control. Never match "Start generation".
  const buttons = page.locator('button, [role="button"]');
  const n = await buttons.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const aria = String(await b.getAttribute('aria-label').catch(() => '') || '').trim().toLowerCase();
    const title = String(await b.getAttribute('title').catch(() => '') || '').trim().toLowerCase();
    if (/start generation|generate|send|submit/.test(`${aria} ${title}`)) continue;
    if (/generation settings|aspect ratio|image settings|settings/.test(`${aria} ${title}`)) {
      if (!(await b.isEnabled().catch(() => false))) continue;
      try {
        await b.click({ timeout: 5000 });
        await sleep(500);
        if (await page.getByText('9:16', { exact: true }).last().isVisible({ timeout: 1200 }).catch(() => false)) return true;
      } catch {}
    }
  }
  await debugFlowControls(page, 'generation settings popover not found');
  return false;
}

async function setAspectRatio9x16AndCount1(page) {
  const opened = await openGenerationSettings(page);
  if (!opened) {
    console.warn('  ! Flow generation settings popover nahi mila.');
    return false;
  }

  // Exact option from the current Flow popover shown in the UI: 16:9, 4:3,
  // 1:1, 3:4, 9:16. Select 9:16 rather than relying on prompt text.
  const ratio = page.getByText('9:16', { exact: true }).last();
  if (!(await ratio.isVisible({ timeout: 2500 }).catch(() => false))) {
    await debugFlowControls(page, '9:16 option not visible');
    return false;
  }
  try { await ratio.click({ timeout: 5000 }); } catch {
    try { await ratio.locator('xpath=ancestor::*[self::button or @role="button"][1]').click({ timeout: 5000 }); }
    catch { return false; }
  }
  await sleep(350);

  // Flow defaults to x2 in the screenshot. Explicitly choose x1 for every job.
  // The exact text avoids accidentally selecting x10/x12/etc.
  const x1 = page.getByText('x1', { exact: true }).last();
  if (!(await x1.isVisible({ timeout: 2500 }).catch(() => false))) {
    // Some builds expose the multiplier as an aria-label instead of text.
    const alt = await firstVisible(page, [
      '[aria-label="x1"]', '[aria-label*="x1" i][aria-label*="image" i]',
      '[data-value="1"]', '[data-count="1"]'
    ], 1800);
    if (!alt) {
      await debugFlowControls(page, 'x1 generation count option not visible');
      return false;
    }
    try { await alt.click({ timeout: 5000 }); } catch { return false; }
  } else {
    try { await x1.click({ timeout: 5000 }); } catch {
      try { await x1.locator('xpath=ancestor::*[self::button or @role="button"][1]').click({ timeout: 5000 }); }
      catch { return false; }
    }
  }
  await sleep(400);
  return true;
}

async function imageSnapshot(page) {
  return page.locator("img").evaluateAll(imgs => imgs.map((img, index) => ({ index, src: img.currentSrc || img.src || "", w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 })).filter(x => x.src && x.w >= 250 && x.h >= 250));
}
async function waitForFreshImage(page, before, timeoutMs = 90000) {
  const old = new Set(before.map(x => x.src));
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(2500);
    const now = await imageSnapshot(page);
    const fresh = now.filter(x => !old.has(x.src)).sort((a,b) => (b.w*b.h) - (a.w*a.h));
    if (fresh.length) return fresh[0];
  }
  return null;
}

async function downloadFreshImage(page, fresh) {
  const img = page.locator('img').nth(fresh.index);
  try { await img.scrollIntoViewIfNeeded(); } catch {}
  try { await img.hover({ timeout: 3000 }); } catch {}
  await sleep(600);

  const card = img.locator('xpath=ancestor::*[self::div or self::section][position() <= 8]');
  const controls = card.locator('button, [role="button"]');
  const n = await controls.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const b = controls.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const label = `${await b.getAttribute('aria-label').catch(() => '')} ${await b.getAttribute('title').catch(() => '')} ${(await b.locator('mat-icon').allTextContents().catch(() => [])).join(' ')} ${(await b.innerText().catch(() => ''))}`.toLowerCase();
    if (/\bdownload\b/.test(label) && !/start generation|snackbar/.test(label) && await b.isEnabled().catch(() => false)) {
      const dp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      try { await b.click({ timeout: 5000 }); } catch { continue; }
      const d = await dp;
      if (d) return await d.path();
    }
  }

  let opened = false;
  for (let i = n - 1; i >= 0; i--) {
    const c = controls.nth(i);
    if (!(await c.isVisible().catch(() => false)) || !(await c.isEnabled().catch(() => false))) continue;
    const label = `${await c.getAttribute('aria-label').catch(() => '')} ${await c.getAttribute('title').catch(() => '')} ${(await c.locator('mat-icon').allTextContents().catch(() => [])).join(' ')}`.toLowerCase();
    if (/more|menu|options/.test(label) && !/start generation|generate/.test(label)) {
      try { await c.click({ timeout: 5000 }); opened = true; break; } catch {}
    }
  }
  if (!opened) { try { await img.click({ button: 'right', timeout: 5000 }); opened = true; } catch {} }
  if (!opened) return null;
  await sleep(500);

  const menuItems = page.locator('[role="menuitem"], flow-menu-item, [role="menu"] button');
  const mCount = await menuItems.count().catch(() => 0);
  let downloadItem = null;
  for (let i = mCount - 1; i >= 0; i--) {
    const item = menuItems.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;
    const text = (await item.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (/^download(?:\s|$)/i.test(text)) { downloadItem = item; break; }
  }
  if (!downloadItem) { await debugFlowControls(page, "download menu item not found"); return null; }
  try { await downloadItem.click({ timeout: 5000 }); } catch { return null; }
  await sleep(400);

  let original = null;
  const options = page.locator('[role="menuitem"], flow-menu-item, [role="menu"] button');
  const oCount = await options.count().catch(() => 0);
  for (let i = oCount - 1; i >= 0; i--) {
    const item = options.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;
    const text = (await item.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (/^original size$/i.test(text)) { original = item; break; }
  }
  const target = original || downloadItem;
  const dp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  try { await target.click({ timeout: 5000 }); } catch {}
  const d = await dp;
  return d ? await d.path() : null;
}
function esc(value) { return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function wrap(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean); const lines = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines.slice(0, 4);
}
function svgText(lines, x, y, size, weight = 800, fill = "#ffffff", anchor = "start", lineGap = 1.08) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i*size*lineGap}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(line)}</text>`).join("");
}
async function addTypography(inputPath, outputPath, job) {
  const sharp = require("sharp");
  const meta = await sharp(inputPath).metadata();
  const width = 1080, height = 1920;
  const style = job.styleId || "single-image";
  const headline = String(job.overlayText || job.pinTitle || job.articleTitle || "").trim();
  const cta = String(job.ctaText || "READ MORE IDEAS").trim();
  const footer = String(job.footerText || "").trim();
  const lines = wrap(headline, style === "bottom-banner" ? 27 : 24);
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  if (style === "bottom-banner") {
    svg += `<rect x="0" y="1360" width="1080" height="410" fill="#151515" fill-opacity="0.88"/>`;
    svg += svgText(lines, 70, 1430, 58, 800, "#ffffff", "start", 1.05);
    const ctaW = Math.min(330, Math.max(220, cta.length * 13 + 70));
    svg += `<rect x="70" y="1600" rx="28" ry="28" width="${ctaW}" height="72" fill="#ffffff"/>`;
    svg += svgText([cta.toUpperCase()], 70 + ctaW/2, 1648, 24, 800, "#171717", "middle");
    svg += svgText([footer], 70, 1740, 20, 600, "#dddddd", "start");
  } else if (style === "big-text-overlay") {
    svg += `<rect x="50" y="1080" width="980" height="440" rx="44" fill="#111111" fill-opacity="0.76"/>`;
    svg += svgText(lines, 90, 1160, 62, 900, "#ffffff", "start", 1.04);
    svg += svgText([cta.toUpperCase()], 90, 1435, 23, 800, "#ffffff", "start");
    svg += svgText([footer], 90, 1480, 19, 600, "#d6d6d6", "start");
  } else if (style === "top-bottom") {
    svg += `<rect x="35" y="55" width="1010" height="330" rx="35" fill="#111111" fill-opacity="0.82"/>`;
    svg += svgText(lines, 70, 135, 55, 850, "#ffffff", "start", 1.05);
    svg += `<rect x="0" y="1640" width="1080" height="280" fill="#111111" fill-opacity="0.78"/>`;
    svg += svgText([cta.toUpperCase()], 70, 1750, 28, 800, "#ffffff", "start");
    svg += svgText([footer], 70, 1810, 19, 600, "#dddddd", "start");
  } else if (style === "centre") {
    svg += `<rect x="65" y="730" width="950" height="430" rx="45" fill="#111111" fill-opacity="0.72"/>`;
    svg += svgText(lines, 105, 835, 56, 850, "#ffffff", "start", 1.05);
    svg += svgText([cta.toUpperCase()], 105, 1080, 23, 800, "#ffffff", "start");
    svg += svgText([footer], 105, 1125, 19, 600, "#dddddd", "start");
  } else if (style === "collage-3" || style === "collage-4") {
    svg += `<rect x="0" y="0" width="1080" height="300" fill="#111111" fill-opacity="0.82"/>`;
    svg += svgText(lines, 60, 95, 48, 850, "#ffffff", "start", 1.04);
    svg += svgText([cta.toUpperCase()], 60, 235, 22, 800, "#ffffff", "start");
    svg += svgText([footer], 60, 275, 17, 600, "#dddddd", "start");
  }
  svg += `</svg>`;
  await sharp(inputPath).resize(width, height, { fit: "cover", position: "attention", kernel: sharp.kernel.lanczos3 }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png({ compressionLevel: 9 }).toFile(outputPath);
}
async function uploadSanitized(filePath) {
  const presign = await api("/api/upload-presign", { method: "POST", body: JSON.stringify({ prefix: "ai-flow", contentType: "image/png" }) });
  const buffer = await fs.readFile(filePath);
  const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: buffer });
  if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
  return presign.publicUrl;
}
async function clickGenerate(page, editor) {
  // Never press Enter: Flow can interpret Enter as both composer submission and
  // an editor action. Clicking the enabled submit arrow prevents duplicate prompts.
  const direct = await firstVisible(page, [
    'button[aria-label*="Generate" i]', 'button[aria-label*="Create" i]',
    'button[aria-label*="Send" i]', 'button[type="submit"]'
  ], 1500);
  if (direct && await direct.isEnabled().catch(() => false)) { await direct.click(); return true; }

  const rect = await editor.boundingBox();
  if (!rect) return false;
  const buttons = page.locator("button");
  const count = await buttons.count();
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i); if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false))) continue;
    const r = await b.boundingBox().catch(() => null); if (!r) continue;
    const aria = `${await b.getAttribute("aria-label").catch(() => "")} ${await b.getAttribute("title").catch(() => "")} ${(await b.innerText().catch(() => ""))}`.toLowerCase();
    const inComposer = r.y >= rect.y - 100 && r.y <= rect.y + rect.height + 120 && r.x >= rect.x + rect.width - 120;
    if (inComposer) candidates.push({ b, r, aria });
  }
  candidates.sort((a,b) => b.r.x - a.r.x);
  if (candidates[0]) { await candidates[0].b.click(); return true; }
  return false;
}
async function processJob(page, job) {
  console.log(`\n→ ${job.articleTitle} · ${job.styleLabel}`);
  await page.keyboard.press("Escape").catch(() => {});
  const editor = await waitForPromptEditor(page); if (!editor) throw new Error("Flow prompt editor nahi mila.");
  await setAspectRatio9x16(page);
  const before = await imageSnapshot(page);
  await editor.click();
  await editor.fill('');
  await editor.fill(job.prompt);
  await sleep(700);
  const submitted = await clickGenerate(page, editor);
  if (!submitted) throw new Error("Flow generate/submit button nahi mila.");
  const fresh = await waitForFreshImage(page, before, 120000);
  if (!fresh) throw new Error("Nayi generated image detect nahi hui; stale image download nahi ki.");
  const downloaded = await downloadFreshImage(page, fresh);
  if (!downloaded) throw new Error("Fresh generated image ka Download → Original size action nahi mila.");
  const finalPath = path.join(DOWNLOAD_DIR, `${job.id}.png`);
  await addTypography(downloaded, finalPath, job);
  const imageUrl = await uploadSanitized(finalPath);
  await api("/api/ai-flow/complete", { method: "POST", body: JSON.stringify({ jobId: job.id, imageUrl }) });
  await fs.rm(finalPath, { force: true }).catch(() => {});
  await fs.rm(downloaded, { force: true }).catch(() => {});
  console.log("  ✓ fresh image → 9:16 → typography → metadata stripped → uploaded → post updated");
}

async function waitForChrome(port) {
  for (let i = 0; i < 20; i++) {
    try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); if (res.ok) return true; } catch {}
    await sleep(500);
  }
  return false;
}
async function launchRealChrome() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  if (await waitForChrome(DEBUG_PORT)) return;
  let chromePath = CHROME_PATH;
  if (process.platform === "win32") {
    const alternatives = [
      chromePath,
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
    ].filter(Boolean);
    for (const candidate of alternatives) {
      try { await fs.access(candidate); chromePath = candidate; break; } catch {}
    }
  }
  const args = [
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run", "--no-default-browser-check", "--disable-popup-blocking", FLOW_URL
  ];
  const child = spawn(chromePath, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  if (!(await waitForChrome(DEBUG_PORT))) throw new Error(`Chrome remote debugging start nahi hua. FLOW_CHROME_PATH check karo: ${chromePath}`);
}
let browser;
try {
  await launchRealChrome();
  browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = pages.find(p => p.url().includes("labs.google")) || pages[0] || await browser.contexts()[0].newPage();
  await ensureLoggedIn(page);
  console.log("\nFlow worker is running. Stop with Ctrl+C.\n");
  while (true) {
    let response;
    try { response = await api("/api/ai-flow/next", { method: "POST", body: "{}" }); }
    catch (err) { console.error("Queue error:", err.message); await sleep(5000); continue; }
    const job = response.job;
    if (!job) { await sleep(5000); continue; }
    try { await processJob(page, job); }
    catch (err) {
      console.error("  ✕", err.message);
      await api("/api/ai-flow/fail", { method: "POST", body: JSON.stringify({ jobId: job.id, error: err.message }) }).catch(() => {});
      await sleep(2000);
    }
  }
} finally { if (browser) await browser.close().catch(() => {}); }
