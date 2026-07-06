/* ════════════════════════════════════════════
   Usap Tayo — private chat for the two of us
   Backend: Supabase (auth + chat_messages + realtime)
   ════════════════════════════════════════════ */

const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";

// the login screen shows names, never emails
const ACCOUNTS = { Erwin: "erwin@eanda.chat", Alliah: "alliah@eanda.chat" };

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

const loginEl = document.getElementById("login");
const chatEl = document.getElementById("chat");
const stepWho = document.getElementById("step-who");
const stepPass = document.getElementById("step-pass");
const passName = document.getElementById("pass-name");
const passInput = document.getElementById("pass-input");
const loginErr = document.getElementById("login-err");
const messagesEl = document.getElementById("messages");
const chatSub = document.getElementById("chat-sub");
const composer = document.getElementById("composer");
const input = document.getElementById("composer-input");

let me = null; // my user id
let names = {}; // user_id -> display name
let selectedName = null;
let msgs = [];

/* ─── login flow ─── */

document.querySelectorAll(".who-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    selectedName = btn.dataset.name;
    passName.textContent = selectedName;
    stepWho.hidden = true;
    stepPass.hidden = false;
    passInput.focus();
  })
);

document.getElementById("login-back").addEventListener("click", () => {
  stepPass.hidden = true;
  stepWho.hidden = false;
  loginErr.hidden = true;
  passInput.value = "";
});

stepPass.addEventListener("submit", async (e) => {
  e.preventDefault();
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
  enterChat();
});

document.getElementById("signout").addEventListener("click", async () => {
  await sb.auth.signOut();
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
  sb.removeAllChannels();
  sb.channel("usap-tayo")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload) => {
        msgs.push(payload.new);
        appendMsg(payload.new, true);
        refreshSeen();
        if (payload.new.sender_id !== me && !document.hidden) markRead();
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
}

/* back to the login screen without losing our place */
function showLogin(note) {
  chatEl.hidden = true;
  loginEl.hidden = false;
  stepPass.hidden = true;
  stepWho.hidden = false;
  loginErr.hidden = true;
  const noteEl = document.getElementById("login-note");
  if (noteEl) {
    noteEl.textContent = note || "";
    noteEl.hidden = !note;
  }
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = input.value.trim();
  if (!body) return;
  input.value = "";
  autosize();

  let { error } = await sb.from("chat_messages").insert({ sender_id: me, body });

  if (error) {
    // most likely a stale session — check it before giving up
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      input.value = body; // keep her words safe
      autosize();
      showLogin("na-expire ang session, mahal — pasok ka ulit at nandiyan pa rin ang mensahe mo ♡");
      return;
    }
    // session is fine (probably just refreshed) — try once more
    ({ error } = await sb.from("chat_messages").insert({ sender_id: me, body }));
    if (error) {
      input.value = body;
      autosize();
      composer.classList.add("failed");
      setTimeout(() => composer.classList.remove("failed"), 1200);
    }
  }
});

// Enter sends; Shift+Enter makes a new line
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

input.addEventListener("input", autosize);

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

/* mark the partner's unread messages as seen */
async function markRead() {
  await sb
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .neq("sender_id", me)
    .is("read_at", null);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && me) markRead();
});

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

  const row = document.createElement("div");
  row.className = "msg" + (m.sender_id === me ? " mine" : "");
  row.dataset.id = m.id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = m.body;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = timeLabel(date);

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

/* ─── boot: still signed in from last time? ─── */

sb.auth.getSession().then(({ data: { session } }) => {
  if (session) enterChat();
});
