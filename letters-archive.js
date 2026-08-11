/* ════════════════════════════════════════════
   "basahin muli ang mga naunang sulat" — an on-demand archive of every
   past monthsary letter. monthsary-timer.js's envelope only ever shows
   the CURRENT month's letter, once, on the day itself; this reuses the
   same static/data/monthsary.json (already fetched by monthsary.js,
   exposed as window.MONTHSARY) so every month written so far stays
   readable anytime, picked from a row of month tabs.
   ════════════════════════════════════════════ */

(() => {
  const openBtn = document.getElementById("letters-archive-open");
  const backdrop = document.getElementById("letters-archive-backdrop");
  const modal = document.getElementById("letters-archive-modal");
  const closeBtn = document.getElementById("letters-archive-close");
  const tabsEl = document.getElementById("letters-archive-tabs");
  const salutationEl = document.getElementById("letters-archive-salutation");
  const titleEl = document.getElementById("letters-archive-title");
  const bodyEl = document.getElementById("letters-archive-body");
  const signEl = document.getElementById("letters-archive-sign");
  if (!openBtn || !backdrop || !modal || !tabsEl) return;
  if (typeof MONTHSARY === "undefined") return;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

  const ordinalEn = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function varsFor(n) {
    const info = MONTHSARY.countInfo(n) || {};
    return {
      count: n,
      name: info.name || `Ika-${n} Buwan`,
      nameLower: (info.name || "").toLowerCase(),
      english: info.english || `${n} months`,
      ordinalEn: info.ordinalEn || ordinalEn(n),
    };
  }

  let months = [];
  let active = null;

  function availableMonths() {
    const data = MONTHSARY.data;
    if (!data || !data.months) return [];
    return Object.keys(data.months)
      .map(Number)
      .filter((n) => data.months[n] && data.months[n].letter && n <= MONTHSARY.count)
      .sort((a, b) => a - b);
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    months.forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "letters-tab" + (n === active ? " active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(n === active));
      btn.textContent = varsFor(n).name;
      btn.addEventListener("click", () => selectMonth(n));
      tabsEl.appendChild(btn);
    });
  }

  function selectMonth(n) {
    active = n;
    renderTabs();
    const raw = MONTHSARY.data.months[n].letter;
    const vars = varsFor(n);
    salutationEl.textContent = fill(raw.salutation || "Mahal,", vars);
    titleEl.innerHTML = (raw.titleLines || []).map((l) => esc(fill(l, vars))).join("<br />");
    bodyEl.innerHTML = (raw.paragraphs || [])
      .map((p) =>
        typeof p === "string"
          ? `<p>${esc(fill(p, vars))}</p>`
          : `<p class="aside">${esc(fill(p.aside || "", vars))}</p>`
      )
      .join("");
    signEl.textContent = raw.sign ? fill(raw.sign, vars) : "";
    modal.scrollTop = 0;
  }

  function openArchive() {
    months = availableMonths();
    if (!months.length) return;
    backdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      modal.classList.add("visible");
    });
    selectMonth(months[months.length - 1]); // most recent letter first
  }

  function closeArchive() {
    backdrop.classList.remove("visible");
    modal.classList.remove("visible");
    setTimeout(() => {
      backdrop.hidden = true;
      modal.hidden = true;
    }, 400);
  }

  openBtn.addEventListener("click", () => {
    MONTHSARY.ready.then(openArchive);
  });
  closeBtn.addEventListener("click", closeArchive);
  backdrop.addEventListener("click", closeArchive);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeArchive();
  });
})();
