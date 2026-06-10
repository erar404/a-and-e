/* ════════════════════════════════════════════
   Walong Buwan — interactions
   ════════════════════════════════════════════ */

const music = document.getElementById("music");
const musicToggle = document.getElementById("music-toggle");
const entry = document.getElementById("entry");
const story = document.getElementById("story");

/* ─── entry gate (also unlocks audio autoplay) ─── */

document.getElementById("open-btn").addEventListener("click", () => {
  entry.classList.add("gone");
  story.hidden = false;
  musicToggle.hidden = false;

  music.volume = 0;
  music.play().then(() => fadeMusic(0.65, 2500)).catch(() => {});

  requestAnimationFrame(() => observeReveals());
  setTimeout(() => entry.remove(), 1600);
});

// visiting with #open skips the entry screen (handy for previews)
if (location.hash === "#open") {
  setTimeout(() => document.getElementById("open-btn").click(), 300);
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

    if (!entry.parentElement || entry.classList.contains("gone")) observeReveals();
  })
  .catch(() => {
    document.getElementById("poems").style.display = "none";
  });
