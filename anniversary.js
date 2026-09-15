/* ════════════════════════════════════════════
   Isang Taon — the anniversary surprise layer.
   monthsary.js flips body.theme-anniversary at hatinggabi of the 12th
   monthsary (Oktubre 11, 2026). A colour swap alone isn't a surprise,
   so this adds what CSS can't do on its own:
     · a sunrise that washes the night away when the flip happens live
       (window.dawnTransition — monthsary.js hands it the actual swap)
     · hearts that float up all day instead of petals falling
     · a constellation of sparkles behind everything
     · confetti at the moments that deserve it — the flip itself,
       "buksan mo", the greeting, a double-tapped reel
     · a small heart wherever she taps
   Everything is transform/opacity only and sits out entirely under
   prefers-reduced-motion. Preview any time with ?month=12.
   ════════════════════════════════════════════ */

(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;
  const isAnniv = () => body.classList.contains("theme-anniversary");

  const PALETTE = ["#ff7a9a", "#ffb3c6", "#ffd166", "#ff9f7a", "#f4a6d7", "#8fd3ff", "#ffe08a"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let heartsLayer = null;
  let sparkleLayer = null;
  let confettiLayer = null;
  let veil = null;

  function layer(cls) {
    const el = document.createElement("div");
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    body.appendChild(el);
    return el;
  }

  function layers() {
    if (heartsLayer) return;
    heartsLayer = layer("hearts");
    sparkleLayer = layer("sparkles");
    confettiLayer = layer("confetti");
    veil = layer("dawn-veil");
    // a fixed constellation — CSS alone keeps it twinkling
    for (let i = 0; i < 22; i++) {
      const s = document.createElement("i");
      s.style.cssText =
        `left:${rand(2, 98).toFixed(1)}vw;top:${rand(3, 95).toFixed(1)}vh;` +
        `--d:${rand(0, 6).toFixed(2)}s;--t:${rand(2.6, 5.2).toFixed(2)}s;--s:${rand(0.55, 1.35).toFixed(2)};` +
        `--c:${Math.random() < 0.6 ? "#fff3c4" : pick(PALETTE)};`;
      sparkleLayer.appendChild(s);
    }
  }

  /* ─── hearts drifting up ─── */

  function spawnHeart(delay = 0, xvw) {
    if (reduced || !isAnniv()) return;
    layers();
    const h = document.createElement("i");
    const size = rand(11, 26);
    h.style.cssText =
      `left:${(xvw == null ? rand(0, 100) : xvw).toFixed(1)}vw;` +
      `width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;` +
      `--c:${pick(PALETTE)};` +
      `animation-duration:${rand(9, 15).toFixed(1)}s;animation-delay:${delay}s;` +
      `--sway:${rand(-70, 70).toFixed(0)}px;--spin:${rand(-45, 45).toFixed(0)}deg;`;
    heartsLayer.appendChild(h);
    h.addEventListener("animationend", () => h.remove());
  }

  /* ─── a small heart right where she taps ─── */

  function popHeart(x, y) {
    if (reduced || !isAnniv()) return;
    layers();
    const h = document.createElement("i");
    h.className = "heart-pop";
    h.style.cssText = `left:${x}px;top:${y}px;--c:${pick(PALETTE)};--dx:${rand(-30, 30).toFixed(0)}px;`;
    confettiLayer.appendChild(h);
    h.addEventListener("animationend", () => h.remove());
  }

  /* ─── confetti ─── */

  function burstConfetti(x = innerWidth / 2, y = innerHeight / 2, n = 30) {
    if (reduced) return;
    layers();
    for (let i = 0; i < n; i++) {
      const c = document.createElement("i");
      const ang = rand(0, Math.PI * 2);
      const dist = rand(70, 260);
      const roll = Math.random();
      c.className = roll < 0.4 ? "heart" : roll < 0.7 ? "dot" : "strip";
      c.style.cssText =
        `left:${x}px;top:${y}px;--c:${pick(PALETTE)};` +
        `--dx:${(Math.cos(ang) * dist).toFixed(0)}px;--dy:${(Math.sin(ang) * dist - 140).toFixed(0)}px;` +
        `--rot:${rand(-540, 540).toFixed(0)}deg;` +
        `animation-duration:${rand(1.2, 2).toFixed(2)}s;animation-delay:${rand(0, 0.18).toFixed(2)}s;`;
      confettiLayer.appendChild(c);
      c.addEventListener("animationend", () => c.remove());
    }
  }

  /* ─── the sunrise — monthsary.js calls this when the theme flips live ─── */

  function dawnTransition(apply) {
    if (reduced) {
      apply();
      return;
    }
    layers();
    body.classList.add("dawning");
    veil.classList.remove("fade");
    veil.classList.add("rise"); // warm light climbs up and fills the screen
    setTimeout(() => {
      apply(); // the palette swaps behind the light
      sync();
      veil.classList.add("fade"); // …then the light thins into the new morning
      burstConfetti(innerWidth / 2, innerHeight * 0.42, 70);
      for (let i = 0; i < 28; i++) spawnHeart(i * 0.1);
      setTimeout(() => {
        veil.classList.remove("rise", "fade");
        body.classList.remove("dawning");
      }, 2600);
    }, 1700);
  }

  /* ─── ambient loop while the theme is on ─── */

  let ambient = null;

  function startAmbient() {
    if (ambient || reduced || !isAnniv()) return;
    layers();
    ambient = setInterval(() => {
      if (!document.hidden) spawnHeart(0);
    }, 2600);
  }

  function stopAmbient() {
    clearInterval(ambient);
    ambient = null;
  }

  function sync() {
    if (isAnniv()) {
      layers();
      startAmbient();
    } else {
      stopAmbient();
    }
  }

  // the theme may already be on when the page loads (any time after the flip)
  sync();
  document.addEventListener("monthsary:change", sync);

  document.addEventListener("pointerdown", (e) => popHeart(e.clientX, e.clientY));

  // "buksan mo" on the anniversary itself — confetti through the curtains
  const openBtn = document.getElementById("open-btn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (!isAnniv() || reduced) return;
      const r = openBtn.getBoundingClientRect();
      burstConfetti(r.left + r.width / 2, r.top + r.height / 2, 56);
      for (let i = 0; i < 22; i++) spawnHeart(0.4 + i * 0.12);
      startAmbient();
    });
  }

  // ?dawn=1#open previews the sunrise itself: the site opens in whatever
  // month it really is, then ~2.5s later the anniversary breaks over it
  if (new URLSearchParams(location.search).has("dawn") && openBtn) {
    openBtn.addEventListener("click", () => {
      setTimeout(() => dawnTransition(() => body.classList.add("theme-anniversary")), 2500);
    });
  }

  window.spawnHeart = spawnHeart;
  window.burstConfetti = burstConfetti;
  window.dawnTransition = dawnTransition;
})();
