# Handoff

## Goal
This is the "Walong Buwan" / "Usap Tayo" static romantic gift site for Erwin & Alliah (vanilla HTML/CSS/JS, no build step, Docker+nginx deploy). No feature request was given in this session — `/erar-go-handoff` was invoked as the very first message, with no prior conversation turns to draw from. This handoff therefore documents **repo state**, not a task-in-progress, so a future session can orient itself quickly.

The last substantive body of work (per git log, all already committed, not done in this session) was:
1. A "VDI disguise" boss-key feature (`vdi-disguise.js`) — hides the real romantic chat/call UI behind a fake boring VDI/Zoom skin, toggled via a floating button or Escape key, so the site can be safely glanced at in public.
2. A YouTube "play `<link>`" inline player (`yt-player.js`) — typing `play <youtube-url>` in the chat composer intercepts the message and opens an audio-focused play bar instead of sending it, supporting single videos and playlists (with prev/next) via the YouTube IFrame API, no API key required.

## Current State
`git status` is **clean** — nothing staged, nothing modified, nothing untracked. HEAD is `91b8e6a` ("added previous and next buttons"), and the branch is up to date with `origin/master`. There is no broken or mid-edit code anywhere in the tree.

Recent commit history (newest first):
- `91b8e6a` added previous and next buttons — prev/next controls for the YouTube playlist bar (`yt-player.js`, `chat.css`, `chat.html`)
- `a8f587c` added disguise optimization — large refactor of `vdi-disguise.js`/`chat.css`/`chat.html`, plus a `Dockerfile` tweak
- `c823c46` added vdi disguise fix — `chat.css` + `Dockerfile` tweaks
- `ed33276` added vdi disguise — initial `vdi-disguise.js` + markup/CSS
- `dd90168` added next poem — unrelated content commit (`static/data/poems.json`)

Key files relevant to the two recent features:
- `vdi-disguise.js` (174 lines) — three-state disguise: full-block overlay (`#vdi-overlay`) when nothing safe is showing, a "functional chat skin" (`body.vdi-skin-chat`) that keeps the real chat/composer live but reskinned as a flat Zoom transcript, and a "functional call skin" (`body.vdi-skin-call`) that keeps the real WebRTC video/mute/hangup live but reskinned as a Zoom gallery view. State persists via `sessionStorage` (`vdiDisguiseOn`) and is kept in sync with real chat/call visibility via a `MutationObserver` on the `hidden` attribute.
- `yt-player.js` (280 lines) — parses `youtube.com`/`youtu.be` URLs (watch, shorts, playlist) typed as `play <url>` in the composer, lazy-loads the YouTube IFrame API on first use, and drives a persistent 1x1 hidden player plus a visible control bar (`#yt-bar`: thumbnail, prev/play-pause/next, seek, time, mute, close). Playlist prev/next buttons are the most recent addition (commit `91b8e6a`).
- `chat.html`, `chat.css`, `chat.js`, `Dockerfile` all carry supporting markup/styles/wiring for both features.

No verification (browser testing, `node --check`, etc.) was performed in this session — this handoff is based purely on reading git history and file contents, since no work was requested or done.

## Files Actively Being Edited
None. The working tree is clean; nothing is mid-change.

## Failed Attempts
None recorded — no work was attempted in this session.

## Next Step
There is no queued task. When the user returns, **ask what they want to work on** — do not assume continuation of the disguise/YouTube-player work just because it's the most recent git history, since this session had no actual instructions. If the user wants to resume verifying the VDI disguise or YouTube player features, the natural first step would be to actually load `chat.html` in a browser and:
1. Toggle the disguise (floating button / Escape) in each of the three states (logged out, chat visible, call active) and confirm the reskin looks right and the real chat/call stays functional underneath.
2. Type `play <a youtube watch/playlist URL>` in the composer and confirm the play bar appears, playback works, and prev/next behave correctly for a playlist.

## Context & Gotchas
- **This session began with zero prior conversation context** — `/erar-go-handoff` was the first message received. Do not trust any assumption that "we were in the middle of X"; there is no X. Everything above was reconstructed from `git log`/`git show`/file reads, not from conversation memory.
- There is an older, much more detailed `handoff.md` that existed before this one (dated around July 10, covering a "monthsary flying envelope" + "minimizable calls" feature session) — it has been **overwritten** by this file. That older session's work is long since committed (it predates `dd90168` "added next poem" in the current git log), so nothing was lost, but if the flying-envelope/call-minimize context is needed again, it's fully present in git history around commits `4858d38`–`769bb5d` rather than in a handoff file now.
- Project conventions established in earlier sessions (still true): no build step, no frameworks, phone-first (Erwin's partner uses her phone, per `PRODUCT.md`), transform/opacity-driven animations, a global `[hidden] { display: none !important; }` rule in both `styles.css` and `chat.css` that always beats competing CSS `display` rules — any new show/hide state should toggle the `hidden` DOM attribute in JS, not a CSS class.
- Windows/PowerShell environment; the Bash tool (git-bash-backed) works fine for `git`/`node`/`grep`-style commands.
