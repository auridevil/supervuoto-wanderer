#!/usr/bin/env node
// render.mjs — headless real-time capture of the autopilot "walk the line" demo
// for a given audio file, producing a YouTube-ready mp4.
//
// It drives the app's existing in-browser recorder (?record=1) inside headless
// Chrome via Puppeteer: serve the built app + the audio same-origin, click
// enter, let the MediaRecorder pipeline run, grab the downloaded .webm, then
// transcode to mp4 with ffmpeg.
//
// This is real time — a 4-minute track takes ~4 minutes. Render quality depends
// on how well headless Chrome does WebGL on this machine (GPU/ANGLE vs the
// slower SwiftShader software fallback); use --seconds to sample first.
//
// Usage:
//   node scripts/render.mjs <audio> [out.mp4] [options]
//   npm run render -- <audio> [out.mp4] [options]
//
// Options:
//   --seconds N     Cap the capture at N seconds (great for test samples).
//                   Omit to record the whole track (stops when it ends).
//   --width N       Capture width  (default 1920)
//   --height N      Capture height (default 1080)
//   --fps N         Capture frame rate (default 60)
//   --crf N         x264 quality, lower = better (default 18)
//   --keep-webm     Keep the intermediate .webm next to the mp4
//   --headful       Show the browser window (debugging)
//   --no-build      Don't rebuild dist/ even if it looks stale

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, readdir, stat, mkdtemp, rm, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// ---- args ----
function parseArgs(argv) {
  const opts = { width: 1920, height: 1080, fps: 60, crf: 18, seconds: 0, keepWebm: false, headful: false, build: true };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seconds") opts.seconds = Number(argv[++i]);
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--height") opts.height = Number(argv[++i]);
    else if (a === "--fps") opts.fps = Number(argv[++i]);
    else if (a === "--crf") opts.crf = Number(argv[++i]);
    else if (a === "--keep-webm") opts.keepWebm = true;
    else if (a === "--headful") opts.headful = true;
    else if (a === "--no-build") opts.build = false;
    else if (a.startsWith("--")) { console.error(`unknown option: ${a}`); process.exit(1); }
    else pos.push(a);
  }
  opts.input = pos[0];
  opts.output = pos[1];
  return opts;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".flac": "audio/flac", ".m4a": "audio/mp4",
};

// Static server for dist/, plus the input audio at a fixed same-origin path so
// the app's analysed (reactive) load path works with no CORS fuss.
function startServer(audioPath, audioRoute) {
  return new Promise((res) => {
    const server = createServer(async (req, resp) => {
      try {
        const url = new URL(req.url, "http://localhost");
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === audioRoute) {
          const data = await readFile(audioPath);
          resp.writeHead(200, { "content-type": MIME[extname(audioPath).toLowerCase()] || "application/octet-stream", "content-length": data.length, "access-control-allow-origin": "*" });
          return resp.end(data);
        }
        if (pathname === "/") pathname = "/index.html";
        const file = join(DIST, pathname);
        if (!file.startsWith(DIST) || !existsSync(file)) { resp.writeHead(404); return resp.end("not found"); }
        const data = await readFile(file);
        resp.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
        resp.end(data);
      } catch (e) { resp.writeHead(500); resp.end(String(e)); }
    });
    server.listen(0, "127.0.0.1", () => res(server));
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("error", rej);
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

function hasFfmpeg() {
  return new Promise((res) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => res(false));
    p.on("close", (c) => res(c === 0));
  });
}

// Wait for a *.webm to appear in dir and finish writing (size stable ~1.5s).
async function waitForDownload(dir, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1, stableSince = 0, found = null;
  while (Date.now() < deadline) {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".webm") && !f.endsWith(".crdownload"));
    if (files.length) {
      found = join(dir, files[0]);
      const { size } = await stat(found);
      if (size > 0 && size === lastSize) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince > 1500) return found;
      } else { lastSize = size; stableSince = 0; }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return found; // may be null (timed out with nothing)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("usage: node scripts/render.mjs <audio> [out.mp4] [--seconds N] [--width N] [--height N] [--fps N]");
    process.exit(1);
  }
  const input = resolve(opts.input);
  if (!existsSync(input)) { console.error(`audio not found: ${input}`); process.exit(1); }
  if (!(await hasFfmpeg())) { console.error("ffmpeg not found on PATH (brew install ffmpeg)"); process.exit(1); }
  const output = resolve(opts.output || basename(input, extname(input)) + ".mp4");

  // Build the app if needed.
  if (opts.build && !existsSync(join(DIST, "index.html"))) {
    console.log("• building app (dist/ missing)…");
    await run("npm", ["run", "build"], { cwd: ROOT });
  } else if (opts.build) {
    console.log("• using existing dist/ (pass --no-build to skip, or delete dist/ to force rebuild)");
  }

  const puppeteer = (await import("puppeteer")).default;

  const audioRoute = "/__audio" + (extname(input).toLowerCase() || ".mp3");
  const server = await startServer(input, audioRoute);
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const trackUrl = `${origin}${audioRoute}`;
  const pageUrl = `${origin}/?record=1&demo=1&track=${encodeURIComponent(trackUrl)}`;

  const downloadDir = await mkdtemp(join(tmpdir(), "walk-render-"));

  console.log(`• launching headless Chrome (${opts.width}×${opts.height} @ ${opts.fps}fps)…`);
  const browser = await puppeteer.launch({
    headless: opts.headful ? false : "new",
    args: [
      `--window-size=${opts.width},${opts.height}`,
      "--autoplay-policy=no-user-gesture-required",
      "--use-gl=angle",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader", // last-resort software GL so it never hard-fails
      "--no-sandbox",
      "--mute-audio", // we capture from the Web Audio graph, not the speakers
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

    page.on("console", (m) => { const t = m.text(); if (/\[record\]|error|Error|WebGL/i.test(t)) console.log("  browser:", t); });
    page.on("pageerror", (e) => console.log("  page error:", e.message));

    await page.goto(pageUrl, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector(".start-btn", { timeout: 15000 });
    await page.click(".start-btn");

    // Recording has begun once beginRecording() adds body.recording.
    await page.waitForFunction(() => document.body.classList.contains("recording"), { timeout: 30000 });
    console.log("• recording…" + (opts.seconds ? ` (stopping after ${opts.seconds}s)` : " (until the track ends — real time)"));

    if (opts.seconds > 0) {
      await new Promise((r) => setTimeout(r, opts.seconds * 1000));
      await page.evaluate(() => window.stopWalkRecording && window.stopWalkRecording());
    }

    // The page saves a .webm (on track end, or right after our stop). Give a
    // generous ceiling: capped runs get seconds+buffer; full runs wait long.
    const timeoutMs = opts.seconds > 0 ? (opts.seconds + 60) * 1000 : 6 * 60 * 60 * 1000;
    const webm = await waitForDownload(downloadDir, timeoutMs);
    if (!webm) throw new Error("no .webm was produced (recording may have failed — try --headful to watch)");
    const { size } = await stat(webm);
    console.log(`• captured ${(size / 1048576).toFixed(1)} MB webm`);

    await browser.close();
    server.close();

    console.log("• transcoding to mp4 (H.264 / AAC)…");
    await run("ffmpeg", [
      "-y", "-i", webm,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", String(opts.crf), "-preset", "medium",
      "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart",
      output,
    ]);

    if (opts.keepWebm) { const dst = output.replace(/\.mp4$/i, "") + ".webm"; await copyFile(webm, dst); console.log(`• kept webm: ${dst}`); }
    await rm(downloadDir, { recursive: true, force: true });
    console.log(`\n✓ done → ${output}`);
  } catch (err) {
    try { await browser.close(); } catch {}
    try { server.close(); } catch {}
    await rm(downloadDir, { recursive: true, force: true }).catch(() => {});
    console.error("\n✗ render failed:", err.message);
    process.exit(1);
  }
}

main();
