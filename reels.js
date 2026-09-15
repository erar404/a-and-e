/* ════════════════════════════════════════════
   Anniversareels — an Instagram-Reels-style vertical feed of our little
   films, streamed straight from the shared Google Drive folder.
   Listahan: static/data/reels.json
   (i-refresh: node tools/sync-drive-media.mjs <folderId> static/data/reels.json)

   Streaming, not downloading: drive.usercontent.google.com/download
   answers byte-range requests (206 Partial Content, Accept-Ranges: bytes)
   with a real video/mp4 body, so a plain <video> can seek and buffer
   progressively — playback starts on the first few hundred KB, and the
   browser only ever pulls what it's about to show. Google does refuse to
   be hotlinked directly, though (a <video> tag's Sec-Fetch-Dest: video
   headers earn a 403), so the request goes through our own origin:
   /reels/<fileId> → nginx.conf.template (tools/dev-server.mjs locally)
   forwards Range and strips the headers Google objects to. Only the
   active reel and its two neighbours hold a src at any time (the next
   one buffers ahead while the current one plays, so a swipe never
   waits); everything else stays a poster. A clip that still refuses to
   stream (quota, permission, a >100 MB virus-scan page) falls back to
   Drive's own embedded player.

   Sound: the reels play *with* sound — while the feed is on screen the
   song fades to silence and any other clip pauses, and the reel's own
   audio takes over. Tap to mute/unmute; it comes back the moment she
   scrolls away. If the browser refuses unmuted autoplay (iOS, no fresh
   gesture) the reel plays silent and one tap turns it on.

   The feed never ends: when she nears the last reel another round of
   the same clips is appended, so it just keeps going, like the real thing.

   Gestures: swipe or scroll for the next reel · tap to mute · double-tap
   to shower it with hearts.
   ════════════════════════════════════════════ */

(() => {
  const section = document.getElementById("reels");
  if (!section) return;

  const feed = document.getElementById("reels-feed");
  const prevBtn = document.getElementById("reels-prev");
  const nextBtn = document.getElementById("reels-next");
  const phone = section.querySelector(".reels-phone");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const streamUrl = (id) => `/reels/${id}`; // same-origin proxy — see the note above
  const posterUrl = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
  const embedUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;

  const ICON_ON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/>' +
    '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_MUTED =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/>' +
    '<path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>';

  /* ─── date captions — same rules drive-show.js uses ─── */

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

  function monthsAt(date) {
    const { y, m, d } = phParts(date);
    return Math.max(1, (y - LOVE_Y) * 12 + (m - LOVE_M) + (d >= LOVE_D ? 0 : -1));
  }

  function dateLabel(date) {
    const { y, m, d } = phParts(date);
    return `${MONTHS_TL[m - 1]} ${d}, ${y}`;
  }

  /* ─── state ─── */

  let items = [];
  let reels = [];
  let active = -1;
  let soundOn = true; // reels play with sound; her tap carries over from reel to reel
  let sectionVisible = false;
  let musicHushed = false;
  let opened = !document.getElementById("entry"); // curtains already gone?
  const MAX_REELS = 600; // ~40 rounds of 15 — "endless" without an unbounded DOM

  fetch("static/data/reels.json")
    .then((r) => r.json())
    .then((data) => {
      items = (data.items || []).filter((i) => i.id && i.type === "video");
      // chronological — the story in the order it actually happened
      items.sort(
        (a, b) => (a.takenAt || "").localeCompare(b.takenAt || "") || a.name.localeCompare(b.name, undefined, { numeric: true })
      );
      if (!items.length) {
        section.style.display = "none";
        return;
      }
      appendRound();
      observeSection();
      // warm the opening reel's poster and headers so the first swipe-in is instant
      ensurePoster(reels[0]);
      ensurePoster(reels[1]);
      ensureSrc(reels[0], opened ? "auto" : "metadata");
      if (opened && reels[1]) ensureSrc(reels[1], "metadata");
    })
    .catch(() => {
      section.style.display = "none";
    });

  /* ─── one reel ─── */

  function buildReel(item, index) {
    const el = document.createElement("article");
    el.className = "reel";
    el.dataset.index = index;

    // a blurred still fills the frame behind clips that aren't 9:16 — its
    // image is only fetched once the clip turns out to be landscape
    const back = document.createElement("div");
    back.className = "reel-back";
    el.appendChild(back);

    // no poster yet: 15 posters (and 15 backdrops) used to load the moment
    // the page did. ensurePoster() sets them for the active reel ±2 only
    const video = document.createElement("video");
    video.className = "reel-video";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.setAttribute("muted", "");
    video.loop = true;
    video.preload = "none";
    video.disableRemotePlayback = true;
    el.appendChild(video);

    const spinner = document.createElement("span");
    spinner.className = "reel-spinner";
    el.appendChild(spinner);

    const paused = document.createElement("span");
    paused.className = "reel-paused";
    paused.textContent = "▶";
    el.appendChild(paused);

    const veil = document.createElement("div");
    veil.className = "reel-veil";
    const cap = document.createElement("p");
    cap.className = "reel-caption";
    if (item.takenAt) {
      const taken = new Date(item.takenAt);
      cap.textContent = dateLabel(taken);
      veil.appendChild(cap);
      const month = document.createElement("span");
      month.className = "reel-month";
      month.textContent = `ika-${monthsAt(taken)} buwan natin`;
      veil.appendChild(month);
    } else {
      cap.textContent = "isang maliit na pelikula natin";
      veil.appendChild(cap);
    }
    el.appendChild(veil);

    const snd = document.createElement("button");
    snd.type = "button";
    snd.className = "reel-sound";
    snd.setAttribute("aria-label", "Toggle sound");
    snd.innerHTML = soundOn ? ICON_ON : ICON_MUTED;
    snd.classList.toggle("on", soundOn);
    el.appendChild(snd);

    const progress = document.createElement("span");
    progress.className = "reel-progress";
    const bar = document.createElement("i");
    progress.appendChild(bar);
    el.appendChild(progress);

    const reel = { el, video, item, index, bar, snd, back, fallback: false, posterSet: false };

    video.addEventListener("waiting", () => el.classList.add("buffering"));
    video.addEventListener("playing", () => el.classList.remove("buffering", "paused"));
    video.addEventListener("pause", () => {
      if (index === active && sectionVisible && !video.ended) el.classList.add("paused");
    });
    video.addEventListener("timeupdate", () => {
      if (video.duration) bar.style.transform = `scaleX(${(video.currentTime / video.duration).toFixed(4)})`;
    });
    video.addEventListener("loadedmetadata", () => {
      const landscape = video.videoWidth > video.videoHeight;
      el.classList.toggle("landscape", landscape);
      if (landscape && !back.style.backgroundImage) back.style.backgroundImage = `url("${posterUrl(item.id, 320)}")`;
    });
    video.addEventListener("error", () => {
      if (video.getAttribute("src")) useFallback(reel);
    });

    snd.addEventListener("click", (e) => {
      e.stopPropagation();
      setSound(!soundOn);
      flashGlyph(el);
    });

    /* tap = sound (or resume, if autoplay was refused) · double-tap = hearts.
       a swipe that ends on the reel must not count as a tap */
    let downX = 0;
    let downY = 0;
    let lastTap = 0;
    let tapTimer = null;
    el.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    el.addEventListener("pointerup", (e) => {
      if (e.target === snd || snd.contains(e.target)) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) return;
      const now = performance.now();
      if (now - lastTap < 320) {
        clearTimeout(tapTimer);
        lastTap = 0;
        heartBurst(el, e.clientX, e.clientY);
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(() => {
        if (index !== active) return;
        if (video.paused && !reel.fallback) {
          play(reel);
        } else {
          setSound(!soundOn);
          flashGlyph(el);
        }
      }, 330);
    });

    return reel;
  }

  /* ─── the endless feed: another round of clips whenever the end is near ─── */

  function appendRound() {
    if (reels.length >= MAX_REELS) return;
    const start = reels.length;
    items.forEach((item, k) => {
      const reel = buildReel(item, start + k);
      reels.push(reel);
      feed.appendChild(reel.el);
      reelObserver.observe(reel.el);
    });
  }

  /* ─── streaming window: active ± 1 hold a src, active ± 2 hold a poster ─── */

  function ensurePoster(reel) {
    if (!reel || reel.posterSet) return;
    reel.posterSet = true;
    reel.video.poster = posterUrl(reel.item.id, 900);
  }

  function ensureSrc(reel, preload) {
    if (!reel || reel.fallback) return;
    const v = reel.video;
    if (!v.getAttribute("src")) v.src = streamUrl(reel.item.id);
    if (v.preload !== "auto") v.preload = preload; // never downgrade a reel that's already buffering
  }

  function releaseSrc(reel) {
    if (!reel || reel.fallback) return;
    const v = reel.video;
    if (!v.getAttribute("src")) return;
    v.pause();
    v.removeAttribute("src");
    v.load(); // closes the stream and frees its buffer
    v.preload = "none";
    reel.bar.style.transform = "scaleX(0)";
    reel.el.classList.remove("buffering", "paused");
  }

  function useFallback(reel) {
    if (reel.fallback) return;
    reel.fallback = true;
    const v = reel.video;
    v.pause();
    v.removeAttribute("src");
    v.load();
    reel.el.classList.add("fallback");
    reel.el.classList.remove("buffering", "paused");
    const frame = document.createElement("iframe");
    frame.className = "reel-frame";
    frame.src = embedUrl(reel.item.id);
    frame.allow = "autoplay; fullscreen";
    frame.allowFullscreen = true;
    frame.title = "video";
    reel.el.appendChild(frame);
  }

  function play(reel) {
    if (!reel || reel.fallback) return;
    ensureSrc(reel, "auto");
    const v = reel.video;
    v.muted = !soundOn;
    v.play()
      .then(() => {
        hushMusic(true); // the reels have the floor, sound or not
        silenceOtherClips();
      })
      .catch(() => {
        // sound was refused without a fresh gesture — play silent, let her tap
        if (!v.muted) {
          v.muted = true;
          soundOn = false;
          paintSound();
          v.play().catch(() => reel.el.classList.add("paused"));
        } else {
          reel.el.classList.add("paused");
        }
      });
  }

  function pause(reel) {
    if (!reel || reel.fallback) return;
    if (!reel.video.paused) reel.video.pause();
    reel.el.classList.remove("paused");
  }

  function setActive(i) {
    if (i === active || !reels[i]) return;
    active = i;
    if (i >= reels.length - 2) appendRound(); // keep the bottom out of reach
    reels.forEach((r, k) => {
      const d = Math.abs(k - i);
      if (d <= 2) ensurePoster(r);
      if (d === 0) {
        if (sectionVisible && (!reduced || soundOn)) play(r);
        else ensureSrc(r, "auto");
      } else if (d === 1) {
        pause(r);
        r.video.muted = true;
        ensureSrc(r, k === i + 1 ? "auto" : "metadata"); // the next one buffers ahead
      } else {
        releaseSrc(r);
      }
    });
    if (reduced && !soundOn) reels[i].el.classList.add("paused");
    prevBtn.disabled = i === 0;
  }

  /* ─── sound: the reels have the floor ─── */

  // the song goes fully silent while the feed is on screen (not just
  // ducked), and comes back when she scrolls on. it never touches the
  // song's play/pause state, so her own music toggle still means what it says
  function hushMusic(on) {
    if (typeof fadeMusic !== "function" || typeof music === "undefined") return;
    if (on && !musicHushed) {
      musicHushed = true;
      if (!music.paused) fadeMusic(0, 400);
    } else if (!on && musicHushed) {
      musicHushed = false;
      if (!music.paused) fadeMusic(0.65, 900);
    }
  }

  // any other clip on the page that's playing out loud steps aside too
  function silenceOtherClips() {
    document.querySelectorAll("video").forEach((v) => {
      if (v.closest(".reel") || v.paused || v.muted) return;
      v.pause();
    });
  }

  function paintSound() {
    reels.forEach((r) => {
      r.snd.innerHTML = soundOn ? ICON_ON : ICON_MUTED;
      r.snd.classList.toggle("on", soundOn);
    });
  }

  function setSound(on) {
    soundOn = on;
    reels.forEach((r) => {
      r.video.muted = !on || r.index !== active;
    });
    paintSound();
    const cur = reels[active];
    if (on && cur && cur.video.paused && sectionVisible) play(cur);
  }

  function flashGlyph(el) {
    if (reduced) return;
    const g = document.createElement("span");
    g.className = "reel-glyph";
    g.innerHTML = soundOn ? ICON_ON : ICON_MUTED;
    el.appendChild(g);
    g.addEventListener("animationend", () => g.remove());
  }

  function heartBurst(el, clientX, clientY) {
    if (reduced) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    for (let i = 0; i < 7; i++) {
      const h = document.createElement("span");
      h.className = "reel-heart";
      h.textContent = "♥";
      h.style.cssText =
        `left:${x}px;top:${y}px;` +
        `--dx:${((Math.random() - 0.5) * 140).toFixed(0)}px;` +
        `--r:${((Math.random() - 0.5) * 50).toFixed(0)}deg;` +
        `animation-delay:${(i * 0.06).toFixed(2)}s;` +
        `font-size:${(1.6 + Math.random() * 1.4).toFixed(2)}rem;`;
      el.appendChild(h);
      h.addEventListener("animationend", () => h.remove());
    }
    // on the anniversary, the whole page joins in
    if (typeof window.burstConfetti === "function" && document.body.classList.contains("theme-anniversary")) {
      window.burstConfetti(clientX, clientY, 18);
    }
  }

  /* ─── which reel is in the frame ─── */

  const reelObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) setActive(Number(e.target.dataset.index));
      });
    },
    { root: feed, threshold: 0.6 }
  );

  // ?reel=N#open+reels lands the feed on reel N straight away (0-based) —
  // for previewing a particular clip, or deep-linking one
  let startAt = Number(new URLSearchParams(location.search).get("reel"));
  if (!Number.isInteger(startAt) || startAt < 0) startAt = -1;

  function observeSection() {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          sectionVisible = e.isIntersecting;
          if (sectionVisible) {
            if (startAt >= 0) {
              const target = startAt;
              startAt = -1;
              while (reels.length <= target + 2 && reels.length < MAX_REELS) appendRound();
              feed.scrollTo({ top: target * feed.clientHeight, behavior: "auto" });
              return; // the reel observer takes it from here
            }
            if (active < 0) setActive(0);
            else if (!reduced || soundOn) play(reels[active]);
          } else {
            reels.forEach(pause);
            hushMusic(false); // the song returns as she scrolls on
          }
        });
      },
      { threshold: 0.35 }
    ).observe(phone);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      reels.forEach(pause);
      hushMusic(false);
    } else if (sectionVisible && active >= 0 && (!reduced || soundOn)) {
      play(reels[active]);
    }
  });

  /* ─── navigation ─── */

  function scrollToReel(i) {
    if (!reels[i]) return;
    feed.scrollTo({ top: i * feed.clientHeight, behavior: reduced ? "auto" : "smooth" });
  }

  prevBtn.addEventListener("click", () => scrollToReel(active - 1));
  nextBtn.addEventListener("click", () => scrollToReel(active + 1));

  document.addEventListener("keydown", (e) => {
    if (!sectionVisible || active < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      scrollToReel(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      scrollToReel(active - 1);
    } else if (e.key === "m" || e.key === "M") {
      setSound(!soundOn);
    }
  });

  // once the curtains part, let the first two reels buffer quietly so
  // the feed is already playing by the time she scrolls down to it
  const openBtn = document.getElementById("open-btn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      opened = true;
      setTimeout(() => {
        if (active >= 0) return; // she's already in the feed — the window logic owns the streams now
        ensureSrc(reels[0], "auto");
        if (reels[1]) ensureSrc(reels[1], "metadata");
      }, 1200);
    });
  }
})();
