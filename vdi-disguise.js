/* ════════════════════════════════════════════
   boss-key style disguise: swap the screen for something that reads as
   a boring VDI/Zoom session at a glance. Toggle with the floating
   button or the Escape key.

   Three states, chosen automatically and kept in sync as login/call
   state changes underneath:
   - functional chat skin (body.vdi-skin-chat): logged into the chat,
     no call running — the REAL messages and composer stay live, just
     reskinned as a flat Zoom chat transcript. Typing still works.
   - functional call skin (body.vdi-skin-call): a call is active — the
     REAL local/remote video, mute/cam/hangup all stay live, reskinned
     as a Zoom gallery view (two equal tiles) instead of the romantic
     big-feed-plus-heart layout.
   - full block (#vdi-overlay): only when there's nothing safe to leave
     live at all — still on the login gate.
   ════════════════════════════════════════════ */

(() => {
  const chrome = document.getElementById("vdi-chrome");
  const overlay = document.getElementById("vdi-overlay");
  const toggleBtn = document.getElementById("vdi-toggle");
  const clockEl = document.getElementById("vdi-clock");
  const chatEl = document.getElementById("chat");
  const callOverlayEl = document.getElementById("call-overlay");
  const chatHeaderEl = document.getElementById("vdi-chat-header");
  const chatHeaderCloseBtn = document.getElementById("vdi-chat-header-close");
  const callHeaderEl = document.getElementById("vdi-call-header");
  const callHeaderCloseBtn = document.getElementById("vdi-call-header-close");
  const callNameEl = document.getElementById("call-name");
  const callLabelRemoteEl = document.getElementById("vdi-call-label-remote");
  if (!chrome || !overlay || !toggleBtn || !chatHeaderEl) return;

  const STORAGE_KEY = "vdiDisguiseOn";
  const leaveBtns = overlay.querySelectorAll("[data-vdi-leave]");

  // everything the full-block state is meant to hide should also be
  // unreachable by keyboard/screen-reader while it's up — but only in
  // that state; both functional skins need the real thing underneath
  // to stay interactive
  const coveredEls = Array.from(document.body.children).filter(
    (el) => el !== chrome && el !== overlay && el !== toggleBtn && el.tagName !== "SCRIPT"
  );
  function setCovered(isInert) {
    coveredEls.forEach((el) => { el.inert = isInert; });
  }

  let disguiseOn = false;
  let clockHandle = null;
  let modeObserver = null;
  let callLabelObserver = null;

  const pad = (n) => String(n).padStart(2, "0");
  function tickClock() {
    const now = new Date();
    clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  function startClock() {
    tickClock();
    clockHandle = setInterval(tickClock, 15000);
  }
  function stopClock() {
    clearInterval(clockHandle);
    clockHandle = null;
  }

  // the other person's real name already lives in #call-name (chat.js
  // keeps it current through ringing/connecting/connected) — just
  // mirror it into the tile label rather than duplicating that logic
  function syncCallLabel() {
    if (callLabelRemoteEl && callNameEl) {
      callLabelRemoteEl.textContent = callNameEl.textContent.trim() || "Participant";
    }
  }
  function watchCallLabel(on) {
    if (callLabelObserver) {
      callLabelObserver.disconnect();
      callLabelObserver = null;
    }
    if (on && callNameEl && callLabelRemoteEl) {
      syncCallLabel();
      callLabelObserver = new MutationObserver(syncCallLabel);
      callLabelObserver.observe(callNameEl, { characterData: true, childList: true, subtree: true });
    }
  }

  // ─── decide which of the three states applies right now, and react
  // live if login/call state changes while disguise stays on ───

  function refreshMode({ flicker = false } = {}) {
    if (!disguiseOn) return;
    const callActive = !!(callOverlayEl && !callOverlayEl.hidden);
    const chatVisible = !!(chatEl && !chatEl.hidden);

    document.body.classList.remove("vdi-skin-chat", "vdi-skin-call");
    chatHeaderEl.hidden = true;
    if (callHeaderEl) callHeaderEl.hidden = true;
    watchCallLabel(false);

    if (callActive) {
      overlay.hidden = true;
      setCovered(false);
      document.body.classList.add("vdi-skin-call");
      if (callHeaderEl) callHeaderEl.hidden = false;
      watchCallLabel(true);
    } else if (chatVisible) {
      overlay.hidden = true;
      setCovered(false);
      document.body.classList.add("vdi-skin-chat");
      chatHeaderEl.hidden = false;
    } else {
      overlay.hidden = false;
      setCovered(true);
      if (flicker) {
        void overlay.offsetWidth; // restart the animation on every switch
        overlay.classList.add("connecting");
        setTimeout(() => overlay.classList.remove("connecting"), 380);
      }
    }
  }

  function activate({ flicker = true, persist = true } = {}) {
    disguiseOn = true;
    chrome.hidden = false;
    startClock();
    refreshMode({ flicker });
    if (!modeObserver) {
      modeObserver = new MutationObserver(() => refreshMode({ flicker: true }));
      if (chatEl) modeObserver.observe(chatEl, { attributes: true, attributeFilter: ["hidden"] });
      if (callOverlayEl) modeObserver.observe(callOverlayEl, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (persist) sessionStorage.setItem(STORAGE_KEY, "1");
  }

  function deactivate() {
    disguiseOn = false;
    if (modeObserver) {
      modeObserver.disconnect();
      modeObserver = null;
    }
    watchCallLabel(false);
    chrome.hidden = true;
    overlay.hidden = true;
    chatHeaderEl.hidden = true;
    if (callHeaderEl) callHeaderEl.hidden = true;
    document.body.classList.remove("vdi-skin-chat", "vdi-skin-call");
    setCovered(false);
    stopClock();
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function toggle() {
    if (disguiseOn) deactivate();
    else activate();
  }

  toggleBtn.addEventListener("click", toggle);
  leaveBtns.forEach((btn) => btn.addEventListener("click", deactivate));
  chatHeaderCloseBtn?.addEventListener("click", deactivate);
  callHeaderCloseBtn?.addEventListener("click", deactivate);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle();
  });

  // the inline script right after the disguise markup already flipped
  // #vdi-chrome/#vdi-overlay visible on reload if the session flag was
  // set — pick up from there without replaying the connect flicker;
  // refreshMode() will then upgrade to whichever functional skin fits
  // once chat.js finishes logging in (and/or a call turns out to be live)
  if (!overlay.hidden || !chrome.hidden) {
    activate({ flicker: false, persist: false });
  }
})();
