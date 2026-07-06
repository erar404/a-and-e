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

  const HOLD_MS = 5500; // how long each photo lingers
  let items = [];
  let current = 0;
  let timer = null;
  let videoOpen = false;

  fetch("static/data/drive-media.json")
    .then((r) => r.json())
    .then((data) => {
      items = (data.items || []).filter((i) => i.id && (i.type === "image" || i.type === "video"));
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
