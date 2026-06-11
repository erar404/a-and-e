# Handoff

## Goal
Build and ship "Walong Buwan" — a one-time romantic gift website for the user's
8th monthsary with his girlfriend (June 10, 2026). It must walk her through:
1. the first video + first picture together (`static/opt/first_vid.mp4`, `static/opt/first_pic.jpg`) with a romantic intro message,
2. an "…and the rest was history." transition (pinned, swelling on scroll),
3. a live "loving you, down to the second" counter from **Oct 11, 2025 10:30 PM PH time**,
4. a draggable polaroid slideshow of all 87 photos,
5. a "moving memories" section with 4 extra video clips,
6. eight flip-open poem cards parsed from `static/poems.txt.txt` (split on `--` lines),
7. a closing letter with the exact Taglish message the user provided (verbatim in `index.html`),
with `static/music.mp3` looping throughout, deployable to Google Cloud Run or
Render via Docker. Theme: "romantic but not corny" — dim cinematic keepsake box,
wine-dark + cream + dusty rose + antique gold, Cormorant Garamond + La Belle
Aurore. Constraints: vanilla HTML/CSS/JS, no build step, phone-first
performance, prefers-reduced-motion respected everywhere.

## Current State
**COMPLETE AND VERIFIED.** Nothing is broken or mid-edit. All features built,
tested via puppeteer-core walkthroughs on desktop (1280×800) and mobile
(390×844) viewports, including a throttled-network (8 Mbps) preloader test.
The site is ready to deploy.

Feature inventory (all working):
- Entry screen with asset **preloader** (progress line "hinahanda ang mga alaala…" → crossfades to "buksan mo" button), curtain-parting open animation, music start with fade-in.
- Web Audio analyser: aurora breathes with bass, music-toggle bars show real spectrum, petal spawn rate follows song energy, polaroids sway to the beat. Falls back to CSS animation + fixed petal timer if AudioContext fails.
- One global rAF "cinema loop" in `script.js` drives: audio analysis, parallax (`[data-par]` elements), pinned interlude swell (`--swell`), letter lens-focus (`--focus-blur`), eq bars.
- Polaroid deck: drag/swipe/arrows/keyboard, auto-advance, deal-in animation on first view, counter "n of 87".
- Poem cards (8, roman numerals, wax seal, 3D flip), live counter, tap blooms, falling petals, scroll progress thread, grain/vignette/aurora/motes atmosphere.
- Docker: `Dockerfile` (nginx:alpine, PORT-aware via `nginx.conf.template` envsubst) + `.dockerignore` excluding all heavy originals (~540 MB) so the image is ~35 MB.

## Files Actively Being Edited
All in `C:\Users\Arellano\ERA\Coding\e-and-a\` (NOT a git repo):
- `index.html` — full site markup: entry (curtains, loader, open button), firsts, pinned interlude, counter, gallery deck, clips, poems, letter; heart SVG favicon; `data-par` parallax attributes.
- `styles.css` — all styling/animations: atmosphere layers, polaroids, deck, poem flip cards, letter, loader, curtains, counter, eq-live bars, reduced-motion fallbacks at the bottom.
- `script.js` — preloader, entry gate, audio analyser, cinema rAF loop, deck logic, deal-in, poems fetch/parse, counter (`LOVE_START = 2025-10-11T22:30:00+08:00`), tilt, tap blooms, petals, scroll thread, `#open` / `#open+sectionId` preview helper.
- `photos.js` — auto-generated array of 87 paths pointing at `static/opt/*.jpg`.
- `static/opt/` — generated web-optimized assets: 88 photos (1200px, ffmpeg `-q:v 4`, ~12 MB total) + `first_vid.mp4` (4.7 MB).
- `static/` (created earlier in session) — `img_2629.mp4` (0.6 MB, transcoded from HEVC MOV), `vid_20250806.mp4`, `vid_20251219.mp4` (renamed+faststart), `worthy_holy.mp4` (12.3 MB, shrunk from 32).
- `Dockerfile`, `nginx.conf.template`, `.dockerignore` — deployment; dockerignore excludes original videos AND original jpgs (`static/1*.jpg`, `static/first_pic.jpg`, `static/First_vid.mp4`).
- `README.md` — run/deploy instructions and maintenance notes.
- `PRODUCT.md` — design-context brief (for the /impeccable skill; excluded from Docker).
- `handoff.md` — this file.

## Failed Attempts
- **Headless Chrome `--screenshot` + `--virtual-time-budget` for scrolled-state verification**: after a programmatic jump (`scrollIntoView`), IntersectionObserver callbacks never fire under virtual time → every `.reveal` stays opacity:0 → uniform dark screenshots (identical 4718-byte PNGs). Don't retry this; use puppeteer-core instead (works: real timing, real scroll). A helper script pattern lives in `%TEMP%\ea-shots\` (`shots.mjs`, `mobile.mjs`, `preload.mjs`) with puppeteer-core installed there.
- **`2>$null` stderr redirect on headless chrome in PowerShell**: silently produced no screenshot file; use `2>&1 | Out-String` instead.
- **Preloading 6 original photos** (~6 MB each, 36 MB total): blew the 12s loader deadline on throttled network — fixed by generating `static/opt/` web copies, not by tweaking the loader.
- **`magick` (ImageMagick)**: not installed on this machine. ffmpeg 7.1 was used instead and DOES apply EXIF rotation correctly for stills (visually verified on two portrait samples).

## Next Step
Deploy. The single command (user must run it themselves, needs gcloud auth):
```powershell
gcloud run deploy walong-buwan --source . --region asia-southeast1 --allow-unauthenticated
```
or push to GitHub → Render "New Web Service" → runtime Docker. Before deploying,
a quick smoke test: `python -m http.server 8080` and open
`http://localhost:8080` (or `#open` to skip the entry gate, `#open+letter` to
jump to a section).

## Context & Gotchas
- **Filename quirks (case matters on Linux/Docker!)**: the poems file is literally `static/poems.txt.txt` (double extension); the original first video is `First_vid.mp4` (capital F) but the site now uses `static/opt/first_vid.mp4`.
- **Anniversary date**: Oct 11, 2025, 10:30 PM, hardcoded with `+08:00` offset in `script.js` (`LOVE_START`) so it's timezone-stable. The counter showed 242/243 days in June 2026 tests — correct.
- **Music autoplay**: gated behind the "buksan mo" click on the entry overlay (browser requirement). The preview helper `#open` auto-clicks it; music `.play()` rejection is caught.
- **Audio ducking rules**: first-video unmute ducks music to 0.08; any clip playing ducks the same; music fades back when they stop. `fadeMusic()` is the single volume authority.
- **`static/opt/` is generated** — regenerate any photo with `ffmpeg -i IN.jpg -vf "scale=w='min(1200,iw)':h=-2" -q:v 4 OUT.jpg`, then regenerate `photos.js` (PowerShell snippet pattern is in the session: list `static\opt\*.jpg` minus `first_pic.jpg`, sorted, wrapped in `const PHOTOS = [...]`).
- **Captions in the clips section**: "august 6, 2025" and "december 19, 2025" were derived from the `Vid yyyymmdd...` filenames; the other two ("a little moment i kept", "worthy, holy ♪") are guesses the user may want to edit in `index.html`.
- **Unused-original exclusions**: `.dockerignore` keeps originals out of the image; deleting them locally is the user's call, never do it unprompted.
- **Skill/style decisions**: identity is locked (Cormorant Garamond etc.) per the impeccable brand register "identity-preservation" rule — do NOT restyle on future passes; PRODUCT.md records this.
- **Test-server noise**: background `python -m http.server` tasks report "failed with exit code 255" when killed via `Stop-Process` — expected, not an error.
- **Windows environment**: PowerShell syntax, Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`, ffmpeg via WinGet shim, no Docker installed locally (Cloud Run/Render build remotely), not a git repository.
