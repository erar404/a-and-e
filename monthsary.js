/* ════════════════════════════════════════════
   Monthsary engine — tuwing ika-11, hatinggabi
   (PH time), kusang nagpapalit ang mga salita:
   ang mga titulo, ang liham, ang tema, at ang
   mga bagong bubuksang tula.
   Lahat ng salita: static/data/monthsary.json
   Preview ng kahit anong buwan: ?month=N
   ════════════════════════════════════════════ */

window.MONTHSARY = (() => {
  const TZ = "Asia/Manila";
  const FALLBACK_START = "2025-10-11"; // keep in sync with "start" in monthsary.json
  const preview = Number(new URLSearchParams(location.search).get("month")) || 0;

  const state = { count: 1, day: 0, data: null };

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

  // months since the start; ticks over at midnight of every 11th
  function computeCount(startISO) {
    const [sy, sm, sd] = startISO.slice(0, 10).split("-").map(Number);
    const t = phToday();
    return Math.max(1, (t.y - sy) * 12 + (t.m - sm) + (t.d >= sd ? 0 : -1));
  }

  const ordinalEn = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function countInfo(n) {
    const hit = state.data && state.data.counts && state.data.counts[n];
    if (hit) return hit;
    // a month beyond the mapping — add it to monthsary.json for proper Tagalog
    return {
      name: `Ika-${n} Buwan`,
      titleLines: [`Ika-${n}`, "Buwan"],
      english: `${n} months`,
      ordinalEn: ordinalEn(n),
    };
  }

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const fill = (tpl, vars) =>
    String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

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

  function resolve(key) {
    const custom = state.data && state.data.months && state.data.months[state.count];
    if (custom && key in custom) return custom[key];
    return state.data && state.data.defaults ? state.data.defaults[key] : null;
  }

  function themeFor(n) {
    const custom = state.data && state.data.months && state.data.months[n];
    if (custom && custom.theme != null) return custom.theme;
    return n >= 12 ? "anniversary" : "";
  }

  function applyTheme() {
    const body = document.body;
    [...body.classList].forEach((c) => c.startsWith("theme-") && body.classList.remove(c));
    const theme = themeFor(state.count);
    if (theme) body.classList.add(`theme-${theme}`);
    body.dataset.month = state.count;
  }

  function applyTexts() {
    if (!state.data) return;
    const vars = varsFor(state.count);
    const text = (key) => {
      const v = resolve(key);
      return v == null ? null : fill(v, vars);
    };
    const setText = (sel, key) => {
      const el = document.querySelector(sel);
      const v = text(key);
      if (el && v != null) el.textContent = v;
    };

    const pageTitle = text("pageTitle");
    if (pageTitle) document.title = pageTitle;

    setText(".entry .kicker", "entryKicker");
    setText(".entry-sub", "entrySub");
    setText(".entry-hint", "entryHint");
    setText("#letter .kicker", "letterKicker");
    setText(".footer-note", "footerNote");

    // entry title: every line plain except the last, which leans italic
    const titleEl = document.querySelector(".entry-title");
    const lines = resolve("entryTitleLines") || countInfo(state.count).titleLines;
    if (titleEl && lines && lines.length) {
      const head = lines.slice(0, -1).map((l) => esc(fill(l, vars))).join("<br />");
      titleEl.innerHTML =
        (head ? head + "<br />" : "") + `<em>${esc(fill(lines[lines.length - 1], vars))}</em>`;
    }

    // the letter rebuilds itself from the month's entry
    const letter = resolve("letter");
    const letterEl = document.querySelector(".letter");
    if (letter && letterEl) {
      const paras = (letter.paragraphs || [])
        .map((p) =>
          typeof p === "string"
            ? `<p>${esc(fill(p, vars))}</p>`
            : `<p class="letter-aside">${esc(fill(p.aside || "", vars))}</p>`
        )
        .join("");
      const titleHtml = (letter.titleLines || [])
        .map((l) => esc(fill(l, vars)))
        .join("<br />");
      letterEl.innerHTML =
        `<p class="letter-salutation">${esc(fill(letter.salutation || "Mahal,", vars))}</p>` +
        `<h2 class="letter-title">${titleHtml}</h2>` +
        paras +
        (letter.sign ? `<p class="letter-sign">${esc(fill(letter.sign, vars))}</p>` : "");
    }
  }

  /* ─── the surprise on every 11th ─── */

  let greeted = false;

  function showGreeting() {
    if (greeted || !state.data) return;
    if (state.day !== 11 && !preview) return; // only on the day itself
    greeted = true;
    const msg = fill(
      resolve("greeting") || "happy {ordinalEn} monthsary, mahal ♡",
      varsFor(state.count)
    );
    const el = document.createElement("div");
    el.className = "monthsary-greeting";
    el.textContent = msg;
    document.body.appendChild(el);
    const leave = () => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 900);
    };
    el.addEventListener("click", leave);
    setTimeout(leave, 14000);
  }

  function celebrate() {
    if (typeof window.spawnPetal !== "function") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 24; i++) window.spawnPetal(i * 0.12);
  }

  /* if the page is open when the clock strikes twelve, everything flips live */
  function refresh() {
    state.day = phToday().d;
    if (preview) return;
    const next = computeCount((state.data && state.data.start) || FALLBACK_START);
    if (next === state.count) return;
    state.count = next;
    greeted = false;
    applyTheme();
    applyTexts();
    document.dispatchEvent(new CustomEvent("monthsary:change", { detail: { count: next } }));
    celebrate();
    if (!document.getElementById("entry")) showGreeting();
  }

  /* ─── boot ─── */

  state.day = phToday().d;
  state.count = preview || computeCount(FALLBACK_START);
  applyTheme(); // instant, so the anniversary dawn never flashes dark

  const ready = fetch("static/data/monthsary.json")
    .then((r) => r.json())
    .then((data) => {
      state.data = data;
      if (!preview) state.count = computeCount(data.start || FALLBACK_START);
      applyTheme();
      applyTexts();
    })
    .catch(() => {}); // no json? the words baked into the html stay

  setInterval(refresh, 20000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });

  // the greeting waits for the curtains to open
  const openBtn = document.getElementById("open-btn");
  if (openBtn) openBtn.addEventListener("click", () => setTimeout(showGreeting, 2800));

  return {
    ready,
    countInfo,
    get count() {
      return state.count;
    },
    get data() {
      return state.data;
    },
  };
})();
