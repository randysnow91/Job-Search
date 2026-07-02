# Product Requirements Document — Job Search Agent App

**Status:** Draft v1.0 (product definition)
**Owner:** Product (builder / primary user)
**Next document:** Claude Code build spec (derived from this PRD)

> **How to read this doc.** This is the *product* document — it defines what the app
> does and why, not how it's coded. Sections are tagged where useful:
> **[V1] / [V2] / [V3]** mark which release a requirement belongs to, and the
> **Definition of Done** lists the binary acceptance checks. A companion build spec
> for Claude Code will be derived from this once it's approved.

---

## 1. Overview

### 1.1 Problem & Use Case
As a person seeking a new job, I want a tool that searches the internet for me, so I
can find more targeted roles faster — including the ones that never get posted to the
big boards.

### 1.2 Product Thesis (the differentiator)
Anyone can filter the listings already on a job board. This app's value is that it goes
**hunting for the employers you'd never think to search for yourself.**

> *Home Depot is easy. The small-but-growing regional company is not. The app's job is
> to find the ones you didn't know to look for.*

The system reasons about *who* the relevant employers and vendors are for a user's
industry, then goes and looks at them directly — not just job boards, but vendors,
consultancies, and companies with in-house teams, including smaller and regional ones.

### 1.3 Goals
- Surface targeted, relevant roles faster than manual searching.
- Reach beyond the major boards to find hidden and hard-to-discover openings.
- Let the user save their search once and rerun it without re-entering everything.
- Be a **deployed, shareable web app** that others can use via a public link.

### 1.4 Non-Goals (V1)
- No scheduled / unattended runs (that's V2).
- No resume-based matching (that's V3).
- No monetization. Money is an explicit non-goal for V1 — but the design must not
  foreclose it (see §7.1).

### 1.5 Success Metrics (KPIs)
KPIs measure *did it work in the world*, over time — distinct from the binary build
checks in the Definition of Done (§4.8).

| KPI | What it measures | Why it matters |
|---|---|---|
| **Time-to-interview** | Does the user's interview rate improve while using the app? | The outcome that actually matters — and the portfolio headline ("took me from 1 interview in 2 months to N in M weeks"). |
| **Hidden-find rate** | At least one role per week the user would not have found on their own. | Directly measures the differentiator: recall + source discovery. |
| **Lightweight satisfaction** | Thumbs up/down per report; would-recommend. | Cheap signal, doubles as a demo feature. |

> **Deliberately *not* a KPI: apply-rate or daily-engagement.** A volume target like
> "applies to 60% of jobs" would fight the recall-first design (a wide net *should*
> lower apply rate). And engagement is misleading for a tool whose job is to make
> itself unnecessary — success is the user getting hired and *leaving*. These are
> health signals to watch, not targets to optimize.

---

## 2. Target User

**Primary user (V1):** the builder — a job-seeker in a product/PM-adjacent field,
running targeted searches for themselves. Technical enough to supply their own API key.

**Future users (public):** other job-seekers reaching the app via a shared link, each
supplying their own API key.

A single short persona is sufficient; the worked example throughout this doc is a
retail-software Product Manager search, drawn from the original agent.

---

## 3. Scope & Roadmap

| Release | Scope | Why this order |
|---|---|---|
| **V1** | On-demand search + saved **Search Profiles** | Fastest path to a working, demoable app. Persistence is already required by the exclusion list and saved reports, so saved profiles ride along for nearly free. |
| **V2** | **Scheduling** (run a profile at a set time, e.g. 5–6am) + **run queue** (never run two at once) | The morning-reports-waiting feature. Bolts onto V1 because the profile already exists — scheduling just adds a *when*. This is where the real backend complexity lives. |
| **V3** | **Resume-based matching** — find roles that fit an uploaded resume instead of (or alongside) typed parameters | Highest-value, highest-complexity; best built once the core is proven. |

Scope discipline note: keep multi-profile *management* trivial in V1 (a list you can
create, pick, and delete — nothing more). The moment a "run at 5am" toggle appears,
V2's backend has leaked into V1.

---

## 4. Functional Requirements

### 4.1 Search Profiles [V1]
A **Search Profile** is a named, saved bundle of search parameters. The user can:
- Create and name a profile.
- Save / edit its parameters.
- List existing profiles and pick one.
- Delete a profile.

Each profile stores:
- **Positions** — one to many, as an ordered **preference ranking** (e.g. Product
  Manager > Program Manager > QA). Ranking, not numeric points (see §4.4).
- **Industry** — e.g. Retail.
- **Keywords** — a list of the user's **skills/capabilities**. Any match is a positive
  ranking signal; more distinct matches rank higher; none is required (see §4.4).
- **Location** — a specific city, remote, or both.
- **Filters** — e.g. minimum pay.
- **Run controls** — minimum jobs to find, and a time/effort budget per run.

The user picks a profile, hits **Run**, and gets a report. No re-entering parameters.

### 4.2 Running a Search [V1]
The engine is an **AI agent performing live web search and reading pages** — the
approach proven by the original agent. On each run it:
1. Reads the global exclusion list first (§4.6).
2. Performs a thorough public web search across major boards **and** beyond them
   (see Source Discovery, §4.3).
3. Deduplicates results (see §5).
4. Excludes anything on the exclusion list, including the same role appearing under
   slightly different wording across sources.
5. Keeps searching until a **stopping condition** is reached: it has found the target
   number of qualifying new jobs, **or** it has spent the time/effort budget.
6. If it can't reach the target within the budget, it returns the best matches found
   and **says so explicitly** ("stopped after the time-budgeted effort; found X").

### 4.3 Source Discovery [V1] — *the differentiator*
The system must not just query job boards. It must **reason about who the relevant
employers are** for the user's industry, then search them directly:
- Vendors that build products for that industry.
- Consultancies serving that industry.
- Companies with in-house product/technology teams.
- **Explicitly including smaller and regional employers, not just the obvious big
  names.** (Without this instruction the model defaults to the obvious ones.)

> Cross-reference: this is the most expensive feature (it drives the per-run cost and
> the time budget — see §7.1) and it leans hardest on the dedup hard problem (§5),
> because it surfaces listings from scattered, non-standard sources.

### 4.4 Matching & Ranking [V1] — *the brain*

**Design principle — recall over precision:**
> Matching favors recall over precision. The system errs toward surfacing a
> plausible-but-imperfect match rather than dropping it. Ranking is **guided judgment,
> not a numeric threshold** — there is no score below which a qualifying job is
> silently discarded. A near-miss the user would be good at is exactly what this app
> exists to surface.

**Qualifying gates (lean, binary, hard):** Because recall is the priority, only truly
non-negotiable filters act as gates:
- Not on the exclusion list.
- Location fit (a strictly on-site role outside the user's chosen locations is useless
  to them).
Everything else — position match, industry, keywords — is **ranking signal, not a
gate.** "Doesn't exactly match my titles but I'd be great at it" must be *surfaced and
ranked*, never gated out.

**Relevance floor (light):** A judgment call the model already makes — lean toward
including the plausible, exclude only the clearly unrelated (a nursing role has no
place in a PM search). This keeps "favor recall" from becoming "return everything."

**Ranking (guided LLM judgment over qualified jobs):** ordered by
1. fit to the preferred positions (steered by the user's ranking),
2. industry/domain relevance,
3. keyword overlap (more distinct skill matches → higher rank),
4. overall likely usefulness.
With location preference applied (e.g. remote ranked ahead of hybrid, if that's the
user's stated preference).

**Position weights:** simple preference *ordering*, not numeric points the user has to
assign. The order is the ranking input.

**Keywords:** a list of the user's **skills/capabilities** — things they can do — **not
requirements.** Any single keyword match is a fully valid positive signal: a POS role is
as valid as an Inventory role. **More distinct matches rank higher** (a role touching
both POS and Inventory ranks above one touching only one). **No keyword is mandatory** —
keyword matching only ever *raises* rank, it never gates a job out. This is fully
consistent with the recall-first principle: a "must-have" keyword would have been a
backdoor gate, dropping a strong role that simply used different wording. (Definitely not
boolean logic like `(POS AND Inventory) OR Replenishment` — that's the opposite of how a
skills list works.)

> *Optional later refinement:* if some future user genuinely has a hard requirement,
> letting them flag a single keyword as *required* is possible — but it's kept out of V1
> for simplicity and to preserve recall.

### 4.5 The Report [V1]
Starts with a short **overview**: how many new matches were found, whether the run hit
its target or stopped on the time budget, and notable patterns (repeated employers,
strong domain matches).

Then jobs in **ranked order**, each with:
- **Title = company name + position title.**
- **A brief "why" line** — why it was included and why it ranked where it did (e.g.
  "Remote US ✓ · Product Owner match · mentions Replenishment · stretch fit but strong
  domain overlap"). This makes stretch matches trustworthy instead of confusing, gives
  you a debugging window, and is a strong demo beat (the tool *explains its ranking*).
- **Salary** if stated; otherwise the literal text **"No salary listed."** Never invent
  one (see §7.4).
- **Location display** — surface remote **and** proximity when both are true, because
  they aren't mutually exclusive: e.g. *"Remote (US) · HQ ~40 min away in St. Louis."*
  A remote role near a company office matters for training and events.
- **Source** (where it was found) and a **direct link** to the posting.

**Per-result actions:** the user can **save** a result (to a saved-reports view) or
**dismiss** it. Saved and dismissed both interact with the exclusion list per §4.6.

### 4.6 Exclusion List [V1]
**One global, account-level list** — not per-profile. A job excluded from a Retail
search should not reappear in an EdTech search, because the dominant content is
"already applied," which is a real-world action independent of which search surfaced
the role.
- Each entry is **tagged with a reason: `applied` or `dismissed`.** One list, one check
  for exclusion purposes — but the tag is kept for later value (stats, smarter V3
  matching, clearing just dismissals without touching application history).
- The list is **viewable and reversible** — the user can see what's been excluded and
  **restore** an entry. This is the escape hatch that makes a global list safe (criteria
  shift over time; nothing should be silently buried forever).
- Every run reads this list first and excludes matches, including the same role under
  different wording across sources.

### 4.7 Definition of Done — Acceptance Criteria [V1]
Binary build checks (distinct from KPIs in §1.5):
- [ ] A run returns a list that excludes everything on the exclusion list.
- [ ] Each result's title is **company name + job title**.
- [ ] Each result includes a brief **why-it-was-included** summary.
- [ ] Each result shows **salary, or "No salary listed."**
- [ ] Each result shows **location** — specific location, remote, or both (incl. the
      remote-but-nearby case).
- [ ] The user can **add a job to the exclusion list** (applied or dismissed).
- [ ] The user can **view and restore** excluded jobs.
- [ ] Search Profiles can be created, saved, listed, picked, and deleted.
- [ ] A run that misses its target within the budget says so explicitly.

---

## 5. Job Identity & Deduplication — *the known hard problem*

The entire exclusion feature rests on a single hard question: **how do we decide two
postings are the same role?** A job appears under different wording across LinkedIn, an
aggregator, and a company's own careers page (which formats nothing like a board). For
an exclusion to "stick" and for duplicates to collapse, the system must recognize the
same opening across **different sources and different searches.**

Going global (§4.6) and doing source discovery (§4.3) both *raise* the stakes here —
they deliberately pull in scattered, non-standard listings. Candidate signals for a
match include company + normalized title + location, the posting URL, and fuzzy
similarity, likely combined with model judgment ("is this effectively the same
opening?"). 

**This does not have to be fully solved before building, but it must not be treated as
an afterthought.** It is the genuinely hard technical bit of the app and it gets its own
design attention in the build spec.

---

## 6. Data Model (V1, conceptual)

```
User
 ├── api_key            (TRANSIENT — never persisted; see §7.3)
 ├── Search Profiles [ ]
 │     ├── positions (ranked), industry, keywords (skills list),
 │     │   location, filters, run controls
 │     └── Reports [ ]
 │           └── Results [ ]
 │                 └── company, title, why-summary, salary|null,
 │                     location (remote/onsite/both + proximity),
 │                     source, link, status (saved | in-report)
 └── Exclusion List  (global, account-level)
       └── entries: job-identity, reason tag (applied | dismissed),
           timestamp, restorable
```

Key property to state plainly: **the API key is the one piece of user data the system
deliberately never persists.** Everything else — profiles, reports, results, the
exclusion list — is stored; the key is the deliberate exception.

---

## 7. Non-Functional Requirements

### 7.1 Cost Model
- **Bring-your-own-key (BYOK):** each user supplies their own API key and pays their own
  usage. Keeps V1 cheap for the builder and leaves a paid tier possible later (money:
  non-goal, not foreclosed).
- Source discovery (§4.3) is the dominant cost driver — reasoning about employers and
  reading their pages is the bulk of a multi-minute run. The cost is intentional; it
  buys the differentiator.
- **Controls:** a hard time/effort budget per run (a stopping condition), a sensible
  default model choice, and prompt caching enabled to cut repeated-context cost.

### 7.2 Deployability
- The app is a **deployed web app**. A **public, shareable link is a hard requirement** —
  this is both the sharing goal and the portfolio requirement.
- Nothing may be built in a way that only works on the builder's machine.
- The deep, long-running agentic search is a **server-side workload** (it can't live in a
  browser tab — closing the tab must not kill a run).

### 7.3 Security — API Key Handling
The defining constraint, driven by liability: **the safest data is the data you never
hold.**
- The key lives in the user's browser, is sent with each run over **TLS**, is held **only
  in server memory for the life of that run**, used, and then discarded.
- It is **never written to a database, disk, or logs**, never echoed in responses, never
  included in error reports or analytics, and **scrubbed from memory** when the run ends.
- The honest, precise guarantee to users is **"we never store your key"** — *not* "your
  key never reaches our server" (it must, briefly, to run the server-side search). State
  it accurately; do not overpromise.

> **V1/V2 fork (flagged):** this transient model works because V1 runs are *attended*
> (browser open). **V2 scheduling breaks it** — a 5am run happens while the browser is
> closed, so the key isn't there to send. V2 must consciously revisit key storage
> (encrypted-at-rest, secrets manager, etc.) and **must not inherit V1's "never stored"
> promise** without change. See §9.

### 7.4 Safety
- **Never invent openings, salaries, or links.** Only report roles with enough evidence
  to describe accurately. Missing salary → "No salary listed."
- Prefer the clearest original employer/source for ambiguous or cross-posted results.
- When a result might match the exclusion list, err on the side of excluding it.

### 7.5 Privacy
- User searches and profiles are stored to enable saved profiles and exclusion history.
- The API key is used **only** to run the user's own searches and is **never saved**
  (§7.3).
- Resume data (V3) will require its own handling note when that release is specced.

---

## 8. Open Questions (parking lot)
- **Publish mechanics:** specific hosting choice (e.g. Vercel-style) — an implementation
  detail to settle at build time, not a blocker now.
- **Monetization (post-V1):** BYOK is the baseline; a paid tier / credits model is a
  later option, supported by an existing interested audience.
- **Source-discovery depth:** how aggressively to dig past the obvious employers — a
  tuning question once the engine exists.
- **Job-identity approach:** the concrete dedup strategy (§5) — chosen during the build.
- **V2 key storage:** how unattended scheduled runs hold a key safely (§7.3).

---

## 9. Roadmap Dependencies & Risks
- **V2 depends on a key-storage decision** that V1 deliberately avoids. Don't let V2
  inherit V1's "never stored" guarantee unexamined.
- **V2 scheduling** introduces the run queue (no two runs at once) and unattended
  execution — the first real backend complexity.
- **Dedup (§5)** is the standing technical risk across all releases; its quality makes or
  breaks the exclusion feature.
- **Cost** scales with users × runs/day × depth; BYOK contains it for the builder, but
  any future "we pay" model reopens it.

---

## 10. Key Design Decisions (log)
A quick record of the deliberate calls behind this PRD:
1. **Engine:** AI agent + live web search (proven by the original agent), not API
   scraping or board-APIs-only.
2. **Architecture:** deployed, shareable web app — public link is a requirement, not a
   nicety. Settles the local-vs-hosted fork.
3. **Roadmap:** on-demand V1 (with saved profiles) → V2 scheduling/queue → V3 resume
   matching.
4. **Saved profiles in V1**, because persistence is already mandatory for the exclusion
   list and saved reports — marginal cost is tiny.
5. **Exclusion list:** one global, account-level list, tagged applied/dismissed,
   viewable and restorable.
6. **Matching:** lean parameterized gates + recall-first guided judgment; no numeric
   score cliff; every result carries a "why" line.
7. **Source discovery** kept as a core capability — the differentiator.
8. **Cost:** BYOK; money a non-goal for V1 but not foreclosed.
9. **Key handling:** transient passthrough, never persisted; guarantee stated as "never
   stored," with the V2 fork flagged.
10. **KPIs reframed** from feature-presence to outcomes (time-to-interview, hidden-find
    rate, satisfaction); the original feature list relocated to acceptance criteria.
