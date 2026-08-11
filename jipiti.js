/* ════════════════════════════════════════════
   "jipiti <prompt>" — asks ChatGPT and drops the reply into the chat for
   both of you to see. Unlike "play", the prompt itself is NOT intercepted:
   it sends as a completely normal message (so it's visible in the thread
   like anything else), and this just also pings the server-side bridge
   (POST /api/jipiti, proxied by nginx to jipiti/main.py — see that file
   and docker/entrypoint.sh) to fetch a reply and post it back as a new
   message from the dedicated GPT sender. The reply arrives through the
   chat's normal Realtime subscription, same as any other message.
   ════════════════════════════════════════════ */

(() => {
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const attachPreviewEl = document.getElementById("attach-preview");
  if (!composer || !input) return;

  const JIPITI_RE = /^jipiti\s+(.+)$/i;

  // capture phase on document, same trick yt-player.js uses: this runs
  // before chat.js's own #composer submit listener reads/clears the
  // textarea, so the raw text is still here to read. We never call
  // preventDefault — the message sends normally either way.
  document.addEventListener(
    "submit",
    (e) => {
      if (e.target !== composer) return;
      if (attachPreviewEl && !attachPreviewEl.hidden) return;
      const raw = input.value.trim();
      const match = raw.match(JIPITI_RE);
      if (!match) return;
      const prompt = match[1].trim();
      if (!prompt) return;
      askJipiti(prompt);
    },
    true
  );

  async function askJipiti(prompt) {
    if (typeof sb === "undefined" || !sb) return;
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return;

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
      // the prompt itself already sent as a normal message; a network
      // hiccup here just means no reply shows up, nothing more to do
    }
  }
})();
