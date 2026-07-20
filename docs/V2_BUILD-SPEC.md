# Claude Code Build Spec — Job Search Agent V2

**Status:** v1.0 — V2 PLANNING (build/implementation spec)  
**Derived from:** `V1_BUILD-SPEC.md` (V1, completed) and `PRD.md` (product requirements)  
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date       | Summary |
|---------|------------|---------|
| v1.0    | 2026-07-20 | V2 spec created; M0 (UX improvements) through M4 (password reset) outlined; build instructions established |

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
- **M1–M4 (larger features):** One at a time, each tested in staging before production.
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
   
5. **Profile Name:** Make **mandatory** — user cannot save profile without naming it.
   - Error message: "Profile name is required."
   
6. **Remote Only:** Clarify what "remote" means with a helper message.
   - Add a tooltip or inline note: **"Remote searches for jobs listed as 'remote' which means 'work from home.'"**
   - Place it near the Remote Only toggle.

#### 3.0.2 Technical Details
- These changes are **client-side validation + UI updates** (form defaults, required field checks, helper text).
- No database changes.
- No API changes.
- **Mobile consideration:** Ensure the "Remote Only" tooltip / helper is readable on a phone (no tiny text, tap-friendly).

#### 3.0.3 Definition of Done
- [ ] Search Time Budget defaults to 3 minutes on new profiles.
- [ ] Industry field accepts null; internal default to "All" is applied at search time.
- [ ] Keywords field accepts null; no error if empty.
- [ ] Target Position field is marked required; form prevents save if empty; error message displays on-submit.
- [ ] Profile Name field is marked required; form prevents save if empty; error message displays on-submit.
- [ ] Remote Only toggle has a clear, readable helper message explaining "work from home, not relocation."
- [ ] All changes work on mobile (phone + tablet in portrait and landscape).
- [ ] All changes work on desktop (PC/Mac, various browsers).
- [ ] Tested locally; staged to staging Render; verified on staging before production.
- [ ] Commit message: "M0: UX improvements – defaults and mandatory fields."

#### 3.0.4 Known Constraints (from V1)
- V1 architecture and data model remain unchanged.
- No new database schema.
- If this affects the search engine's prompt or behavior, document it in a note (it shouldn't).

---

### 3.1 M1: Streaming for True Partial Results
**Goal:** Capture results as they stream from the model, so a run cut off mid-response still returns what was found.

**Status:** Not yet detailed. Will be specified once M0 is live.

---

### 3.2 M2: Reliable Verification (Code-Enforced Post-Search Verification Pass)
**Goal:** After search assembles its final candidate list, verify each job URL is still open—code-enforced, not left to model discretion.

**Status:** Not yet detailed. Will be specified once M1 is live.

---

### 3.3 M3: Scheduling + Run Queue
**Goal:** Allow users to schedule a search profile to run at a set time (e.g., 5am) using Render cron + background worker. Queue ensures no two runs overlap.

**Status:** Not yet detailed. Includes key-storage decision flagged in V1 BUILD-SPEC §7.3 fork.

---

### 3.4 M4: Password Reset (Account Management Priority)
**Goal:** Enable users to self-serve reset a forgotten password—the highest-priority item in account management.

**Status:** Not yet detailed. Will be specified once M3 is live.

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
5. ⏳ **M1–M4:** Ship incrementally, one at a time.

---

**Ready to move forward?** Next up: setting up the Render staging instance and the GitHub staging branch. Those are prerequisites for M0.
