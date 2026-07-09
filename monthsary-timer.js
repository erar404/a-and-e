/* ════════════════════════════════════════════
   Monthsary countdown — Usap Tayo edition
   Counts down to every 11th, hatinggabi (PH time).
   Shows a banner one day out, echoes it on the call
   screen in the final 10 minutes, and delivers that
   month's letter (from static/data/monthsary.json)
   the moment it hits zero.
   Debug: ?monthsaryTestSeconds=N forces the countdown
   to N seconds left, for trying the reveal without
   waiting for the real date.
   ════════════════════════════════════════════ */

(() => {
  const TZ = "Asia/Manila";
  const PH_OFFSET_MS = 8 * 60 * 60 * 1000; // fixed UTC+8, PH observes no DST
  const FALLBACK_START = "2025-10-11";
  const TEN_MIN_MS = 10 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const banner = document.getElementById("monthsary-banner");
  const bannerName = document.getElementById("monthsary-banner-name");
  const bannerClock = document.getElementById("monthsary-banner-clock");
  const callOverlay = document.getElementById("call-overlay");
  const callTimer = document.getElementById("call-monthsary-timer");
  const callClock = document.getElementById("call-monthsary-clock");
  const letterOverlay = document.getElementById("monthsary-letter");
  const letterSalutation = document.getElementById("monthsary-letter-salutation");
  const letterTitle = document.getElementById("monthsary-letter-title");
  const letterBody = document.getElementById("monthsary-letter-body");
  const letterSign = document.getElementById("monthsary-letter-sign");
  const letterClose = document.getElementById("monthsary-letter-close");

  if (!banner || !letterOverlay) return; // markup not present on this page

  const testSeconds = Number(new URLSearchParams(location.search).get("monthsaryTestSeconds"));
  const debugOverrideMs = Number.isFinite(testSeconds) && testSeconds > 0 ? testSeconds * 1000 : null;

  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function phToday() {
    const [y, m, d] = dateFmt.format(new Date()).split("-").map(Number);
    return { y, m, d };
  }

  // ms timestamp for 00:00:00 PH time on the given calendar date
  function phMidnightMs(y, m, d) {
    return Date.UTC(y, m - 1, d) - PH_OFFSET_MS;
  }

  const ordinalEn = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const fill = (tpl, vars) =>
    String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

  let data = null;
  let startY = 2025;
  let startM = 10;

  function countInfo(n) {
    const hit = data && data.counts && data.counts[n];
    if (hit) return hit;
    return { name: `Ika-${n} Buwan`, english: `${n} months`, ordinalEn: ordinalEn(n) };
  }

  function varsFor(n) {
    const info = countInfo(n);
    return {
      count: n,
      name: info.name,
      nameLower: info.name.toLowerCase(),
      english: info.english,
      ordinalEn: info.ordinalEn,
    };
  }

  function letterFor(n) {
    const custom = data && data.months && data.months[n] && data.months[n].letter;
    const base = custom || (data && data.defaults && data.defaults.letter);
    if (!base) return null;
    const vars = varsFor(n);
    return {
      salutation: fill(base.salutation || "Mahal,", vars),
      titleLines: (base.titleLines || []).map((l) => fill(l, vars)),
      paragraphs: (base.paragraphs || []).map((p) =>
        typeof p === "string" ? { text: fill(p, vars) } : { aside: fill(p.aside || "", vars) }
      ),
      sign: base.sign ? fill(base.sign, vars) : "",
    };
  }

  // the count that's active *today* — same rule the public site uses
  function currentCount() {
    const t = phToday();
    return Math.max(1, (t.y - startY) * 12 + (t.m - startM) + (t.d >= 11 ? 0 : -1));
  }

  let targetMs = null;
  let targetCount = null;

  function computeNextTarget() {
    const t = phToday();
    let ty = t.y;
    let tm = t.m;
    if (t.d >= 11) {
      tm += 1;
      if (tm > 12) {
        tm = 1;
        ty += 1;
      }
    }
    targetMs = phMidnightMs(ty, tm, 11);
    targetCount = (ty - startY) * 12 + (tm - startM);
  }

  function seenKey(n) {
    return `monthsary_seen_${n}`;
  }

  function hasSeen(n) {
    try {
      return localStorage.getItem(seenKey(n)) === "1";
    } catch {
      return false;
    }
  }

  function markSeen(n) {
    try {
      localStorage.setItem(seenKey(n), "1");
    } catch {
      // storage unavailable — worst case the letter can show again next load
    }
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return days > 0
      ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`
      : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }

  function renderLetter(n) {
    const letter = letterFor(n);
    if (!letter) return false;
    letterSalutation.textContent = letter.salutation;
    letterTitle.innerHTML = letter.titleLines.map((l) => esc(l)).join("<br />");
    letterBody.innerHTML = letter.paragraphs
      .map((p) =>
        "aside" in p ? `<p class="aside">${esc(p.aside)}</p>` : `<p>${esc(p.text)}</p>`
      )
      .join("");
    letterSign.textContent = letter.sign;
    return true;
  }

  function revealLetter(n) {
    if (!renderLetter(n)) return;
    banner.hidden = true;
    callTimer.hidden = true;
    letterOverlay.hidden = false;
  }

  letterClose.addEventListener("click", () => {
    letterOverlay.hidden = true;
  });
  letterOverlay.addEventListener("click", (e) => {
    if (e.target === letterOverlay) letterOverlay.hidden = true;
  });

  function tick() {
    if (!data) return;

    const remaining = targetMs - Date.now();

    if (remaining <= 0) {
      revealLetter(targetCount);
      markSeen(targetCount);
      computeNextTarget();
      return;
    }

    const clockText = formatClock(remaining);

    if (remaining <= ONE_DAY_MS) {
      bannerName.textContent = countInfo(targetCount).name || "";
      bannerClock.textContent = clockText;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    const inCall = callOverlay && !callOverlay.hidden;
    if (inCall && remaining <= TEN_MIN_MS) {
      callClock.textContent = clockText;
      callTimer.hidden = false;
    } else {
      callTimer.hidden = true;
    }
  }

  function boot() {
    computeNextTarget();
    if (debugOverrideMs != null) targetMs = Date.now() + debugOverrideMs; // ?monthsaryTestSeconds=N

    // first run ever on this device: seed the *current* (already-known) month
    // as "seen" so shipping this feature mid-cycle doesn't immediately pop a
    // letter they've already read — every month from here on plays normally
    let bootedBefore = true;
    try {
      bootedBefore = localStorage.getItem("monthsary_timer_booted") === "1";
      if (!bootedBefore) {
        localStorage.setItem("monthsary_timer_booted", "1");
      }
    } catch {
      // no storage — fall through, treated as already-booted (safer default)
    }
    if (!bootedBefore) markSeen(currentCount());

    // catch up on a letter that arrived while the tab was closed, instead of
    // only ever firing at the exact instant the page happens to be open
    const nowCount = currentCount();
    if (!hasSeen(nowCount)) {
      revealLetter(nowCount);
      markSeen(nowCount);
    }

    tick();
    setInterval(tick, 1000);
  }

  fetch("static/data/monthsary.json")
    .then((r) => r.json())
    .then((json) => {
      data = json;
      if (json.start) {
        const [sy, sm] = json.start.slice(0, 7).split("-").map(Number);
        startY = sy;
        startM = sm;
      }
      boot();
    })
    .catch(() => {}); // no json, no countdown — fails quiet, chat still works
})();
