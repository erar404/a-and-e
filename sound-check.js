/* ════════════════════════════════════════════
   "sound check" — a quick 5-second preview of the site's theme song
   (static/music.mp3). A fixed phrase, no arguments, purely local: it's
   never sent as a real chat message, same document-level capture-phase
   interception "play"/"jipiti" use in yt-player.js/jipiti.js — this
   runs before chat.js's own #composer submit listener gets a chance to
   read and clear the textarea.
   ════════════════════════════════════════════ */

(() => {
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const attachPreviewEl = document.getElementById("attach-preview");
  if (!composer || !input) return;

  const SOUND_CHECK_RE = /^sound\s*check$/i;
  const PREVIEW_MS = 5000;

  let audio = null;
  let stopTimer = null;
  let pillEl = null;

  function stopPreview() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (pillEl) {
      const el = pillEl;
      pillEl = null;
      el.classList.remove("show");
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 350);
    }
  }

  function showPill() {
    const el = document.createElement("div");
    el.className = "sound-check-pill";
    el.innerHTML = `<span aria-hidden="true">🔊</span> sound check…`;
    el.addEventListener("click", stopPreview);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    pillEl = el;
  }

  function playPreview() {
    stopPreview(); // restart cleanly if triggered again mid-preview
    if (!audio) audio = new Audio("static/music.mp3");
    audio.currentTime = 0;
    audio.play().catch(() => {});
    showPill();
    stopTimer = setTimeout(stopPreview, PREVIEW_MS);
  }

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target !== composer) return;
      if (attachPreviewEl && !attachPreviewEl.hidden) return; // a captioned photo sends normally
      const raw = input.value.trim();
      if (!SOUND_CHECK_RE.test(raw)) return;

      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      input.style.height = "auto";
      playPreview();
    },
    true
  );
})();
