# 💬 "Usap Tayo" — Private Chat Page Execution Plan

A private, two-person-only chat page for Erwin & Alliah, added to the
Walong Buwan site. Check off each step as it's accomplished — mark `[x]`.

> **STATUS: EXECUTED ✅** (July 6, 2026) — backend on the **bandapa** Supabase
> project, verified end-to-end via the public API. See decision notes at the
> bottom for what changed from the original plan.

---

## Tech Stack (decided)

| Layer     | Choice                                   | Why                                                                 |
|-----------|------------------------------------------|---------------------------------------------------------------------|
| Frontend  | Vanilla HTML/CSS/JS (`chat.html`)        | Matches the existing site — no build step, same fonts & aesthetic    |
| Backend   | **Supabase** (bandapa project: Postgres + Realtime + Auth) | Free tier, no server to run, live message delivery over websockets  |
| Auth      | Supabase Auth (email + password)         | Two pre-created accounts; passwords = birthdates; secure via RLS    |
| Hosting   | Unchanged (nginx Docker → Cloud Run/Render) | Chat page is just another static file; Supabase is called from the browser |

### Accounts

| Person  | Login (hidden behind name button) | Password (birthdate, MMDDYYYY) |
|---------|-----------------------------------|--------------------------------|
| Erwin   | erwin@eanda.chat                  | `10111997` (Oct 11, 1997)      |
| Alliah  | alliah@eanda.chat                 | `01102001` (Jan 10, 2001)      |

> The emails are just login identifiers — the login screen shows name buttons,
> nobody ever types an email. Row Level Security means even a correct password
> guess only matters with the matching email, and only these two accounts are
> in `chat_members`.

---

## Phase 1 — Supabase project setup

- [x] 1.1 Reuse the **bandapa** Supabase project (per Erwin's instruction)
- [x] 1.2 ~~Disable public signups~~ **Skipped on purpose** — bandapa needs
      signups; the `chat_members` RLS gate makes stray accounts harmless
- [x] 1.3 Created both accounts (SQL, auto-confirmed, bcrypt birthdate passwords)
- [x] 1.4 Project URL + publishable key wired into `chat.js`

## Phase 2 — Database schema

- [x] 2.1 `chat_messages` table (`id`, `sender_id → auth.users`, `body`,
      `created_at`, `read_at`) — named `chat_*` to coexist with bandapa tables
- [x] 2.2 RLS enabled (+ `chat_members` gate table + `is_chat_member()` helper)
- [x] 2.3 Policies: only the two members can select/insert
      (insert requires `sender_id = auth.uid()`); update limited to marking
      the partner's `read_at` (column-level grant blocks body edits)
- [x] 2.4 Realtime enabled on `chat_messages`
- [x] 2.5 `read_at` column for the "seen" indicator

## Phase 3 — Login screen (`chat.html`)

- [x] 3.1 `chat.html` + `chat.css` + `chat.js` in the site's aesthetic
      (grain, aurora, Cormorant, rose palette)
- [x] 3.2 Login: pick Erwin / Alliah name button → enter birthdate password
- [x] 3.3 `signInWithPassword()`; Tagalog error on wrong password
      ("hindi tama, mahal… subukan mo ulit ♡")
- [x] 3.4 Session persists (localStorage); "lisan" sign-out button

## Phase 4 — Chat UI

- [x] 4.1 Their messages left (dark card), yours right (paper card)
- [x] 4.2 Composer: autosizing textarea, Enter sends, Shift+Enter = new line
- [x] 4.3 Loads last 100 messages
- [x] 4.4 Realtime subscription — new messages appear instantly
- [x] 4.5 Auto-scroll + Tagalog date separators ("ngayon", "kahapon", "Hulyo 6")
      and times ("8:14 ng gabi")
- [x] 4.6 Mobile-first layout (safe-area insets for phones)
- [x] 4.7 "nakita ♡" seen indicator via `read_at` (heart reactions: someday)

## Phase 5 — Link it into the site

- [x] 5.1 Discreet cursive "usap tayo ♡" link under the letter's footer note
- [x] 5.2 nginx serves it as a static file — nothing to configure

## Phase 6 — Test & deploy

- [x] 6.1 Verified via the public API: both birthdate logins OK, Erwin sent,
      Alliah received (test message cleaned up after)
- [x] 6.2 Verified anonymous requests see zero rows; wrong password rejected
- [x] 6.3 Supabase security advisors run; chat helper function locked down
      (`is_chat_member` no longer callable by anon)
- [ ] 6.4 Commit & deploy (Cloud Run or Render, same command as README)
- [ ] 6.5 Send Alliah the link 💌 — password: her birthdate, `01102001`

---

## Decision notes (deviations from the original plan)

1. **Dedicated chat emails** (`erwin@eanda.chat` / `alliah@eanda.chat`):
   Erwin's real email already had a bandapa account — reusing it would have
   forced his bandapa password to become his birthdate. Separate accounts
   keep the two apps independent. The emails are invisible in the UI.
2. **Signups stay enabled** on the project because bandapa needs them;
   security comes from the `chat_members` allow-list, not from closing the door.
3. **Tables are `chat_members` / `chat_messages`** (not plain `messages`)
   to stay clearly separated from bandapa's schema.
4. Leaked-password protection stays off — it would likely reject the
   birthdate passwords, which are a deliberate choice here.
