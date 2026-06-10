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

## Notes

- **Music autoplay**: browsers block autoplay, so the site opens with a
  "buksan mo" entry screen — the click starts the music. This is intentional.
- **Photos are heavy** (~528 MB of JPGs). The site lazy-loads them a few at a
  time so it still feels fast, but if you want faster first paint and a smaller
  Docker image, batch-resize them to ~1600px before deploying, e.g. with
  [ImageMagick](https://imagemagick.org): `magick mogrify -resize 1600x1600 -quality 82 static/*.jpg`
- **Adding/removing photos**: drop JPGs in `static/`, then regenerate
  `photos.js` (it's just an array of paths).
- **Editing poems**: edit `static/poems.txt.txt` — poems separated by a line
  containing `--`. The cards build themselves.
- **Video clips**: the "moving memories" section plays web-optimized copies of
  the extra videos (`img_2629.mp4`, `vid_20250806.mp4`, `vid_20251219.mp4`,
  `worthy_holy.mp4`), converted with ffmpeg (H.264 + faststart; the MOV was
  HEVC, which most browsers can't play, and Worthy Holy was shrunk 32 → 12 MB).
  The original files stay on disk but are excluded from the Docker image via
  `.dockerignore`. To redo a conversion:
  `ffmpeg -i "static/INPUT" -c:v libx264 -crf 24 -c:a aac -movflags +faststart static/output.mp4`
