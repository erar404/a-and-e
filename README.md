# Walong Buwan 💌

An interactive keepsake website for your 8th monthsary — a dim, cinematic
"memory box" with the first video & picture, a draggable polaroid photo deck,
sealed poem cards, a looping soundtrack, and a closing letter.

## Run locally

Any static server works. Easiest:

```powershell
# from this folder
python -m http.server 8080
# then open http://localhost:8080
```

Or with Docker:

```powershell
docker build -t walong-buwan .
docker run -p 8080:8080 walong-buwan
```

## Deploy — Google Cloud Run

```powershell
gcloud run deploy walong-buwan --source . --region asia-southeast1 --allow-unauthenticated
```

That's it — Cloud Run builds the Dockerfile, injects `PORT`, and gives you a URL.

## Deploy — Render

1. Push this folder to a GitHub repo.
2. Render Dashboard → **New → Web Service** → connect the repo.
3. Runtime: **Docker**. No other settings needed (the container honors Render's `PORT`).

## The monthsary engine 🌙→🌅

The site rewrites itself **every 11th of the month at midnight (PH time)** —
titles, the entry screen, the letter, the footer, and newly-unsealed poems.
No code changes needed month to month; everything lives in two JSON files:

- **`static/data/monthsary.json`** — the Tagalog count names (`counts`),
  default text templates (`defaults`, with `{name}` `{english}` `{ordinalEn}`
  placeholders), and per-month customizations (`months`). To write next
  month's letter, add/edit `months["9"]` and fill in `letter.paragraphs`.
  If a month has no entry, a sweet default letter shows instead.
- **`static/data/poems.json`** — every poem with the `month` it unseals on.
  Add `{ "month": 9, "text": "..." }` and the card appears by itself at
  midnight of the 9th monthsary (`\n` = new line, `\n\n` = stanza break).

Extras:

- **Preview any month** with a query param: `http://localhost:8080/?month=12`.
- **On the 11th itself**, a handwritten greeting card slides up after the
  curtains open (per-month `greeting` in monthsary.json). If the page is open
  when midnight strikes, everything flips live with a shower of petals.
- **Month 12 = the first anniversary** switches the whole site to the
  `anniversary` theme — the dark night becomes a golden dawn (a new chapter).
  Any month can set `"theme"` in its `months` entry.
- The old `static/poems.txt.txt` is no longer read; poems come from
  `poems.json` now.
- Keep `start` in monthsary.json, `FALLBACK_START` in `monthsary.js`, and
  `LOVE_START` in `script.js` in sync if the start date ever changes.

## The cloud slideshow ☁️

The "mula sa ating ulap" section auto-plays every photo and video in our
Google Drive folder — streamed straight from Drive, so nothing gets added
to the repo or the Docker image.

**One-time setup:** in Google Drive, right-click the folder → **Share** →
General access → **"Anyone with the link" (Viewer)** → Done. (Required both
for the sync script and for visitors' browsers to load the media. Note: this
means anyone holding a file's link can view it.)

**Refresh the list** whenever new files land in the folder:

```powershell
node tools/sync-drive-media.mjs
```

That regenerates `static/data/drive-media.json` (id + name + type per file).
The slideshow crossfades photos every ~5.5s with a slow Ken Burns drift;
videos show a play button and pause the rotation (and duck the music) while
playing. If the JSON is empty the section hides itself, so the site never
looks broken.

## Usap Tayo — the private chat 💬

`chat.html` is a two-person chat (reachable via the cursive "usap tayo ♡"
link under the letter). Backend is Supabase (the bandapa project): auth +
`chat_messages` table + realtime, all gated by Row Level Security so only
the two `chat_members` accounts can read or write anything.

- Login: tap your name, enter your birthdate (`MMDDYYYY`).
- Messages deliver live (websockets), with Tagalog timestamps and a
  "nakita ♡" seen indicator.
- Full build/decision log lives in `CHAT_PLAN.md`.

## Notes

- **Music autoplay**: browsers block autoplay, so the site opens with a
  "buksan mo" entry screen — the click starts the music. This is intentional.
- **Preloader**: the entry screen holds the "buksan mo" button behind a
  progress line until the fonts, first video/picture, music, and the first six
  deck photos are buffered (per-item grace timeouts plus a 12s hard deadline,
  so nobody can get stuck on the loading screen).
- **Photos & the intro video are served from `static/opt/`** — web-sized
  copies (~17 MB total vs ~540 MB of originals), generated with
  `ffmpeg -i IN.jpg -vf "scale=w='min(1200,iw)':h=-2" -q:v 4 static/opt/OUT.jpg`.
  Originals stay on disk but are excluded from the Docker image.
- **The live counter**: the "Loving you, down to the second" section counts up
  from `LOVE_START` in `script.js` — set to **October 11, 2025, 10:30 PM PH time**.
- **Adding/removing photos**: drop the JPG in `static/`, create its optimized
  copy in `static/opt/` (command above), then regenerate `photos.js` (it's
  just an array of `static/opt/...` paths).
- **Editing poems**: edit `static/poems.txt.txt` — poems separated by a line
  containing `--`. The cards build themselves.
- **Video clips**: the "moving memories" section plays web-optimized copies of
  the extra videos (`img_2629.mp4`, `vid_20250806.mp4`, `vid_20251219.mp4`,
  `worthy_holy.mp4`), converted with ffmpeg (H.264 + faststart; the MOV was
  HEVC, which most browsers can't play, and Worthy Holy was shrunk 32 → 12 MB).
  The original files stay on disk but are excluded from the Docker image via
  `.dockerignore`. To redo a conversion:
  `ffmpeg -i "static/INPUT" -c:v libx264 -crf 24 -c:a aac -movflags +faststart static/output.mp4`
