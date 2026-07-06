#!/usr/bin/env node
/* ════════════════════════════════════════════
   sync-drive-media.mjs
   Reads a public ("Anyone with the link") Google
   Drive folder and writes static/data/drive-media.json
   for the cloud slideshow.

   Usage:  node tools/sync-drive-media.mjs [folderId]
   Rerun it anytime new photos/videos land in the folder.
   ════════════════════════════════════════════ */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FOLDER = "14kA3EyvaUASX175rQICR_lDgoe9m0KWa";
const folder = process.argv[2] || DEFAULT_FOLDER;
const outFile = join(dirname(fileURLToPath(import.meta.url)), "..", "static", "data", "drive-media.json");

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v", "3gp", "mkv", "avi"]);

const items = [];
const visited = new Set();

async function walk(folderId, album) {
  if (visited.has(folderId)) return;
  visited.add(folderId);

  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`);
  const html = await res.text();

  // each entry in the public listing appears as a "flip-entry" block
  const chunks = html.split(/class="flip-entry"/).slice(1);

  if (!chunks.length && !album) {
    console.error("✖ Walang nakitang files sa folder.");
    console.error("  Malamang hindi pa naka-public ang folder. Sa Google Drive:");
    console.error("  right-click ang folder → Share → General access →");
    console.error('  "Anyone with the link" (Viewer) → Done, tapos patakbuhin ulit ito.');
    process.exit(1);
  }

  for (const chunk of chunks) {
    const id = chunk.match(/id="entry-([-\w]+)"/)?.[1];
    const name = chunk.match(/flip-entry-title">([^<]+)</)?.[1]?.trim();
    if (!id || !name) continue;

    // subfolders become albums; their name rides along as the caption
    const href = chunk.match(/href="([^"]+)"/)?.[1] || "";
    if (href.includes("/folders/")) {
      console.log(`  ↳ album: ${name}`);
      await walk(id, name);
      continue;
    }

    const ext = (name.split(".").pop() || "").toLowerCase();
    const type = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
    if (!type) {
      console.log(`  (nilaktawan: ${name} — hindi larawan o video)`);
      continue;
    }
    items.push({ id, name, type, ...(album ? { album } : {}) });
  }
}

await walk(folder, "");

items.sort(
  (a, b) =>
    (a.album || "").localeCompare(b.album || "") ||
    a.name.localeCompare(b.name, undefined, { numeric: true })
);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({ folder, generatedAt: new Date().toISOString(), items }, null, 2) + "\n"
);

const nImg = items.filter((i) => i.type === "image").length;
const nVid = items.filter((i) => i.type === "video").length;
console.log(`✔ ${items.length} files (${nImg} larawan, ${nVid} video) → static/data/drive-media.json`);
