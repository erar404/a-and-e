/* ════════════════════════════════════════════
   boss-key style disguise: swap the screen for something that reads as
   a boring VDI/Zoom session at a glance. Toggle with the floating
   button or the Escape key.

   Three states, chosen automatically and kept in sync as login/call
   state changes underneath:
   - functional chat skin (body.vdi-skin-chat): logged into the chat,
     no call running — the REAL messages and composer stay live, just
     reskinned as the full Zoom Workplace chat shell. Typing still works.
   - functional call skin (body.vdi-skin-call): a full-screen call is
     active — the REAL local/remote video, mute/cam/hangup all stay
     live, reskinned as a Zoom gallery view (two equal tiles) instead of
     the romantic big-feed-plus-heart layout.
   - full block (#vdi-overlay): only when there's nothing safe to leave
     live at all — still on the login gate.

   A minimized call (chat.js shrinks it to a small draggable bubble) is
   deliberately treated as the CHAT skin, not the call skin: the whole
   point of minimizing is that the real chat underneath is fully
   visible/usable again, so it should read as ordinary disguised chat,
   not a meeting room, with the small bubble (mute/hangup + a live
   avatar ring) floating on top regardless of which skin is under it.
   chat.js auto-minimizes as soon as this file's call skin would
   otherwise come on for an active call — see the MutationObserver on
   document.body's class list over there.
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
  const composerInput = document.getElementById("composer-input");
  const zoomList = document.getElementById("vdi-zoom-list");
  const chatHeaderTitleEl = document.getElementById("vdi-chat-header-title");
  const chatHeaderIconEl = document.getElementById("vdi-chat-header-icon");
  if (!chrome || !overlay || !toggleBtn || !chatHeaderEl) return;

  const STORAGE_KEY = "vdiDisguiseOn";
  const leaveBtns = overlay.querySelectorAll("[data-vdi-leave]");

  // the real placeholder ("sabihin mo, mahal...") gives the game away the
  // moment the composer is empty — swap it for the fake channel's while
  // the chat skin is up, stash the real one the first time so it can
  // come back exactly as it was
  const DISGUISE_PLACEHOLDER = "Write a message or type / for more";
  let realPlaceholder = null;
  function setChatSkinPlaceholder(on) {
    if (!composerInput) return;
    if (on) {
      if (realPlaceholder === null) realPlaceholder = composerInput.placeholder;
      composerInput.placeholder = DISGUISE_PLACEHOLDER;
    } else if (realPlaceholder !== null) {
      composerInput.placeholder = realPlaceholder;
    }
  }

  // the fake chat list (desktop only, see vdi-zoom-list in chat.css) is
  // clickable purely for cover: picking a different name there just
  // relabels the disguised header, no real chat data changes — the real
  // messages/composer underneath stay pointed at the real conversation
  const DEFAULT_ROW_NAME = chatHeaderTitleEl ? chatHeaderTitleEl.textContent.trim() : "Meeting Chat";
  function selectZoomListRow(row) {
    if (!zoomList || !row) return;
    zoomList.querySelectorAll(".vdi-zoom-list-row.active").forEach((r) => r.classList.remove("active"));
    row.classList.add("active");
    if (chatHeaderTitleEl) chatHeaderTitleEl.textContent = row.dataset.vdiName || row.textContent.trim();
    if (chatHeaderIconEl) {
      const avatarBg = row.querySelector(".vdi-zoom-avatar")?.style.background;
      chatHeaderIconEl.style.background = avatarBg || "";
    }
  }
  function resetZoomList() {
    if (!zoomList) return;
    const defaultRow = zoomList.querySelector(`.vdi-zoom-list-row[data-vdi-name="${DEFAULT_ROW_NAME}"]`);
    selectZoomListRow(defaultRow || zoomList.querySelector(".vdi-zoom-list-row"));
  }
  zoomList?.addEventListener("click", (e) => {
    const row = e.target.closest(".vdi-zoom-list-row");
    if (row) selectZoomListRow(row);
  });

  // every other decorative bit of the Zoom shell (topbar icons, rail
  // items, list-head controls, filters, header action icons, tabs) is
  // wired to one of the app's real, already-implemented features rather
  // than left as inert chrome — [data-vdi-action="<id>"] in chat.html
  // names which real button to proxy a click through to, and each one
  // carries a `title` so hovering reveals what it actually does, the
  // same "you have to go looking for it" spirit as the "play"/"jipiti"
  // composer commands. Only ever reachable while the functional chat
  // skin is on (these elements are display:none otherwise), so the real
  // chat is always genuinely live/logged-in underneath by the time one
  // of these can be clicked.
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-vdi-action]");
    if (!trigger) return;
    document.getElementById(trigger.dataset.vdiAction)?.click();
  });

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
    // a minimized call already shrinks to a small bubble that leaves the
    // real page fully visible underneath (see chat.js) — so for skin
    // purposes it counts as "not on a call" the same as chatVisible below,
    // rather than pulling in the full-screen meeting-room skin
    const callFullScreen = callActive && !callOverlayEl.classList.contains("minimized");
    const chatVisible = !!(chatEl && !chatEl.hidden);

    document.body.classList.remove("vdi-skin-chat", "vdi-skin-call");
    chatHeaderEl.hidden = true;
    if (callHeaderEl) callHeaderEl.hidden = true;
    watchCallLabel(false);
    setChatSkinPlaceholder(false);

    if (callFullScreen) {
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
      setChatSkinPlaceholder(true);
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
      // "class" too, not just "hidden" — that's how minimizeCall()/restoreCall()
      // signal the minimized state this now reacts to above
      if (callOverlayEl) modeObserver.observe(callOverlayEl, { attributes: true, attributeFilter: ["hidden", "class"] });
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
    setChatSkinPlaceholder(false);
    resetZoomList();
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
