/* ════════════════════════════════════════════
   Cloud slideshow — larawan at video, diretso
   mula sa Google Drive folder natin.
   Listahan: static/data/drive-media.json
   (i-refresh gamit ang tools/sync-drive-media.mjs)
   ════════════════════════════════════════════ */

(() => {
  const section = document.getElementById("cloudshow");
  if (!section) return;

  const stage = document.getElementById("cine-stage");
  const numEl = document.getElementById("cine-num");
  const totalEl = document.getElementById("cine-total");

  const imgUrl = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
  const videoUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;

  // date-taken caption + "which month were we" tag — takenAt comes from
  // tools/sync-drive-media.mjs, parsed straight out of the filename (no
  // Drive API access here, just the public folder listing)
  const TZ = "Asia/Manila";
  const LOVE_START_ISO = "2025-10-11"; // keep in sync with static/data/monthsary.json's "start"
  const [LOVE_Y, LOVE_M, LOVE_D] = LOVE_START_ISO.split("-").map(Number);
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const MONTHS_TL = [
    "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
    "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre",
  ];

  function phParts(date) {
    const [y, m, d] = dateFmt.format(date).split("-").map(Number);
    return { y, m, d };
  }

  // same whole-month rule the monthsary engine uses, just aimed at
  // whatever date the photo was taken instead of "today"
  function monthsAt(date) {
    const { y, m, d } = phParts(date);
    return Math.max(1, (y - LOVE_Y) * 12 + (m - LOVE_M) + (d >= LOVE_D ? 0 : -1));
  }

  function dateLabel(date) {
    const { y, m, d } = phParts(date);
    return `${MONTHS_TL[m - 1]} ${d}, ${y}`;
  }

  const HOLD_MS = 5500; // how long each photo lingers
  let items = [];
  let current = 0;
  let timer = null;
  let videoOpen = false;

  // Fisher-Yates — a fresh order every visit
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  fetch("static/data/drive-media.json")
    .then((r) => r.json())
    .then((data) => {
      items = shuffle((data.items || []).filter((i) => i.id && (i.type === "image" || i.type === "video")));
      if (!items.length) {
        section.style.display = "none";
        return;
      }
      totalEl.textContent = items.length;
      show(0, true);
      startAuto();
    })
    .catch(() => {
      section.style.display = "none";
    });

  function buildSlide(item) {
    const slide = document.createElement("div");
    slide.className = "cine-slide";

    // a soft blurred copy fills the frame behind the real one
    const back = document.createElement("div");
    back.className = "cine-back";
    back.style.backgroundImage = `url("${imgUrl(item.id, 400)}")`;
    slide.appendChild(back);

    const img = document.createElement("img");
    img.className = "cine-img";
    img.src = imgUrl(item.id, 1600);
    img.alt = "";
    img.draggable = false;
    slide.appendChild(img);

    if (item.album) {
      const cap = document.createElement("span");
      cap.className = "cine-album";
      cap.textContent = item.album;
      slide.appendChild(cap);
    }

    if (item.takenAt) {
      const taken = new Date(item.takenAt);
      const date = document.createElement("span");
      date.className = "cine-date";
      date.textContent = `${dateLabel(taken)} · ika-${monthsAt(taken)} buwan namin`;
      slide.appendChild(date);
    }

    if (item.type === "video") {
      const play = document.createElement("button");
      play.className = "cine-play";
      play.setAttribute("aria-label", "Play video");
      play.textContent = "▶";
      play.addEventListener("click", () => openVideo(slide, item));
      slide.appendChild(play);

      const tag = document.createElement("span");
      tag.className = "cine-tag";
      tag.textContent = "video";
      slide.appendChild(tag);
    }

    return slide;
  }

  function openVideo(slide, item) {
    videoOpen = true;
    pauseAuto();
    const frame = document.createElement("iframe");
    frame.className = "cine-frame";
    frame.src = videoUrl(item.id);
    frame.allow = "autoplay";
    frame.allowFullscreen = true;
    slide.appendChild(frame);
    slide.classList.add("playing");
    // the music politely steps aside while the video plays
    if (typeof fadeMusic === "function" && typeof music !== "undefined" && !music.paused) {
      fadeMusic(0.08, 500);
    }
  }

  function closeVideo() {
    if (!videoOpen) return;
    videoOpen = false;
    if (typeof fadeMusic === "function" && typeof music !== "undefined" && !music.paused) {
      fadeMusic(0.65, 900);
    }
  }

  function show(idx, instant) {
    closeVideo();
    current = (idx + items.length) % items.length;
    const next = buildSlide(items[current]);
    if (instant) next.classList.add("on");
    stage.appendChild(next);

    // crossfade: the new slide fades in, old ones leave after
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        next.classList.add("on");
        [...stage.children].forEach((el) => {
          if (el !== next) {
            el.classList.remove("on");
            setTimeout(() => el.remove(), 1300);
          }
        });
      })
    );

    numEl.textContent = current + 1;

    // warm the next image so the fade never stutters
    const upcoming = items[(current + 1) % items.length];
    new Image().src = imgUrl(upcoming.id, 1600);
  }

  function tick() {
    // hold still while a video is open or the show is offscreen
    if (videoOpen) return;
    const r = stage.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    show(current + 1);
  }

  function startAuto() {
    pauseAuto();
    timer = setInterval(tick, HOLD_MS);
  }

  function pauseAuto() {
    clearInterval(timer);
    timer = null;
  }

  document.getElementById("cine-next").addEventListener("click", () => {
    show(current + 1);
    startAuto();
  });

  document.getElementById("cine-prev").addEventListener("click", () => {
    show(current - 1);
    startAuto();
  });

  /* swipe on the stage */
  let startX = null;
  stage.addEventListener("pointerdown", (e) => (startX = e.clientX));
  stage.addEventListener("pointerup", (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 55) {
      show(current + (dx < 0 ? 1 : -1));
      startAuto();
    }
  });
})();
