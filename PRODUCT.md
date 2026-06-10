# PRODUCT.md

## Product Purpose
"Walong Buwan" is a one-time romantic gift website for an 8th monthsary
(June 10, 2026). It walks the recipient through the couple's story: the first
video and picture together, a live since-we-met counter, a draggable polaroid
photo archive (87 photos), four video clips, eight sealed poem cards, and a
closing handwritten letter, with a looping song underneath.

## Users
Exactly one: the creator's girlfriend, most likely viewing on her phone,
alone, with sound on. Secondary: the creator previewing on desktop.

## Register
brand

## Brand & Tone
Romantic but explicitly NOT corny: a dim, cinematic "keepsake box" found in a
drawer. Warm wine-dark espresso backgrounds, film grain, cream polaroid paper,
dusty rose and antique gold accents. Taglish voice (Filipino terms of
endearment: "mahal", handwritten asides). Intimate, hushed, sincere.

## Anti-references
- Valentine clip-art: red hearts everywhere, cupids, glitter
- Generic AI landing-page slop: purple gradients, centered SaaS heroes
- Loud party energy; this is a quiet, late-night experience

## Strategic principles
- Identity is locked: Cormorant Garamond + La Belle Aurore, the wine/rose/gold
  palette, polaroid paper surfaces. Enhancements deepen this world, never
  restyle it.
- Phone-first performance: 528 MB of photos already; effects must be
  transform/opacity-only or canvas-light, 60fps on a mid-range phone.
- Music is the heartbeat: the song loops throughout; interactions should defer
  to it (ducking, fades).
- Everything degrades gracefully and respects prefers-reduced-motion.

## Tech constraints
Vanilla HTML/CSS/JS, no build step, no frameworks. Served by nginx in Docker
(Cloud Run / Render). Assets in static/.
