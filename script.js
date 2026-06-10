/* ════════════════════════════════════════════
   Walong Buwan — interactions
   ════════════════════════════════════════════ */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const music = document.getElementById("music");
const musicToggle = document.getElementById("music-toggle");
const entry = document.getElementById("entry");
const story = document.getElementById("story");

/* ─── preloader (warm the critical assets before the curtains open) ─── */

const openBtn = document.getElementById("open-btn");
const loaderEl = document.getElementById("loader");
const loaderFill = document.getElementById("loader-fill");
const loaderNum = document.getElementById("loader-num");

const loadImg = (src) =>
  new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => res();
    im.src = src;
  });

const waitMedia = (el) =>
  new Promise((res) => {
    if (el.readyState >= 4) return res();
    const done = () => {
      el.removeEventListener("canplaythrough", done);
      el.removeEventListener("error", done);
      res();
    };
    el.addEventListener("canplaythrough", done);
    el.addEventListener("error", done);
  });

(function preload() {
  const grace = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

  const tasks = [
    document.fonts.ready,
    loadImg("static/opt/first_pic.jpg"),
    // iOS may refuse to buffer media before a tap; don't hold the door for it
    grace(waitMedia(document.getElementById("first-video")), 8000),
    grace(waitMedia(music), 4000),
    ...PHOTOS.slice(0, 6).map(loadImg),
  ];

  let loaded = 0;
  let finished = false;
  const total = tasks.length;
  tasks.forEach((t) => t.then(() => loaded++));

  // never trap her on the loading screen: open up after 12s regardless
  const deadline = setTimeout(() => (loaded = total), 12000);

  let shown = 0;
  (function paint() {
    shown += (loaded / total - shown) * 0.08;
    loaderFill.style.transform = `scaleX(${shown.toFixed(4)})`;
    loaderNum.textContent = Math.round(shown * 100);
    if (shown > 0.995) {
      if (!finished) {
        finished = true;
        clearTimeout(deadline);
        loaderFill.style.transform = "scaleX(1)";
        loaderNum.textContent = "100";
        loaderEl.classList.add("done");
        openBtn.classList.remove("is-loading");
      }
      return;
    }
    requestAnimationFrame(paint);
  })();
})();

/* ─── entry gate (also unlocks audio autoplay) ─── */

document.getElementById("open-btn").addEventListener("click", () => {
  entry.classList.add("opening");
  story.hidden = false;
  musicToggle.hidden = false;

  music.volume = 0;
  music.play().then(() => fadeMusic(0.65, 2500)).catch(() => {});
  initAudioReactive();

  requestAnimationFrame(() => observeReveals());
  setTimeout(() => entry.remove(), 1900);

  // a gentle shower of petals to welcome her in
  if (!reduceMotion) {
    for (let i = 0; i < 14; i++) spawnPetal(i * 0.18);
    // without an analyser, fall back to a steady drift
    if (!analyser) setInterval(() => spawnPetal(0), 3200);
  }
});

/* ─── audio analyser (the page listens to the song) ─── */

let analyser = null;
let freqData = null;

function initAudioReactive() {
  if (analyser || reduceMotion) return;
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(music);
    analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    src.connect(analyser);
    analyser.connect(actx.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    actx.resume();
    musicToggle.classList.add("live");
  } catch {
    analyser = null;
  }
}

/* ─── falling rose petals ─── */

const petalsBox = document.getElementById("petals");

function spawnPetal(delay) {
  const p = document.createElement("i");
  const size = 8 + Math.random() * 11;
  p.style.cssText =
    `left:${Math.random() * 100}vw;` +
    `width:${size}px;height:${size * 0.85}px;` +
    `animation-duration:${7 + Math.random() * 7}s;` +
    `animation-delay:${delay}s;` +
    `--sway:${20 + Math.random() * 50}px;` +
    `--spin:${Math.random() > 0.5 ? 380 : -380}deg;`;
  petalsBox.appendChild(p);
  p.addEventListener("animationend", () => p.remove());
}

/* ─── scroll progress thread ─── */

const threadBar = document.getElementById("thread-bar");
let threadTick = false;

addEventListener(
  "scroll",
  () => {
    if (threadTick) return;
    threadTick = true;
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight || 1;
      threadBar.style.transform = `scaleX(${doc.scrollTop / max})`;
      threadTick = false;
    });
  },
  { passive: true }
);

/* ─── tap bloom ─── */

document.addEventListener("pointerdown", (e) => {
  if (reduceMotion) return;
  const b = document.createElement("span");
  b.className = "tap-bloom";
  b.style.left = e.clientX + "px";
  b.style.top = e.clientY + "px";
  document.body.appendChild(b);
  b.addEventListener("animationend", () => b.remove());
});

/* ─── "was history." letter-by-letter ─── */

const bigLineEm = document.querySelector(".interlude-line.big em");
if (bigLineEm && !reduceMotion) {
  bigLineEm.innerHTML = [...bigLineEm.textContent]
    .map((c, i) => `<span class="ch" style="--i:${i}">${c === " " ? "&nbsp;" : c}</span>`)
    .join("");
}

/* ─── live "loving you" counter ─── */

// the day it all began — October 11, 2025, 10:30 PM (PH time)
const LOVE_START = new Date("2025-10-11T22:30:00+08:00");

const cDays = document.getElementById("c-days");
const cHours = document.getElementById("c-hours");
const cMins = document.getElementById("c-mins");
const cSecs = document.getElementById("c-secs");

function tickCounter() {
  let s = Math.max(0, Math.floor((Date.now() - LOVE_START.getTime()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  cDays.textContent = d;
  cHours.textContent = String(h).padStart(2, "0");
  cMins.textContent = String(m).padStart(2, "0");
  cSecs.textContent = String(s).padStart(2, "0");
}

tickCounter();
setInterval(tickCounter, 1000);

/* ─── the deck deals itself in when the archive arrives ─── */

if (!reduceMotion) {
  const deckWrap = document.querySelector(".deck-wrap");
  let dealt = false;
  new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !dealt) {
          dealt = true;
          dealIn();
        }
      });
    },
    { threshold: 0.3 }
  ).observe(deckWrap);
}

function dealIn() {
  [...deck.children].forEach((card, j) => {
    const settled = card.style.transform;
    card.style.transition = "none";
    card.style.transform = `translateY(80vh) rotate(${j % 2 ? 21 : -17}deg)`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        card.style.transition = "";
        card.style.transitionDelay = `${j * 0.1}s`;
        card.style.transform = settled;
        setTimeout(() => (card.style.transitionDelay = ""), 1400);
      })
    );
  });
}

/* ─── the cinema loop ─────────────────────────
   one rAF drives everything: audio analysis,
   parallax depth, the interlude swell, the
   letter's lens focus, and the live spectrum  */

const rootStyle = document.documentElement.style;
const parEls = [...document.querySelectorAll("[data-par]")];
const interludeEl = document.querySelector(".interlude");
const interludeBig = document.querySelector(".interlude-line.big");
const interludeSmall = document.querySelector(".interlude-line:not(.big)");
const letterEl = document.querySelector(".letter");
const EQ_BANDS = [2, 6, 14, 30];

let smBass = 0;
let smEnergy = 0;
let petalFuel = 0;
let lastFrame = performance.now();

function cinemaLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const vh = innerHeight;

  /* listen to the song */
  if (analyser && !music.paused) {
    analyser.getByteFrequencyData(freqData);
    let bass = 0;
    for (let i = 1; i < 9; i++) bass += freqData[i];
    bass /= 8 * 255;
    let energy = 0;
    for (let i = 0; i < freqData.length; i++) energy += freqData[i];
    energy /= freqData.length * 255;
    smBass += (bass - smBass) * 0.14;
    smEnergy += (energy - smEnergy) * 0.08;

    EQ_BANDS.forEach((b, k) =>
      musicToggle.style.setProperty(`--eq${k + 1}`, Math.max(0.12, freqData[b] / 255).toFixed(2))
    );

    /* petals fall with the song's energy */
    petalFuel += smEnergy * dt;
    if (petalFuel > 0.9) {
      petalFuel = 0;
      spawnPetal(0);
    }
  } else {
    smBass *= 0.95;
    smEnergy *= 0.96;
  }

  rootStyle.setProperty("--bass", smBass.toFixed(3));
  rootStyle.setProperty("--energy", smEnergy.toFixed(3));
  rootStyle.setProperty("--sway", (Math.sin(now / 950) * (0.25 + smBass * 1.1)).toFixed(3) + "deg");

  /* parallax depth */
  for (const el of parEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const off = (r.top + r.height / 2 - vh / 2) * parseFloat(el.dataset.par);
    el.style.setProperty("--par-y", off.toFixed(1) + "px");
  }

  /* "was history." pins and swells */
  if (interludeEl) {
    const r = interludeEl.getBoundingClientRect();
    const span = r.height - vh;
    if (span > 0 && r.top < 0 && r.bottom > 0) {
      const p = Math.min(1, Math.max(0, -r.top / span));
      interludeBig.style.setProperty("--swell", (1 + p * 0.55).toFixed(3));
      interludeSmall.style.opacity = p < 0.5 ? "" : String(Math.max(0, 1 - (p - 0.5) / 0.3));
    }
  }

  /* the letter comes into focus */
  if (letterEl) {
    const r = letterEl.getBoundingClientRect();
    if (r.top < vh + 100 && r.bottom > 0) {
      const p = Math.min(1, Math.max(0, (vh * 0.88 - r.top) / (vh * 0.5)));
      letterEl.style.setProperty("--focus-blur", ((1 - p) * 9).toFixed(2) + "px");
    }
  }

  requestAnimationFrame(cinemaLoop);
}

if (!reduceMotion) requestAnimationFrame(cinemaLoop);

/* ─── 3D tilt on the first polaroids ─── */

if (matchMedia("(pointer: fine)").matches && !reduceMotion) {
  document.querySelectorAll(".firsts .polaroid").forEach((card) => {
    const base = card.classList.contains("tilt-l") ? -3 : 2.5;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg) rotate(${base / 2}deg) scale(1.02)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

// visiting with #open skips the entry screen (handy for previews);
// "#open+sectionId" also scrolls to that section
if (location.hash.startsWith("#open")) {
  setTimeout(() => {
    document.getElementById("open-btn").click();
    const target = location.hash.split("+")[1];
    if (target) {
      setTimeout(() => document.getElementById(target)?.scrollIntoView(), 2200);
    }
  }, 300);
}

/* ─── music ─── */

let musicFadeTimer = null;

function fadeMusic(target, ms) {
  clearInterval(musicFadeTimer);
  const start = music.volume;
  const t0 = performance.now();
  musicFadeTimer = setInterval(() => {
    const k = Math.min((performance.now() - t0) / ms, 1);
    music.volume = start + (target - start) * k;
    if (k === 1) clearInterval(musicFadeTimer);
  }, 50);
}

musicToggle.addEventListener("click", () => {
  if (music.paused) {
    music.play();
    fadeMusic(0.65, 800);
    musicToggle.classList.remove("muted");
  } else {
    fadeMusic(0, 600);
    setTimeout(() => music.pause(), 650);
    musicToggle.classList.add("muted");
  }
});

/* ─── first video sound (ducks the music) ─── */

const firstVideo = document.getElementById("first-video");
const vidSound = document.getElementById("vid-sound");

vidSound.addEventListener("click", () => {
  firstVideo.muted = !firstVideo.muted;
  vidSound.textContent = firstVideo.muted ? "unmute" : "mute";
  if (!firstVideo.muted) {
    firstVideo.currentTime = 0;
    firstVideo.play();
    if (!music.paused) fadeMusic(0.08, 600);
  } else if (!music.paused) {
    fadeMusic(0.65, 900);
  }
});

/* ─── video clips (one at a time, music steps aside) ─── */

const clipVideos = [...document.querySelectorAll(".clip video")];

clipVideos.forEach((vid) => {
  const fig = vid.closest(".clip");

  const toggle = () => {
    if (vid.paused) {
      clipVideos.forEach((other) => other !== vid && other.pause());
      vid.play();
    } else {
      vid.pause();
    }
  };

  vid.addEventListener("click", toggle);
  fig.querySelector(".clip-play").addEventListener("click", toggle);

  vid.addEventListener("play", () => {
    fig.classList.add("playing");
    if (!music.paused) fadeMusic(0.08, 500);
  });

  const onStop = () => {
    fig.classList.remove("playing");
    const anyPlaying = clipVideos.some((v) => !v.paused && !v.ended);
    if (!anyPlaying && !music.paused) fadeMusic(0.65, 900);
  };

  vid.addEventListener("pause", onStop);
  vid.addEventListener("ended", () => { vid.currentTime = 0; onStop(); });
});

/* ─── scroll reveals ─── */

function observeReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.18 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

/* ─── photo deck ─── */

const deck = document.getElementById("deck");
const countEl = document.getElementById("deck-count");
const totalEl = document.getElementById("deck-total");
const VISIBLE = 4; // cards rendered in the stack
let current = 0;
let autoTimer = null;

totalEl.textContent = PHOTOS.length;

// deterministic "random" tilt per photo so the stack feels hand-placed
function tilt(i) {
  const seed = Math.sin(i * 127.1) * 43758.5453;
  return (seed - Math.floor(seed)) * 7 - 3.5; // -3.5deg … 3.5deg
}

function stackTransform(pos, i) {
  if (pos === 0) return `rotate(${tilt(i)}deg)`;
  const dir = i % 2 === 0 ? 1 : -1;
  return `translate(${dir * pos * 7}px, ${-pos * 9}px) rotate(${tilt(i) + dir * pos * 2}deg) scale(${1 - pos * 0.03})`;
}

function renderDeck() {
  deck.innerHTML = "";
  for (let pos = VISIBLE - 1; pos >= 0; pos--) {
    const i = (current + pos) % PHOTOS.length;
    const card = document.createElement("div");
    card.className = "pcard";
    card.style.transform = stackTransform(pos, i);
    card.style.zIndex = VISIBLE - pos;

    const img = document.createElement("img");
    img.className = "ph";
    img.src = PHOTOS[i];
    img.alt = `Memory ${i + 1}`;
    img.draggable = false;

    const cap = document.createElement("div");
    cap.className = "ph-caption";
    cap.textContent = `no. ${i + 1}`;

    card.appendChild(img);
    card.appendChild(cap);
    deck.appendChild(card);

    if (pos === 0) attachDrag(card, i);
  }
  countEl.textContent = current + 1;
  preload(current + VISIBLE, 3);
}

function preload(from, n) {
  for (let k = 0; k < n; k++) {
    new Image().src = PHOTOS[(from + k) % PHOTOS.length];
  }
}

function advance(dirX) {
  const front = deck.lastElementChild;
  if (!front) return;
  const x = dirX >= 0 ? window.innerWidth : -window.innerWidth;
  front.classList.add("fly");
  front.style.transform = `translate(${x * 0.7}px, -60px) rotate(${dirX >= 0 ? 24 : -24}deg)`;
  setTimeout(() => {
    current = (current + 1) % PHOTOS.length;
    renderDeck();
  }, 320);
  resetAuto();
}

function goBack() {
  current = (current - 1 + PHOTOS.length) % PHOTOS.length;
  renderDeck();
  const front = deck.lastElementChild;
  if (front) {
    const settled = front.style.transform;
    front.style.transition = "none";
    front.style.transform = `translate(-${window.innerWidth * 0.6}px, -60px) rotate(-20deg)`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        front.style.transition = "";
        front.style.transform = settled;
      })
    );
  }
  resetAuto();
}

/* drag / swipe on the front card */
function attachDrag(card, i) {
  let startX = 0, startY = 0, dx = 0, dragging = false;

  card.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    card.classList.add("dragging");
    card.setPointerCapture(e.pointerId);
    pauseAuto();
  });

  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    const dy = (e.clientY - startY) * 0.35;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt(i) + dx * 0.06}deg)`;
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("dragging");
    if (Math.abs(dx) > 75) {
      advance(dx);
    } else {
      card.style.transform = stackTransform(0, i);
      resetAuto();
    }
    dx = 0;
  };

  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
}

/* gentle auto-advance while the gallery is on screen */
function pauseAuto() { clearInterval(autoTimer); autoTimer = null; }

function resetAuto() {
  pauseAuto();
  autoTimer = setInterval(() => advanceAuto(), 5000);
}

function advanceAuto() {
  const r = deck.getBoundingClientRect();
  if (r.top < window.innerHeight && r.bottom > 0) advance(1);
}

document.getElementById("deck-next").addEventListener("click", () => advance(1));
document.getElementById("deck-prev").addEventListener("click", goBack);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") advance(1);
  if (e.key === "ArrowLeft") goBack();
});

renderDeck();
preload(0, VISIBLE + 2);
resetAuto();

/* ─── poems ─── */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

fetch("static/poems.txt.txt")
  .then((r) => r.text())
  .then((text) => {
    const poems = text
      .split(/\r?\n\s*--\s*\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const grid = document.getElementById("poem-grid");
    poems.forEach((poem, idx) => {
      const card = document.createElement("div");
      card.className = "poem-card reveal";
      card.style.transitionDelay = `${(idx % 4) * 0.12}s`;
      card.innerHTML = `
        <div class="poem-face poem-front">
          <span class="poem-num">${ROMAN[idx] || idx + 1}</span>
          <span class="poem-seal">♡</span>
          <span class="poem-open-hint">tap to unseal</span>
        </div>
        <div class="poem-face poem-back">
          <div class="poem-text"></div>
          <div class="poem-foot">— para sa'yo, lagi</div>
        </div>`;
      card.querySelector(".poem-text").textContent = poem;
      card.addEventListener("click", () => card.classList.toggle("open"));
      grid.appendChild(card);
    });

    if (!entry.parentElement || entry.classList.contains("opening")) observeReveals();
  })
  .catch(() => {
    document.getElementById("poems").style.display = "none";
  });
