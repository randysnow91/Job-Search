# Retrospective — Job Search Agent

*A product manager's build log: from problem to deployed application.*

---

## Why this document exists

This is a retrospective on building the Job Search Agent — an AI-powered job-search web
app I designed, specced, and shipped end to end. It's written the way I ran monthly
retrospectives with my team: an honest look at what I set out to do, the decisions I
made and why, what worked, and what I'd do differently.

I built this to demonstrate something specific about how I work as a product manager,
not just that I can ship, but *how I think while shipping*: how I scope, where I draw
boundaries, when I trust a tool and when I enforce a guarantee in code, and how I handle
the things that don't go to plan.

The code, the product requirements document (PRD), and the technical build spec all live
in this repository. Where this retrospective references a decision, the reasoning behind
it is recorded, in versioned detail, in those documents.

---

## Where I was coming in

Over the last several years I advanced into roles adjacent to and above hands-on product
management: Portfolio Manager, Release & QA Manager, and for the past year and a half,
Associate Director. Those roles exercised the same muscles a PM uses, but it had been a
while since I held the title and did the core craft day to day. I wanted to prove (to
myself as much as anyone) that the fundamentals were still sharp.

This project was the proof. It confirmed that product thinking is a craft I still know
how to practice.

---

## Goals

I ran this project against two distinct sets of goals, and keeping them separate mattered,
because they governed different decisions.

### Product goals (what the app optimizes for)

The app started with one goal: **find the best-fit jobs a job seeker might otherwise
miss.** That goal evolved mid-build into something sharper: **find the best-fit jobs
while watching the user's wallet.**

That evolution wasn't a correction, it was the point. Once I started running real
searches, I learned something I hadn't fully appreciated going in: the AI-powered search
costs real money per run. New information changed the requirement. A good product goal
isn't fixed at kickoff; it adapts as reality teaches you things. So "find me the best
jobs" became "find me the best jobs, cost-consciously," and that reframing rippled into
real decisions (the time budget, the optional job cap, the two-model cost split — more
below).

### Project goals (what I was building this *for*)

1. **Learn to build a real application with Claude Code** — hands-on, not theoretical.
2. **Learn to integrate real systems** (a database, authentication, a deployment
   platform) and make the app publicly available to anyone, not a script on my machine.
3. **Produce something resume-worthy as quickly as possible.**

### How the goals governed the build

These weren't decoration. They were the criteria I returned to every time I made a
scoping call:

- The **learning goal** produced the working method itself: I built milestone by
  milestone, verifying and committing each step before the next, and I structured every
  instruction to reinforce understanding rather than just get code ("...I'm learning as I
  go — explain things in plain language"). Learning was engineered into the process, not
  hoped for.
- The **integration-and-availability goal** is *why* the app is a deployed, multi-user
  web application with a public link — not a local tool. It drove the platform choices
  and a data model that was multi-user from day one.
- The **ship-fast goal** is *why* I deferred so aggressively. Scheduling, resume-matching,
  and account management were all consciously pushed past V1 because they served later
  goals, not the goal of getting a working, demonstrable product live quickly.

Every deferral traced back to a goal. That traceability: goal → decision → outcome — is
what kept the scope honest.

---

## The product thesis

The core design principle, and the thing that makes the tool different from "a filter
over a job board," is **recall over precision.**

I built this because I'd been job hunting myself, and I kept running into the same
frustration: the good roles I'd never have found by typing obvious keywords into a big
board. So the app's real value isn't searching LinkedIn faster, it's **reasoning about**
which employers are relevant to a search and going to look at them directly, **including**
the smaller and regional companies you'd never think to search for. Home Depot is easy to
find. The growing regional company that would be a great fit is not. That's the job the
tool does.

The recall-first principle is captured in a sentence I kept coming back to:

> *I don't want to miss a job because it ranked 2.9 instead of 3.*

A rigid scoring system creates a cliff — a job just below the threshold silently
disappears. Judgment doesn't have a cliff; it can say "not a perfect fit, but you'd be
good at this," which is exactly the near-miss the tool exists to surface. So the app
favors including a plausible-but-imperfect match and *explaining why*, rather than
dropping it. Every result carries a plain-language "why" line, the reasoning behind its
inclusion and ranking, so the user can judge for themselves.

This principle became a test I applied to other decisions: any time a feature would
*drop* a job, I asked whether that was one of the few truly non-negotiable gates
(already-applied, wrong location) or whether it should be a ranking signal instead. Most
things were ranking signals, not gates. Recall-first wasn't a slogan; it was a razor.

---

## Key product decisions

A few decisions that show the reasoning, not just the outcome:

**Keywords as a skills list, not required filters.** The PRD initially framed keywords as
must-have vs. nice-to-have. Reviewing that requirement against my own real use case, before
it was built, I realized it was wrong: my keywords (POS, Inventory, Replenishment) are
*skills I have*, and a role matching *any one* of them is valid. A job managing a POS system
is just as relevant to me as one managing inventory; more matches just mean a stronger fit,
not a required combination. So keywords became a cumulative ranking signal where nothing is
mandatory. Catching this at the PRD stage rather than after building mattered, and it
turned out to be *more* consistent with recall-first: a "must-have" keyword is a hidden gate
that could drop a strong role for using different wording.

**One exclusion list per user, shared across all their searches.** A single user can run
several different search profiles. I have one for Retail and one for EdTech, each hunting
different roles. (I was my own primary customer here, so these were real requirements I was
feeling, not hypothetical ones.) That raises a question: when I mark a job "applied" or
"dismissed," should it be excluded from just *that* profile's searches, or from *all* of
them? I made it account-wide: once I've applied to a job, that's true no matter which
profile surfaces it again — "already applied" is a real-world fact about *me*, not about a
particular search. So the exclusion list is one list per user, respected by every profile.
The list is viewable and fully reversible (any job can be restored), which is the safety
valve that makes an account-wide exclusion safe, nothing is hidden permanently or without
recourse. Entries are tagged by reason (applied vs. dismissed), preserving a distinction
that becomes useful later without adding complexity now.

**Cost transparency at the point of decision.** Once the product goal shifted to
"watch the wallet," I put the cost tradeoff *in front of the user where they choose*, the
search-time budget and an optional maximum-jobs cap, each with plain-language descriptions
of the cost implication. The tool is honest about the fact that a deeper search costs more,
rather than hiding it.

---

## Architecture & technical judgment

I made the architecture calls, and each traces to a real constraint:

**Deployment platform: a persistent server, not serverless.** The defining workload (a
deep, multi-minute agentic search) cannot run inside a standard serverless function's
time limit. Rather than bolt a workaround onto a serverless host, I chose a platform that
runs a persistent server where long-running work is a first-class citizen. The one-line
version: *I chose the host where my long-running search is a native workload rather than a
fight against a timeout.* I deployed on Render, which runs a persistent server where a
long-running job is a native workload — no serverless timeout to design around.

**A two-model cost split.** The agentic search needs a capable model to reliably complete
a complex, multi-step task. But the lightweight ranking-and-explanation pass afterward (—
scoring an already-gathered list and writing the "why" lines) does not. So I split them:
the expensive model does the hard search; a cheaper model does the light ranking. This
keeps the costly model on the task that genuinely needs it, directly serving the
cost-conscious product goal. (I've kept the specific model names out of this
retrospective deliberately. They change with each new release, and the durable point
is the *judgment* to match model capability to task difficulty, not which model was
current at build time. The exact models are recorded in the build spec.)

**Bring-your-own-key, never stored.** Each user supplies their own API key, so usage costs
fall to the user, not to me. This keeps the app financially viable to share. The key is
handled as a deliberate exception to everything else: it's the one piece of user data the
system *never* stores. It's held only transiently to run a search, never written to the
database, disk, or logs. The honest guarantee to users is precisely "we never store your
key" — not "your key never reaches our server," because it must, briefly, to run the
search. Stating it accurately mattered more than stating it reassuringly.

---

## How I worked: engineering discipline

The *how* mattered as much as the *what*:

**Milestone by milestone, verified and committed.** I broke the build into small,
shippable steps and verified each against explicit acceptance criteria before moving on.
The commit history tracks the build story milestone by milestone — deliberately, because
that history is itself part of the artifact.

**Versioned documentation, built as if a team would review it.** The PRD and build spec
carry revision histories. Every meaningful decision or change updated the relevant document
*before or alongside* the code, so the documentation never drifted into fiction, and when
a decision changed my mind (several did), the docs record both the change and the reasoning.
The mindset behind that: I kept asking *if colleagues had to review these docs, how would I
record a change so they could see what changed and why?* It was a solo project, but I built
it the way I'd hand it to a team — because that's the difference between a professional
artifact and a hack on my own machine.

**Testing at the layer that actually matters.** A few examples of judgment here:
- For multi-user data isolation, I verified security at the *database* layer (row-level
  security), not just the UI — and tested it by trying to reach one account's data while
  logged in as another, including pasting a direct URL. The UI hiding data isn't the same
  as the database refusing to serve it.
- The search returns different results each run (it's a live agentic search), so I learned
  not to test features against that noisy output. To verify the exclusion list worked, I
  tested the *deterministic* layer. Is the list itself correctly isolated per user,
  rather than trying to infer it from a non-repeatable search?

**Believing the data over the assumption.** More than once, the obvious explanation was
wrong and the evidence said so. When a search returned zero results and the suggested fix
was "increase the time budget," my own data (six results in three minutes on a prior run)
contradicted that — so I pushed to make the system observable with logging instead of
guessing, and the logs revealed the real cause. Trusting evidence over the first
explanation, even a confident one, is a habit I relied on repeatedly.

---

## What didn't go to plan — and how I handled it

The most instructive part of the project was a feature that *didn't* work as intended, and
I think how I handled it says more than the features that did.

I built an optional **verification** feature: before a job reaches the report, fetch its
page to confirm it's still open, so users don't chase dead listings. Because it makes runs
slower and costlier, I built it behind a flag, off by default, for users to opt into later.
When I finally tested it for real near the finish, I discovered it didn't reliably work —
and *why* it didn't is the interesting part.

The verification was **instructional, not enforced**: the "check each posting" step lived
in the model's instructions, and the model decided whether to run it. In testing, it
verified some candidates (correctly discarding closed ones) but skipped the final batch it
returned, so closed jobs still reached the report. Verification wasn't a guarantee; it
was a request the model mostly honored.

I made two calls. First, I kept the feature **off** for V1, because verification that's
*sometimes* applied is worse than none. It implies results are verified when they aren't.
An honest "some of these may have closed, check before applying" beats a false promise.
Second, I documented the *real* fix as a future version: a **code-enforced** verification
pass that runs on every final result, rather than a prompt instruction the model can skip
— while being honest that even that can't be perfect, since some pages resist automated
checks.

The general lesson I took from it, and the one I'd carry into any AI product:

> **Match the tool to the nature of the task. Search and ranking are judgment work — the
> model is excellent at those. But "is this URL still open?" is a *guarantee*, and
> guarantees belong in enforced code, not in a prompt the model can choose to skip.
> Knowing which parts of a product can be model-judgment and which need deterministic
> enforcement is one of the core skills of building with AI well.**

A working verification feature would have been a smaller thing to show than the judgment of
recognizing it didn't work, choosing honesty over a false guarantee, and knowing exactly
how to fix it properly.

---

## The mobile failure — why real-device testing matters

I had verified the whole app end to end and considered V1 done. Before announcing it, I
sent it to a handful of testers — deliberately, because I've learned that "works on my
machine" is not "works." One of them tried it on a phone, and the search crashed.

The root cause was subtle, and it's exactly the kind of thing you only find by testing on
real devices under real conditions. The search ran as a single long-lived HTTP request
that stayed open for the several minutes a search takes. On a desktop with a stable
connection, that's invisible — it just works. But a phone kills a long-held connection the
moment the screen locks, the app backgrounds, or the network hands off between WiFi and
cellular. The server finished the search and saved the report perfectly; the phone had
simply stopped listening for the response. It looked like a crash; it was really a dropped
connection.

I made two decisions. First, I classified this as a **V1 requirement, not a V2
enhancement** — even though I had a "finished" app and a self-imposed deadline. The
reasoning was simple and tied straight to the project's top goal: this app exists to help
me get a job, and the people evaluating it will very likely open it on a phone. A tool that
crashes on the device a recruiter uses is worse than no tool. So "works on mobile" wasn't
polish; it was load-bearing. I let the deadline slip.

Second, I fixed it at the architecture level rather than papering over it. I re-architected
the search to run **asynchronously**: the request now returns immediately with a report ID,
the search runs in the background on the server, and the page checks for completion by
polling. Because the result no longer depends on a held connection, it survives anything
the phone does.

Then I verified it the honest way, by reproducing the exact failure. I started a search on
my phone, deliberately let the screen lock while it ran, and came back: the completed report
was waiting for me. Not "it seemed to work". I recreated the precise condition that broke
it and confirmed the fix held.

The lesson here is different from the verification one, and just as durable:

> **Test on the conditions your users actually face, not the ones convenient to you. A
> clean pass on your own setup can hide a failure that's guaranteed on someone else's. And
> when a defect hits a core requirement, the right move is to fix it properly and let the
> date move — a shipped-but-broken demo serves no one.**

This one also reminded me that finding a bug in testing isn't a failure of the work, it's
the point of the testing. The gate did its job. I'd rather a family member hit that crash
than a hiring manager.

---

## Roadmap — deliberate scope, not gaps

Everything I deferred, I deferred on purpose, and it's documented as such. The distinction
between "V1" and "later" was a constant, deliberate scoping exercise:

- **Reliable verification** — the code-enforced post-search pass described above.
- **Scheduling** — unattended, timed runs (e.g. reports waiting each morning), plus a run
  queue. Real backend work that bolts cleanly onto V1's foundation.
- **Resume-based matching** — find roles that fit an uploaded resume, not just typed
  parameters.
- **Per-profile settings & account management** — including password reset (the priority
  item, since a locked-out user can't self-recover) and per-profile verification control.
- **Session management** — idle timeout and expiry, once the app has real multi-user
  traffic.
- **Context-aware navigation** — a shared screen whose "back" link should return users to
  wherever they came from.

None of these are missing features. They're a roadmap, with each item's reasoning recorded
— which is itself the product-thinking evidence.

---

## What I learned building with AI

A few things I'll carry forward:

- **Directing the tool is the skill.** I wrote the PRD, made every product and architecture
  decision, verified every step, and used Claude Code to implement. The value wasn't that
  AI wrote code — it's that shipping good software increasingly means clear thinking, sharp
  decisions, and directing capable tools well. Every decision was mine to make.
- **The skill is critical collaboration, not delegation.** The best results came from
  *sparring* with the tools, not handing off to them — and from trusting evidence over any
  single source, including the AI. One example: choosing a search model, Claude Code told me
  the cheaper model was "just slower, it needs more time." I didn't accept that — my earlier
  test data suggested otherwise — so I pushed back and worked through it rather than taking
  the claim at face value. The honest conclusion was that we *didn't actually know* the
  cause: the model might be slower, or it might simply fail to complete the task, and the
  data couldn't distinguish the two. So I documented only what was proven and explicitly
  marked the cause as undetermined, rather than writing down a tidy explanation that wasn't
  established. Knowing when to challenge the tool — and refusing to record an inference as a
  fact — is, I think, the core competency of building with AI well.
- **Requirements evolve because information evolves.** The product goal shifted mid-build
  because I learned something real (cost). Letting the product adapt to what reality teaches
  you, rather than clinging to the kickoff spec, is the job, not a failure of planning.
- **Judgment vs. guarantee.** The verification lesson, above — the single most useful
  principle I took from the whole project.
- **Docs and versioning are not overhead.** Keeping decisions written and versioned meant I
  never lost the *why*, could change my mind cleanly, and ended with an artifact that tells
  the story — not just working code.

---

## Closing

I set out to build a real, deployed application as a product manager, against clear goals,
and to prove the core craft was still sharp after years in adjacent roles. The app is
live, multi-user, and does what it was designed to do, but the app was never really the
point. The point was the thinking: the scoping, the tradeoffs, the honest handling of what
didn't work, and knowing where human judgment belongs and where a tool should take over.

This project reaffirmed that product management is a craft I know how to practice. I'm glad
I built it, and I did a good job.

---

*Built by James (Randy) Snow. The PRD and technical build spec, with full decision
histories, are in this repository.*
