/* ════════════════════════════════════════════
   boss-key style disguise: swap the whole screen for
   something that reads as a boring VDI/Zoom session at a
   glance. Toggle with the floating button or the Escape key;
   "Leave" doubles as the way back, same as leaving any real call.
   ════════════════════════════════════════════ */

(() => {
  const STORAGE_KEY = "vdiDisguiseOn";

  const overlay = document.getElementById("vdi-overlay");
  const toggleBtn = document.getElementById("vdi-toggle");
  const leaveBtn = overlay?.querySelector("[data-vdi-leave]");
  const clockEl = document.getElementById("vdi-clock");
  const timerEl = document.getElementById("vdi-timer");
  const stage = document.getElementById("vdi-stage");
  if (!overlay || !toggleBtn) return;

  const ROSTER = [
    { initials: "RS", name: "R. Santos" },
    { initials: "MC", name: "M. Cruz" },
    { initials: "JD", name: "J. Dela Peña" },
    { initials: "You", name: "You" },
  ];

  stage.innerHTML = ROSTER.map(
    (p) => `
    <div class="vdi-tile${p.name === "You" ? " vdi-tile-you" : ""}">
      <span class="vdi-tile-avatar">${p.initials}</span>
      <span class="vdi-tile-name"><i aria-hidden="true">⦸</i>${p.name}</span>
    </div>`
  ).join("");

  // everything the overlay is meant to hide should also be unreachable by
  // keyboard/screen-reader while it's up, not just visually covered
  const coveredEls = Array.from(document.body.children).filter(
    (el) => el !== overlay && el !== toggleBtn && el.tagName !== "SCRIPT"
  );
  function setCovered(isInert) {
    coveredEls.forEach((el) => { el.inert = isInert; });
  }

  const pad = (n) => String(n).padStart(2, "0");

  let clockHandle = null;
  let timerHandle = null;
  let elapsedSec = 0;

  function tickClock() {
    const now = new Date();
    clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  function tickTimer() {
    elapsedSec += 1;
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;
    timerEl.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function startClocks() {
    elapsedSec = Math.floor(Math.random() * 900) + 120; // already mid-meeting
    tickClock();
    tickTimer();
    clockHandle = setInterval(tickClock, 15000);
    timerHandle = setInterval(tickTimer, 1000);
  }

  function stopClocks() {
    clearInterval(clockHandle);
    clearInterval(timerHandle);
  }

  function activate({ flicker = true, persist = true } = {}) {
    overlay.hidden = false;
    setCovered(true);
    if (flicker) {
      void overlay.offsetWidth; // restart the animation on every activation
      overlay.classList.add("connecting");
      setTimeout(() => overlay.classList.remove("connecting"), 380);
    }
    startClocks();
    if (persist) sessionStorage.setItem(STORAGE_KEY, "1");
  }

  function deactivate() {
    overlay.hidden = true;
    setCovered(false);
    stopClocks();
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function toggle() {
    if (overlay.hidden) activate();
    else deactivate();
  }

  toggleBtn.addEventListener("click", toggle);
  leaveBtn?.addEventListener("click", deactivate);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle();
  });

  // the inline script right after the overlay markup already flipped
  // overlay.hidden off on reload if the session flag was set — just
  // wire up the clocks here, no flicker (nothing "reconnected")
  if (!overlay.hidden) activate({ flicker: false, persist: false });
})();
