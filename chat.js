/* ════════════════════════════════════════════
   Usap Tayo — private chat for the two of us
   Backend: Supabase (auth + chat_messages + realtime)
   ════════════════════════════════════════════ */

const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";

// the login screen shows names, never emails
const ACCOUNTS = { Erwin: "erwin@eanda.chat", Alliah: "alliah@eanda.chat" };

const loginEl = document.getElementById("login");
const chatEl = document.getElementById("chat");
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

let me = null; // my user id
let names = {}; // user_id -> display name
let selectedName = null;
let msgs = [];
let pendingFile = null; // image chosen but not yet sent

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

// no need to pick yourself twice — remember who was here last time
const lastWho = localStorage.getItem("usap-who");
if (lastWho && ACCOUNTS[lastWho]) showPass(lastWho);

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

  setupCallChannel();
  setupPush();
}

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
  if (file.size > 8 * 1024 * 1024) {
    alert("masyadong malaki ang larawan, mahal ♡");
    return;
  }
  pendingFile = file;
  attachPreviewImg.src = URL.createObjectURL(file);
  attachPreview.hidden = false;
});

attachRemove.addEventListener("click", clearAttachment);

function clearAttachment() {
  pendingFile = null;
  attachPreview.hidden = true;
  attachPreviewImg.src = "";
}

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
  if (!document.hidden && me && sb) markRead();
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

  if (m.attachment_path) {
    renderImageBubble(bubble, m);
  } else {
    bubble.textContent = m.body;
  }

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

/* ─── audio / video calls (WebRTC, signaled over a Supabase Realtime broadcast channel) ─── */

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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
const callHangupBtn = document.getElementById("call-hangup");

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

function setupCallChannel() {
  callChannel = sb.channel("usap-tayo-call", { config: { broadcast: { self: false } } });
  callChannel
    .on("broadcast", { event: "offer" }, ({ payload }) => handleOffer(payload))
    .on("broadcast", { event: "answer" }, ({ payload }) => handleAnswer(payload))
    .on("broadcast", { event: "ice" }, ({ payload }) => handleRemoteIce(payload))
    .on("broadcast", { event: "hangup" }, ({ payload }) => handleHangup(payload))
    .on("broadcast", { event: "busy" }, ({ payload }) => handleBusy(payload))
    .subscribe();
}

function sendSignal(event, payload) {
  if (!callChannel) return;
  callChannel.send({ type: "broadcast", event, payload: { ...payload, from: me, callId } });
}

function createPeerConnection() {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  conn.onicecandidate = (e) => {
    if (e.candidate) sendSignal("ice", { candidate: e.candidate.toJSON() });
  };
  conn.ontrack = (e) => {
    remoteVideoEl.srcObject = e.streams[0];
  };
  conn.onconnectionstatechange = () => {
    if (conn.connectionState === "connected") {
      if (callState === "idle") return;
      callState = "active";
      showActiveControls();
      startTimer();
    } else if (["failed", "disconnected", "closed"].includes(conn.connectionState)) {
      if (callState !== "idle") endCall();
    }
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

// ends the call locally with a readable status, optionally telling the other side why
function failCall(message, signalReason) {
  setCallStatus(message);
  if (signalReason) sendSignal("hangup", { reason: signalReason });
  setTimeout(endCall, 2200);
}

async function startCall(video) {
  if (callState !== "idle" || !callPeer) return;
  isVideoCall = video;
  callId = crypto.randomUUID();
  callState = "outgoing";
  showCallUI();
  callNameEl.textContent = names[callPeer] || "mahal";
  setCallStatus(`tumatawag kay ${names[callPeer] || "iyo"}…`);
  showOutgoingControls();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  } catch (e) {
    // no offer was ever sent — she was never rung, so there's no one to signal
    failCall(mediaErrorMessage(e), null);
    return;
  }
  localVideoEl.srcObject = localStream;
  localVideoEl.hidden = !video;

  pc = createPeerConnection();
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
  showCallUI();
  callNameEl.textContent = names[from] || "mahal";
  setCallStatus(`tumatawag si ${names[from] || "siya"}…`);
  callAvatar.classList.add("ringing");
  showIncomingControls();
}

async function acceptCall() {
  if (callState !== "incoming" || !pendingOffer) return;
  setCallStatus("kumokonekta…");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
  } catch (e) {
    // caller is actively waiting on this one — tell them why it failed, not just "declined"
    failCall(mediaErrorMessage(e), "media-error");
    return;
  }
  localVideoEl.srcObject = localStream;
  localVideoEl.hidden = !isVideoCall;

  pc = createPeerConnection();
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
  flushPendingCandidates();
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal("answer", { sdp: answer });
  showActiveControls();
}

function declineCall() {
  sendSignal("hangup", { reason: "declined" });
  endCall();
}

function hangupCall() {
  if (callState !== "idle") sendSignal("hangup", { reason: "ended" });
  endCall();
}

async function handleAnswer({ from, sdp, callId: rid }) {
  if (from === me || from !== callPeer || rid !== callId || !pc) return;
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
  setCallStatus("abala siya ngayon ♡");
  setTimeout(endCall, 1500);
}

function endCall() {
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
  hideCallUI();
}

function showCallUI() {
  callOverlay.hidden = false;
  callAvatar.hidden = false;
  callMuteBtn.classList.remove("off");
  callCamBtn.classList.remove("off");
}

function hideCallUI() {
  callOverlay.hidden = true;
  callAvatar.classList.remove("ringing");
  [callAcceptBtn, callDeclineBtn, callMuteBtn, callCamBtn, callHangupBtn].forEach((b) => (b.hidden = true));
}

function showOutgoingControls() {
  callAcceptBtn.hidden = true;
  callDeclineBtn.hidden = false;
  callMuteBtn.hidden = true;
  callCamBtn.hidden = true;
  callHangupBtn.hidden = true;
}

function showIncomingControls() {
  callAcceptBtn.hidden = false;
  callDeclineBtn.hidden = false;
  callMuteBtn.hidden = true;
  callCamBtn.hidden = true;
  callHangupBtn.hidden = true;
}

function showActiveControls() {
  callAcceptBtn.hidden = true;
  callDeclineBtn.hidden = true;
  callMuteBtn.hidden = false;
  callCamBtn.hidden = !isVideoCall;
  callHangupBtn.hidden = false;
  callAvatar.hidden = isVideoCall;
  callAvatar.classList.remove("ringing");
  setCallStatus("");
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

callMuteBtn.addEventListener("click", () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  callMuteBtn.classList.toggle("off", !track.enabled);
});

callCamBtn.addEventListener("click", () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  callCamBtn.classList.toggle("off", !track.enabled);
  localVideoEl.hidden = !track.enabled;
});

window.addEventListener("beforeunload", () => {
  if (callState !== "idle") sendSignal("hangup", { reason: "left" });
});

/* ─── push notifications for new messages ─── */

const VAPID_PUBLIC_KEY =
  "BNIujtEXG7qLnWE3lUv7FoNV2Jfq_4Y1CCQdR_ZApi3f5tGbEGeIggekWLGIRA_BcDIoPqGWEgiXMPW91FQCKlQ";

const notifyBtn = document.getElementById("notify-btn");

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function setupPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

  let reg;
  try {
    reg = await navigator.serviceWorker.register("sw.js");
  } catch {
    return;
  }

  if (Notification.permission === "granted") {
    notifyBtn.hidden = true;
    subscribePush(reg);
  } else if (Notification.permission === "default") {
    notifyBtn.hidden = false;
  } else {
    notifyBtn.hidden = true;
  }
}

notifyBtn.addEventListener("click", async () => {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  notifyBtn.hidden = true;
  subscribePush(reg);
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
