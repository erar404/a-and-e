/* ════════════════════════════════════════════
   Call Check — standalone diagnostics for the
   "Usap Tayo" WebRTC audio/video call feature.

   Runs the same building blocks a real call uses
   (getUserMedia, the Supabase Realtime signaling
   channel, and STUN candidate gathering) in
   isolation, so a failure can be pinned to one
   step instead of just "the call didn't connect".
   ════════════════════════════════════════════ */

// same project as chat.js — the anon/publishable key is meant to be public
const SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi";

// must match ICE_SERVERS in chat.js — keep in sync if that ever changes
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const runBtn = document.getElementById("run-btn");
const copyBtn = document.getElementById("copy-btn");
const copyNote = document.getElementById("copy-note");
const verdictEl = document.getElementById("verdict");
const verdictTitle = document.getElementById("verdict-title");
const verdictBody = document.getElementById("verdict-body");
const previewVideo = document.getElementById("preview-video");

const report = []; // plain-text lines for the "copy report" button

function setStatus(test, state, text) {
  const icon = document.getElementById(`icon-${test}`);
  const detail = document.getElementById(`detail-${test}`);
  icon.className = `check-icon ${state}`;
  icon.textContent = { running: "◐", pass: "✓", warn: "!", fail: "✕" }[state] || "○";
  detail.textContent = text;
  report.push(`[${state.toUpperCase()}] ${test}: ${text.replace(/\n/g, " / ")}`);
}

function mediaErrorMessage(err) {
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Blocked — camera/mic permission was denied. Check the browser's site permissions (and, on WorkSpaces, that USB/webcam redirection is enabled for the session).";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera/mic was found. On Amazon WorkSpaces this usually means local webcam/mic redirection isn't turned on for the session — check the WorkSpaces client's device settings.";
  }
  if (name === "NotReadableError") {
    return "A camera/mic was found but another app already has it open.";
  }
  return `Could not access camera/mic (${name || "unknown error"}).`;
}

async function testEnvironment() {
  setStatus("env", "running", "Checking…");
  const lines = [];
  let worst = "pass";

  const isSecure = window.isSecureContext;
  lines.push(isSecure ? "Secure context (https/localhost): yes" : "Secure context: NO — getUserMedia will be blocked on a plain http:// origin");
  if (!isSecure) worst = "fail";

  const hasRTC = typeof RTCPeerConnection !== "undefined";
  lines.push(hasRTC ? "WebRTC (RTCPeerConnection): supported" : "WebRTC: NOT supported by this browser");
  if (!hasRTC) worst = "fail";

  const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  lines.push(hasMedia ? "getUserMedia: supported" : "getUserMedia: NOT supported by this browser");
  if (!hasMedia) worst = "fail";

  lines.push(`User agent: ${navigator.userAgent}`);

  setStatus("env", worst, lines.join("\n"));
  return worst;
}

async function testMedia() {
  setStatus("media", "running", "Requesting camera/mic permission…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput").length;
    const mics = devices.filter((d) => d.kind === "audioinput").length;
    previewVideo.srcObject = stream;
    previewVideo.hidden = false;
    setStatus(
      "media",
      "pass",
      `OK — got audio + video.\nCameras detected: ${cams}, microphones detected: ${mics}.\n(Live preview shown below.)`
    );
    // stop tracks after a short preview so the camera light doesn't stay on
    setTimeout(() => stream.getTracks().forEach((t) => t.stop()), 6000);
    return "pass";
  } catch (e) {
    setStatus("media", "fail", mediaErrorMessage(e));
    return "fail";
  }
}

function testSignaling() {
  return new Promise((resolve) => {
    setStatus("signal", "running", "Connecting to Supabase Realtime…");
    let done = false;
    let client;
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      setStatus("signal", "fail", `Could not create Supabase client: ${e.message}`);
      resolve("fail");
      return;
    }

    const channelName = "call-check-" + Math.random().toString(36).slice(2);
    const channel = client.channel(channelName, { config: { broadcast: { self: true } } });
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      setStatus(
        "signal",
        "fail",
        `Timed out after 8s waiting for Supabase Realtime (${SUPABASE_URL}).\nThis is the same connection the call uses to ring/answer. If this fails but general internet works, something (proxy/firewall) is blocking WebSocket (wss://) traffic to this host.`
      );
      channel.unsubscribe();
      resolve("fail");
    }, 8000);

    channel
      .on("broadcast", { event: "ping" }, () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        setStatus("signal", "pass", "OK — connected and round-tripped a message through Supabase Realtime.");
        channel.unsubscribe();
        resolve("pass");
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event: "ping", payload: {} });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          setStatus("signal", "fail", `Realtime subscription failed (status: ${status}).`);
          resolve("fail");
        }
      });
  });
}

function testIce() {
  return new Promise((resolve) => {
    setStatus("ice", "running", "Gathering ICE candidates via STUN (up to 6s)…");
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const counts = { host: 0, srflx: 0, relay: 0, prflx: 0, other: 0 };
    let finished = false;

    function classify(candStr) {
      const m = /\btyp (\w+)/.exec(candStr || "");
      const type = m ? m[1] : "other";
      counts[type] = (counts[type] || 0) + 1;
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) classify(e.candidate.candidate);
    };

    function finish() {
      if (finished) return;
      finished = true;
      pc.close();

      const summary = `Candidates found — host: ${counts.host}, server-reflexive (STUN): ${counts.srflx}, relay (TURN): ${counts.relay}.`;

      if (counts.srflx > 0) {
        setStatus(
          "ice",
          "pass",
          `${summary}\nOutbound UDP to the STUN server worked, so this network can usually punch through to the other side directly. Note: this app has no TURN server configured, so if the OTHER computer's network blocks UDP, the call can still fail even though this side passes.`
        );
        resolve("pass");
      } else if (counts.host > 0) {
        setStatus(
          "ice",
          "fail",
          `${summary}\nNo server-reflexive (STUN) candidates were gathered at all — outbound UDP to stun.l.google.com:19302 appears to be blocked or filtered by this network. This is a very common restriction on managed/VDI networks like Amazon WorkSpaces. Without STUN (or a TURN relay, which this app doesn't have configured), WebRTC has no way to establish the call and it will hang or drop right when connecting.`
        );
        resolve("fail");
      } else {
        setStatus(
          "ice",
          "fail",
          `${summary}\nNo ICE candidates were gathered at all (not even local ones). This usually points to the browser/OS blocking WebRTC entirely, or a very restrictive network/security policy.`
        );
        resolve("fail");
      }
    }

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };

    pc.createDataChannel("call-check");
    pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish());

    setTimeout(finish, 6000);
  });
}

function renderVerdict(results) {
  verdictEl.hidden = false;
  const { env, media, signal, ice } = results;

  if (env === "fail") {
    verdictEl.className = "check-verdict fail";
    verdictTitle.textContent = "Hindi kaya ng browser na ito ang tumawag";
    verdictBody.textContent =
      "Basic browser support (secure connection or WebRTC itself) is missing. Try a current version of Chrome or Edge, and make sure the page is loaded over https:// (not http://).";
  } else if (ice === "fail") {
    verdictEl.className = "check-verdict fail";
    verdictTitle.textContent = "Malamang: naka-block ang UDP/STUN sa network na ito";
    verdictBody.textContent =
      "This is the most likely reason calls fail on this computer. WebRTC calls need outbound UDP to a STUN server to work, and this network isn't allowing it through — very typical for Amazon WorkSpaces, corporate VPNs, and locked-down proxies.\n\n" +
      "What to try:\n" +
      "• Ask IT/network admin to allow outbound UDP (not just TCP/443) from the WorkSpace, at least to stun.l.google.com and stun1.l.google.com on port 19302.\n" +
      "• If that's not possible, the app needs a TURN server (a relay that works over TCP/443 even when UDP is blocked) — plain STUN can't fix this, since STUN only works when direct UDP is allowed. Flag this back to Erwin; a TURN relay needs to be added to chat.js.\n" +
      "• As a workaround for now, try the call from a regular (non-WorkSpaces) network to confirm it's the network and not the app.";
  } else if (media === "fail") {
    verdictEl.className = "check-verdict warn";
    verdictTitle.textContent = "Network looks fine — camera/mic access is the blocker";
    verdictBody.textContent =
      "Signaling and STUN both look OK, so the call itself should be able to connect once camera/mic access works. See the detail under step 2 above for the specific fix (permissions vs. no device found vs. device in use).\n\n" +
      "On Amazon WorkSpaces specifically: local webcam/mic redirection has to be explicitly enabled in the WorkSpaces client (Settings → Webcam/Microphone redirection) before the in-session browser can see the device at all.";
  } else if (signal === "fail") {
    verdictEl.className = "check-verdict warn";
    verdictTitle.textContent = "Hindi maabot ang signaling server";
    verdictBody.textContent =
      "Camera/mic and STUN look fine, but this network can't reach Supabase Realtime, so the call invite itself (offer/answer/hangup) never gets delivered. This looks like a firewall/proxy blocking WebSocket (wss://) connections to *.supabase.co. Ask IT to allow it, or try a different network.";
  } else {
    verdictEl.className = "check-verdict ok";
    verdictTitle.textContent = "Lahat maayos dito ♡ — this computer should be able to call";
    verdictBody.textContent =
      "Every step passed: camera/mic access works, the signaling channel connects, and outbound STUN/UDP is open. If calls still fail when actually dialing between the two of you, run this same check on the OTHER computer too — a call needs BOTH sides to have working network access, and it only takes one side being blocked (e.g. the other one being on WorkSpaces with UDP blocked) for the call to fail.";
  }

  report.push("");
  report.push(`VERDICT: ${verdictTitle.textContent}`);
  report.push(verdictBody.textContent);
}

async function runAll() {
  runBtn.disabled = true;
  runBtn.textContent = "Sinusuri…";
  copyBtn.hidden = true;
  copyNote.hidden = true;
  verdictEl.hidden = true;
  report.length = 0;
  report.push(`Call Check report — ${new Date().toISOString()}`);

  const env = await testEnvironment();
  const media = env === "fail" ? "fail" : await testMedia();
  const signal = await testSignaling();
  const ice = await testIce();

  renderVerdict({ env, media, signal, ice });

  runBtn.disabled = false;
  runBtn.textContent = "Ulitin ♡ Run again";
  copyBtn.hidden = false;
}

runBtn.addEventListener("click", runAll);

copyBtn.addEventListener("click", async () => {
  const text = report.join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API unavailable/blocked — fall back to a visible textarea-free prompt
    window.prompt("Kopyahin ang resulta (Ctrl+C):", text);
    return;
  }
  copyNote.hidden = false;
});
