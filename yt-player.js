/* ════════════════════════════════════════════
   "play <youtube link OR text>" — a small audio-only play bar.
   Video and playlist links play directly with no API key (the official
   IFrame Player API handles both, including advancing through a
   playlist's own sequence). Anything else after "play " is treated as a
   search: the YouTube Data API (key in yt-config.js, see README) returns
   the top 5 matches in an overlay so you can pick which one plays.
   ════════════════════════════════════════════ */

(() => {
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const attachPreviewEl = document.getElementById("attach-preview");
  const bar = document.getElementById("yt-bar");
  const thumbEl = document.getElementById("yt-thumb");
  const prevBtn = document.getElementById("yt-prev");
  const playPauseBtn = document.getElementById("yt-playpause");
  const nextBtn = document.getElementById("yt-next");
  const titleEl = document.getElementById("yt-title");
  const seekEl = document.getElementById("yt-seek");
  const curTimeEl = document.getElementById("yt-time-cur");
  const durTimeEl = document.getElementById("yt-time-dur");
  const muteBtn = document.getElementById("yt-mute");
  const closeBtn = document.getElementById("yt-close");
  const searchOverlay = document.getElementById("yt-search-overlay");
  const searchStatus = document.getElementById("yt-search-status");
  const searchList = document.getElementById("yt-search-list");
  const searchClose = document.getElementById("yt-search-close");
  if (!composer || !input || !bar) return;
  if (!searchOverlay || !searchStatus || !searchList || !searchClose) return;

  const PLAY_RE = /^play\s+(.+)$/i;

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

  let isPlaylist = false; // prev/next only mean anything once a playlist is loaded

  function playYouTube(parsed) {
    isPlaylist = !!parsed.playlistId;
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
    prevBtn.disabled = !isPlaylist;
    nextBtn.disabled = !isPlaylist;
  }

  function hideBar() {
    bar.hidden = true;
    isPlaylist = false;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
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
    prevBtn.disabled = true;
    nextBtn.disabled = true;
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

  prevBtn.addEventListener("click", () => {
    if (player && typeof player.previousVideo === "function") player.previousVideo();
  });

  nextBtn.addEventListener("click", () => {
    if (player && typeof player.nextVideo === "function") player.nextVideo();
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
  // textarea synchronously at the top of its handler. "play " followed by
  // anything at all is treated as a command now — a real link plays
  // directly, plain text triggers a search — so it never falls through to
  // a normal chat send once it matches.

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target !== composer) return;
      if (attachPreviewEl && !attachPreviewEl.hidden) return; // a captioned photo sends normally
      const raw = input.value.trim();
      const match = raw.match(PLAY_RE);
      if (!match) return;
      const query = match[1].trim();
      if (!query) return;

      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      input.style.height = "auto";

      const parsed = parseYouTubeUrl(query);
      if (parsed) playYouTube(parsed);
      else searchYouTube(query);
    },
    true
  );

  // ─── "play <text>" search — top 5 results, you pick ───

  function showSearchStatus(message) {
    searchOverlay.hidden = false;
    searchStatus.textContent = message;
    searchStatus.hidden = false;
    searchList.hidden = true;
    searchList.innerHTML = "";
  }

  function hideSearchOverlay() {
    searchOverlay.hidden = true;
  }

  function renderSearchResults(items) {
    searchList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "yt-search-item";

      const thumb = document.createElement("img");
      thumb.className = "yt-search-thumb";
      thumb.alt = "";
      thumb.loading = "lazy";
      if (item.thumb) thumb.src = item.thumb;

      const meta = document.createElement("span");
      meta.className = "yt-search-meta";

      const itemTitle = document.createElement("span");
      itemTitle.className = "yt-search-item-title";
      itemTitle.textContent = item.title || "";

      const itemChannel = document.createElement("span");
      itemChannel.className = "yt-search-item-channel";
      itemChannel.textContent = item.channel || "";

      meta.append(itemTitle, itemChannel);
      btn.append(thumb, meta);
      btn.addEventListener("click", () => {
        hideSearchOverlay();
        playYouTube({ videoId: item.videoId, playlistId: null });
      });
      li.appendChild(btn);
      searchList.appendChild(li);
    });
    searchStatus.hidden = true;
    searchList.hidden = false;
  }

  async function searchYouTube(query) {
    showSearchStatus("naghahanap, mahal…");

    const key = window.YOUTUBE_API_KEY;
    if (!key) {
      showSearchStatus("hindi pa naka-set up ang YouTube search, mahal ♡");
      return;
    }

    let data;
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "5");
      url.searchParams.set("q", query);
      url.searchParams.set("key", key);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`yt search ${res.status}`);
      data = await res.json();
    } catch {
      showSearchStatus("hindi ma-search ngayon, mahal, subukan mo mamaya ♡");
      return;
    }

    const items = (data.items || [])
      .map((it) => ({
        videoId: it.id && it.id.videoId,
        title: it.snippet && it.snippet.title,
        channel: it.snippet && it.snippet.channelTitle,
        thumb:
          it.snippet &&
          it.snippet.thumbnails &&
          (it.snippet.thumbnails.default || it.snippet.thumbnails.medium || {}).url,
      }))
      .filter((it) => it.videoId);

    if (!items.length) {
      showSearchStatus(`wala akong nahanap para kay “${query}”, mahal ♡`);
      return;
    }
    renderSearchResults(items);
  }

  searchClose.addEventListener("click", hideSearchOverlay);
  searchOverlay.addEventListener("click", (e) => {
    if (e.target === searchOverlay) hideSearchOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !searchOverlay.hidden) hideSearchOverlay();
  });
})();
