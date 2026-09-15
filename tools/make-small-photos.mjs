#!/usr/bin/env node
/* ════════════════════════════════════════════
   make-small-photos.mjs — 720px-wide copies of every static/opt/*.jpg
   into static/opt/sm/, for the deck's <img srcset>.

   The web-optimised originals are 1200×1598 (~140 KB each), but the
   polaroid deck and the first-picture frame never render wider than
   ~340 CSS px — even a 2× phone only needs ~700 px. The browser picks
   the small copy from srcset and falls back to the original if a small
   one is missing (script.js drops the srcset on error), so it's safe to
   rerun this any time new photos land in static/opt/.

   Needs ffmpeg on PATH.   Usage: node tools/make-small-photos.mjs
   ════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "static", "opt");
const OUT = join(SRC, "sm");
const WIDTH = 720;

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f));
let made = 0;
let skipped = 0;
let before = 0;
let after = 0;

for (const name of files) {
  const src = join(SRC, name);
  const out = join(OUT, basename(name));
  before += statSync(src).size;
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    skipped++;
    after += statSync(out).size;
    continue;
  }
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", `scale=${WIDTH}:-2`, "-q:v", "4", out], { stdio: "inherit" });
  after += statSync(out).size;
  made++;
}

const kb = (n) => Math.round(n / 1024);
console.log(`✔ ${made} ginawa, ${skipped} nilaktawan (bago pa) → static/opt/sm/`);
console.log(`  ${kb(before)} KB → ${kb(after)} KB (${Math.round((1 - after / before) * 100)}% lighter)`);
