/* ════════════════════════════════════════════
   "play <youtube link>" — a small audio-only play bar.
   Video and playlist links both work with no API key (the official
   IFrame Player API handles both, including advancing through a
   playlist's own sequence). Plain-title search is intentionally not
   supported yet — it needs the YouTube Data API and a key we don't have.
   ════════════════════════════════════════════ */

(() => {
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const attachPreviewEl = document.getElementById("attach-preview");
  const bar = document.getElementById("yt-bar");
  const thumbEl = document.getElementById("yt-thumb");
  const playPauseBtn = document.getElementById("yt-playpause");
  const titleEl = document.getElementById("yt-title");
  const seekEl = document.getElementById("yt-seek");
  const curTimeEl = document.getElementById("yt-time-cur");
  const durTimeEl = document.getElementById("yt-time-dur");
  const muteBtn = document.getElementById("yt-mute");
  const closeBtn = document.getElementById("yt-close");
  if (!composer || !input || !bar) return;

  const PLAY_RE = /^play\s+(\S+)\s*$/i;

  function parseYouTubeUrl(raw) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^www\./, "").replace(/^music\./, "");
    if (host !== "youtube.com" && host !== "youtu.be") return null;

    let videoId = null;
    const playlistId = url.searchParams.get("list") || null;

    if (host === "youtu.be") {
      videoId = url.pathname.slice(1).split("/")[0] || null;
    } else if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/")[2] || null;
    } else if (url.pathname !== "/playlist") {
      return null; // some other youtube.com page we don't handle
    }

    if (!videoId && !playlistId) return null;
    return { videoId, playlistId };
  }

  // ─── youtube iframe api, loaded lazily on first real use ───

  let apiPromise = null;
  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  let player = null; // created once, reused for every "play" after that

  function ensurePlayer() {
    if (player) return Promise.resolve(player);
    return loadYouTubeApi().then(
      () =>
        new Promise((resolve) => {
          player = new YT.Player("yt-audio-frame", {
            height: "1",
            width: "1",
            playerVars: {
              autoplay: 1,
              playsinline: 1,
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              origin: location.origin,
            },
            events: {
              onReady: () => resolve(player),
              onStateChange: onPlayerStateChange,
              onError: onPlayerError,
            },
          });
        })
    );
  }

  function playYouTube(parsed) {
    showBar();
    setBarLoading();
    ensurePlayer().then((p) => {
      if (parsed.playlistId) {
        p.loadPlaylist({ list: parsed.playlistId, listType: "playlist", index: 0 });
      } else {
        p.loadVideoById(parsed.videoId);
      }
    });
  }

  // ─── bar state ───

  function showBar() {
    bar.hidden = false;
    bar.classList.remove("error");
    playPauseBtn.disabled = false;
    seekEl.disabled = false;
  }

  function hideBar() {
    bar.hidden = true;
    stopProgressLoop();
  }

  function setBarLoading() {
    titleEl.textContent = "Kumukonekta…";
    thumbEl.removeAttribute("src");
    playPauseBtn.textContent = "⏸";
    playPauseBtn.setAttribute("aria-label", "I-pause");
  }

  function showBarError(message) {
    showBar();
    bar.classList.add("error");
    titleEl.textContent = message;
    thumbEl.removeAttribute("src");
    playPauseBtn.disabled = true;
    seekEl.disabled = true;
    stopProgressLoop();
  }

  function updateTrackInfo() {
    if (!player || typeof player.getVideoData !== "function") return;
    const data = player.getVideoData();
    if (data && data.title) {
      titleEl.textContent = data.title;
      if (data.video_id) thumbEl.src = `https://i.ytimg.com/vi/${data.video_id}/mqdefault.jpg`;
    }
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  let progressHandle = null;
  let seeking = false;

  function startProgressLoop() {
    stopProgressLoop();
    progressHandle = setInterval(() => {
      if (!player || typeof player.getCurrentTime !== "function") return;
      const dur = player.getDuration() || 0;
      const cur = player.getCurrentTime() || 0;
      seekEl.max = String(dur);
      if (!seeking) seekEl.value = String(cur);
      curTimeEl.textContent = formatTime(cur);
      durTimeEl.textContent = formatTime(dur);
    }, 500);
  }

  function stopProgressLoop() {
    clearInterval(progressHandle);
    progressHandle = null;
  }

  function onPlayerStateChange(e) {
    const state = e.data;
    const playing = state === YT.PlayerState.PLAYING;
    playPauseBtn.textContent = playing ? "⏸" : "▶";
    playPauseBtn.setAttribute("aria-label", playing ? "I-pause" : "I-play");
    if (playing || state === YT.PlayerState.CUED) updateTrackInfo();
    if (playing) startProgressLoop();
    else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) stopProgressLoop();
  }

  function onPlayerError(e) {
    const code = e.data;
    const message =
      code === 100
        ? "wala nang video na 'yan, mahal ♡"
        : code === 101 || code === 150
        ? "hindi pwedeng i-embed 'yan, mahal — baka pribado ♡"
        : "hindi ma-play 'yan, mahal, subukan mo ulit ♡";
    showBarError(message);
  }

  // ─── bar controls ───

  playPauseBtn.addEventListener("click", () => {
    if (!player || typeof player.getPlayerState !== "function") return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  });

  seekEl.addEventListener("input", () => { seeking = true; });
  seekEl.addEventListener("change", () => {
    seeking = false;
    if (player && typeof player.seekTo === "function") player.seekTo(Number(seekEl.value), true);
  });

  muteBtn.addEventListener("click", () => {
    if (!player || typeof player.isMuted !== "function") return;
    if (player.isMuted()) {
      player.unMute();
      muteBtn.textContent = "🔊";
      muteBtn.setAttribute("aria-label", "Patayin ang tunog");
    } else {
      player.mute();
      muteBtn.textContent = "🔇";
      muteBtn.setAttribute("aria-label", "Buksan ang tunog");
    }
  });

  closeBtn.addEventListener("click", () => {
    if (player && typeof player.stopVideo === "function") player.stopVideo();
    hideBar();
  });

  // ─── the "play" command itself ───
  // registered on document, capture phase: this runs before chat.js's own
  // submit listener on #composer, which otherwise reads and clears the
  // textarea synchronously at the top of its handler. only a genuine,
  // parseable youtube link gets intercepted — "play mo yung ganito" or a
  // bare "play" with no real link just falls through and sends normally.

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target !== composer) return;
      if (attachPreviewEl && !attachPreviewEl.hidden) return; // a captioned photo sends normally
      const raw = input.value.trim();
      const match = raw.match(PLAY_RE);
      if (!match) return;
      const parsed = parseYouTubeUrl(match[1]);
      if (!parsed) return;

      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      input.style.height = "auto";
      playYouTube(parsed);
    },
    true
  );
})();
