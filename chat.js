/* ════════════════════════════════════════════
   Usap Tayo — private chat for the two of us
   Backend: Supabase (auth + chat_messages + realtime)
   ════════════════════════════════════════════ */

const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";

// the login screen shows names, never emails
const ACCOUNTS = { Erwin: "erwin@eanda.chat", Alliah: "alliah@eanda.chat" };

// asked once per browser session, before the two of us are even named
const ANNIVERSARY = "2025-10-11";

const loginEl = document.getElementById("login");
const chatEl = document.getElementById("chat");
const stepGate = document.getElementById("step-gate");
const gateInput = document.getElementById("gate-input");
const gateErr = document.getElementById("gate-err");
const stepWho = document.getElementById("step-who");
const stepPass = document.getElementById("step-pass");
const passName = document.getElementById("pass-name");
const passInput = document.getElementById("pass-input");
const loginErr = document.getElementById("login-err");
const loginNote = document.getElementById("login-note");
const messagesEl = document.getElementById("messages");
const chatSub = document.getElementById("chat-sub");
const composer = document.getElementById("composer");
const input = document.getElementById("composer-input");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachPreview = document.getElementById("attach-preview");
const attachPreviewImg = document.getElementById("attach-preview-img");
const attachRemove = document.getElementById("attach-remove");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const onlineDot = document.getElementById("online-dot");
const refreshBtn = document.getElementById("refresh-btn");
const typingWrap = document.getElementById("typing-wrap");
const typingLabel = document.getElementById("typing-label");
const partnerPlayingEl = document.getElementById("partner-playing");
const partnerPlayingText = document.getElementById("partner-playing-text");
const ytJamNotification = document.getElementById("yt-jam-notification");
const ytJamNameEl = document.getElementById("yt-jam-name");
const ytJamTitleEl = document.getElementById("yt-jam-title");
const ytJamJoinBtn = document.getElementById("yt-jam-join");
const ytJamDismissBtn = document.getElementById("yt-jam-dismiss");

let me = null; // my user id
let names = {}; // user_id -> display name
let selectedName = null;
let msgs = [];
let pendingFile = null; // image chosen but not yet sent

/* ─── tab title flashes while a new message waits, unread, on a background tab ─── */

const DEFAULT_TITLE = document.title;
let unreadTitleCount = 0;

function bumpUnreadTitle() {
  unreadTitleCount++;
  document.title = unreadTitleCount > 1 ? `(${unreadTitleCount}) Bagong mensahe ♡` : "💬 Bagong mensahe ♡";
}

function resetTitle() {
  unreadTitleCount = 0;
  document.title = DEFAULT_TITLE;
}

/* ─── login navigation: pure DOM, wired before anything can fail ─── */

function note(text) {
  loginNote.textContent = text || "";
  loginNote.hidden = !text;
}

function showWho() {
  stepPass.hidden = true;
  stepWho.hidden = false;
  loginErr.hidden = true;
  passInput.value = "";
}

function showPass(name) {
  selectedName = name;
  passName.textContent = name;
  stepWho.hidden = true;
  stepPass.hidden = false;
  loginErr.hidden = true;
  setTimeout(() => passInput.focus(), 60);
}

/* back to the login screen without losing our place */
function showLogin(message) {
  chatEl.hidden = true;
  loginEl.hidden = false;
  note(message);
  showWho();
}

document.querySelectorAll(".who-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    localStorage.setItem("usap-who", btn.dataset.name);
    showPass(btn.dataset.name);
  })
);

document.getElementById("login-back").addEventListener("click", () => {
  localStorage.removeItem("usap-who");
  showWho();
});

/* ─── security gate: prove it's really us before naming names ─── */

function afterGate() {
  stepGate.hidden = true;
  // no need to pick yourself twice — remember who was here last time
  const lastWho = localStorage.getItem("usap-who");
  if (lastWho && ACCOUNTS[lastWho]) showPass(lastWho);
  else showWho();
}

stepGate.addEventListener("submit", (e) => {
  e.preventDefault();
  if (gateInput.value === ANNIVERSARY) {
    gateErr.hidden = true;
    sessionStorage.setItem("usap-gate-ok", "1");
    afterGate();
  } else {
    gateErr.hidden = false;
    stepGate.classList.remove("shake");
    void stepGate.offsetWidth; // restart the animation on repeat wrong guesses
    stepGate.classList.add("shake");
  }
});

// passed the gate already this browser session? no need to ask twice
if (sessionStorage.getItem("usap-gate-ok") === "1") afterGate();

/* ─── supabase client (guarded — a load failure can't kill the buttons) ─── */

let sb = null;

if (window.supabase) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* phones throttle background timers, which can let the auth token expire;
     pause/resume the refresh loop with tab visibility so it never goes stale */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sb.auth.stopAutoRefresh();
    else sb.auth.startAutoRefresh();
  });

  /* signed out anywhere (another tab, expiry)? fall back to the login screen */
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showLogin("nawala ang session, mahal — pasok ka ulit ♡");
  });

  /* still signed in from last time? go straight in */
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session) enterChat();
  });
} else {
  note("hindi ma-load ang koneksyon — i-refresh mo ako, mahal ♡");
}

/* ─── login submit ─── */

stepPass.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) {
    note("hindi ma-load ang koneksyon — i-refresh mo ako, mahal ♡");
    return;
  }
  loginErr.hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: ACCOUNTS[selectedName],
    password: passInput.value.trim(),
  });
  if (error) {
    loginErr.hidden = false;
    passInput.select();
    return;
  }
  passInput.value = "";
  note("");
  enterChat();
});

document.getElementById("signout").addEventListener("click", async () => {
  if (callState !== "idle") hangupCall();
  if (sb) await sb.auth.signOut();
  location.reload();
});

/* ─── chat ─── */

async function enterChat() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  me = user.id;

  const { data: members, error } = await sb.from("chat_members").select("*");
  if (error || !members || !members.length) {
    // logged in but not one of us two — RLS shows nothing
    await sb.auth.signOut();
    showLogin("para lang sa aming dalawa ito ♡");
    return;
  }
  names = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]));
  const partner = members.find((m) => m.user_id !== me);
  callPeer = partner ? partner.user_id : null;
  chatSub.textContent = partner ? `ikaw at si ${partner.display_name} lang ♡` : "ikaw at ako lang ♡";

  loginEl.hidden = true;
  chatEl.hidden = false;

  const { data } = await sb
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  msgs = (data || []).reverse();
  renderAll();
  markRead();

  // re-login shouldn't stack a second subscription
  await sb.removeAllChannels();
  sb.channel("usap-tayo")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload) => {
        // skip if already in msgs (optimistic send already rendered it)
        if (msgs.some((m) => m.id === payload.new.id)) return;
        msgs.push(payload.new);
        appendMsg(payload.new, true);
        refreshSeen();
        if (hasLoveWords(payload.new.body)) celebrateLoveWords();
        if (callMinimized) updateMiniPreview(true);
        if (callChatOpen && !callMinimized) appendCallChatMsg(payload.new, true);
        if (payload.new.sender_id !== me) {
          if (document.hidden) bumpUnreadTitle();
          else markRead();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "chat_messages" },
      (payload) => {
        const i = msgs.findIndex((m) => m.id === payload.new.id);
        if (i > -1) msgs[i] = payload.new;
        refreshSeen();
      }
    )
    .subscribe();

  setupCallChannel();
  setupPresence();
  setupPush();
}

/* ─── online presence (is the partner here right now?) ─── */

let presenceChannel = null;
let partnerOnline = false;
let partnerTyping = false;

// the single source of truth for what we broadcast about ourselves —
// .track() replaces the whole payload every call, so typing (below) and
// "now playing" (set from yt-player.js via trackPresence()) have to
// share and merge into this instead of stomping on each other
const presenceState = { typing: false, nowPlaying: null };

function trackPresence(partial) {
  if (!presenceChannel) return;
  Object.assign(presenceState, partial);
  presenceChannel.track({ online_at: new Date().toISOString(), ...presenceState });
}

function setupPresence() {
  presenceChannel = sb.channel("usap-tayo-presence", {
    config: { presence: { key: me } },
  });
  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const partnerState = callPeer && state[callPeer] && state[callPeer][0];
      partnerOnline = !!partnerState;
      onlineDot.hidden = !partnerOnline;
      setPartnerTyping(!!(partnerState && partnerState.typing));
      setPartnerNowPlaying(partnerState && partnerState.nowPlaying);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") trackPresence({});
    });
}

/* "nagta-type siya…" — the other half of .seen, driven off the same
   presence channel via a `typing` flag instead of a second channel */

function setPartnerTyping(typing) {
  if (typing === partnerTyping) return;
  partnerTyping = typing;
  if (typing) {
    typingLabel.textContent = `nagta-type si ${names[callPeer] || "siya"}…`;
    typingWrap.classList.add("open");
    scrollDown(true);
  } else {
    typingWrap.classList.remove("open");
  }
}

let typingTrackTimeout = null;
let isTypingTracked = false;

function trackTyping() {
  if (!presenceChannel) return;
  if (!isTypingTracked) {
    isTypingTracked = true;
    trackPresence({ typing: true });
  }
  clearTimeout(typingTrackTimeout);
  typingTrackTimeout = setTimeout(stopTypingTrack, 2500);
}

function stopTypingTrack() {
  clearTimeout(typingTrackTimeout);
  if (!isTypingTracked || !presenceChannel) return;
  isTypingTracked = false;
  trackPresence({ typing: false });
}

/* "🎵 nakikinig si Alliah kay <song>" — the other half of this, set from
   yt-player.js via trackPresence({ nowPlaying }), tracks the partner's
   YT_PlayerState.PLAYING specifically (pausing hides it again) */

let lastPartnerNowPlaying = null;
let ytJamAutoHideTimer = null;

function setPartnerNowPlaying(nowPlaying) {
  partnerPlayingEl.hidden = !nowPlaying;
  if (nowPlaying) {
    partnerPlayingText.textContent = `nakikinig si ${names[callPeer] || "siya"} kay ${nowPlaying.title || "isang kanta"}`;
  }

  const prevTitle = lastPartnerNowPlaying && lastPartnerNowPlaying.title;
  const newTitle = nowPlaying && nowPlaying.title;
  lastPartnerNowPlaying = nowPlaying;

  if (newTitle && newTitle !== prevTitle) {
    showJamNotification(nowPlaying);
  } else if (!newTitle) {
    dismissJamNotification();
  }
}

function showJamNotification(nowPlaying) {
  clearTimeout(ytJamAutoHideTimer);
  const partnerName = names[callPeer] || "siya";
  ytJamNameEl.textContent = `nakikinig si ${partnerName}`;
  ytJamTitleEl.textContent = nowPlaying.title || "isang kanta";
  ytJamJoinBtn.dataset.videoId = nowPlaying.videoId || "";
  ytJamJoinBtn.dataset.title = nowPlaying.title || "";

  ytJamNotification.hidden = false;
  ytJamNotification.classList.remove("leaving");
  requestAnimationFrame(() => ytJamNotification.classList.add("show"));

  ytJamAutoHideTimer = setTimeout(dismissJamNotification, 10000);
}

function dismissJamNotification() {
  clearTimeout(ytJamAutoHideTimer);
  ytJamNotification.classList.add("leaving");
  ytJamNotification.classList.remove("show");
  setTimeout(() => {
    if (!ytJamNotification.classList.contains("show")) {
      ytJamNotification.hidden = true;
      ytJamNotification.classList.remove("leaving");
    }
  }, 420);
}

ytJamDismissBtn.addEventListener("click", dismissJamNotification);

ytJamJoinBtn.addEventListener("click", () => {
  const videoId = ytJamJoinBtn.dataset.videoId;
  const title = ytJamJoinBtn.dataset.title;
  dismissJamNotification();
  if (typeof window.playPartnerVideo === "function") {
    window.playPartnerVideo(videoId, title);
  } else if (videoId) {
    input.value = `play https://youtu.be/${videoId}`;
    composer.requestSubmit();
  }
});

/* ─── image attachments ─── */

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("larawan lang, mahal ♡");
    return;
  }
  attachImageFile(file);
});

attachRemove.addEventListener("click", clearAttachment);

function clearAttachment() {
  pendingFile = null;
  attachPreview.hidden = true;
  attachPreviewImg.src = "";
}

function attachImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return false;
  if (file.size > 8 * 1024 * 1024) {
    alert("masyadong malaki ang larawan, mahal ♡");
    return false;
  }
  pendingFile = file;
  attachPreviewImg.src = URL.createObjectURL(file);
  attachPreview.hidden = false;
  return true;
}

input.addEventListener("paste", (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file && attachImageFile(file)) e.preventDefault();
      break;
    }
  }
});

const attachmentUrlCache = new Map(); // path -> { url, expires }

async function getAttachmentUrl(path) {
  const cached = attachmentUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await sb.storage.from("chat-attachments").createSignedUrl(path, 3600);
  if (error || !data) return null;
  attachmentUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = input.value.trim();
  const file = pendingFile;
  if (!body && !file) return;
  input.value = "";
  autosize();
  clearAttachment();
  stopTypingTrack();

  let attachment_path = null;
  let attachment_type = null;

  if (file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${me}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await sb.storage
      .from("chat-attachments")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      if (body) input.value = body;
      autosize();
      composer.classList.add("failed");
      setTimeout(() => composer.classList.remove("failed"), 1200);
      return;
    }
    attachment_path = path;
    attachment_type = file.type;
  }

  const row = { sender_id: me, body: body || "", attachment_path, attachment_type };

  let { data: sent, error } = await sb.from("chat_messages").insert(row).select().single();

  if (error) {
    // most likely a stale session — check it before giving up
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      if (body) input.value = body; // keep her words safe
      autosize();
      showLogin("na-expire ang session, mahal — pasok ka ulit at nandiyan pa rin ang mensahe mo ♡");
      return;
    }
    // session is fine — try once more
    ({ data: sent, error } = await sb.from("chat_messages").insert(row).select().single());
    if (error) {
      if (body) input.value = body;
      autosize();
      composer.classList.add("failed");
      setTimeout(() => composer.classList.remove("failed"), 1200);
      return;
    }
  }

  // show immediately; realtime will skip it when it arrives (dedup by id)
  if (sent && !msgs.some((m) => m.id === sent.id)) {
    msgs.push(sent);
    appendMsg(sent, true);
    refreshSeen();
    if (hasLoveWords(sent.body)) celebrateLoveWords();
    if (callMinimized) updateMiniPreview(true);
    if (callChatOpen && !callMinimized) appendCallChatMsg(sent, true);
  }
});

/* ─── surprise "mahal kita" counter ───
   fires for BOTH of you whenever a new message (sent or received)
   contains "I love you" / "mahal kita" — a running, all-time tally over
   every message ever exchanged, via a simple ILIKE count query (already
   allowed by the same RLS policy that lets either of you read every
   message; no new backend needed) */

function hasLoveWords(text) {
  const t = (text || "").toLowerCase();
  return t.includes("i love you") || t.includes("mahal kita");
}

async function celebrateLoveWords() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let count = null;
  try {
    const res = await sb
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .or("body.ilike.%i love you%,body.ilike.%mahal kita%");
    count = res.count;
  } catch {
    // no count? still worth the surprise, just without the tally
  }
  showLoveBurst(count, reduced);
}

function showLoveBurst(count, reduced) {
  const el = document.createElement("div");
  el.className = "love-burst";

  const label = document.createElement("p");
  label.className = "love-burst-label";
  label.textContent =
    typeof count === "number" && count > 0
      ? `ika-${count} beses n'yo nang sinabi 'yan, mahal ♡`
      : "sinabi n'yo na naman 'yan, mahal ♡";
  el.appendChild(label);

  if (!reduced) {
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("span");
      p.className = "love-particle";
      p.textContent = "♡";
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.4;
      const dist = 70 + Math.random() * 40;
      p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      p.style.animationDelay = `${Math.random() * 0.15}s`;
      el.appendChild(p);
    }
  }

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  const dismiss = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 500);
  };
  el.addEventListener("click", dismiss);
  setTimeout(dismiss, 3200);
}

// Enter sends; Shift+Enter makes a new line
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

input.addEventListener("input", () => {
  autosize();
  trackTyping();
});

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

/* ─── image lightbox ─── */

function renderImageBubble(bubble, m) {
  bubble.classList.add("has-image");
  const img = document.createElement("img");
  img.className = "msg-img";
  img.alt = "larawan";
  img.loading = "lazy";
  img.addEventListener("click", () => openLightbox(img.src));
  bubble.appendChild(img);
  getAttachmentUrl(m.attachment_path).then((url) => {
    if (url) img.src = url;
  });

  if (m.body) {
    const cap = document.createElement("div");
    cap.className = "msg-caption";
    cap.textContent = m.body;
    bubble.appendChild(cap);
  }
}

function openLightbox(src) {
  if (!src) return;
  lightboxImg.src = src;
  lightbox.hidden = false;
}

lightbox.addEventListener("click", () => {
  lightbox.hidden = true;
  lightboxImg.src = "";
});

/* mark the partner's unread messages as seen */
async function markRead() {
  await sb
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .neq("sender_id", me)
    .is("read_at", null);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    resetTitle();
    if (me && sb) markRead();
  }
});

/* manual re-sync — in case a realtime event ever got dropped (flaky network,
   backgrounded tab) and a message never showed up on its own */
async function refreshMessages() {
  if (!sb || !me || refreshBtn.classList.contains("spinning")) return;
  refreshBtn.classList.add("spinning");
  const { data } = await sb
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (data) {
    msgs = data.reverse();
    renderAll();
    markRead();
  }
  setTimeout(() => refreshBtn.classList.remove("spinning"), 700);
}

refreshBtn.addEventListener("click", refreshMessages);

/* ─── rendering ─── */

const MONTHS_TL = [
  "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
  "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre",
];

function dayLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (today - that) / 86400000;
  if (diff === 0) return "ngayon";
  if (diff === 1) return "kahapon";
  const y = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${MONTHS_TL[date.getMonth()]} ${date.getDate()}${y}`;
}

function timeLabel(date) {
  let h = date.getHours();
  const part =
    h < 6 ? "ng madaling-araw" :
    h < 12 ? "ng umaga" :
    h === 12 ? "ng tanghali" :
    h < 18 ? "ng hapon" : "ng gabi";
  const m = String(date.getMinutes()).padStart(2, "0");
  h = h % 12 || 12;
  return `${h}:${m} ${part}`;
}

let lastDayKey = null;

function renderAll() {
  messagesEl.innerHTML = "";
  lastDayKey = null;
  msgs.forEach((m) => appendMsg(m, false));
  refreshSeen();
  scrollDown(false);
}

function appendMsg(m, animate) {
  const date = new Date(m.created_at);
  const dayKey = date.toDateString();
  if (dayKey !== lastDayKey) {
    lastDayKey = dayKey;
    const sep = document.createElement("div");
    sep.className = "day-sep";
    sep.innerHTML = `<span></span><i></i><span></span>`;
    sep.querySelector("i").textContent = dayLabel(date);
    messagesEl.appendChild(sep);
  }

  // anyone who isn't me and isn't a known chat_members row (populated
  // from the real two-person member list) is the "jipiti" bot — see
  // jipiti.js / jipiti/main.py, which posts its replies this way
  const isBot = m.sender_id !== me && !names[m.sender_id];

  const row = document.createElement("div");
  row.className = "msg" + (m.sender_id === me ? " mine" : "") + (isBot ? " bot" : "");
  row.dataset.id = m.id;
  row.dataset.sender = m.sender_id === me ? "You" : names[m.sender_id] || (isBot ? "GPT" : "Guest");
  row.dataset.time = timeLabel(date);

  // hidden outside the disguise skin — .avatar only ever renders there
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = row.dataset.sender.charAt(0).toUpperCase();

  if (isBot) {
    const tag = document.createElement("div");
    tag.className = "bot-tag";
    tag.textContent = "GPT";
    row.appendChild(tag);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (m.attachment_path) {
    renderImageBubble(bubble, m);
  } else {
    bubble.textContent = m.body;
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = timeLabel(date);

  row.appendChild(avatar);
  row.appendChild(bubble);
  row.appendChild(meta);
  if (animate) row.classList.add("pop");
  messagesEl.appendChild(row);
  if (animate) scrollDown(true);
}

/* "nakita ♡" under my most recent message that's been read */
function refreshSeen() {
  messagesEl.querySelectorAll(".seen").forEach((el) => el.remove());
  const lastSeen = [...msgs].reverse().find((m) => m.sender_id === me && m.read_at);
  if (!lastSeen) return;
  const row = messagesEl.querySelector(`[data-id="${lastSeen.id}"]`);
  if (!row) return;
  const tag = document.createElement("div");
  tag.className = "seen";
  tag.textContent = "nakita ♡";
  row.appendChild(tag);
}

function scrollDown(smooth) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/* ─── audio / video calls (WebRTC, signaled over a Supabase Realtime broadcast channel) ─── */

// STUN alone only works when both sides can hole-punch directly — a symmetric
// NAT (common on managed/VDI networks like Amazon WorkSpaces) blocks that even
// when each side's own STUN check passes, so a TURN relay is required as a
// fallback. These are the always-available base servers; a real call also
// tries to add short-lived Cloudflare TURNS (TLS-on-443) credentials on top
// (see getIceServers below) — a plain, non-TLS relay can get silently dropped
// by a firewall doing deep packet inspection on port 443, while TURNS looks
// identical to ordinary HTTPS traffic and gets through the same way other
// video-calling apps' traffic does.
const STATIC_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

// fetches fresh, short-lived Cloudflare TURN/TURNS credentials for this call;
// falls back to the static list alone if that fails for any reason (offline,
// slow, function down) — a call should still attempt to connect either way
async function getIceServers() {
  try {
    const invoke = sb.functions.invoke("get-turn-credentials", { body: {} });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000));
    const { data, error } = await Promise.race([invoke, timeout]);
    if (error) throw error;
    return [...STATIC_ICE_SERVERS, ...((data && data.iceServers) || [])];
  } catch (e) {
    console.error("[call] failed to fetch TURN credentials, using static ICE servers only:", e);
    return STATIC_ICE_SERVERS;
  }
}

const callAudioBtn = document.getElementById("call-audio-btn");
const callVideoBtn = document.getElementById("call-video-btn");
const callOverlay = document.getElementById("call-overlay");
const callAvatar = document.getElementById("call-avatar");
const callNameEl = document.getElementById("call-name");
const callStatusEl = document.getElementById("call-status");
const remoteVideoEl = document.getElementById("remote-video");
const localVideoEl = document.getElementById("local-video");
const callAcceptBtn = document.getElementById("call-accept");
const callDeclineBtn = document.getElementById("call-decline");
const callMuteBtn = document.getElementById("call-mute");
const callCamBtn = document.getElementById("call-cam");
const callMinimizeBtn = document.getElementById("call-minimize");
const callMicBtn = document.getElementById("call-mic-btn");
const callHangupBtn = document.getElementById("call-hangup");
const callMiniExpandBtn = document.getElementById("call-mini-expand");
const callMiniControls = document.querySelector(".call-mini-controls");
const callMiniMuteBtn = document.getElementById("call-mini-mute");
const callMiniHangupBtn = document.getElementById("call-mini-hangup");
const callMiniBar = document.getElementById("call-mini-bar");
const callMiniPreview = document.getElementById("call-mini-preview");
const callChatToggleBtn = document.getElementById("call-chat-toggle");
const callChatPanel = document.getElementById("call-chat-panel");
const callChatMessages = document.getElementById("call-chat-messages");
const callChatInput = document.getElementById("call-chat-input");
const callChatForm = document.getElementById("call-chat-form");
const callChatClose = document.getElementById("call-chat-close");
const callChatHead = document.getElementById("call-chat-head");

let callChannel = null;
let callPeer = null; // partner's user id — this app only ever has two members
let callState = "idle"; // idle | outgoing | incoming | active
let callId = null;
let isVideoCall = true;
let pc = null;
let localStream = null;
let pendingOffer = null;
let pendingCandidates = [];
let callTimer = null;
let callStartedAt = null;
let isCaller = null; // true = we dialed out, false = we received the call — set per-call, only meaningful while callState !== "idle"
let pipIsLocal = true; // which feed is the small floating one — tap it to swap, Instagram-style
let callFailureReported = false; // guards against double-reporting the same failure via both the timeout and the native "failed" event
let connectTimeoutId = null;
let callMinimized = false; // shrunk to a draggable bubble so the chat underneath is usable mid-call
let callChatOpen = false; // in-call chat panel visible
let miniDrag = null; // { startX, startY, origX, origY, moved } while a drag is in progress
let chatSwipe = null; // { startY, dy } while a swipe-down-to-dismiss on the in-call chat sheet is in progress
let preferredMicId = localStorage.getItem("preferredMicId") || ""; // "" = system default

// browsers don't always land on connectionState "failed" — ICE can just sit in
// "checking"/"new" forever with no terminal state at all, which used to mean
// no message and no error report ever fired. This guarantees both after a
// fixed wait, regardless of whether the native state machine ever resolves.
function armConnectTimeout(conn) {
  clearConnectTimeout();
  connectTimeoutId = setTimeout(async () => {
    if (callState === "idle" || callState === "active" || callFailureReported) return;
    callFailureReported = true;
    setCallStatus("hindi kumonekta ang tawag — baka blocked ng network ang koneksyon. subukan ang 🛠 Call Check ♡");
    const statsSummary = await summarizeIceStats(conn);
    console.log("[call] timed out waiting to connect — stats:", statsSummary);
    reportCallError(
      "connection-timeout",
      `connectionState=${conn.connectionState}, iceConnectionState=${conn.iceConnectionState}, iceGatheringState=${conn.iceGatheringState}; ${statsSummary}`
    );
    setTimeout(endCall, 3500);
  }, 20000);
}

function clearConnectTimeout() {
  if (connectTimeoutId) {
    clearTimeout(connectTimeoutId);
    connectTimeoutId = null;
  }
}

const ringtone = new Audio("static/ringtone.m4a");
ringtone.loop = true;
ringtone.preload = "auto";

function playRingtone() {
  ringtone.currentTime = 0;
  ringtone.play().catch(() => {});
}

function stopRingtone() {
  ringtone.pause();
  ringtone.currentTime = 0;
}

/* getStats() shows what the standalone Call Check page can't: what actually
   happened between these two specific peers — which candidate pairs were
   tried, which one (if any) won, and what type each side's candidate was
   (host/srflx/relay). That's the difference between "the network can reach
   a STUN/TURN server" and "the network could reach the other peer". */
async function summarizeIceStats(conn) {
  try {
    const report = await conn.getStats();
    const candidates = {};
    const pairs = [];
    report.forEach((r) => {
      if (r.type === "local-candidate" || r.type === "remote-candidate") candidates[r.id] = r;
      if (r.type === "candidate-pair") pairs.push(r);
    });

    const describe = (id) => {
      const c = candidates[id];
      return c ? `${c.candidateType}/${c.protocol}` : "unknown";
    };

    const pairSummaries = pairs.map(
      (p) => `${p.state}${p.nominated ? "*" : ""}(local=${describe(p.localCandidateId)},remote=${describe(p.remoteCandidateId)})`
    );

    const counts = { local: {}, remote: {} };
    Object.values(candidates).forEach((c) => {
      const bucket = c.type === "local-candidate" ? counts.local : counts.remote;
      bucket[c.candidateType] = (bucket[c.candidateType] || 0) + 1;
    });

    return `local=${JSON.stringify(counts.local)} remote=${JSON.stringify(counts.remote)} pairs=[${pairSummaries.join(",") || "none"}]`;
  } catch (e) {
    return `getStats failed: ${e.message}`;
  }
}

function logIceStats(conn, label) {
  summarizeIceStats(conn).then((s) => console.log(`[call] ${label} stats —`, s));
}

// mails Erwin whenever a call breaks, naming which side (caller/callee) it happened on —
// best-effort only, a failed report should never interrupt the call flow itself
function reportCallError(kind, detail) {
  if (!sb) return;
  const side = isCaller === false ? "callee" : "caller";
  sb.functions
    .invoke("send-call-error-email", {
      body: {
        kind,
        detail: String(detail || ""),
        side,
        who: names[me] || me || "unknown",
        peer: names[callPeer] || callPeer || "unknown",
        callId,
        when: new Date().toISOString(),
      },
    })
    .catch((e) => console.error("[call] failed to report error email:", e));
}

/* ─── peer mic control (remote mic switching during an active call) ─── */

const callPeerMicBtn = document.getElementById("call-peer-mic-btn");
const callPeerMicPanel = document.getElementById("call-peer-mic-panel");
const callPeerMicList = document.getElementById("call-peer-mic-list");
const callPeerMicNameEl = document.getElementById("call-peer-mic-name");

let peerMics = []; // partner's audioinput devices, received via signal
let peerMicPanelOpen = false;
let activePeerMicId = null; // deviceId currently in use on the partner's side

async function broadcastPeerMics() {
  let devices;
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return;
  }
  const mics = devices
    .filter((d) => d.kind === "audioinput")
    .map((d) => ({ deviceId: d.deviceId, label: d.label || "" }));
  const currentId = localStream && localStream.getAudioTracks()[0]
    ? localStream.getAudioTracks()[0].getSettings().deviceId || null
    : null;
  sendSignal("peer-mics", { mics, currentId });
}

function handlePeerMics({ from, mics, currentId }) {
  if (!from || from === me || from !== callPeer) return;
  if (!Array.isArray(mics)) return;
  peerMics = mics;
  activePeerMicId = currentId || null;
  renderPeerMicList();
  if (callState === "active") {
    callPeerMicBtn.hidden = peerMics.length < 2;
  }
}

function renderPeerMicList() {
  callPeerMicList.innerHTML = "";
  if (callPeerMicNameEl) callPeerMicNameEl.textContent = names[callPeer] || "siya";
  peerMics.forEach((mic, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "call-peer-mic-item" + (mic.deviceId === activePeerMicId ? " active-mic" : "");
    btn.textContent = mic.label || `Mikropono ${i + 1}`;
    btn.addEventListener("click", () => {
      sendSignal("switch-peer-mic", { deviceId: mic.deviceId });
      activePeerMicId = mic.deviceId;
      renderPeerMicList(); // update the active highlight immediately
      closePeerMicPanel();
    });
    callPeerMicList.appendChild(btn);
  });
}

async function handleSwitchPeerMic({ from, deviceId }) {
  if (!from || from === me || from !== callPeer) return;
  if (!pc || !localStream || callState !== "active") return;

  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
  } catch {
    return;
  }

  const newTrack = newStream.getAudioTracks()[0];
  if (!newTrack) return;

  // preserve muted state
  const oldTrack = localStream.getAudioTracks()[0];
  newTrack.enabled = oldTrack ? oldTrack.enabled : true;

  const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
  if (sender) await sender.replaceTrack(newTrack).catch(() => {});

  if (oldTrack) { oldTrack.stop(); localStream.removeTrack(oldTrack); }
  localStream.addTrack(newTrack);

  // tell the other side what's now active so their panel highlights it
  broadcastPeerMics();

  const prev = callStatusEl.textContent;
  setCallStatus("mikropono binago ♡");
  setTimeout(() => { if (callState === "active") setCallStatus(prev); }, 1800);
}

function openPeerMicPanel() {
  if (peerMicPanelOpen || peerMics.length < 2) return;
  peerMicPanelOpen = true;
  callPeerMicPanel.hidden = false;
  requestAnimationFrame(() => callPeerMicPanel.classList.add("open"));
}

function closePeerMicPanel() {
  if (!peerMicPanelOpen) return;
  peerMicPanelOpen = false;
  callPeerMicPanel.classList.remove("open");
  setTimeout(() => { if (!peerMicPanelOpen) callPeerMicPanel.hidden = true; }, 240);
}

callPeerMicBtn.addEventListener("click", () => {
  if (peerMicPanelOpen) closePeerMicPanel();
  else openPeerMicPanel();
});

function setupCallChannel() {
  callChannel = sb.channel("usap-tayo-call", { config: { broadcast: { self: false } } });
  callChannel
    .on("broadcast", { event: "offer" }, ({ payload }) => handleOffer(payload))
    .on("broadcast", { event: "answer" }, ({ payload }) => handleAnswer(payload))
    .on("broadcast", { event: "ice" }, ({ payload }) => handleRemoteIce(payload))
    .on("broadcast", { event: "hangup" }, ({ payload }) => handleHangup(payload))
    .on("broadcast", { event: "busy" }, ({ payload }) => handleBusy(payload))
    .on("broadcast", { event: "peer-mics" }, ({ payload }) => handlePeerMics(payload))
    .on("broadcast", { event: "switch-peer-mic" }, ({ payload }) => handleSwitchPeerMic(payload))
    .subscribe();
}

function sendSignal(event, payload) {
  if (!callChannel) return;
  callChannel.send({ type: "broadcast", event, payload: { ...payload, from: me, callId } });
}

async function createPeerConnection() {
  const iceServers = await getIceServers();
  const conn = new RTCPeerConnection({ iceServers });
  conn.onicecandidate = (e) => {
    if (e.candidate) sendSignal("ice", { candidate: e.candidate.toJSON() });
  };
  conn.ontrack = (e) => {
    remoteVideoEl.srcObject = e.streams[0];
  };
  conn.onconnectionstatechange = async () => {
    if (conn.connectionState === "connected") {
      if (callState === "idle") return;
      clearConnectTimeout();
      stopRingtone();
      callState = "active";
      showActiveControls();
      startTimer();
      // baseline for comparison against a future failure — which path a working call actually used
      logIceStats(conn, "connected");
      broadcastPeerMics();
    } else if (conn.connectionState === "failed") {
      // ICE never found a path through — almost always a blocked-UDP/firewall
      // network (common on locked-down VDI like Amazon WorkSpaces), not a
      // normal hangup, so say so instead of just going silent
      if (callState !== "idle" && !callFailureReported) {
        callFailureReported = true;
        clearConnectTimeout();
        setCallStatus("hindi kumonekta ang tawag — baka blocked ng network ang koneksyon. subukan ang 🛠 Call Check ♡");
        const statsSummary = await summarizeIceStats(conn);
        console.log("[call] failed stats —", statsSummary);
        reportCallError(
          "connection-failed",
          `iceConnectionState=${conn.iceConnectionState}, iceGatheringState=${conn.iceGatheringState}; ${statsSummary}`
        );
        setTimeout(endCall, 3500);
      }
    } else if (["disconnected", "closed"].includes(conn.connectionState)) {
      if (callState !== "idle") {
        logIceStats(conn, conn.connectionState);
        endCall();
      }
    }
  };
  // not user-facing — visible in devtools console while debugging a real call
  conn.oniceconnectionstatechange = () => {
    console.log("[call] iceConnectionState:", conn.iceConnectionState);
  };
  conn.onicegatheringstatechange = () => {
    console.log("[call] iceGatheringState:", conn.iceGatheringState);
  };
  return conn;
}

/* getUserMedia failures are common (blocked/unset permissions are the norm
   on a fresh incognito window, since permissions never carry over from
   normal browsing) — name the actual reason instead of a generic failure */
function mediaErrorMessage(err) {
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "naka-block ang camera/mic — tingnan sa browser settings, mahal ♡";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "walang nahanap na camera/mic, mahal ♡";
  }
  if (name === "NotReadableError") {
    return "ginagamit na ng iba ang camera/mic mo, mahal ♡";
  }
  return "hindi ma-access ang camera/mic, mahal ♡";
}

// requests the local media stream for a call, preferring whichever mic the
// user picked in the mic picker — falls back to the system default if that
// device disappeared since (unplugged headset, etc.) rather than failing outright
async function getLocalStream(video) {
  const audio = preferredMicId ? { deviceId: { exact: preferredMicId } } : true;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video });
  } catch (e) {
    if (preferredMicId && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
      preferredMicId = "";
      localStorage.removeItem("preferredMicId");
      return await navigator.mediaDevices.getUserMedia({ audio: true, video });
    }
    throw e;
  }
}

// ends the call locally with a readable status, optionally telling the other side why
function failCall(message, signalReason) {
  stopRingtone();
  setCallStatus(message);
  if (signalReason) sendSignal("hangup", { reason: signalReason });
  setTimeout(endCall, 2200);
}

/* she's not on the chat screen right now — say so instead of ringing into the void */
function offlinePrompt() {
  showCallUI();
  callAvatar.hidden = false;
  callNameEl.textContent = names[callPeer] || "mahal";
  setCallStatus(`wala si ${names[callPeer] || "siya"} online ngayon, mahal ♡`);
  [callAcceptBtn, callDeclineBtn, callMuteBtn, callCamBtn, callMicBtn, callHangupBtn].forEach((b) => (b.hidden = true));
  setTimeout(hideCallUI, 2200);
}

async function startCall(video) {
  if (callState !== "idle" || !callPeer) return;
  if (!partnerOnline) {
    offlinePrompt();
    return;
  }

  isVideoCall = video;
  callId = crypto.randomUUID();
  callState = "outgoing";
  isCaller = true;
  showCallUI();
  callNameEl.textContent = names[callPeer] || "mahal";
  setCallStatus(`tumatawag kay ${names[callPeer] || "iyo"}…`);
  showOutgoingControls();
  playRingtone();

  try {
    localStream = await getLocalStream(video);
  } catch (e) {
    // no offer was ever sent — she was never rung, so there's no one to signal
    reportCallError("media-error", e && e.name);
    failCall(mediaErrorMessage(e), null);
    return;
  }
  localVideoEl.srcObject = localStream;
  localVideoEl.hidden = !video;

  pc = await createPeerConnection();
  // no timeout armed yet — she hasn't answered, this is just ringing, and a
  // normal ring can easily take longer than a connect timeout should allow
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal("offer", { sdp: offer, video });
}

async function handleOffer({ from, sdp, video, callId: incomingId }) {
  if (!from || from === me || from !== callPeer) return;
  if (callState !== "idle") {
    sendSignal("busy", { callId: incomingId });
    return;
  }
  callId = incomingId;
  isVideoCall = video;
  pendingOffer = sdp;
  callState = "incoming";
  isCaller = false;
  showCallUI();
  callNameEl.textContent = names[from] || "mahal";
  setCallStatus(`tumatawag si ${names[from] || "siya"}…`);
  callAvatar.classList.add("ringing");
  showIncomingControls();
  playRingtone();
}

async function acceptCall() {
  if (callState !== "incoming" || !pendingOffer) return;
  stopRingtone();

  setCallStatus("kumokonekta…");
  try {
    localStream = await getLocalStream(isVideoCall);
  } catch (e) {
    // caller is actively waiting on this one — tell them why it failed, not just "declined"
    reportCallError("media-error", e && e.name);
    failCall(mediaErrorMessage(e), "media-error");
    return;
  }
  localVideoEl.srcObject = localStream;
  localVideoEl.hidden = !isVideoCall;

  pc = await createPeerConnection();
  armConnectTimeout(pc);
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
  flushPendingCandidates();
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal("answer", { sdp: answer });
  showActiveControls();
}

function declineCall() {
  stopRingtone();
  sendSignal("hangup", { reason: "declined" });
  endCall();
}

function hangupCall() {
  stopRingtone();
  if (callState !== "idle") sendSignal("hangup", { reason: "ended" });
  endCall();
}

async function handleAnswer({ from, sdp, callId: rid }) {
  if (from === me || from !== callPeer || rid !== callId || !pc) return;
  stopRingtone();
  // she's actually answered now — ICE negotiation starts here, so this is
  // the right moment to start the connect-timeout clock, not when we dialed
  armConnectTimeout(pc);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  flushPendingCandidates();
}

async function handleRemoteIce({ from, candidate, callId: rid }) {
  if (from === me || from !== callPeer || rid !== callId) return;
  if (!pc || !pc.remoteDescription) {
    pendingCandidates.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(candidate);
  } catch {
    // stray candidate after teardown — safe to ignore
  }
}

function flushPendingCandidates() {
  pendingCandidates.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
  pendingCandidates = [];
}

function handleHangup({ from, callId: rid, reason }) {
  if (from === me || from !== callPeer || rid !== callId) return;
  stopRingtone();
  if (reason === "media-error") {
    setCallStatus(`hindi ma-access ang camera/mic ni ${names[from] || "siya"}, mahal ♡`);
    setTimeout(endCall, 2200);
    return;
  }
  setCallStatus("tumawid ang tawag ♡");
  setTimeout(endCall, 400);
}

function handleBusy({ from, callId: rid }) {
  if (from === me || from !== callPeer || rid !== callId) return;
  stopRingtone();
  setCallStatus("abala siya ngayon ♡");
  setTimeout(endCall, 1500);
}

function endCall() {
  clearConnectTimeout();
  callFailureReported = false;
  stopRingtone();
  stopTimer();
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  remoteVideoEl.srcObject = null;
  localVideoEl.srcObject = null;
  pendingCandidates = [];
  pendingOffer = null;
  callState = "idle";
  callId = null;
  isCaller = null;
  hideCallUI();
}

function showCallUI() {
  callOverlay.hidden = false;
  callAvatar.hidden = false;
  callMuteBtn.classList.remove("off");
  callCamBtn.classList.remove("off");
  callMiniMuteBtn.classList.remove("off");
  pipIsLocal = true;
  applyVideoRoles();
  restoreCall(); // every new call starts full-screen, never inherits a previous minimize
}

function hideCallUI() {
  callOverlay.hidden = true;
  callAvatar.classList.remove("ringing");
  [callAcceptBtn, callDeclineBtn, callMuteBtn, callCamBtn, callMicBtn, callPeerMicBtn, callMinimizeBtn, callChatToggleBtn, callHangupBtn].forEach(
    (b) => (b.hidden = true)
  );
  closePeerMicPanel();
  peerMics = [];
  activePeerMicId = null;
  closeCallChat();
  restoreCall();
}

function showOutgoingControls() {
  callAcceptBtn.hidden = true;
  callDeclineBtn.hidden = false;
  callMuteBtn.hidden = true;
  callCamBtn.hidden = true;
  callMicBtn.hidden = true;
  callMinimizeBtn.hidden = true;
  callHangupBtn.hidden = true;
}

function showIncomingControls() {
  callAcceptBtn.hidden = false;
  callDeclineBtn.hidden = false;
  callMuteBtn.hidden = true;
  callCamBtn.hidden = true;
  callMicBtn.hidden = true;
  callMinimizeBtn.hidden = true;
  callHangupBtn.hidden = true;
}

function showActiveControls() {
  callAcceptBtn.hidden = true;
  callDeclineBtn.hidden = true;
  callMuteBtn.hidden = false;
  callCamBtn.hidden = !isVideoCall;
  callMicBtn.hidden = false;
  callMinimizeBtn.hidden = false;
  callChatToggleBtn.hidden = false;
  callHangupBtn.hidden = false;
  callAvatar.hidden = isVideoCall;
  callAvatar.classList.remove("ringing");
  setCallStatus("");
  openCallChat();
}

// --- minimize: shrinks the overlay's real box to a small draggable bubble,
// so everything outside it is genuinely the chat underneath again, not just
// visually implied. only offered once a call is actually connected —
// ringing/dialing keeps full attention.

function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  callMuteBtn.classList.toggle("off", !track.enabled);
  callMiniMuteBtn.classList.toggle("off", !track.enabled);
}

function clampMiniPosition(x, y) {
  const rect = callOverlay.getBoundingClientRect();
  const margin = 10;
  const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
  return { x: Math.min(Math.max(x, margin), maxX), y: Math.min(Math.max(y, margin), maxY) };
}

function setMiniPosition(x, y) {
  callOverlay.style.setProperty("--call-min-x", `${x}px`);
  callOverlay.style.setProperty("--call-min-y", `${y}px`);
}

// what shows in the minimized bar: the latest message in the thread,
// named if it's hers, plain if it's yours, a photo placeholder if
// there's no text at all
function messagePreviewText(m) {
  if (!m) return "wala pang mensahe";
  if (m.body) {
    const isBot = m.sender_id !== me && !names[m.sender_id];
    const who = m.sender_id === me ? null : names[m.sender_id] || (isBot ? "GPT" : "Siya");
    return who ? `${who}: ${m.body}` : m.body;
  }
  return m.attachment_path ? "📷 nagpadala ng larawan" : "wala pang mensahe";
}

function updateMiniPreview(animate) {
  callMiniPreview.textContent = messagePreviewText(msgs[msgs.length - 1]);
  if (animate) {
    callMiniPreview.classList.remove("tick");
    void callMiniPreview.offsetWidth; // restart the animation on repeat ticks
    callMiniPreview.classList.add("tick");
  }
}

function minimizeCall() {
  if (callState !== "active" || callMinimized) return;
  closePeerMicPanel();
  callMinimized = true;
  callOverlay.classList.add("minimized");
  callMiniBar.hidden = false;
  callMiniControls.hidden = false;
  updateMiniPreview(false);
  // always parks top-right, just under the header, fresh — simpler to
  // predict than remembering a previous drag, and it reliably clears the
  // composer at the bottom regardless of how tall the textarea has grown
  const rect = callOverlay.getBoundingClientRect();
  const header = document.querySelector(".chat-head");
  const topClear = header ? header.getBoundingClientRect().bottom + 12 : 76;
  const pos = clampMiniPosition(window.innerWidth - rect.width - 16, topClear);
  setMiniPosition(pos.x, pos.y);
}

function restoreCall() {
  callMinimized = false;
  miniDrag = null;
  callOverlay.classList.remove("minimized");
  callMiniBar.hidden = true;
  callMiniControls.hidden = true;
  callOverlay.style.removeProperty("--call-min-x");
  callOverlay.style.removeProperty("--call-min-y");
}

function setCallStatus(text) {
  callStatusEl.textContent = text;
}

function startTimer() {
  callStartedAt = Date.now();
  callTimer = setInterval(() => {
    const s = Math.floor((Date.now() - callStartedAt) / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    setCallStatus(`${m}:${ss}`);
  }, 1000);
}

function stopTimer() {
  clearInterval(callTimer);
  callTimer = null;
}

callAudioBtn.addEventListener("click", () => startCall(false));
callVideoBtn.addEventListener("click", () => startCall(true));
callAcceptBtn.addEventListener("click", acceptCall);
callDeclineBtn.addEventListener("click", declineCall);
callHangupBtn.addEventListener("click", hangupCall);
callMuteBtn.addEventListener("click", toggleMute);
callMinimizeBtn.addEventListener("click", minimizeCall);

callMiniExpandBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  restoreCall();
});
callMiniMuteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});
callMiniHangupBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  hangupCall();
});

// dragging the minimized bubble: track movement from pointerdown, and only
// treat it as a "tap to expand" if the pointer barely moved before lifting
callOverlay.addEventListener("pointerdown", (e) => {
  if (!callMinimized || e.target.closest(".call-mini-btn, .call-mini-expand")) return;
  const rect = callOverlay.getBoundingClientRect();
  miniDrag = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
  callOverlay.setPointerCapture(e.pointerId);
});

callOverlay.addEventListener("pointermove", (e) => {
  if (!miniDrag) return;
  const dx = e.clientX - miniDrag.startX;
  const dy = e.clientY - miniDrag.startY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) miniDrag.moved = true;
  if (!miniDrag.moved) return;
  const pos = clampMiniPosition(miniDrag.origX + dx, miniDrag.origY + dy);
  setMiniPosition(pos.x, pos.y);
});

callOverlay.addEventListener("pointerup", () => {
  if (!miniDrag) return;
  const wasDrag = miniDrag.moved;
  miniDrag = null;
  if (!wasDrag && callMinimized) restoreCall();
});

window.addEventListener("resize", () => {
  if (!callMinimized) return;
  const rect = callOverlay.getBoundingClientRect();
  const pos = clampMiniPosition(rect.left, rect.top);
  setMiniPosition(pos.x, pos.y);
});

callCamBtn.addEventListener("click", () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  callCamBtn.classList.toggle("off", !track.enabled);
  localVideoEl.hidden = !track.enabled;
});

/* ─── microphone picker ───
   reachable from the chat menu any time (just sets the default used by the
   next call) and from the in-call controls (also live-swaps the active
   call's outgoing audio track, no hangup needed) */

const micSettingsBtn = document.getElementById("mic-settings-btn");
const micPickerOverlay = document.getElementById("mic-picker-overlay");
const micPickerClose = document.getElementById("mic-picker-close");
const micPickerStatus = document.getElementById("mic-picker-status");
const micPickerList = document.getElementById("mic-picker-list");

// device labels come back blank until mic permission has been granted at
// least once — request a throwaway stream just to unlock them if needed,
// rather than showing an unhelpful list of "Microphone 1", "Microphone 2"
async function ensureMicLabels() {
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.some((d) => d.kind === "audioinput" && d.label)) return devices;
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmp.getTracks().forEach((t) => t.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    // permission denied — show what we have, unlabeled
  }
  return devices;
}

async function renderMicPicker() {
  micPickerStatus.hidden = true;
  micPickerList.hidden = true;
  let devices;
  try {
    devices = await ensureMicLabels();
  } catch {
    devices = [];
  }
  const mics = devices.filter((d) => d.kind === "audioinput");

  if (!mics.length) {
    micPickerStatus.textContent = "walang nahanap na mikropono, mahal ♡";
    micPickerStatus.hidden = false;
    return;
  }

  micPickerList.innerHTML = "";
  mics.forEach((d, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mic-picker-item";
    btn.setAttribute("role", "option");
    const isSelected = preferredMicId ? d.deviceId === preferredMicId : i === 0;
    btn.setAttribute("aria-selected", String(isSelected));
    btn.innerHTML = `<span class="mic-picker-item-check" aria-hidden="true">♡</span><span class="mic-picker-item-label"></span>`;
    btn.querySelector(".mic-picker-item-label").textContent = d.label || `mikropono ${i + 1}`;
    btn.addEventListener("click", () => selectMic(d.deviceId));
    li.appendChild(btn);
    micPickerList.appendChild(li);
  });
  micPickerList.hidden = false;
}

async function selectMic(deviceId) {
  preferredMicId = deviceId;
  localStorage.setItem("preferredMicId", deviceId);
  renderMicPicker();

  // mid-call: swap the live outgoing track instead of making them hang up
  if (pc && callState === "active") {
    try {
      const swapStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newTrack = swapStream.getAudioTracks()[0];
      const oldTrack = localStream && localStream.getAudioTracks()[0];
      if (oldTrack) newTrack.enabled = oldTrack.enabled;
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
      if (sender) await sender.replaceTrack(newTrack);
      if (localStream) {
        if (oldTrack) {
          localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStream.addTrack(newTrack);
      }
    } catch (e) {
      console.log("[call] could not switch microphone live:", e && e.name);
    }
  }
}

function openMicPicker() {
  micPickerOverlay.hidden = false;
  renderMicPicker();
}

function closeMicPicker() {
  micPickerOverlay.hidden = true;
}

micSettingsBtn.addEventListener("click", openMicPicker);
callMicBtn.addEventListener("click", openMicPicker);
micPickerClose.addEventListener("click", closeMicPicker);
micPickerOverlay.addEventListener("click", (e) => {
  if (e.target === micPickerOverlay) closeMicPicker();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !micPickerOverlay.hidden) closeMicPicker();
});

// tap the small floating feed to swap it with the big one, same as Instagram
function applyVideoRoles() {
  const mainEl = pipIsLocal ? remoteVideoEl : localVideoEl;
  const pipEl = pipIsLocal ? localVideoEl : remoteVideoEl;
  mainEl.classList.remove("call-video-pip");
  mainEl.classList.add("call-video-main");
  pipEl.classList.remove("call-video-main");
  pipEl.classList.add("call-video-pip");
}

[remoteVideoEl, localVideoEl].forEach((el) => {
  el.addEventListener("click", () => {
    if (!isVideoCall || !el.classList.contains("call-video-pip")) return;
    pipIsLocal = !pipIsLocal;
    applyVideoRoles();
  });
});

window.addEventListener("beforeunload", () => {
  if (callState !== "idle") sendSignal("hangup", { reason: "left" });
});

/* ─── in-call chat panel ─── */

function openCallChat() {
  if (callChatOpen) return;
  callChatOpen = true;
  renderCallChatMessages();
  callChatPanel.classList.add("open");
  callChatToggleBtn.classList.add("active");
  callChatToggleBtn.setAttribute("aria-label", "Isara ang chat");
}

function closeCallChat() {
  if (!callChatOpen) return;
  callChatOpen = false;
  callChatPanel.classList.remove("open");
  callChatToggleBtn.classList.remove("active");
  callChatToggleBtn.setAttribute("aria-label", "Chat");
}

function renderCallChatMessages() {
  callChatMessages.innerHTML = "";
  msgs.slice(-60).forEach((m) => appendCallChatMsg(m, false));
  callChatMessages.scrollTop = callChatMessages.scrollHeight;
}

function appendCallChatMsg(m, animate) {
  const isMine = m.sender_id === me;
  const row = document.createElement("div");
  row.className = "call-chat-msg" + (isMine ? " mine" : "");
  row.dataset.id = m.id;

  const bubble = document.createElement("div");
  bubble.className = "call-chat-bubble";
  bubble.textContent = m.body || (m.attachment_path ? "📷 larawan" : "");

  const date = new Date(m.created_at);
  const h = date.getHours() % 12 || 12;
  const min = String(date.getMinutes()).padStart(2, "0");
  const ampm = date.getHours() < 12 ? "AM" : "PM";
  const meta = document.createElement("div");
  meta.className = "call-chat-meta";
  meta.textContent = `${h}:${min} ${ampm}`;

  row.appendChild(bubble);
  row.appendChild(meta);

  if (animate) {
    row.style.cssText = "opacity:0;transform:translateY(8px)";
    callChatMessages.appendChild(row);
    requestAnimationFrame(() => {
      row.style.cssText = "opacity:1;transform:none;transition:opacity 0.3s ease,transform 0.3s ease";
    });
    callChatMessages.scrollTop = callChatMessages.scrollHeight;
  } else {
    callChatMessages.appendChild(row);
  }
}

callChatToggleBtn.addEventListener("click", () => {
  if (callChatOpen) closeCallChat();
  else openCallChat();
});

callChatClose.addEventListener("click", closeCallChat);

// swipe the header down to dismiss — only the bottom-sheet layout (mobile
// portrait) needs this; the desktop side panel slides in from the edge, not
// up from the bottom, so a vertical drag there wouldn't make sense
const isChatSheetLayout = () => window.matchMedia("(max-width: 640px)").matches;

callChatHead.addEventListener("pointerdown", (e) => {
  if (!isChatSheetLayout() || !callChatOpen || e.target.closest(".call-chat-close")) return;
  chatSwipe = { startY: e.clientY, dy: 0 };
  callChatPanel.style.transition = "none";
  callChatHead.setPointerCapture(e.pointerId);
});

callChatHead.addEventListener("pointermove", (e) => {
  if (!chatSwipe) return;
  chatSwipe.dy = Math.max(0, e.clientY - chatSwipe.startY);
  callChatPanel.style.transform = `translateY(${chatSwipe.dy}px)`;
});

function endCallChatSwipe() {
  if (!chatSwipe) return;
  const dy = chatSwipe.dy;
  chatSwipe = null;
  callChatPanel.style.transition = "";
  callChatPanel.style.transform = "";
  if (dy > 90) closeCallChat();
}

callChatHead.addEventListener("pointerup", endCallChatSwipe);
callChatHead.addEventListener("pointercancel", endCallChatSwipe);

callChatInput.addEventListener("input", () => {
  callChatInput.style.height = "auto";
  callChatInput.style.height = Math.min(callChatInput.scrollHeight, 100) + "px";
});

callChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    callChatForm.requestSubmit();
  }
});

callChatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = callChatInput.value.trim();
  if (!body || !sb || !me) return;
  callChatInput.value = "";
  callChatInput.style.height = "auto";

  const row = { sender_id: me, body, attachment_path: null, attachment_type: null };
  const { data: sent, error } = await sb.from("chat_messages").insert(row).select().single();
  if (error) {
    callChatInput.value = body;
    return;
  }
  if (sent && !msgs.some((m) => m.id === sent.id)) {
    msgs.push(sent);
    appendMsg(sent, true);
    refreshSeen();
    if (hasLoveWords(sent.body)) celebrateLoveWords();
    if (callMinimized) updateMiniPreview(true);
    appendCallChatMsg(sent, true);
  }
});

/* ─── push notification toggle for new messages ─── */

const VAPID_PUBLIC_KEY =
  "BNIujtEXG7qLnWE3lUv7FoNV2Jfq_4Y1CCQdR_ZApi3f5tGbEGeIggekWLGIRA_BcDIoPqGWEgiXMPW91FQCKlQ";

const notifyBtn = document.getElementById("notify-btn");
const pushSupported =
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function setNotifyToggle(active) {
  notifyBtn.classList.toggle("active", active);
  notifyBtn.setAttribute("aria-pressed", String(active));
  const label = active ? "Papatayin ang abiso" : "Paganahin ang abiso";
  notifyBtn.title = label;
  notifyBtn.querySelector(".chat-menu-icon").textContent = active ? "🔔" : "🔕";
  notifyBtn.querySelector(".chat-menu-label").textContent = label;
}

async function setupPush() {
  if (!pushSupported) {
    notifyBtn.hidden = true;
    return;
  }

  let reg;
  try {
    reg = await navigator.serviceWorker.register("sw.js");
  } catch {
    notifyBtn.hidden = true;
    return;
  }

  const existing =
    Notification.permission === "granted" ? await reg.pushManager.getSubscription() : null;
  setNotifyToggle(!!existing);
}

notifyBtn.addEventListener("click", async () => {
  if (!pushSupported) return;
  const reg = await navigator.serviceWorker.ready;

  if (notifyBtn.classList.contains("active")) {
    await unsubscribePush(reg);
    setNotifyToggle(false);
    return;
  }

  if (Notification.permission === "denied") {
    alert("naka-block ang abiso sa browser mo, mahal — paganahin sa settings ♡");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  await subscribePush(reg);
  setNotifyToggle(true);
});

async function subscribePush(reg) {
  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON();
    await sb.from("push_subscriptions").upsert(
      {
        user_id: me,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );
  } catch {
    // notifications are a nice-to-have — a failed subscribe shouldn't break the chat
  }
}

async function unsubscribePush(reg) {
  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // best-effort — worst case a stale subscription just never gets pushed to
  }
}

/* ─── mobile header "more" menu (bottom sheet on narrow screens) ─── */

const chatMenuBtn = document.getElementById("chat-menu-btn");
const chatMenu = document.getElementById("chat-menu");
const chatMenuBackdrop = document.getElementById("chat-menu-backdrop");

function openChatMenu() {
  chatMenuBtn.setAttribute("aria-expanded", "true");
  chatMenu.classList.add("open");
  chatMenuBackdrop.hidden = false;
  requestAnimationFrame(() => chatMenuBackdrop.classList.add("visible"));
}

function closeChatMenu() {
  chatMenuBtn.setAttribute("aria-expanded", "false");
  chatMenu.classList.remove("open");
  chatMenuBackdrop.classList.remove("visible");
  closeCallSettingsSubmenu();
  setTimeout(() => {
    chatMenuBackdrop.hidden = true;
  }, 400);
}

chatMenuBtn.addEventListener("click", () => {
  if (chatMenu.classList.contains("open")) closeChatMenu();
  else openChatMenu();
});

chatMenuBackdrop.addEventListener("click", closeChatMenu);

chatMenu.querySelectorAll(".chat-menu-item:not(.chat-submenu-trigger)").forEach((item) => {
  item.addEventListener("click", closeChatMenu);
});

/* ─── call settings submenu ─── */

const callSettingsBtn = document.getElementById("call-settings-btn");
const callSettingsSubmenu = document.getElementById("call-settings-submenu");

function closeCallSettingsSubmenu() {
  callSettingsSubmenu.classList.remove("open");
  callSettingsBtn.setAttribute("aria-expanded", "false");
}

callSettingsBtn.addEventListener("click", () => {
  const opening = !callSettingsSubmenu.classList.contains("open");
  callSettingsSubmenu.classList.toggle("open", opening);
  callSettingsBtn.setAttribute("aria-expanded", String(opening));
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatMenu.classList.contains("open")) closeChatMenu();
});
