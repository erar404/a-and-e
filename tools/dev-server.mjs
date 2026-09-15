#!/usr/bin/env node
/* ════════════════════════════════════════════
   dev-server.mjs — local preview with the Anniversareels proxy.

   `python -m http.server` is enough for everything on the site except
   the reels: Google refuses <video> hotlinks to Drive (any request that
   carries the browser's Sec-Fetch-Dest: video headers gets a 403), so in
   production nginx.conf.template proxies /reels/<fileId> to
   drive.usercontent.google.com with those headers and cookies stripped.
   This tiny server does the same thing locally: static files from the
   repo root, plus that one proxy route, Range headers passed through so
   the clips still stream (206) instead of downloading whole.

   Usage:  node tools/dev-server.mjs [port]     (default 8765)
           then open http://localhost:8765/index.html
   ════════════════════════════════════════════ */

import http from "node:http";
import https from "node:https";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PORT = Number(process.argv[2]) || 8765;
const DRIVE_HOST = "drive.usercontent.google.com";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// forwards /reels/<id> to Drive, follows one redirect if Google adds one,
// and streams the (possibly partial) body back with its range headers
const DEBUG = !!process.env.REELS_DEBUG; // REELS_DEBUG=1 logs every proxied request
const log = (...a) => DEBUG && console.log(new Date().toISOString().slice(11, 19), ...a);

// a browser streams one clip as several range requests (head, the index
// atom at the tail, then the body) — reusing the TLS connection to Google
// saves a DNS + handshake round trip on each of them
const driveAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

function proxyReel(req, res, id, url = `https://${DRIVE_HOST}/download?id=${id}&export=download`, hops = 0) {
  const headers = { "User-Agent": "walong-buwan-reels/1.0", Accept: "*/*" };
  if (req.headers.range) headers.Range = req.headers.range;
  log(`→ ${req.method} /reels/${id} range=${req.headers.range || "-"} dest=${req.headers["sec-fetch-dest"] || "-"}`);

  let sent = 0;
  const up = https.request(url, { method: req.method === "HEAD" ? "HEAD" : "GET", headers, agent: driveAgent }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 2) {
      r.resume();
      return proxyReel(req, res, id, new URL(r.headers.location, url).href, hops + 1);
    }
    const out = { "Cache-Control": "public, max-age=86400", "Accept-Ranges": "bytes" };
    for (const k of ["content-type", "content-length", "content-range", "last-modified", "etag"]) {
      if (r.headers[k]) out[k] = r.headers[k];
    }
    log(`← upstream ${r.statusCode} ${r.headers["content-type"]} ${r.headers["content-range"] || r.headers["content-length"] || ""}`);
    res.writeHead(r.statusCode, out);
    r.on("data", (c) => (sent += c.length));
    r.on("end", () => log(`  done /reels/${id} ${sent}B`));
    r.pipe(res);
  });

  up.on("error", (err) => {
    log(`  upstream error ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`reel proxy error: ${err.message}`);
  });
  // the browser gave up on this range (a seek, a swipe away) — stop pulling
  res.on("close", () => {
    if (!res.writableFinished) {
      log(`  client left /reels/${id} after ${sent}B`);
      up.destroy();
    }
  });
  up.end();
}

function serveStatic(req, res, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, clean);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    let st = statSync(file);
    if (st.isDirectory()) {
      file = join(file, "index.html");
      st = statSync(file);
    }
    const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
    // validators, so "no-cache" really means revalidate (and edits show up on
    // reload) instead of the browser quietly reusing an old script.js
    const lastMod = st.mtime.toUTCString();
    if (req.headers["if-modified-since"] === lastMod) {
      res.writeHead(304, { "Last-Modified": lastMod, "Cache-Control": "no-cache" });
      return res.end();
    }
    res.setHeader("Last-Modified", lastMod);
    const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : st.size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (DEBUG && !pathname.startsWith("/reels/")) {
      res.on("finish", () => log(`${res.statusCode} ${pathname} ${res.getHeader("content-length") || ""}`));
    }
    const reel = pathname.match(/^\/reels\/([-\w]+)$/);
    if (reel) return proxyReel(req, res, reel[1]);
    serveStatic(req, res, pathname === "/" ? "/index.html" : pathname);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`✔ walong buwan dev server → http://localhost:${PORT}/index.html`);
    console.log(`  /reels/<id> proxies to ${DRIVE_HOST} (range-streamed, headers scrubbed)`);
  });
