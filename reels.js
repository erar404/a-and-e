/* ════════════════════════════════════════════
   Anniversareels — an Instagram-Reels-style vertical feed of our little
   films, streamed straight from the shared Google Drive folder, opened
   from a "Reels Ka Muna, Mahal" invitation rather than sitting inline in
   the page's own scroll.
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

   Sound: the reels play *with* sound — while the modal is open the song
   fades to silence and any other clip pauses, and the reel's own audio
   takes over. Tap to mute/unmute; it comes back the moment she closes
   the modal. If the browser refuses unmuted autoplay (iOS, no fresh
   gesture) the reel plays silent and one tap turns it on.

   The feed never ends: when she nears the last reel another round of
   the same clips is appended, so it just keeps going, like the real thing.

   Autoplay: every reel starts moving the moment it's on screen, always
   muted first (the one autoplay guarantee every browser honors), then
   sound layers on top automatically if she's left it on, quietly falling
   back to muted (never showing a play icon) if a browser's autoplay-with-
   sound policy says no this time, mainly iOS Safari on a clip she hasn't
   tapped directly. A direct tap always gets sound immediately, since
   that's a real gesture the policy always allows.

   Preloading: the next reel isn't just hinted at with preload="auto" —
   it's actually played (muted, invisible) for a frame and rested back at
   0, forcing real buffering instead of a hint the browser might
   deprioritize. The one after that gets the lighter preload="auto" hint
   too, so even a fast swipe has a head start.

   Preloaded on entry: the moment she opens the curtains ("buksan mo"),
   the first five clips start buffering in the background — same
   real-play-and-pause trick as the single "next" reel used to get, just
   applied to five at once — so the first stretch of the story is
   usually already sitting in the browser's buffer by the time she taps
   the invitation, with nothing left to wait on. Everything past that
   fifth clip stays fully lazy, built only once she actually opens it.

   Gestures: swipe or scroll for the next reel · tap to mute · double-tap
   to shower it with hearts · Escape or the ✕ closes the modal.
   ════════════════════════════════════════════ */

(() => {
  const section = document.getElementById("reels");
  if (!section) return;

  const openBtn = document.getElementById("reels-open");
  const backdrop = document.getElementById("reels-modal-backdrop");
  const modal = document.getElementById("reels-modal");
  const closeBtn = document.getElementById("reels-modal-close");
  const feed = document.getElementById("reels-feed");
  const prevBtn = document.getElementById("reels-prev");
  const nextBtn = document.getElementById("reels-next");
  if (!openBtn || !backdrop || !modal || !closeBtn || !feed) return;

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

  /* ─── sweet nothings — a random pair of hashtags per reel, standing in
     for the date/month caption this used to show ─── */

  const SWEET_TAGS = [
    "#tayongdalawa", "#mahalkita", "#mahalnamahal", "#atin", "#kilig",
    "#kiligtothebones", "#forever", "#foreverandever", "#soulmateko",
    "#ikawna", "#mineforever", "#ourstory", "#lovebirds",
    "#cutenessoverload", "#bestfriendforever", "#alwaysyou", "#onlyyou",
    "#thisisus", "#partnersforlife", "#homeisyou", "#latenightkwento",
    "#myperson", "#happysaiyo", "#hanggangdulo",
  ];

  function pickTags(n) {
    const pool = [...SWEET_TAGS];
    const picked = [];
    for (let i = 0; i < n && pool.length; i++) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  /* ─── state ─── */

  let items = [];
  let reels = [];
  let active = -1;
  let soundOn = true; // reels play with sound; her tap carries over from reel to reel
  let modalOpen = false;
  let musicHushed = false;
  let ready = false; // reels.json has resolved with at least one clip
  let built = false; // the reel elements exist yet (only ever built once)
  let entered = !document.getElementById("entry"); // curtains already open?
  let wantsOpen = false; // she tapped before reels.json was ready — open the instant it is
  const MAX_REELS = 600; // ~40 rounds of 15 — "endless" without an unbounded DOM
  const PRELOAD_COUNT = 5; // how many clips get buffered the moment she enters the site

  // ?reel=N previews a particular clip straight away (0-based) by opening
  // the modal itself the moment the data's ready — handy for testing or
  // sharing a link to one clip, without needing the invitation click.
  // Number(null) is 0, not NaN, so the param's absence has to be checked
  // explicitly — otherwise every ordinary visit would "deep-link" to 0
  // and the modal would auto-open on its own, every single time
  const reelParam = new URLSearchParams(location.search).get("reel");
  let startAt = reelParam === null ? -1 : Number(reelParam);
  if (!Number.isInteger(startAt) || startAt < 0) startAt = -1;

  // reels.json itself is tiny — worth fetching up front just to know
  // whether there's anything to show (and to hide the invitation
  // entirely if not). the heavy part, building 15+ video elements and
  // streaming, waits for openModal()
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
      ready = true;
      maybePreload();
      if (startAt >= 0) requestOpen(false);
      else if (wantsOpen) requestOpen(true);
    })
    .catch(() => {
      section.style.display = "none";
    });

  // once she's actually entered the site ("buksan mo") and reels.json has
  // resolved, whichever happens last, build the feed and start buffering
  // the first few clips — nothing is visible yet (the modal stays
  // hidden), but a hidden <video> still buffers over the network just
  // fine, so by the time she taps the invitation it's already loaded
  function maybePreload() {
    if (!ready || !entered || built) return;
    built = true;
    appendRound();
    const count = Math.min(PRELOAD_COUNT, reels.length);
    for (let k = 0; k < count; k++) {
      ensurePoster(reels[k]);
      prewarm(reels[k]);
    }
  }

  const curtainBtn = document.getElementById("open-btn");
  if (curtainBtn) {
    curtainBtn.addEventListener("click", () => {
      entered = true;
      maybePreload();
    });
  }

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

    // no poster yet: ensurePoster() sets it for the active reel ±2 only
    const video = document.createElement("video");
    video.className = "reel-video";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", ""); // older iOS Safari wanted this exact name
    video.muted = true;
    video.setAttribute("muted", "");
    video.autoplay = true; // belt-and-suspenders in case a play() call ever gets missed
    video.loop = true;
    video.preload = "none";
    video.disableRemotePlayback = true; // no cast/AirPlay affordance
    video.disablePictureInPicture = true; // no floating PiP icon
    video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback noplaybackrate");
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
    const tags = document.createElement("p");
    tags.className = "reel-tags";
    tags.textContent = pickTags(2).join(" ");
    veil.appendChild(tags);
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
      if (index === active && modalOpen && !video.ended) el.classList.add("paused");
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
    video.addEventListener("ended", () => {
      // loop=true should make this unreachable, but if some engine ever
      // lets a reel run dry, this restarts it right where a native loop
      // would have, so nothing ever stops moving until she swipes
      video.currentTime = 0;
      video.play().catch(() => {});
    });

    snd.addEventListener("click", (e) => {
      e.stopPropagation();
      setSound(!soundOn, { fromGesture: true });
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
          play(reel, { fromGesture: true }); // her tap - sound can start right away
        } else {
          setSound(!soundOn, { fromGesture: true });
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

  /* ─── streaming window: active + 2 forward hold a src, +/-2 hold a poster ─── */

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

  function prewarm(reel) {
    if (!reel || reel.fallback) return;
    ensureSrc(reel, "auto");
    const v = reel.video;
    if (v.readyState >= 3 || !v.paused) return; // already buffered, or already running
    v.muted = true;
    v.play()
      .then(() => {
        requestAnimationFrame(() => {
          if (!v.paused) {
            v.pause();
            v.currentTime = 0; // rested at the start, ready to resume instantly
          }
        });
      })
      .catch(() => {}); // harmless if refused, the preload hint above still applies
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

  function play(reel, { fromGesture = false } = {}) {
    if (!reel || reel.fallback) return;
    ensureSrc(reel, "auto");
    const v = reel.video;

    if (fromGesture && soundOn) {
      // a real tap, the browser always allows sound synchronously here
      v.muted = false;
      v.play()
        .then(() => {
          hushMusic(true);
          silenceOtherClips();
        })
        .catch(() => {
          // even a direct tap couldn't get sound (unusual), at least keep it moving
          v.muted = true;
          v.play()
            .then(() => {
              hushMusic(true);
              silenceOtherClips();
            })
            .catch(() => reel.el.classList.add("paused"));
        });
      return;
    }

    // muted playback is the one autoplay guarantee every browser honors,
    // so it always starts this way first, sound (when she's left it on)
    // is layered on top as a second, best-effort step, so a policy
    // rejection never leaves the play icon showing or the picture frozen
    v.muted = true;
    v.play()
      .then(() => {
        hushMusic(true); // the reels have the floor, sound or not
        silenceOtherClips();
        if (soundOn) unmuteReel(reel);
      })
      .catch(() => {
        reel.el.classList.add("paused"); // truly nothing could play, rare
      });
  }

  function unmuteReel(reel) {
    if (reel.index !== active) return; // she may have already swiped past it
    const v = reel.video;
    v.muted = false;
    // some engines quietly re-pause an autoplaying clip the instant it's
    // unmuted without a fresh tap on it specifically, if that happens, it
    // just goes back to muted and keeps playing, not back to a play icon
    requestAnimationFrame(() => {
      if (v.paused && reel.index === active) {
        v.muted = true;
        v.play().catch(() => {});
      }
    });
  }

  function pause(reel) {
    if (!reel || reel.fallback) return;
    if (!reel.video.paused) reel.video.pause();
    reel.el.classList.remove("paused");
  }

  function setActive(i, fromGesture) {
    if (i === active || !reels[i]) return;
    active = i;
    if (i >= reels.length - 2) appendRound(); // keep the bottom out of reach
    reels.forEach((r, k) => {
      const d = k - i; // signed: positive = ahead, negative = behind
      const ad = Math.abs(d);
      if (ad <= 2) ensurePoster(r);
      if (d === 0) {
        if (modalOpen && (!reduced || soundOn)) play(r, { fromGesture: !!fromGesture });
        else ensureSrc(r, "auto");
      } else if (d === 1) {
        // the very next reel: a real (invisible) play+pause forces actual
        // buffering, not just a preload hint, a swipe should never wait
        pause(r);
        r.video.muted = true;
        prewarm(r);
      } else if (d === 2) {
        // one further ahead: lighter touch, just gets the connection warm
        ensureSrc(r, "auto");
      } else if (d === -1) {
        pause(r);
        r.video.muted = true;
        ensureSrc(r, "metadata");
      } else {
        releaseSrc(r);
      }
    });
    if (reduced && !soundOn) reels[i].el.classList.add("paused");
    prevBtn.disabled = i === 0;
  }

  /* ─── sound: the reels have the floor ─── */

  // the song goes fully silent while the modal is open (not just ducked),
  // and comes back when it closes. it never touches the song's own
  // play/pause state, so her own music toggle still means what it says
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

  function setSound(on, opts) {
    soundOn = on;
    reels.forEach((r) => {
      r.video.muted = !on || r.index !== active;
    });
    paintSound();
    const cur = reels[active];
    if (on && cur && cur.video.paused && modalOpen) play(cur, opts);
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
        const idx = Number(e.target.dataset.index);
        if (e.isIntersecting) {
          setActive(idx);
        } else if (idx === active) {
          // she's swiped away — stop this one immediately rather than
          // waiting on the next reel to officially become active
          pause(reels[idx]);
        }
      });
    },
    { root: feed, threshold: 0.6 }
  );

  /* ─── the modal itself ─── */

  // she may tap the invitation before reels.json has resolved (a slow
  // connection, or she's simply fast) — that tap must not just vanish;
  // it's remembered and fulfilled the instant the data is ready
  function requestOpen(fromGesture) {
    if (!ready) {
      wantsOpen = true;
      return;
    }
    wantsOpen = false;
    openModal(fromGesture);
  }

  function openModal(fromGesture) {
    if (!built) {
      built = true;
      appendRound();
    }
    modalOpen = true;
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      modal.classList.add("visible");
    });
    if (active < 0) {
      const target = startAt >= 0 ? startAt : 0;
      startAt = -1;
      while (reels.length <= target + 2 && reels.length < MAX_REELS) appendRound();
      if (target > 0) feed.scrollTo({ top: target * feed.clientHeight, behavior: "auto" }); // reelObserver's setActive takes it from here
      else setActive(0, fromGesture);
    } else if (!reduced || soundOn) {
      play(reels[active], { fromGesture: !!fromGesture }); // reopening — resume right where she left off
    }
  }

  function closeModal() {
    if (modal.hidden) return;
    modalOpen = false;
    backdrop.classList.remove("visible");
    modal.classList.remove("visible");
    reels.forEach(pause);
    hushMusic(false);
    setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
    }, 400);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      reels.forEach(pause);
      hushMusic(false);
    } else if (modalOpen && active >= 0 && (!reduced || soundOn)) {
      play(reels[active]);
    }
  });

  /* ─── navigation ─── */

  function scrollToReel(i) {
    if (!reels[i]) return;
    feed.scrollTo({ top: i * feed.clientHeight, behavior: reduced ? "auto" : "smooth" });
  }

  openBtn.addEventListener("click", () => requestOpen(true)); // a real tap — sound can start right away
  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  prevBtn.addEventListener("click", () => scrollToReel(active - 1));
  nextBtn.addEventListener("click", () => scrollToReel(active + 1));

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    if (active < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      scrollToReel(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      scrollToReel(active - 1);
    } else if (e.key === "m" || e.key === "M") {
      setSound(!soundOn, { fromGesture: true });
    }
  });
})();
