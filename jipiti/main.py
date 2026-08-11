"""
jipiti bot — backend for the "jipiti <prompt>" chat command.

Runs as a background process inside the same container as nginx (see
docker/30-start-jipiti.sh), bound to 127.0.0.1 only. nginx proxies
POST /api/jipiti to it (see nginx.conf.template) so it's never reachable
directly from outside the container and needs no CORS handling — the
browser calls it same-origin.

Pure standard library on purpose: the base image is nginx:alpine, and
avoiding third-party packages means no pip/wheel build step to keep
working across image rebuilds.

Flow per request:
  1. verify the caller's Supabase access token against GoTrue, confirm
     the resulting user is one of the two chat_members (mirrors the RLS
     policy chat_messages itself enforces for normal messages)
  2. answer the HTTP request immediately (202) — the browser already
     sent the "jipiti <prompt>" text as a normal chat message itself;
     this endpoint only needs to produce the *reply*
  3. call OpenAI, then insert the reply as a new chat_messages row
     (sender_id = the dedicated GPT bot account) using the service-role
     key, which bypasses RLS the same way a real member's insert would
     satisfy it. Both clients receive it through the chat's existing
     Realtime subscription — no realtime code needed here.
"""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUPABASE_URL = "https://rrfelwwoypouqcjbdzrb.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_RPXksA5y0cj00OUH9lW6eA_2q4FtbFi"
GPT_BOT_SENDER_ID = "fb893ccc-5c16-4d6b-9042-62b139f2b6bc"  # auth.users row seeded for this bot; not a chat_members row

_missing = [
    name
    for name in ("SUPABASE_SERVICE_ROLE_KEY", "GPT_API_KEY")
    if not os.environ.get(name)
]
if _missing:
    # printed, not raised: a bare KeyError traceback here is easy to miss
    # in Render's log stream and gives no hint about *which* var to add.
    # This process is backgrounded by docker/30-start-jipiti.sh, so exiting
    # only disables "jipiti" — nginx and the rest of the site start fine
    # regardless, but every /api/jipiti call 502s until this is fixed.
    print(f"jipiti: missing required env var(s): {', '.join(_missing)} — exiting, 'jipiti' will 502 until set")
    raise SystemExit(1)

SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GPT_API_KEY = os.environ["GPT_API_KEY"]
GPT_MODEL = os.environ.get("GPT_MODEL", "gpt-4o-mini")
PORT = int(os.environ.get("JIPITI_PORT", "8001"))

MAX_PROMPT_LEN = 2000
SYSTEM_PROMPT = (
    "You are a warm, concise assistant chiming into a private two-person "
    "chat between a couple. Keep replies short and conversational."
)
FALLBACK_REPLY = "hindi ko na-abot si ChatGPT ngayon, mahal — subukan ulit mamaya ♡"


def http_json(method, url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        return res.status, (json.loads(raw) if raw else None)


def get_authed_user_id(access_token):
    try:
        status, data = http_json(
            "GET",
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {access_token}"},
        )
    except Exception:
        return None
    if status != 200 or not data:
        return None
    return data.get("id")


def is_chat_member(user_id):
    try:
        status, data = http_json(
            "GET",
            f"{SUPABASE_URL}/rest/v1/chat_members?user_id=eq.{user_id}&select=user_id",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            },
        )
    except Exception:
        return False
    return status == 200 and isinstance(data, list) and len(data) > 0


def ask_chatgpt(prompt):
    status, data = http_json(
        "POST",
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GPT_API_KEY}",
            "Content-Type": "application/json",
        },
        body={
            "model": GPT_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 500,
        },
        timeout=60,
    )
    return data["choices"][0]["message"]["content"].strip()


def post_bot_message(body_text):
    http_json(
        "POST",
        f"{SUPABASE_URL}/rest/v1/chat_messages",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        body={"sender_id": GPT_BOT_SENDER_ID, "body": body_text},
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # nginx already logs the public-facing request

    def _send(self, status, payload=None):
        body = json.dumps(payload).encode("utf-8") if payload is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_POST(self):
        if self.path != "/jipiti":
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "bad json"})
            return

        prompt = (payload.get("prompt") or "").strip()[:MAX_PROMPT_LEN]
        auth_header = self.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.lower().startswith("bearer ") else ""

        if not prompt or not token:
            self._send(400, {"error": "missing prompt or token"})
            return

        user_id = get_authed_user_id(token)
        if not user_id or not is_chat_member(user_id):
            self._send(401, {"error": "not a chat member"})
            return

        # the browser already sent "jipiti <prompt>" as a normal chat
        # message; this response only acks that the reply is coming
        self._send(202, {"ok": True})

        try:
            reply = ask_chatgpt(prompt)
        except Exception:
            reply = FALLBACK_REPLY
        try:
            post_bot_message(reply)
        except Exception:
            pass  # nothing more we can do without a client connection to report to


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()
