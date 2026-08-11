#!/usr/bin/env node
/* ════════════════════════════════════════════
   sync-drive-media.mjs
   Reads a public ("Anyone with the link") Google
   Drive folder and writes static/data/drive-media.json
   for the cloud slideshow.

   Usage:  node tools/sync-drive-media.mjs [folderId]
   Rerun it anytime new photos/videos land in the folder.

   Optional: set GOOGLE_DRIVE_API_KEY to also fetch each photo's real
   EXIF capture date (Drive API v3's imageMediaMetadata.time — the same
   DateTimeOriginal tag the camera itself wrote). Without it, photo
   dates are simply omitted rather than guessed — an earlier version of
   this script guessed from a 13-digit number some filenames carry, but
   that turned out to be an export/upload timestamp, not the capture
   date, and showed the wrong date on the site. Video dates don't need
   the API at all: Android's own VID_YYYYMMDD_HHMMSS filename convention
   already *is* the real capture date.
   ════════════════════════════════════════════ */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FOLDER = "14kA3EyvaUASX175rQICR_lDgoe9m0KWa";
const folder = process.argv[2] || DEFAULT_FOLDER;
const outFile = join(dirname(fileURLToPath(import.meta.url)), "..", "static", "data", "drive-media.json");
const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v", "3gp", "mkv", "avi"]);

// Android's own camera convention (VID_/IMG_YYYYMMDD_HHMMSS...) embeds the
// real capture date right in the filename — no API needed, and it's what
// the OS itself wrote, so it's trustworthy.
function dateFromCameraFilename(name) {
  const cam = name.match(/(?:VID|IMG)_(\d{4})(\d{2})(\d{2})_/);
  if (!cam) return null;
  const [, y, m, d] = cam;
  const date = new Date(`${y}-${m}-${d}T12:00:00+08:00`);
  return isNaN(date) ? null : date.toISOString();
}

// Drive API's imageMediaMetadata.time mirrors the file's own EXIF
// DateTimeOriginal tag, formatted "YYYY:MM:DD HH:MM:SS" with no timezone —
// treated as PH local time throughout this site, so it's built as one.
function parseExifTime(raw) {
  const m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`);
  return isNaN(date) ? null : date.toISOString();
}

async function fetchExifDate(id) {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${id}?fields=imageMediaMetadata(time)&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return parseExifTime(data.imageMediaMetadata && data.imageMediaMetadata.time);
  } catch {
    return null;
  }
}

// small concurrency limit — hundreds of individual files.get calls, but
// gentle enough not to trip Drive API's rate limit
async function mapWithConcurrency(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}

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
    const takenAt = type === "video" ? dateFromCameraFilename(name) : null;
    items.push({ id, name, type, ...(album ? { album } : {}), ...(takenAt ? { takenAt } : {}) });
  }
}

await walk(folder, "");

if (apiKey) {
  const photos = items.filter((i) => i.type === "image");
  console.log(`↻ kinukuha ang tunay na petsa (EXIF) ng ${photos.length} larawan sa Drive API…`);
  const dates = await mapWithConcurrency(photos, 8, (item) => fetchExifDate(item.id));
  let dated = 0;
  photos.forEach((item, i) => {
    if (dates[i]) {
      item.takenAt = dates[i];
      dated++;
    }
  });
  console.log(`  ${dated} / ${photos.length} may EXIF na petsa (walang EXIF ang iba — screenshot o na-edit na)`);
} else {
  console.log("  (walang GOOGLE_DRIVE_API_KEY — nilaktawan ang tunay na petsa ng mga larawan; buo pa rin ang petsa ng mga video mula sa filename)");
}

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
