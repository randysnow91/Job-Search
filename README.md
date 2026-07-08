# Job Search Agent

An AI-powered job-search tool that goes hunting across the web — including the
smaller and regional employers that never show up on the big boards.

---

## About this project

I'm a product manager, and I built this to demonstrate something specific: that I
can take a product from a blank page to a working, deployed application — owning
the decisions at every layer.

It started as a problem. I was laid off, and I wanted a tool that would surface the
roles the big job boards miss. That problem became a PRD, then a technical build
spec, and then a real app built milestone by milestone. I made the product and
architecture calls — what to build, how to model the data, where to draw scope
lines, how to balance search quality against cost — and used Claude Code to
implement them, verifying and course-correcting at every step. The versioned docs
in this repo (below) track that reasoning as it happened, including the decisions I
changed my mind on and why.

The point isn't that AI wrote the code. The point is that shipping good software is
increasingly about clear thinking, sharp decisions, and directing capable tools
well — and that's the work I did here.

---

## Key features

- **Source discovery** — the engine reasons about who the relevant employers
  are for your industry (vendors, consultancies, in-house teams), then
  searches them directly, not just the major boards. Smaller and regional
  employers are an explicit target.
- **Recall-first ranking** — results favor inclusion over exclusion. A
  plausible-but-imperfect match is surfaced and explained, not silently
  dropped. Each result includes a plain-language "why" line explaining why
  it was included and where it ranked.
- **Deduplication** — the same role appearing across multiple sources is
  collapsed to one result.
- **Global exclusion list** — marking a job Applied or Dismissed adds it to
  an account-level list that all future searches respect. The list is
  viewable and fully reversible (Restore removes the entry so the job can
  appear again).
- **Saved reports** — every run is persisted; past reports are always
  accessible.
- **Multi-user auth** — Supabase Auth with per-user data isolation enforced
  by Row Level Security at the database level, not just app-side filtering.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database + Auth | Supabase (Postgres + Auth + Row Level Security) |
| Hosting | Render (persistent web service — required for long-running searches) |
| Search engine | Anthropic Messages API + hosted web-search tool, agentic loop |
| Search model | Claude Opus 4.8 (`SEARCH_MODEL` env var) |
| Ranking model | Claude Haiku 4.5 (`RANK_MODEL` env var, overridable) |

The two-model split is a deliberate cost decision: Opus handles the hard
agentic search (multi-step tool use); Haiku handles the lightweight
post-search ranking and why-line pass (text-in / JSON-out, no tools needed).

---

## Project documentation

The full product and technical reasoning lives in two versioned documents:

- **[`docs/PRD.md`](docs/PRD.md)** — the product requirements document.
  Defines what the app does, why, and the acceptance criteria for V1. Written
  before any code.
- **[`docs/BUILD-SPEC.md`](docs/BUILD-SPEC.md)** — the build spec derived
  from the PRD. Records implementation decisions, architecture tradeoffs,
  the milestone plan, and notes from testing. Updated at each milestone.

Both documents are versioned with revision histories. They're intentionally
part of the portfolio artifact — the documentation shows the thinking, not
just the code.

---

## Status

V1 in progress. Milestones completed:

- **M0** — Project skeleton, deployed to Render
- **M1** — Database + search profiles (Supabase)
- **M2** — Search engine (agentic web search with time budget and incremental capture)
- **M3** — Report persistence and report view
- **M4** — Job identity and deduplication
- **M5** — Global exclusion list with inline restore
- **M6** — Recall-first ranking with two-model split and why-lines
- **M7** — Supabase Auth, multi-user support, Row Level Security

Remaining:

- **M8** — API key handling hardening
- **M9** — Polish and public demo

---

## Running locally

**Requirements:** Node.js 20+, a Supabase project, an Anthropic API key
(your own, for local dev only).

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

**Environment variables** — create a `.env.local` file at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

> **Note on the Anthropic key:** in the production design (§7 of the build
> spec), each user supplies their own API key per run — it is never stored.
> For local development, the key is read from the environment variable above
> as a convenience. This is replaced in M8 (key handling hardening).

Do not commit `.env.local` or put real keys in this file in version control.
