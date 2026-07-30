# Claude Code Build Spec — Job Search Agent V2

**Status:** v1.3 — V2 PLANNING (build/implementation spec)  
**Derived from:** `V1_BUILD-SPEC.md` (V1, completed) and `PRD.md` (product requirements)  
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date       | Summary |
|---------|------------|---------|
| v1.0    | 2026-07-20 | V2 spec created; M0 (UX improvements) through M4 (password reset) outlined; build instructions established |
| v1.1    | 2026-07-22 | M0: inline error messages and auto-scroll |
| v1.2    | 2026-07-30 | Scope reduction: removed Streaming (M1) and Scheduling + Run Queue (M3); Verification and Password Reset renumbered to M1 and M2 |
| v1.3    | 2026-07-30 | M1 detailed: code-enforced one-job-at-a-time verification, time-budget-bounded adaptive re-search, "Validate jobs" checkbox |

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
- Model: Haiku 4.5, the same tier already used for ranking — cheap and sufficient for a binary open/closed judgment. Enable the `web_fetch` tool on that call so the model can retrieve the actual job page.
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
