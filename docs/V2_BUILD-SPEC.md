# Claude Code Build Spec — Job Search Agent V2

**Status:** v1.9 — M1 fully complete and live in production, including all post-launch hardening (seven bugs plus one UX addition found via staging testing) — see §3.1.5. Diagnostic logging deliberately kept on through M2. **M2 requirements gathering starting now.**  
**Derived from:** `V1_BUILD-SPEC.md` (V1, completed) and `PRD.md` (product requirements)  
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date       | Summary |
|---------|------------|---------|
| v1.0    | 2026-07-20 | V2 spec created; M0 (UX improvements) through M4 (password reset) outlined; build instructions established |
| v1.1    | 2026-07-22 | M0: inline error messages and auto-scroll |
| v1.2    | 2026-07-30 | Scope reduction: removed Streaming (M1) and Scheduling + Run Queue (M3); Verification and Password Reset renumbered to M1 and M2 |
| v1.3    | 2026-07-30 | M1 detailed: code-enforced one-job-at-a-time verification, time-budget-bounded adaptive re-search, "Validate jobs" checkbox |
| v1.4    | 2026-07-31 | M1 implemented and verified. Root-caused a `web_fetch` caching bug (stale snapshots up to months old) via testing; fixed with `web_fetch_20260318` + `use_cache: false`. Verification prompt rewritten to require positive confirmation rather than pattern-matching known "closed" phrasings. |
| v1.5    | 2026-08-01 | M1 closed out and merged to `main`/production. Documented an isolated, non-reproduced verification miss as an accepted error rate rather than chasing it further. Removed temporary diagnostic logging. |
| v1.6    | 2026-08-04 | Post-launch staging fixes: search loop no longer silently stops on a `max_tokens` cutoff (now resumes like `pause_turn`; cap raised 4096→8192, mislabeled `stoppedReason` fixed); added temporary `[verify][diag]` logging after a verification miss; a `web_fetch` failure during verification no longer counts as "closed" — kept as `unverified` instead. See §3.1.5. |
| v1.7    | 2026-08-05 | Post-launch staging fixes: ranking call now has a 60s timeout (was unbounded, could hang a run indefinitely); jobs now carry their actual posted location end to end; ranking's location hard gate strengthened in the prompt, then — after prompt-only enforcement failed twice — backed by a deterministic code-level filter. See §3.1.5. |
| v1.8    | 2026-08-06 | Post-launch staging fix: reproduced the v1.4 `web_fetch` caching bug despite `use_cache: false` — a Capital One posting verified "open" against an 8-month-stale fetch while the live page was actually its closed-posting error page. An OPEN verdict built without at least one fetch confirmed fresh (`retrieved_at` within 48h) is now downgraded to `unverified` rather than trusted. See §3.1.5. |
| v1.9    | 2026-08-06 | UX addition: each result now shows its verification outcome ("Open" / "Unverified") in the report, next to salary/location/source, instead of unverified survivors looking identical to confirmed-open jobs. Requires a manual `results.verification_status` column — see §3.1.5 item 8. |

> **How to use this document.**
> V1's BUILD-SPEC describes a completed release. This spec outlines V2 features—building on V1's architecture and stack.
> **For each milestone:** hand Claude Code the relevant section (e.g., §3 for M0), along with the Build Instructions (§1). Do not paste the entire file; work one milestone at a time, verify against acceptance criteria, commit to Git, then move to the next.
>
> **Context:** V1 is live at job-search-asjo.onrender.com. V2 features will be shipped incrementally as they're built, using a staging environment and Git workflow. See §2 for release strategy.

---

## 1. Build Instructions (ground rules for every session)

These apply to **every** milestone and Claude Code session. Reference them in each prompt as "§1" rather than repeating.

### 1.1 Mobile First + Cross-Platform
- The application must run on **phones and tablets** as the primary constraint.
- The same app runs on **PC and Mac** — no separate builds.
- **No mobile-only workarounds.** If a feature works on mobile, it works on desktop; vice versa.
- Test on a phone (or mobile browser dev tools) before marking a milestone done.

### 1.2 Explain Before Doing
- **Every Claude Code session:** Explain what you're about to build and why before writing code.
- If the approach changes from what was spec'd, explain the change and why.
- If you hit a constraint or limitation, surface it and ask before working around it.

### 1.3 Windows Terminal Commands
- Your OS: **Windows** (PowerShell in Windows Terminal)
- **All terminal commands must use PowerShell syntax**, not bash or sh.
- Example conversions:
  - `mkdir` → `mkdir` (same)
  - `cat file.txt` → `Get-Content file.txt` (or `type file.txt`)
  - `ls` → `Get-ChildItem` (or `ls` works as alias)
  - `rm file` → `Remove-Item file` (or `rm` works as alias)
  - `cd folder` → `Set-Location folder` (or `cd` works)
  - `npm install` → `npm install` (same)
  - `git commit` → `git commit` (same)
- When in doubt, prefer the PowerShell cmdlet (e.g., `Get-Content`) so it's explicit and portable.

### 1.4 Testing Strategy
- **Local first:** Test all changes locally in your dev environment before pushing.
- **Staging second:** Push to staging branch, deploy to staging Render instance, test end-to-end.
- **Production third:** Once staging is verified, create a GitHub PR to main and merge only after review (even if you're the reviewer).
- **Commit after each milestone:** One atomic commit per completed milestone, with a clear message (e.g., "M0: UX improvements – defaults and mandatory fields").

---

## 2. Release Strategy & Git Workflow

### 2.1 Branches and Environments
```
feature/v2-ux-improvements (local)
    ↓ (git push)
staging branch (GitHub)
    ↓ (auto-deploys to staging Render)
staging.job-search-asjo.onrender.com (test here)
    ↓ (PR to main, merge when confident)
main branch (GitHub)
    ↓ (auto-deploys to production Render)
job-search-asjo.onrender.com (live, users see this)
```

### 2.2 Render Staging Setup
A separate Render app instance will be created (before M0) pointing to the staging branch. This allows:
- Testing changes without touching production.
- A "live test machine" (your requirement) before public release.
- Confidence that what you see in staging will work in prod.

### 2.3 Milestone Release Cadence
- **M0 (UX improvements):** Ship this week (testing + staging + production).
- **M1–M2 (larger features):** One at a time, each tested in staging before production.
- No big release events. Each milestone is a separate, incremental deployment.

---

## 3. Milestones: V2 Scope & Acceptance Criteria

### 3.0 M0: UX Improvements (User Experience Refinements)
**Goal:** Make the search profile form easier and safer to use by guiding the user toward valid inputs.

#### 3.0.1 Scope
1. **Search Time Budget:** Add a default value of **3 minutes**.
   - User sees "3 minutes" pre-filled; can change it.
   
2. **Industry:** Allow null (no selection).
   - Internally defaults to "All industries."
   - Example: a graphic designer searching for jobs doesn't care about industry.
   
3. **Keywords:** Allow null (no selection).
   - User can search on position + location alone if they want.
   
4. **Target Position:** Make **mandatory** — user cannot save profile without at least one position listed.
   - Error message: "Please select at least one target position."
   - Error displays directly below the Target Position field, not in a page-level banner.
   
5. **Profile Name:** Make **mandatory** — user cannot save profile without naming it.
   - Error message: "Profile name is required."
   - Error displays directly below the Profile Name field, not in a page-level banner.

5a. **Error visibility on save:** When Save/Create is clicked and validation fails, the page automatically scrolls the offending field into view (the user should never have to hunt for the error).
   - If both Profile Name and Target Position are invalid at once, Profile Name is checked first (it's higher in the form) and is the one scrolled to / reported.
   - This applies only to these two field-level validations. Server/save errors (e.g. a Supabase failure) continue to display in the existing top-of-form banner, since they aren't tied to a single field.
   
6. **Remote:** Clarify what "remote" means with a helper message.
   - Add a tooltip or inline note: **"Remote searches for jobs listed as 'remote' which means 'work from home.'"**
   - Place it near the "Remote" option in the existing location radio group (remote / city / both).
   - The radio group structure is unchanged — this is a text-only addition, not a UI conversion.

#### 3.0.2 Technical Details
- These changes are **client-side validation + UI updates** (form defaults, required field checks, helper text).
- No database changes.
- No API changes.
- **Mobile consideration:** Ensure the "Remote" tooltip / helper is readable on a phone (no tiny text, tap-friendly).

#### 3.0.3 Definition of Done
- [ ] Search Time Budget defaults to 3 minutes on new profiles.
- [ ] Industry field accepts null; internal default to "All" is applied at search time.
- [ ] Keywords field accepts null; no error if empty.
- [ ] Target Position field is marked required; form prevents save if empty; error message displays directly below the field on-submit.
- [ ] Profile Name field is marked required; form prevents save if empty; error message displays directly below the field on-submit.
- [ ] On a failed save due to Profile Name or Target Position being empty, the page auto-scrolls to bring the offending field into view (Profile Name takes priority if both are invalid).
- [ ] Remote radio option has a clear, readable helper message explaining "work from home, not relocation." Radio group structure (remote / city / both) is unchanged.
- [ ] All changes work on mobile (phone + tablet in portrait and landscape).
- [ ] All changes work on desktop (PC/Mac, various browsers).
- [ ] Tested locally; staged to staging Render; verified on staging before production.
- [ ] Commit message: "M0: UX improvements – defaults and mandatory fields."

#### 3.0.4 Known Constraints (from V1)
- V1 architecture and data model remain unchanged.
- No new database schema.
- If this affects the search engine's prompt or behavior, document it in a note (it shouldn't).

---

### 3.1 M1: Reliable Verification (Code-Enforced Post-Search Verification Pass)
**Goal:** After search assembles its final candidate list, verify each job URL is still open—code-enforced, not left to model discretion.

#### 3.1.1 Scope
1. **Verification logic:** After a search completes, loop through each job found and verify it's still open.
   - For each job, a single Claude API call fetches the job page (`web_fetch` tool) and judges whether it's still open/valid.
   - Signals of a closed/invalid posting: "position closed," "position filled," a 404, or any other signal that the job isn't worth the user's click.
   - Invalid jobs are removed from the results list.

2. **Per-job verification mechanics — one job, one call:**
   - Verification is code-enforced one-job-at-a-time: a single function accepts exactly one job and makes exactly one API call. There is no code path that accepts multiple jobs in one call — batching isn't something the model could slip back into, because the function signature only ever takes one job.
   - Jobs are verified strictly sequentially (a `for` loop with `await`, not `Promise.all`) — never more than one verification call in flight at once.
   - If an individual verification call fails (timeout, API error, unparseable response): skip verification for that job and keep it in the results, unverified. No retry. A failure on one job never affects any other job's outcome and never fails the whole pass — consistent with this app's recall-first philosophy (a flaky call is not evidence a job is closed).

3. **Adaptive re-search — bounded by time budget, not a fixed pass count:**
   - If a verification pass removes **more than 50%** of the jobs it checked, trigger another search pass using the same profile parameters — but only if **all** of the following hold:
     a. Remaining time budget is **≥ 60 seconds** (the reserve threshold — see §3.1.2).
     b. The pass that just ran found **at least one new job** (a search that turns up nothing new isn't worth repeating, even with time left).
   - New jobs found by an additional search pass are deduplicated against every job already seen in earlier passes (same job-identity/link matching used elsewhere in the app) — a job is **never verified twice**.
   - Only the new, not-yet-verified jobs from each pass are verified, using the same one-at-a-time approach as the first pass.
   - Looping stops as soon as **any** of: survival rate on the latest pass is ≥ 50%, remaining time budget drops below 60 seconds, or a pass finds zero new jobs.
   - Survivors from **every** pass are merged together (deduped) into the final result set — earlier passes' verified-open jobs are never discarded in favor of a later pass.
   - From the user's perspective this is **one continuous "Searching…" experience** — no new UI state, and no indication of how many internal passes ran.

4. **UI addition:**
   - Add a per-profile checkbox: **"Validate jobs."**
   - Helper text: **"If checked, the system will validate that found jobs are still open. Warning: this takes more time and costs more money."**
   - Default: unchecked (off) — this is opt-in, since it adds time and cost.

#### 3.1.2 Technical Details
- New file: `lib/verify.ts` — houses `verifyOneJob()` (single job, single API call) and a sequential driver that loops over jobs and passes.
- Model: Haiku 4.5, the same tier already used for ranking — cheap and sufficient for a binary open/closed judgment. Enable the `web_fetch_20260318` tool on that call, with `allowed_callers: ['direct']` (required for Haiku) and **`use_cache: false`**. The cache bypass is load-bearing: `web_fetch`'s default caching was confirmed in testing to return page snapshots up to several months stale, which made "open" verdicts unreliable for jobs that had since closed — `use_cache: false` forces a fresh fetch every call.
- The verification prompt defaults to CLOSED and requires the model to positively confirm three things (the specific job title is shown, it's presented as currently live, a real apply mechanism is attached) rather than scanning for known "closed" phrasings — this generalizes better across the many different ways companies signal a dead posting (explicit messages, 404s, generic redirects, custom-branded error pages).
- Time-budget tracking spans the entire verify + re-search flow, using the same elapsed/remaining-time pattern already used in `lib/search.ts` (`Date.now()` measured against `profile.time_budget_seconds`).
- Reserve threshold: **60 seconds**, flat (not a percentage of the budget). No further pass starts once remaining time drops below this, regardless of survival rate.
- New database column: `search_profiles.validate_jobs` (boolean, default `false`) — required, since this is a persisted per-profile setting. Unlike M0, this milestone is **not** schema-free.
- Gated behavior: the verification pass (and any additional search passes it triggers) only run when `validate_jobs` is `true` on the profile. When `false`, behavior is unchanged from V1/M0.
- **Relationship to the existing `VERIFICATION_ENABLED` env var** in `lib/search.ts`: that mechanism asks the *search model itself* to self-verify inline via `web_fetch` during the main search loop. It is separate from, and not modified by, this milestone — both could in principle be enabled at once. Reconciling or retiring the env-var path is a follow-up decision, out of scope here.
- No new UI state beyond the checkbox — the existing `status: 'running'` / report-polling flow already presents one continuous "Searching…" experience regardless of internal pass count.
- **Mobile consideration:** Ensure the "Validate jobs" checkbox and helper text are readable and tap-friendly on a phone.

#### 3.1.3 Definition of Done
- [ ] "Validate jobs" checkbox appears on the profile form, unchecked by default, with the specified helper text.
- [ ] When unchecked, search behavior is unchanged from V1/M0 (no verification, no extra passes).
- [ ] When checked, each job found is verified individually — one job, one API call, never batched.
- [ ] Verification calls run strictly sequentially, never concurrently.
- [ ] A failed verification call for one job doesn't remove that job and doesn't affect any other job's verification.
- [ ] If a pass removes more than 50% of the jobs it checked, remaining time budget is ≥60 seconds, and the pass found at least one new job, another search+verify pass triggers automatically.
- [ ] Looping stops as soon as: survival rate ≥50% on the latest pass, remaining time <60s, or a pass finds zero new jobs.
- [ ] Jobs already verified in an earlier pass are never re-verified in a later pass.
- [ ] Survivors from all passes are merged (deduped) into the final result set.
- [ ] The user sees a single continuous "Searching…" state throughout, with no indication of how many internal passes occurred.
- [ ] All changes work on mobile (phone + tablet in portrait and landscape).
- [ ] All changes work on desktop (PC/Mac, various browsers).
- [ ] Tested locally; staged to staging Render; verified on staging before production.
- [ ] Commit message: "M1: code-enforced job verification with adaptive re-search."

#### 3.1.4 Known Constraints
- Requires a database migration (`validate_jobs` boolean column) — unlike M0, this milestone is not schema-free.
- Turning on verification increases both search time and Anthropic API cost roughly in proportion to job count — disclosed to the user via the checkbox helper text, not hidden.
- The existing `VERIFICATION_ENABLED` env-var mechanism in `lib/search.ts` (model self-verification during the main search loop) is untouched by this milestone; it's a separate, weaker mechanism, and the two are not reconciled here.
- Pass count is not bounded by a fixed number — only by the time budget and the stopping conditions above. The 60-second reserve and the profile's own time budget are the only hard limits on how many passes can run.
- **`web_fetch` does not execute client-side JavaScript.** Some career sites (e.g. Ashby-hosted boards) return only a bare loading shell (e.g. "You need to enable JavaScript to run this app.") with no server-rendered job content at all. When this happens, the model cannot positively confirm the job is open, so per the prompt's "default to CLOSED" rule, it's marked closed rather than guessed open. This trades away some recall on JS-only sites (a genuinely open posting may be hidden) in exchange for never confidently showing a dead link — the correct failure direction for this milestone's goal, but a real, disclosed limitation, not a defect to chase further within M1.
- **Verification is not 100% accurate; occasional false positives are expected.** Across extensive staging testing, the system correctly caught the large majority of closed postings across many different site styles (explicit "removed"/"expired" messages, 404s, generic `?error=true` listing redirects, JS-only shells). One isolated miss was observed on a Capital One posting with an unusually styled, non-standard error page ("Oops! Let's fix this.") — the model judged it open when it was not, despite fresh (non-cached) fetch content and a prompt that explicitly names this style of page as a closed-signal. This did not reproduce on retest (the posting didn't resurface in subsequent searches to retest directly), so it's treated as an accepted error rate rather than a fixed, reproducible bug. No LLM-judgment-based verification will be 100% accurate; this is disclosed as a known limitation, not silently hidden. Revisit if this kind of miss becomes frequent rather than occasional.
  - **Update, §3.1.5 below:** a related but distinct failure mode was found and fixed after this note was written — a `web_fetch` that failed outright (blocked site, bad URL) was previously still reasoned into a CLOSED verdict by the model's own "default to CLOSED" instruction. That's now caught in code and kept as `unverified` instead. The Capital One case above was a genuine misjudgment against real fetched content, which is a different (and still open) problem from a fetch that never happened.

#### 3.1.5 Post-Launch Hardening (staging, 2026-08-04 – 2026-08-06)

M1 shipped to production per v1.5 above. A second round of real-world staging testing — running actual search profiles and checking results against the live postings, not just reading logs — surfaced seven further bugs plus one UX addition prompted by that testing. Six are fixed and merged to `staging` (PRs #3–#9); items 7 and 8 (below) are fixed/built and pushed, pending a bundled PR. **None are merged to `main`/production yet.** Documented here because they materially change M1's behavior from what v1.4/v1.5 described above.

1. **Search loop silently stopped on a token-cap cutoff, mislabeling the reason.** `lib/search.ts`'s per-turn `max_tokens` was 4096 — sized for a simpler search loop and too tight once a turn could include adaptive thinking plus many tool calls (a single turn can run 80–100+ content blocks). Hitting the cap ended the search after just one API call, with no handling for `stop_reason: 'max_tokens'` — it fell through to an unconditional stop. `stoppedReason` defaults to `'time_budget'` and nothing on that path ever corrected it, so the UI/logs reported "stopped at time budget" even when most of the budget was unused. **Fix:** cap raised to 8192; `max_tokens` now resumes the loop the same way `pause_turn` already did (append the truncated turn, ask the model to continue).

2. **Verification diagnostic logging added.** A Lever-hosted posting's standard closed-posting 404 page ("Sorry, we couldn't find anything here") was judged **open** by verification. Added `[verify][diag]` logging in `lib/verify.ts` — the raw `web_fetch` result (URL, `retrieved_at`, fetched content) and the model's raw verdict text for every verification call — to catch a repeat and diagnose it from real data instead of guessing. Deliberately left running for a few days rather than stripped immediately, since the failure isn't reproducible on demand.

3. **A blocked/unreachable `web_fetch` no longer counts as "closed."** The new diagnostic logging paid off immediately: several CLOSED verdicts turned out to be reached with **zero successful fetches** — ZipRecruiter, LinkedIn, and some career sites consistently returned `url_not_accessible` / `url_not_allowed` / `url_not_in_prior_context`. The model was correctly following its own "default to CLOSED" prompt, but a fetch failure isn't a confirmed-dead posting, and it contradicted the recall-first handling §3.1.1.2 already requires for outright API failures ("a flaky call is not evidence a job is closed"). **Fix:** `verifyOneJob()` tracks whether any fetch for a job ever succeeded; a CLOSED verdict reached without one is downgraded to `unverified` (job kept) instead of dropping it. **Accepted trade-off:** some jobs that are genuinely closed but sit behind a blocked/unreachable site will now be shown to the user rather than filtered out — same recall-over-precision bias as the rest of M1, just extended to this case.

4. **Ranking had no timeout and wasn't bounded by the time budget.** Every other API call in the pipeline (search, verify, adaptive re-search) is bounded by the profile's time budget via `AbortSignal.timeout`. `rankResults()` in `lib/rank.ts` runs afterward, with none — a stall there could hang a run indefinitely, burning API spend with no way to observe or stop it short of restarting the Render service. Surfaced when a staging run hung past its 5-minute budget. **Fix:** fixed 60s `AbortSignal.timeout` on the ranking call; a timeout now falls through to the function's existing fallback path (original order, summary as why) instead of hanging.

5. **Jobs had no captured location, so nothing downstream could check one.** `JobResult` never had a `location` field — the search model's own JSON output schema didn't ask for one. That meant ranking's location hard gate could only ever check one narrow case (candidate requires remote, posting is explicitly office-only), and the report's per-job "location" was always the **profile's target location**, not the job's actual one — so a mismatch couldn't even be seen in the UI. Confirmed on staging: a 7-Eleven posting in Irving, TX made it into results for a profile requiring "Remote or Saint Louis, Missouri." **Fix:** `search.ts`'s JSON schema now requires a `location` field per job (the posting's own stated location, not the candidate's request); it flows through `JobResult`/`RankedResult` and into `location_display` on each saved result, replacing the old profile-derived generic string.

6. **The location hard gate wasn't actually enforced — prompt-only fixes failed twice.** With real location data in hand, `lib/rank.ts`'s hard-gate rule was generalized to all three location modes (previously only covered `remote`). Staging still let mismatches through — the model's own why-lines said things like *"Location is a hard miss... justify inclusion as a stretch consideration"* while including the job anyway, treating the gate as a demotion signal rather than an exclusion. The prompt was rewritten a second time: mandatory-exclusion framing, a worked example using the exact failure scenario, and a self-check telling the model to remove any job whose why-line calls out a location miss. **That still didn't hold** — a re-test afterward returned 9-for-9 with zero exclusions, including postings in Plano, TX and Łódź, Poland for the same remote-or-Saint-Louis profile. **Fix:** a deterministic code-level filter, independent of what the model decides — `passesLocationGate()` / `applyLocationGate()` in `lib/rank.ts`, applied after ranking returns (and in its `fallback()` path, which previously didn't filter by location at all). `remote` mode requires "remote" in the job's location text; `city`/`both` modes accept remote or a normalized match on the target city (so "St. Louis" / "St Louis" / "Saint Louis" all match). The prompt's hard-gate language stays in place as a first pass, but the actual guarantee now comes from code. **Lesson for future milestones:** a hard business rule that must never be violated needs a code-level backstop — however strongly worded, prompt instructions alone weren't reliable enough here, even after two rewrites.

7. **The v1.4 caching bug reproduced — a stale fetch produced a trusted OPEN verdict.** `use_cache: false` was assumed (per v1.4) to guarantee a fresh fetch. Staging reproduced the original bug anyway: a Capital One posting verified **open**, but the `[verify][diag]` logging (item 2) showed `retrieved_at` was 8 months in the past, and the live page had since become Capital One's closed-posting error page. The model reasoned faithfully over genuinely stale content it had no way to know was stale. **Fix:** mirrors item 3's logic but for the opposite direction — `verifyOneJob()` now tracks whether any successful fetch for a job was actually fresh (`retrieved_at` within 48h of now, via `STALE_FETCH_THRESHOLD_MS`). An OPEN verdict reached without at least one fresh fetch is downgraded to `unverified` rather than trusted, the same way a CLOSED verdict reached without any successful fetch already is. A missing or ancient `retrieved_at` can't prove a job is still open any more than a blocked fetch can prove it's closed.

8. **Verification outcome surfaced in the report ("Open" / "Unverified").** Items 3 and 7 both extend M1's recall-first bias to keep jobs the system couldn't fully confirm — but the report gave the user no way to tell an `unverified` survivor apart from a confirmed-`open` one, so a job that turned out to be dead read as a bug rather than a disclosed trade-off. `verifyJobsSequentially()` now stamps its outcome onto each surviving job instead of discarding it once the keep/drop decision is made; it flows through ranking (both the model-ranked and `fallback()` paths) and into a new `results.verification_status` column. `ResultCard.tsx` shows "Open" inline with salary/location/source, or "Unverified" in muted amber with a tooltip, and shows nothing when `validate_jobs` was off (verification never ran). **Requires a manual DB column** (no migration tooling in this repo, same as `validate_jobs` before it): `ALTER TABLE results ADD COLUMN verification_status text CHECK (verification_status IN ('open', 'unverified'));`

**Current state:** all eight items above are merged to `main`/production (PR #11, 2026-08-06). Item 2's `[verify][diag]` logging is being kept on deliberately longer than originally planned — not just until the fetch-failure/stale-fetch questions feel settled, but through the rest of M2 (i.e., through the end of V2). Given how many real, previously-invisible bugs this logging surfaced during M1 hardening, the builder decided it's worth keeping the visibility through the next milestone rather than removing it early. Remove once M2 is complete.

---

### 3.2 M2: Password Reset (Account Management Priority)
**Goal:** Enable users to self-serve reset a forgotten password—the highest-priority item in account management.

**Status:** Not yet detailed. Will be specified once M1 is live.

---

## 4. V1 Architecture Reference (no changes for V2)

See **V1_BUILD-SPEC.md §1–3** for the full tech stack and architecture:
- **Framework:** Next.js (App Router)
- **Hosting:** Render (Starter instance with persistent server)
- **Database + Auth:** Supabase (Postgres + auth)
- **Search Engine:** Anthropic Messages API + hosted web-search tool
- **Models:** Opus 4.8 (search), Haiku 4.5 (ranking)

V2 builds on this foundation. No changes to the core stack.

---

## 5. How Each Milestone Flows (process)

For **each completed milestone:**

1. **Local branch:** Create a feature branch (e.g., `feature/v2-m0-ux-improvements`).
2. **Build locally:** Code and test on your machine.
3. **Commit locally:** Atomic commit with a clear message.
4. **Push to staging:** Push the branch; pull request to `staging` on GitHub.
5. **Test on staging Render:** Verify the feature works on the staging instance (live, not local).
6. **PR to main:** Once confident, create a PR from `staging` to `main` (or from your feature branch if staging is not yet set up).
7. **Merge to main:** Render auto-deploys to production.
8. **Verify production:** Quick smoke test on the live site to confirm deployment succeeded.
9. **Move to next milestone:** Start the next feature branch.

---

## 6. File Structure (for reference)
```
job-search-agent/
├── .github/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── api/
│   ├── layout.tsx
│   └── ...
├── components/
│   ├── SearchForm.tsx  (← M0 changes likely here)
│   ├── ProfileForm.tsx (← M0 changes likely here)
│   └── ...
├── lib/
├── public/
├── BUILD-SPEC.md (← V1, completed)
├── V2_BUILD-SPEC.md (← you are here)
├── PRD.md
├── package.json
├── tsconfig.json
└── ...
```

---

## 7. Ground Rules Summary (quick reference)

| Rule | Why |
|------|-----|
| **Mobile first** | App must work on phone—that's the constraint. |
| **Explain before doing** | You (the PM) need to understand the approach before code is written. |
| **Windows terminal commands** | Your dev environment; makes prompts executable immediately. |
| **One milestone at a time** | Clear commits, easier rollback, portfolio tells a story. |
| **Staging before production** | Test on a live-like machine before users see it. |

---

## Next Steps

1. ✅ **V2 BUILD-SPEC created** (you are here).
2. ⏳ **Set up Render staging instance** (before M0).
3. ⏳ **Create staging branch on GitHub** (before M0).
4. ⏳ **M0: UX improvements** (this week).
5. ⏳ **M1–M2:** Ship incrementally, one at a time.

---

**Ready to move forward?** Next up: setting up the Render staging instance and the GitHub staging branch. Those are prerequisites for M0.
