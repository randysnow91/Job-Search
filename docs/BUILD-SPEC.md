# Claude Code Build Spec — Job Search Agent App

**Status:** v2.0 — V1 COMPLETE (build/implementation spec)
**Derived from:** `job-search-app-PRD.md` (the product document — read it first)
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date       | Summary |
|---------|------------|---------|
| v1.0    | 2026-07-02 | Initial spec |
| v1.1    | 2026-07-03 | Added VERIFICATION_ENABLED env flag to M2 definition-of-done; added V2 per-profile verification and V4-ish "Companies worth following" to §14 |
| v1.2    | 2026-07-04 | Removed minimum-jobs target; Search Time Budget is the primary limit with an optional Max Jobs ceiling (whichever comes first); results now captured incrementally with partial-results-on-stop. |
| v1.3    | 2026-07-04 | Corrected search-model guidance: Opus 4.8 is the known-good default (Sonnet 5 did not complete a 120s run; Haiku errored); root cause not yet determined. Documented that true partial-results-on-timeout for a single long call requires streaming (deferred past M2). Both stopping conditions verified in testing. PRD unaffected (stays v1.2). |
| v1.4    | 2026-07-06 | M4 dedup ships with steps 1–2 (exact URL + normalized company/title/location key); step 3 (model judgment for near-matches) deferred pending testing. Documented recall-first "when in doubt keep both" bias and the step-2 same-title over-merge blind spot. PRD unaffected. |
| v1.5    | 2026-07-06 | Report-view exclusion behavior: dismissing/applying grays the result in place (not removed), keeping View and Restore links active; Restore fully un-excludes. Both reason tags (applied/dismissed) surfaced in the report UI. Verified against a live run. |
| v1.6    | 2026-07-06 | Documented the two-model split: Opus 4.8 for the agentic search (`SEARCH_MODEL`), Haiku 4.5 for the lightweight ranking/why-line pass (`RANK_MODEL`, overridable) — a deliberate cost decision. Clarified Haiku errored on *search* but is reliable for *ranking*. M6 recall test verified. PRD unaffected. |
| v1.7    | 2026-07-07 | M7 auth verified (credential rejection, per-user isolation confirmed via UI and direct-URL/RLS test). Documented account management (email/password change, password reset, deletion) as a deliberate V1 non-goal in §12 and an upgrade path in §14, with password reset flagged as the priority item in that bucket. PRD unaffected. (wording corrected: email typo could not be fixed via SQL or dashboard, only by recreating the account) |
| v1.8    | 2026-07-09 | M8 UI messaging: no-key message (verified), credits note (verified), friendly API-error handling — 401 (invalid key) and log-scrubbing verified with live tests; 402/429 message handling implemented but pending live confirmation. Sign out button noted. Auth routing and session-persistence documented as V1 decisions with idle-timeout deferred (§12, §14). Exclusion-list wording updated from "global" to "per-user, account-wide" throughout; cross-user isolation verified. PRD unaffected. |
| v1.9    | 2026-07-10 | Verification stays OFF for V1: testing showed it's instructional (model-dependent), not code-enforced, so it doesn't reliably check the final result set (closed jobs reached the report). Documented the honest finding, kept the "results may be unverified" posture for V1, and specified the V2 fix as a code-enforced post-search verification pass (with its honest limits). Recorded the judgment-vs-guarantee design lesson. Noted a secondary logging bug (tool_use vs server_tool_use). PRD unaffected. |
| v2.0    | 2026-07-10 | V1 COMPLETE. All milestones M0–M9 built, deployed to Render, and verified end-to-end on the live site via a full stranger-journey test (fresh signup → home → profile → own API key → search → report). Fixed a fresh-login redirect bug found in live testing. Recorded one deferred V1 limitation: context-aware report back-link (V2). PRD unaffected. |

> **How to use this document.**
> The PRD says *what* and *why*. This spec says *how, with what, and in what order*.
> **Do not paste this whole file into Claude Code and say "build it."** Work through
> the **Milestones** (§9) one at a time, verifying each against its acceptance checks
> before moving on. That is the core discipline of building this well: small,
> verifiable steps, each committed to Git.
>
> **Re-verify moving details at build time.** Exact platform limits, the hosted
> web-search tool identifier, and model ID strings change. Check current Anthropic and
> Render docs when you reach the relevant milestone rather than trusting a number
> written here.

---

## 1. Recommended Tech Stack (and why)

These are recommendations, chosen for a fast first build, a genuine public deployment,
and beginner-friendly "vibe coding." Each is defensible in an interview. You can swap
any of them — the reasoning is here so you know what you'd be trading.

| Layer | Choice | Why this one |
|---|---|---|
| **Framework** | **Next.js (App Router)** | Frontend and backend (API routes) in one repo, one language. The most tutorial-covered, Claude-Code-friendly stack. |
| **Hosting** | **Render** (Hobby workspace + one **Starter** web-service instance, ~$7/mo) | Deploys from GitHub → a public link (a hard PRD requirement). Unlike serverless hosts, Render runs a **persistent server** with request timeouts up to ~100 min and **first-class background workers + cron** — so the long-running search and later scheduling are native, not workarounds. A paid Starter instance also keeps the demo **always warm** (free instances cold-start ~30–60s, which kills a portfolio demo). See §3.1. |
| **Database + Auth** | **Supabase** | Managed Postgres + built-in auth + a friendly dashboard, generous free tier. Gives per-user data scoping and sign-in without building either from scratch. |
| **Search engine** | **Anthropic Messages API + hosted web-search tool**, lightweight agent loop | Pure HTTP calls — deploys anywhere, no bundled binary, no scraping infrastructure. See §3.2 for why not the Agent SDK. |
| **Search model** | **Claude Opus 4.8** (`claude-opus-4-8`), via `SEARCH_MODEL` | For the agentic search itself (tool use, multi-step web search): in testing, Opus 4.8 reliably **completes** a run within the time budget; **Sonnet 5 did not complete a run within a 120s budget**, and **Haiku 4.5 errored** on this workload. Opus is the known-good default for search (see §10). |
| **Ranking model** | **Claude Haiku 4.5** (default), via `RANK_MODEL` (overridable) | For the lightweight matching/ranking + "why"-line pass, which runs AFTER search on a fixed candidate list — no tools, just text-in / JSON-out. A cheap model is sufficient here and cuts cost. Note: Haiku errored on the *agentic search* (a hard task) but is reliable for *ranking* (a light one) — different tasks, different requirements. Verified working in M6. |
| **Long-running / scheduled work** | **Render background workers + cron** (native) | For deeper V1 runs and V2 scheduling. Because Render supports these as first-class service types, no third-party durable-execution service is needed (see §3.1, §14). |

**Language:** TypeScript throughout (type safety helps Claude Code produce correct code
and is the norm for this stack).

---

## 2. Architecture at a Glance

```
Browser (Next.js UI)          [served by Render web service]
  │  user picks a Search Profile, clicks Run
  │  sends: profile params + user's API key (per run, over HTTPS)
  ▼
Server route (Render)  ── the SEARCH ENGINE (server-side) ─────────┐
  │  persistent server: long runs allowed (~100 min), no fn timeout │
  │  1. load global exclusion list for this user                    │
  │  2. agent loop: Claude (Messages API) + hosted web-search tool   │
  │     → source discovery, read pages, gather candidates            │
  │  3. dedup + apply exclusion list                                 │
  │  4. matching/ranking (recall-first judgment) + "why" line        │
  │  5. stream progress back; save the report                       │
  │  API key held in memory for THIS run only, then discarded       │
  └─────────────────────────────────────────────────────────────────┘
  │
  ▼
Supabase (Postgres)   Users · Profiles · Reports · Results · Exclusion list
                      (the API key is NEVER written here — see §7)
```

---

## 3. Two Architecture Decisions Called Out

### 3.1 The long-running search and why the host matters
A deep agentic search runs for many minutes. **Serverless** functions (Vercel/Netlify-
style) cap out in the low-minutes range, which would force a workaround. This is *why the
host was chosen*: Render runs a **persistent server**, so a request can run far longer
(up to ~100 minutes on a paid instance) and Render offers **background workers and cron
as first-class service types**. The platform constraint that would have shaped the
architecture on serverless simply isn't there.

**Decision for V1:** run the search **synchronously with streamed progress** on the
Render web service, with a **configurable time budget** (the budget now exists for *cost*
control — PRD §7.1 — not because the platform forces it). Start with a modest budget and
raise it once it's stable. No queue or separate worker needed to ship V1.

**Upgrade path (deeper runs + V2 scheduling):** move the engine into a **Render
background worker**, triggered on demand and, for V2, on a **Render cron schedule**. Same
platform, native features — no third-party durable-execution service to bolt on.

> Note: because Render doesn't force a short cap, V1 runs can be genuinely deeper than
> they would have been on serverless — closer to the original agent's depth, bounded only
> by the cost budget you choose.

### 3.2 Why the Messages API, not the Claude Agent SDK
The Agent SDK runs the tool loop for you and ships built-in tools — attractive. But it's
built around coding-agent tools (file editing, bash) and bundles a Claude Code binary,
which is heavier than this app needs when all we want is web search. The **Messages API +
hosted web-search tool** is just HTTP: light, portable, and the loop is modest code
Claude Code can write — which also keeps the door open to running it in a plain Render
background worker later. (On a persistent Render server the SDK *could* run, so this is
now a simplicity/right-sized-tool call rather than a hard deployment limit. If the engine
later needs richer tool orchestration, revisiting the Agent SDK is reasonable — but not
for V1.)

---

## 4. Data Model (concrete schema)

Postgres tables (Supabase). **Every user-owned row carries `user_id`** so the app is
multi-user from day one, even while V1 is used by one person.

**`users`** — provided by Supabase Auth (id, email, created_at).

**`search_profiles`**
- `id`, `user_id`
- `name`
- `positions` (JSON: ordered list — the order *is* the preference ranking)
- `industry` (text)
- `keywords` (JSON: a flat list of skill terms — see PRD §4.4; no must/nice tiers)
- `location` (JSON: { mode: "remote" | "city" | "both", city?, region? })
- `filters` (JSON: e.g. { min_pay })
- `time_budget_seconds` (int), `max_jobs` (int, **nullable/optional** — a ceiling, not a target)
- `created_at`, `updated_at`

**`reports`**
- `id`, `profile_id`, `user_id`
- `run_started_at`, `run_finished_at`
- `overview` (text — the summary header)
- `stopped_reason` ("time_budget" | "max_reached")
- `jobs_found` (int)

**`results`** (one row per job in a report)
- `id`, `report_id`, `user_id`
- `company`, `title`
- `why` (text — the recall/ranking explanation line)
- `salary` (text | null → render "No salary listed" when null)
- `location_display` (text — includes remote + proximity, e.g. "Remote (US) · HQ ~40 min, St. Louis")
- `source` (text), `link` (url)
- `rank` (int)
- `job_identity` (text — the dedup key; see §11)
- `status` ("in_report" | "saved")

**`exclusions`** (the per-user, account-wide list — one list per user, shared across that user's profiles, NOT tied to a specific profile; isolated between users by RLS)
- `id`, `user_id`
- `job_identity` (text — how we recognize the same role again; see §11)
- `company`, `title` (for display)
- `reason` ("applied" | "dismissed")
- `created_at`

---

## 5. The Search Engine (the heart of the app)

A single run, server-side, executes these steps:

1. **Load context.** Fetch this user's full `exclusions` list.
2. **Plan sources (source discovery — the differentiator).** Instruct the model to
   reason about *who* the relevant employers are for the profile's industry — vendors,
   consultancies, and companies with in-house teams — **explicitly including smaller and
   regional employers, not just the obvious big names** — then search those directly, in
   addition to the major boards. Without the "past the obvious" instruction the model
   defaults to the big names.
3. **Agent loop.** Using the Messages API with the hosted web-search tool, iterate: search → read promising results → gather candidate postings. **Capture each qualifying job to the report as it is found — not only at the end.** Continue until a **stopping condition**: `time_budget_seconds` spent, **or** the optional `max_jobs` ceiling reached — **whichever comes first** (there is no minimum-jobs target). On stop, return **whatever has been collected so far** and set `stopped_reason` accordingly. A run that stops early must **never return zero merely because a response was cut off mid-flight** — partial results are expected behavior, not an error.
4. **Deduplicate** candidates against each other and compute each one's `job_identity`
   (§11).
5. **Apply exclusions.** Drop any candidate whose `job_identity` matches the exclusion
   list — including the same role appearing under different wording.
6. **Match & rank (recall-first).** Apply the PRD §4.4 principle:
   - **Hard gates only:** on the exclusion list → out; location genuinely incompatible →
     out. Nothing else is a gate.
   - **Light relevance floor:** include the plausible, exclude only the clearly unrelated.
   - **Rank by judgment**, not a numeric score, ordered by: position fit (steered by the
     profile's ranking) → industry relevance → keyword/skill overlap (more distinct
     matches rank higher) → overall usefulness → location preference.
   - **No score cliff:** never silently drop a qualifying-but-imperfect job.
7. **Explain.** Each result gets a short **"why" line** (why included, why ranked here).
8. **Persist & return.** Write the `report` + `results`; stream progress and the final
   report to the browser.

> **Known limitation (as of v1.3) — partial results depend on the model
> completing.** Results are captured after each *completed* model response
> (including across `pause_turn`/continue iterations). But if a run is a **single
> long API call that never completes within the budget**, the abort fires with
> nothing captured — returning zero, the exact failure PRD §4.2 says must not
> happen. This is currently avoided *in practice* by using Opus 4.8 (which
> completes within budget); it is **not yet structurally fixed**. True
> partial-result recovery for an incomplete single call requires **streaming**
> (capturing results as they stream in), deferred past M2 (see §14). Watch for
> this returning if a larger time budget, verification on, or a harder search ever
> pushes even Opus past the budget without completing.

**Output contract per result** (drives the UI and the acceptance checks):
company · title (displayed as *company + title*) · why-line · salary-or-"No salary
listed" · location_display (remote **and** proximity when both true) · source · link.

**Safety (from PRD §7.4):** never invent openings, salaries, or links. Missing salary →
"No salary listed." Prefer the clearest original source for cross-posted roles.

**Source-access constraint:** rely on the **hosted web-search tool** (public web search).
**Do not build custom scrapers** for sites whose terms prohibit automated access (e.g.
LinkedIn). Public search results and companies' own career pages are the right surface.

---

## 6. API Routes (V1)

- `POST /api/search/run` — body: `{ profileId, apiKey }`. Runs the engine, streams
  progress, persists the report. The **only** place the API key is accepted; it is used
  and discarded (see §7).
- `GET /api/reports?profileId=` — list reports for a profile.
- `GET /api/reports/:id` — one report with results.
- `POST /api/results/:id/save` — mark a result saved.
- `POST /api/results/:id/exclude` — body `{ reason }`. Add to global exclusions
  (applied | dismissed) and gray it out in place in the active report view (it is NOT removed — see §8)
- CRUD for `search_profiles`.
- `GET /api/exclusions`, `POST /api/exclusions/:id/restore` — view and undo exclusions.

---

## 7. API Key Handling (the liability decision — implement exactly)

From PRD §7.3. **Guarantee to users: "we never store your key"** — stated precisely,
because it *must* reach the server briefly to run the search.

- Key entered in the browser; held in **`sessionStorage` or React state only** — never
  `localStorage`, never a cookie.
- Sent **only** to `POST /api/search/run`, over HTTPS, **per run**.
- Held in **server memory for that run only**, passed to the Messages API calls, then
  dropped when the run ends.
- **Never** written to Postgres, disk, logs, error reports, or analytics; never echoed
  back in any response.
- It is the **one piece of user data the system deliberately never persists.** Everything
  else is stored.

> **V2 fork (do not forget):** scheduled/unattended runs can't get the key from a closed
> browser. V2 must consciously choose a storage approach (encrypted-at-rest, secrets
> manager) and **must not inherit this "never stored" promise unchanged.**

---

## 8. UI Screens (V1)

Keep it minimal — enough to demo, no more.
1. **Sign in** (Supabase Auth — email or Google).
2. **API key entry** — a small settings field; explains it's never stored.
   - If a search is attempted with no key, a friendly inline message appears (browser
     checks before sending any request): directs the user to create a key at
     platform.claude.com/settings/keys and notes they'll also need billing credits.
     (Verified.)
   - Near the key field, an informative (not alarming) note that running a search uses
     the user's own Anthropic credits, with a link to check balance at
     platform.claude.com/dashboard. (Verified — link works.)
   - API errors during a search are caught and shown as friendly inline messages, not
     raw errors: invalid/mistyped key (401), out-of-credits/billing (402), rate limit
     (429), and a generic fallback. The user never sees raw JSON, status codes, or
     stack traces. Real error details are logged server-side only, with the API key
     scrubbed so it is never written to logs. STATUS: 401 (invalid key) and log-
     scrubbing verified with live tests; 402/429 message handling implemented but not
     yet confirmed against a live error — pending (402 expected soon as dev credits
     run out).
3. **Profiles list** — create / pick / delete. Deliberately simple (PRD scope guard).
4. **Profile editor** — the parameter form (positions ranked, industry, keywords, location, filters, time budget, optional max-jobs ceiling). The time-budget and max-jobs fields show the user-facing cost descriptions from PRD §4.1.
5. **Run + report view** — click Run, watch progress, see ranked results with the
   "why" line. Each result offers two exclusion actions: **Applied** and
   **Dismiss** (both add the job to the per-user, account-wide exclusion list, tagged with that
   reason). When a result is excluded, it is **grayed out in place — not removed** —
   so the list doesn't reflow and you keep your place. A grayed result shows its
   chosen state ("Applied ✓" or "Dismissed ✓"), a **Restore** link, and keeps its
   **View** link active (you can still open a grayed job's posting). **Restore fully
   un-excludes** — it removes the entry from the exclusion list (verified: excluded
   job appears in the exclusions list, and after Restore it is gone), so the job can
   appear in future runs again.
6. **Saved reports** — review saved results later.
7. **Exclusions view** — see what's excluded; **restore** an entry.

A **Sign out** button is visible in the app nav (on the Profiles list screen).

---

### Auth routing & session behavior

**Auth routing (two layers).** Unauthenticated users are redirected to login;
authenticated users land on their profiles. Routing protects UX, but data is also
protected at the data layer — RLS + server-side auth checks mean a direct URL to a
data page while logged out reveals no data (verified: logged-out direct navigation
bounces to login, shows no data).

**Session persistence (V1 decision).** Login persists across browser close (Supabase
session token) for convenience. The API key does NOT persist (sessionStorage,
cleared when the session ends), so a shared-computer walk-away cannot spend money on
the account — only low-stakes data (saved profiles/reports) would be viewable.
Automatic session expiry / idle timeout is deliberately deferred (see §12, §14). A
manual Sign out button is available.

---

## 9. Build Milestones (work these in order)

**Status: V1 COMPLETE (v2.0).** All milestones M0–M9 built, deployed to Render, and
verified end-to-end on the live public site. Remaining work is V2+ (see §14).

Each milestone is a shippable, verifiable step. Build it, check it, commit it, then move
on. A suggested first Claude Code prompt is given for each.

### M0 — Project skeleton
- **Build:** Next.js + TypeScript app, Git repo, deployed to **Render as a web service**
  (a "hello world") so the public-link pipeline works from day one. Use the free instance
  to start; switch this one service to a **Starter instance (~$7/mo)** before you demo it,
  so it stays warm.
- **Verify:** the live Render URL loads.
- **Prompt seed:** *"Create a new Next.js App Router + TypeScript project, initialize
  Git, and give me the steps to deploy it to Render as a web service from GitHub,
  including the build and start commands Render needs."*

### M1 — Database + a profile
- **Build:** Supabase project; `search_profiles` table; create/list/delete/edit a profile
  from the UI. (Hardcode a dev `user_id` for now.)
- **Verify:** a profile persists across page reloads.

### M2 — The search engine, minimal
- **Build:** `POST /api/search/run` that takes a profile + a key, runs the Messages API
  with the hosted web-search tool in a simple loop, and returns a few real job results.
  Configurable time budget for cost control (§3.1). No dedup/exclusion/ranking yet — just
  prove it searches.
- **Verify:** running a profile returns real, current postings with links.
- > **Added in v1.1:** A `VERIFICATION_ENABLED=true` env flag (default `false`) gates
  > URL-verification logic (the engine fetches each candidate posting to confirm it is
  > still open before including it). The logic is present in the codebase but **off by
  > default** so test runs stay within the time budget. Turning it on increases run time
  > significantly. Verification present but off by default is part of M2's
  > definition-of-done. Per-profile verification control and a UI toggle are **deferred
  > to V2**.
- > **Finding (v1.9 — verification stays OFF for V1).** Final testing showed the
  > verification mechanism, as built, is **instructional, not enforced** — the "verify
  > each posting is still open" step lives in the model's prompt, and the model decides
  > whether to run it. In a real run it verified some candidates (correctly discarding
  > closed roles) but skipped verification on the final batch it returned, so closed
  > jobs reached the report (2 of 4 were closed on manual check). Because verification
  > is not reliably applied to the final result set, `VERIFICATION_ENABLED` stays
  > **false** for V1. Shipping it on-but-inconsistent would be worse than off: it would
  > imply results are verified when they are not. V1 is honest about this — results may
  > include closed postings; users should confirm before applying. Reliable
  > verification is a V2 feature (see §14).
  >
  > *Secondary logging bug noted for V2 implementer:* the verification logging checks
  > for block type `tool_use`, but Anthropic's hosted tools (web_fetch) use
  > `server_tool_use`, so the "no web_fetch calls" log line is unreliable — the
  > logging needs fixing alongside the verification fix.
- > **Added in v1.2:** Results are captured incrementally and a run that hits its time/max limit returns partial results with a stop reason — never zero.
- > **Added in v1.3:** The "never returns zero" behavior currently holds only because Opus 4.8 completes within budget; the single-long-call case is a known limitation (see §5 callout). **Verified working:** a 2-min run with no max returned 6 jobs (`stopped_reason: time_budget`); a 10-min run with `max_jobs=3` stopped in ~1 min with 3 jobs (`stopped_reason: max_reached`). Both stopping conditions confirmed.
- **Prompt seed:** *"Add an API route that calls the Anthropic Messages API with the
  hosted web-search tool in a loop to find job postings matching these profile
  parameters, with a hard time budget. Stream progress. Return company, title, summary,
  salary or null, source, and link."*

### M3 — Report persistence + the report view
- **Build:** save `reports` + `results`; the report view UI with the overview header and
  the **company+title / why / salary-or-"No salary listed" / location_display / source /
  link** contract.
- **Verify:** every acceptance item in PRD §4.7 that concerns report *content* passes.

### M4 — Dedup / job identity
- **Build:** compute `job_identity` and dedup within a run (start simple — §11).
  Steps 1 and 2 of §11 are implemented (URL dedup + normalized company+title key).
  Step 3 (near-match model judgment) is deferred — a placeholder comment marks
  where it belongs in `lib/dedup.ts`.
- **Verify:** the same role from two sources appears once in the report; a genuinely
  different role at the same company (e.g. different seniority) is not wrongly merged;
  `job_identity` values are visible on saved rows in Supabase.

### M5 — Per-user exclusion list
- **Build:** `exclusions` table; **Save** / **Dismiss** actions; the engine reads
  exclusions first and drops matches (using `job_identity` from M4); the Exclusions
  view with **restore**.
- **Verify:** dismiss a job, re-run → it does not reappear; restore it → it can appear
  again.

### M6 — Matching & ranking (recall-first)
- **Build:** the §5.6 gates + judgment ranking + the **"why" line**.
- **Verify:** a plausible-but-imperfect role still appears (recall test); results are
  sensibly ordered; each carries a why-line.
  - > **Model note (v1.6):** ranking + why-line run on a separate cheaper model
    > (`RANK_MODEL`, default Haiku 4.5) from the Opus search — a deliberate cost
    > split. Verified: recall test passed (a plausible-but-imperfect role appeared,
    > ranked last with an honest "stretch" why-line, not buried), and why-lines were
    > consistently clear across the run.

### M7 — Auth + multi-user
- **Build:** Supabase Auth; replace the hardcoded `user_id`; scope every query by the
  signed-in user.
- **Verify:** two accounts see only their own profiles, reports, and exclusions.
  - > **Verified (v1.7):** sign-in rejects bad credentials and unknown accounts;
    > existing features still work under real auth; Account B cannot see Account A's
    > data in the UI **or** by opening Account A's report URL directly (RLS enforced
    > at the database, not just the app). Account management (email/password change,
    > password reset, deletion) is deliberately out of V1 — see §12.

### M8 — Key handling hardening
- **Build:** enforce §7 exactly — key transient, never logged/stored, scrubbed after a
  run; the "never stored" note in the UI.
- **Verify:** grep the codebase and logs — the key is never persisted or printed.

### M9 — Polish + public demo
- **Build:** progress UX, empty/error states, the "stopped on time budget" message, a
  clean landing page.
- **Verify:** a stranger with their own API key can sign up and run a search via the
  public link.
- > **Verified (v2.0) — V1 complete.** The M9 acceptance test passed end to end on
  > the LIVE deployed site: a fresh (stranger) account signed up, landed on the home
  > page, created a profile, entered their own API key, ran a real search, and
  > received a report — the full public-link journey. A fresh-login redirect bug
  > (login pushed to /profiles instead of the home page) was found during the live
  > test and fixed. V1 is functionally complete.

**V1 is done at M9.** Scheduling (V2) and resume matching (V3) start only after this
ships and is on your resume.

---

## 10. Cost & Model Configuration

**Your hosting cost (what *you* pay to run the app):**
- **Render:** Hobby workspace ($0) + one **Starter** web-service instance (~$7/mo) so the
  demo stays warm. That's the realistic V1 floor. The ~$25/mo Render **Pro** workspace
  plan is a *separate, optional* account-tier fee (it adds autoscaling, environment
  isolation, more build minutes/bandwidth, priority support) — **not needed for V1**, and
  it does **not** include compute. Upgrade to Pro only when a real need appears.
- **Database + auth:** **Supabase free tier ($0)** — also avoids Render's free Postgres
  30-day expiry.
- **Total to start: ~$7/month.**

**The search's API cost (what *users* pay):**
- **BYO key:** each user pays their own Claude usage (PRD §7.1). Keeps that cost off you.
- **Two-model split (cost decision):** the **agentic search** runs on **Opus 4.8**
  (`SEARCH_MODEL`) — required because cheaper models didn't complete the search
  reliably (Sonnet 5 didn't finish a 120s run; Haiku 4.5 errored). The separate
  **ranking / why-line pass** runs on **Haiku 4.5** by default (`RANK_MODEL`,
  overridable) because it's a light text-in/JSON-out task on an already-gathered
  candidate list, where a cheap model is sufficient. This keeps the expensive model
  on the hard task only. Root cause of Sonnet/Haiku not completing the *search* is
  still undetermined; the proven facts are that Opus completes the search and that
  Haiku handles ranking reliably (verified in M6).
- **Enable prompt caching** to cut repeated-context cost.
- **The time budget and the optional Max Jobs ceiling are the cost caps** — together they control how much a run spends. Source discovery (§5.2) is the dominant cost; that's intentional.

---

## 11. Job Identity & Deduplication (the known hard problem)
The exclusion feature only works if the app recognizes the *same* role across different
sources and searches (PRD §5).

**V1 approach (start simple — recall-first):** the intended approach has three
steps, in increasing order of confidence and complexity:
1. Treat an identical posting `link`/URL as a definite match.
2. Normalize `company` + `title` + location into a canonical key; identical keys
   merge.
3. For near-matches (same company, similar-but-not-identical title or wording), a
   lightweight **model judgment** check ("are these the same opening?"), run only
   on close candidates.

**Shipped in M4 (v1.4): steps 1–2 only. Step 3 is deferred** until testing shows
it's needed — per start-simple, we don't add the extra API call and fuzzy matching
before there's evidence we need them. Leave a marked seam in the code where step 3
will slot in (a comment, like the existing placeholder markers).

**Recall-first bias — when in doubt, keep both.** Dedup's worst failure is
*over-merging* (wrongly hiding a real job as a "duplicate"), which violates
recall-first. Matching is therefore conservative: an uncertain match keeps both
postings. An occasional visible duplicate is acceptable; a silently-hidden real
job is not. When step 3 is eventually built, its default must be "if ambiguous,
keep both."

**Known blind spot (accepted for V1):** step 2 merges any two postings with the
same normalized company + title. Usually correct, but it *can* over-merge two
genuinely different same-titled roles at one large employer (e.g. two distinct
"Software Engineer" openings on different teams) — the second would be hidden.
Accepted as a V1 tradeoff (the alternative creates more duplicate noise); watch for
it in testing. Deferring step 3 also means some human-obvious near-duplicates
("Acme Corp" vs "Acme, Inc." with slightly different titles) will slip through and
appear twice — expected behavior, not a bug.

Store the result as `job_identity`. **Expect to iterate** — this is the app's genuine
technical risk. Don't over-engineer it in V1; do make it its own step so it's easy to
improve.

---

## 12. Out of Scope for V1 (scope guards)
- Scheduled/unattended runs and the run queue → **V2**.
- Resume-based matching → **V3**.
- Any monetization/billing.
- Custom scrapers for ToS-restricted sites.
- Required ("must-have") keyword gating — kept out on purpose (PRD §4.4).
- A "run at 5am" toggle anywhere in the UI — its presence means V2 leaked into V1.
- Account management — changing email, changing password, password reset, and
  account deletion. Auth (sign up / sign in) exists as of M7, but self-service
  account management does not. Deliberately deferred: the V1 audience (the builder
  + recruiters trying a demo) doesn't need it, and it's a whole category of work
  that doesn't demonstrate anything the app is meant to demonstrate. Note: even
  fixing a mistyped email at signup is non-trivial — the email lives in Supabase's
  protected `auth.users` schema, not an app table, and could not be edited via SQL
  or the Supabase dashboard (the dashboard offered only delete, no edit), so the
  account had to be recreated. **Password reset is the highest-priority item in
  this deferred bucket** — a forgotten password is a dead end a real user can't
  self-recover from at all — but the email experience shows even "small" account
  fixes need real tooling.
- Automatic session management — idle timeout, session expiry, "log out on browser
  close." Login persists across sessions by design (convenience); the mitigating
  factor is that the API key does not persist, so a persistent session cannot incur
  API charges. A manual Sign out button exists. Automatic expiry is deferred to when
  the app has real multi-user traffic (see §14).

---

## 13. Getting Started (first session)
1. **Accounts:** GitHub, **Render**, Supabase, and an Anthropic API key (yours for dev).
2. **Render service:** deploy the repo as a **web service** (Node). Set the build/start
   commands for Next.js; start on the free instance, move to **Starter (~$7/mo)** before
   demoing so it doesn't cold-start.
3. **Env vars:** Supabase URL + anon key (in Render's dashboard). **The Anthropic key is
   NOT an app env var** — it comes from the user per run (§7). Use your own key locally
   via a dev-only input.
4. **Repo:** create it, commit early and often — this is also your portfolio artifact,
   so a clean commit history that tracks the milestones tells the build story.
5. **First Claude Code prompt:** start at **M0**. Build one milestone, verify it, commit,
   then hand Claude Code the next. Feed it *this spec's relevant section* per milestone —
   not the whole file at once.

---

## 14. Upgrade Paths (post-V1)
- **V2 scheduling:** use **Render cron + a background worker** (native — no third-party
  service) for longer, unattended runs + the run queue (never two at once) + the
  key-storage decision (§7 fork).
- **V3 resume matching:** add resume upload + its own privacy note; matching runs off
  resume-derived signals instead of (or alongside) typed parameters.
- **Deeper search:** once the search runs in a Render background worker, raise the time budget back toward the
  original agent's depth.
- **Reliable verification (V2) — the real fix.** V1's verification is instructional
  (the model may skip it), so it's off. The V2 fix is a **dedicated post-search
  verification pass**: after the search assembles its final candidate list, a
  separate step (its own API call, possibly on a cheaper model) fetches every
  candidate URL and returns only those still open. This is **code-enforced** — the
  verification step is guaranteed to run on every final job, rather than left to the
  model's discretion mid-search. Honest limitation to carry forward: even a
  code-enforced pass can't perfectly detect "closed," because some postings are
  JavaScript-rendered or block automated fetches — so the guarantee is that the
  *check runs on every job*, not that the result is flawless. Once reliable, the flag
  can also move from a global env setting to a **per-profile toggle** with a UI, so
  each user chooses the cost/quality tradeoff.
  *Design lesson recorded: this is a case of matching the tool to the task — search
  and ranking are judgment work (well-suited to the model), but "is this URL still
  open?" is a guarantee, which belongs in enforced code rather than a prompt
  instruction the model can skip.*
- **V4-ish (parked idea) — "Companies worth following":** when the engine finds employers
  with roles that match the profile but are already closed, record those employers so the
  user can monitor them for future openings. Keeps useful signal that would otherwise be
  silently discarded.
- **Account management (deferred from V1):** self-service password reset (the
  priority item — a forgotten password is otherwise unrecoverable), plus change
  email (non-trivial — email lives in Supabase's guarded auth schema and isn't
  editable via SQL or the dashboard; requires the admin API or account recreation),
  change password, and delete account. None are needed for the V1 portfolio/demo
  use, but password reset is the first to add the moment the app has real users who
  can lock themselves out.
- **Session management (deferred from V1):** idle timeout, session expiry, and a
  "keep me logged in" option — grouped with account management (§12). Matters once
  the app has real users who might use shared computers; not needed for the V1
  portfolio/demo.
- **Streaming for true partial results:** capture results as they stream from the
  model, so a run cut off mid-response still returns what it found — regardless of
  model or whether the call completed. Structurally fixes the v1.3 known
  limitation in §5 (currently only avoided by using a model that completes within
  budget). Deferred past M2.
- **Context-aware report back-link (deferred from V1):** the report view is shared
  between two entry points — arriving from a profile after running a search, and
  arriving from All Reports when reviewing a past report. The back-link is currently
  fixed, so it can't return the user to whichever screen they actually came from.
  Making it context-aware (pass or track the origin so "back" returns to the calling
  screen) is a real change with edge cases; it was deliberately deferred rather than
  risk a navigation regression at the V1 release. Minor UX issue — the user still
  lands on a valid screen, just not always the one they came from.
