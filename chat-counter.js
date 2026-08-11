/* ════════════════════════════════════════════
   "the chat count" section — total messages ever exchanged in Usap Tayo,
   fetched via a SECURITY DEFINER RPC (public.chat_message_count) that
   only ever returns a number: RLS still fully protects the messages
   themselves, this function just counts rows without exposing any of
   them, so it's safe to call from this public, unauthenticated page.
   Counts up into view once the section is scrolled to, same spirit as
   the deck's deal-in animation in script.js.
   ════════════════════════════════════════════ */

(() => {
  const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
  const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";

  const section = document.getElementById("chatcount");
  const numEl = document.getElementById("chatcount-num");
  if (!section || !numEl) return;

  function animateTo(target) {
    if (typeof reduceMotion !== "undefined" && reduceMotion) {
      numEl.textContent = target.toLocaleString();
      return;
    }
    const duration = 1400;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      numEl.textContent = Math.round(target * eased).toLocaleString();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const countPromise = fetch(`${SUPABASE_URL}/rest/v1/rpc/chat_message_count`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((count) => (typeof count === "number" ? count : null))
    .catch(() => null);

  let played = false;
  new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || played) return;
        played = true;
        observer.disconnect();
        countPromise.then((count) => {
          if (count !== null) animateTo(count);
          else numEl.textContent = "♡"; // quietly graceful if the fetch ever fails
        });
      });
    },
    { threshold: 0.4 }
  ).observe(section);
})();
