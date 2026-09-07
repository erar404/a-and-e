/* ════════════════════════════════════════════
   Arrange & Express — the public disguise. Reads as a generic AI tone
   formatter to anyone who lands on it. Two things underneath are real:

   1. Sign In (top right) — same Supabase accounts chat.html uses
      (Erwin/Alliah, password = their birthdate). Correct credentials
      redirect straight into index.html, the actual site.
   2. "Format Text" genuinely calls the "jipiti" bridge (see jipiti.js /
      jipiti/main.py) — it only works while signed in (main.py checks
      the caller is a real chat_members row), so a stranger poking at
      the form just gets the generic failure message below. Someone
      already signed in, though, can use this page as a quiet way to
      ask ChatGPT something without ever opening the real chat — same
      spirit as the hidden "jipiti"/"play" composer commands there.
   ════════════════════════════════════════════ */

(() => {
  const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
  const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";
  const ACCOUNTS = { Erwin: "erwin@eanda.chat", Alliah: "alliah@eanda.chat" };
  const GPT_BOT_SENDER_ID = "fb893ccc-5c16-4d6b-9042-62b139f2b6bc";

  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  const yearEl = document.getElementById("af-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ─── sign in modal ─── */

  const signInOpenBtn = document.getElementById("signin-open");
  const signInBackdrop = document.getElementById("signin-backdrop");
  const signInModal = document.getElementById("signin-modal");
  const signInClose = document.getElementById("signin-close");
  const signInForm = document.getElementById("signin-form");
  const signInUsername = document.getElementById("signin-username");
  const signInPassword = document.getElementById("signin-password");
  const signInError = document.getElementById("signin-error");

  function openSignIn() {
    signInError.hidden = true;
    signInPassword.value = "";
    signInBackdrop.hidden = false;
    signInModal.hidden = false;
    setTimeout(() => signInPassword.focus(), 60);
  }

  function closeSignIn() {
    signInBackdrop.hidden = true;
    signInModal.hidden = true;
  }

  signInOpenBtn?.addEventListener("click", openSignIn);
  signInClose?.addEventListener("click", closeSignIn);
  signInBackdrop?.addEventListener("click", closeSignIn);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && signInModal && !signInModal.hidden) closeSignIn();
  });

  signInForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    signInError.hidden = true;

    if (!sb) {
      signInError.textContent = "Service unavailable — please try again later.";
      signInError.hidden = false;
      return;
    }

    const email = ACCOUNTS[signInUsername.value];
    const { error } = await sb.auth.signInWithPassword({
      email,
      password: signInPassword.value.trim(),
    });

    if (error) {
      signInError.textContent = "Incorrect username or password.";
      signInError.hidden = false;
      signInPassword.select();
      return;
    }

    window.location.href = "index.html";
  });

  /* ─── tone multi-select dropdown ─── */

  const toneToggle = document.getElementById("tone-toggle");
  const tonePanel = document.getElementById("tone-panel");
  const toneLabel = document.getElementById("tone-label");
  const otherCheck = document.getElementById("tone-other-check");
  const otherInput = document.getElementById("tone-other-input");
  const toneChecks = tonePanel ? Array.from(tonePanel.querySelectorAll('input[type="checkbox"]')) : [];

  function setTonePanelOpen(open) {
    tonePanel.hidden = !open;
    toneToggle.setAttribute("aria-expanded", String(open));
  }

  toneToggle?.addEventListener("click", () => setTonePanelOpen(tonePanel.hidden));

  document.addEventListener("click", (e) => {
    if (tonePanel && !tonePanel.hidden && !e.target.closest(".tone-dropdown")) setTonePanelOpen(false);
  });

  function updateToneLabel() {
    const names = toneChecks
      .filter((c) => c.checked && c !== otherCheck)
      .map((c) => c.value);
    if (otherCheck.checked && otherInput.value.trim()) names.push(otherInput.value.trim());
    toneLabel.textContent = names.length ? names.join(", ") : "Select tone(s)";
  }

  otherCheck?.addEventListener("change", () => {
    otherInput.hidden = !otherCheck.checked;
    if (otherCheck.checked) otherInput.focus();
    updateToneLabel();
  });
  otherInput?.addEventListener("input", updateToneLabel);
  toneChecks.forEach((c) => c !== otherCheck && c.addEventListener("change", updateToneLabel));

  function getSelectedTones() {
    const names = toneChecks
      .filter((c) => c.checked && c !== otherCheck)
      .map((c) => c.value);
    if (otherCheck.checked && otherInput.value.trim()) names.push(otherInput.value.trim());
    return names;
  }

  /* ─── statement field: auto-grow + live word count ─── */

  const statementInput = document.getElementById("statement-input");
  const extraInput = document.getElementById("extra-input");
  const statementCount = document.getElementById("statement-count");

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  document.querySelectorAll(".af-autogrow").forEach((el) => {
    el.addEventListener("input", () => autoGrow(el));
    autoGrow(el);
  });

  function updateStatementCount() {
    const words = statementInput.value.trim().split(/\s+/).filter(Boolean).length;
    statementCount.textContent = `${words} word${words === 1 ? "" : "s"}`;
  }
  statementInput?.addEventListener("input", updateStatementCount);
  updateStatementCount();

  /* ─── format action → jipiti ─── */

  const formatBtn = document.getElementById("format-btn");
  const formatBtnLabel = document.getElementById("format-btn-label");
  const kbdHint = document.getElementById("kbd-hint");
  const resultBox = document.getElementById("result-box");
  const resultStatusDot = document.getElementById("result-status-dot");
  const resultSkeleton = document.getElementById("result-skeleton");
  const resultText = document.getElementById("result-text");
  const resultTextContent = document.getElementById("result-text-content");
  const resultCaret = document.getElementById("result-caret");
  const resultStopBtn = document.getElementById("result-stop");
  const resultActions = document.getElementById("result-actions");
  const resultCopyBtn = document.getElementById("result-copy");
  const resultCopyLabel = document.getElementById("result-copy-label");
  const resultRegenerateBtn = document.getElementById("result-regenerate");

  // ⌘+Enter (Ctrl+Enter elsewhere) submits, same convention as every
  // chat/AI tool this page is impersonating.
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || "");
  if (kbdHint) kbdHint.textContent = `${isMac ? "⌘" : "Ctrl"}+Enter to format`;
  [statementInput, extraInput].forEach((el) => {
    el?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        submitFormat();
      }
    });
  });

  let waitingChannel = null;
  let waitTimeout = null;
  let cancelStreaming = null;
  let lastPrompt = null;
  let isBusy = false;
  let currentFullText = "";

  function stopWaiting() {
    if (waitingChannel && sb) {
      sb.removeChannel(waitingChannel);
      waitingChannel = null;
    }
    if (waitTimeout) {
      clearTimeout(waitTimeout);
      waitTimeout = null;
    }
    if (cancelStreaming) {
      cancelStreaming();
      cancelStreaming = null;
    }
  }

  function setBusy(busy) {
    isBusy = busy;
    formatBtn.disabled = busy;
    formatBtnLabel.textContent = busy ? "Formatting…" : "Format Text";
  }

  // reveals `text` in word-sized chunks with a little randomized pacing
  // per chunk — reads like tokens arriving from a live model instead of
  // a uniform typewriter. total time is capped so long replies don't
  // drag; returns a canceller that leaves whatever was shown so far.
  function streamInto(el, text, onDone) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      el.textContent = text;
      onDone();
      return () => {};
    }

    const tokens = text.match(/\S+\s*/g) || [text];
    const totalMs = Math.min(1800, Math.max(280, tokens.length * 55));
    const baseMs = totalMs / tokens.length;
    let shown = 0;
    let stopped = false;
    let timeoutId = null;

    function step() {
      if (stopped) return;
      shown++;
      el.textContent = tokens.slice(0, shown).join("");
      if (shown < tokens.length) {
        timeoutId = setTimeout(step, baseMs * (0.5 + Math.random()));
      } else {
        onDone();
      }
    }
    timeoutId = setTimeout(step, baseMs);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }

  function showThinking() {
    resultBox.hidden = false;
    resultStatusDot.hidden = false;
    resultActions.hidden = true;
    resultSkeleton.hidden = false;
    resultText.hidden = true;
    resultStopBtn.hidden = true;
  }

  function beginStreaming(text) {
    currentFullText = text;
    resultSkeleton.hidden = true;
    resultText.hidden = false;
    resultTextContent.textContent = "";
    resultCaret.hidden = false;
    resultStopBtn.hidden = false;
    cancelStreaming = streamInto(resultTextContent, text, finishStreaming);
  }

  function finishStreaming() {
    cancelStreaming = null;
    resultCaret.hidden = true;
    resultStopBtn.hidden = true;
    resultStatusDot.hidden = true;
    resultActions.hidden = false;
    setBusy(false);
  }

  function showError(message) {
    stopWaiting();
    resultSkeleton.hidden = true;
    resultStatusDot.hidden = true;
    resultStopBtn.hidden = true;
    resultActions.hidden = true;
    resultText.hidden = false;
    resultCaret.hidden = true;
    resultTextContent.textContent = message;
    setBusy(false);
  }

  resultStopBtn?.addEventListener("click", () => {
    if (cancelStreaming) cancelStreaming();
    resultTextContent.textContent = currentFullText;
    finishStreaming();
  });

  resultCopyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultTextContent.textContent);
      resultCopyLabel.textContent = "Copied";
      resultCopyBtn.classList.add("is-copied");
      setTimeout(() => {
        resultCopyLabel.textContent = "Copy";
        resultCopyBtn.classList.remove("is-copied");
      }, 1400);
    } catch {
      // clipboard access blocked (permissions, insecure context) — nothing more to do
    }
  });

  resultRegenerateBtn?.addEventListener("click", () => {
    if (!isBusy && lastPrompt) runFormat(lastPrompt);
  });

  const GENERIC_FAILURE = "Something went wrong. Please try again later.";

  async function runFormat(prompt) {
    lastPrompt = prompt;
    stopWaiting();
    setBusy(true);
    showThinking();

    if (!sb) {
      showError(GENERIC_FAILURE);
      return;
    }

    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      showError(GENERIC_FAILURE);
      return;
    }

    waitingChannel = sb
      .channel(`format-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          if (payload.new.sender_id !== GPT_BOT_SENDER_ID) return;
          if (waitTimeout) {
            clearTimeout(waitTimeout);
            waitTimeout = null;
          }
          if (waitingChannel && sb) {
            sb.removeChannel(waitingChannel);
            waitingChannel = null;
          }
          beginStreaming(payload.new.body);
        }
      )
      .subscribe();

    waitTimeout = setTimeout(() => showError(GENERIC_FAILURE), 20000);

    try {
      await fetch("/api/jipiti", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });
    } catch {
      showError(GENERIC_FAILURE);
    }
  }

  function submitFormat() {
    if (isBusy) return;
    const statement = statementInput.value.trim();
    if (!statement) {
      statementInput.focus();
      return;
    }
    const tones = getSelectedTones();
    if (!tones.length) {
      setTonePanelOpen(true);
      toneToggle.focus();
      return;
    }

    let prompt = `Rewrite the following statement in ${tones.length > 1 ? "these tones" : "this tone"}: ${tones.join(", ")}.`;
    const extra = extraInput.value.trim();
    if (extra) prompt += ` ${extra}`;
    prompt += `\n\nStatement: "${statement}"`;

    runFormat(prompt);
  }

  formatBtn?.addEventListener("click", submitFormat);
})();
