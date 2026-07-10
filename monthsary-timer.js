/* ════════════════════════════════════════════
   Monthsary countdown — Usap Tayo edition
   Counts down to every 11th, hatinggabi (PH time).
   Shows a banner one day out, echoes it on the call
   screen in the final 10 minutes, and — the moment it
   hits zero — a sealed envelope starts drifting loose
   around the screen, closed, small, tappable wherever
   it happens to be. Tap it and it flies in from that
   exact spot, settles at the center, the wax seal
   cracks, and the letter grows up out of it.
   It keeps drifting (findable on every page) for the
   rest of that day, then tucks itself away again until
   next month.
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
  const LAND_MS = 900; // must roughly match the CSS .landing transition duration

  const banner = document.getElementById("monthsary-banner");
  const bannerName = document.getElementById("monthsary-banner-name");
  const bannerClock = document.getElementById("monthsary-banner-clock");
  const callOverlay = document.getElementById("call-overlay");
  const callTimer = document.getElementById("call-monthsary-timer");
  const callClock = document.getElementById("call-monthsary-clock");
  const flyHint = document.getElementById("monthsary-fly-hint");
  const backdrop = document.getElementById("monthsary-backdrop");
  const envelope = document.getElementById("monthsary-envelope");
  const letterCard = document.getElementById("monthsary-letter-card");
  const letterSalutation = document.getElementById("monthsary-letter-salutation");
  const letterTitle = document.getElementById("monthsary-letter-title");
  const letterBody = document.getElementById("monthsary-letter-body");
  const letterSign = document.getElementById("monthsary-letter-sign");
  const letterClose = document.getElementById("monthsary-letter-close");

  if (!envelope || !letterCard) return; // markup not present on this page

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

  let hintTimer = null;

  // sets the envelope loose, drifting and closed — this is the resting
  // state for the whole monthsary day, until it's tapped
  function startFlying(n) {
    if (!renderLetter(n)) return;
    if (banner) banner.hidden = true;
    if (callTimer) callTimer.hidden = true;
    letterCard.hidden = true;
    if (backdrop) {
      backdrop.classList.remove("visible");
      backdrop.hidden = true;
    }
    envelope.classList.remove("opened", "landing");
    envelope.style.animation = "";
    envelope.style.transform = "";
    envelope.hidden = false;

    if (flyHint) {
      flyHint.hidden = false;
      // restart the fade in/out cycle every time flight (re)starts
      flyHint.style.animation = "none";
      void flyHint.offsetWidth;
      flyHint.style.animation = "";
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        flyHint.hidden = true;
      }, 7300);
    }
  }

  let landTimer = null;

  // caught mid-flight — carries the exact envelope from wherever it was to
  // dead center, then unseals it
  function openLetter() {
    if (envelope.hidden) return;
    if (envelope.classList.contains("landing") || envelope.classList.contains("opened")) return;

    if (flyHint) flyHint.hidden = true;

    if (backdrop) {
      backdrop.hidden = false;
      requestAnimationFrame(() => backdrop.classList.add("visible"));
    }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      envelope.classList.add("landing", "opened");
      letterCard.hidden = false;
      return;
    }

    // freeze the envelope at its current mid-flight position so switching
    // off the looping animation doesn't make it jump, then transition it
    const current = getComputedStyle(envelope).transform;
    envelope.style.animation = "none";
    envelope.style.transform = current === "none" ? "translate(-50%, -50%)" : current;
    void envelope.offsetWidth; // force reflow before the class/transition change
    envelope.classList.add("landing");
    requestAnimationFrame(() => {
      envelope.style.transform = "translate(-50%, -50%)";
    });

    clearTimeout(landTimer);
    landTimer = setTimeout(() => {
      envelope.classList.add("opened");
      letterCard.hidden = false;
    }, LAND_MS);
  }

  envelope.addEventListener("click", openLetter);

  function closeLetter() {
    clearTimeout(landTimer);
    letterCard.hidden = true;
    if (backdrop) {
      backdrop.classList.remove("visible");
      setTimeout(() => {
        backdrop.hidden = true;
      }, 500);
    }
    // let it loose again, fresh, so it stays findable for the rest of the day
    envelope.classList.remove("opened", "landing");
    envelope.style.animation = "none";
    envelope.style.transform = "none";
    void envelope.offsetWidth;
    envelope.style.animation = "";
    envelope.style.transform = "";
  }

  if (letterClose) letterClose.addEventListener("click", closeLetter);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeLetter();
    });
  }

  // the envelope only drifts on the monthsary day itself, so it stays
  // reachable from any page all day, then quietly disappears until next month
  function updateAvailability() {
    const available = !!data && (phToday().d === 11 || debugOverrideMs != null);
    const mid = envelope.classList.contains("landing") || envelope.classList.contains("opened");
    if (!available && !mid) {
      envelope.hidden = true;
      if (flyHint) flyHint.hidden = true;
    }
  }

  function tick() {
    if (!data) return;

    updateAvailability();

    const remaining = targetMs - Date.now();

    if (remaining <= 0) {
      startFlying(targetCount);
      computeNextTarget();
      return;
    }

    const clockText = formatClock(remaining);

    if (banner) {
      if (remaining <= ONE_DAY_MS) {
        bannerName.textContent = countInfo(targetCount).name || "";
        bannerClock.textContent = clockText;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }

    if (callTimer) {
      const inCall = callOverlay && !callOverlay.hidden;
      if (inCall && remaining <= TEN_MIN_MS) {
        callClock.textContent = clockText;
        callTimer.hidden = false;
      } else {
        callTimer.hidden = true;
      }
    }
  }

  function boot() {
    computeNextTarget();
    if (debugOverrideMs != null) targetMs = Date.now() + debugOverrideMs; // ?monthsaryTestSeconds=N

    // catch up on a letter whose day already started while the tab was
    // closed, instead of only ever setting it loose the instant the page
    // happens to be open at exactly midnight
    if (phToday().d === 11 || debugOverrideMs != null) {
      startFlying(currentCount());
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
