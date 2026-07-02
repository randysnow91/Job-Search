# Claude Code Build Spec — Job Search Agent App

**Status:** Draft v1.0 (build/implementation spec)
**Derived from:** `job-search-app-PRD.md` (the product document — read it first)
**Audience:** Claude Code (the coding agent) + the builder (product owner)

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
| **Default model** | **Claude Sonnet 5** (`claude-sonnet-5`) | Balance of reasoning and cost for agentic search. Budget: **Haiku 4.5**. Premium: **Opus 4.8**. Make it configurable. |
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
- `min_jobs` (int), `time_budget_seconds` (int)
- `created_at`, `updated_at`

**`reports`**
- `id`, `profile_id`, `user_id`
- `run_started_at`, `run_finished_at`
- `overview` (text — the summary header)
- `stopped_reason` ("target_met" | "time_budget")
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

**`exclusions`** (the global, account-level list — NOT tied to a profile)
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
3. **Agent loop.** Using the Messages API with the hosted web-search tool, iterate:
   search → read promising results → gather candidate postings. Continue until a
   **stopping condition**: `min_jobs` qualifying new jobs found, **or** `time_budget`
   reached. If the budget is hit first, the report must **say so explicitly**.
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
  (applied | dismissed) and remove from the active report view.
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
3. **Profiles list** — create / pick / delete. Deliberately simple (PRD scope guard).
4. **Profile editor** — the parameter form (positions ranked, industry, keywords,
   location, filters, min jobs, time budget).
5. **Run + report view** — click Run, watch progress, see ranked results with the "why"
   line; per-result **Save** / **Dismiss (applied|not interested)**.
6. **Saved reports** — review saved results later.
7. **Exclusions view** — see what's excluded; **restore** an entry.

---

## 9. Build Milestones (work these in order)

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
- **Prompt seed:** *"Add an API route that calls the Anthropic Messages API with the
  hosted web-search tool in a loop to find job postings matching these profile
  parameters, with a hard time budget. Stream progress. Return company, title, summary,
  salary or null, source, and link."*

### M3 — Report persistence + the report view
- **Build:** save `reports` + `results`; the report view UI with the overview header and
  the **company+title / why / salary-or-"No salary listed" / location_display / source /
  link** contract.
- **Verify:** every acceptance item in PRD §4.7 that concerns report *content* passes.

### M4 — Global exclusion list
- **Build:** `exclusions` table; **Save** / **Dismiss** actions; the engine reads
  exclusions first and drops matches; the Exclusions view with **restore**.
- **Verify:** dismiss a job, re-run → it does not reappear; restore it → it can appear
  again.

### M5 — Dedup / job identity
- **Build:** compute `job_identity` and dedup within a run and against exclusions
  (start simple — §11).
- **Verify:** the same role from two sources appears once; an excluded role stays gone
  even when reworded.

### M6 — Matching & ranking (recall-first)
- **Build:** the §5.6 gates + judgment ranking + the **"why" line**.
- **Verify:** a plausible-but-imperfect role still appears (recall test); results are
  sensibly ordered; each carries a why-line.

### M7 — Auth + multi-user
- **Build:** Supabase Auth; replace the hardcoded `user_id`; scope every query by the
  signed-in user.
- **Verify:** two accounts see only their own profiles, reports, and exclusions.

### M8 — Key handling hardening
- **Build:** enforce §7 exactly — key transient, never logged/stored, scrubbed after a
  run; the "never stored" note in the UI.
- **Verify:** grep the codebase and logs — the key is never persisted or printed.

### M9 — Polish + public demo
- **Build:** progress UX, empty/error states, the "stopped on time budget" message, a
  clean landing page.
- **Verify:** a stranger with their own API key can sign up and run a search via the
  public link.

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
- **Default model Sonnet 5;** expose a setting for Haiku 4.5 (budget) / Opus 4.8
  (premium).
- **Enable prompt caching** to cut repeated-context cost.
- **The time budget is the cost cap** — the primary control on how much a run spends.
  Source discovery (§5.2) is the dominant cost; that's intentional.

---

## 11. Job Identity & Deduplication (the known hard problem)
The exclusion feature only works if the app recognizes the *same* role across different
sources and searches (PRD §5).

**V1 approach (start simple):**
1. Normalize `company` + `title` + location into a canonical key.
2. Treat identical posting `link`/URL as a definite match.
3. For near-matches (same role, different wording), use a lightweight **model judgment**
   check ("are these the same opening?") — cheap because it runs only on close
   candidates.

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
