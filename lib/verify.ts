import Anthropic from '@anthropic-ai/sdk';
import type { JobResult, SearchProfile } from './types';
import { runSearch } from './search';
import { deduplicateResults } from './dedup';

// Same tier as ranking — cheap, and a binary open/closed judgment doesn't need more.
const VERIFY_MODEL = process.env.VERIFY_MODEL ?? 'claude-haiku-4-5-20251001';

// A single verification is one fetch + one judgment. Extra turns only happen if
// the model needs to actually invoke web_fetch before it can answer; capped so a
// stuck job can't loop forever.
const MAX_VERIFY_TURNS = 3;

// If a verification pass survives fewer than this fraction of the jobs it
// checked, another search pass is triggered (time budget permitting).
const SURVIVAL_THRESHOLD = 0.5;

// No further search pass starts once remaining time budget drops below this,
// regardless of survival rate.
const RESEARCH_TIME_RESERVE_MS = 60_000;

function parseVerdict(text: string): { status: 'open' | 'closed' } | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && (parsed.status === 'open' || parsed.status === 'closed')) return parsed;
  } catch {
    // Fall through to brace extraction.
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && (parsed.status === 'open' || parsed.status === 'closed')) return parsed;
    } catch {
      // Give up — caller treats this as "no verdict."
    }
  }
  return null;
}

type VerifyOutcome = 'open' | 'closed' | 'unverified';

// Verifies exactly one job with exactly one API call (turns beyond the first
// only happen because the model needed to invoke web_fetch first). Any failure
// — timeout, API error, unparseable response, or exhausting MAX_VERIFY_TURNS —
// returns 'unverified': the job is kept, but the caller can tell this was a
// failure, not a genuine "open" judgment. No retry. A failure never affects
// any other job's outcome, matching the app's recall-first philosophy — a
// flaky call is not evidence a job is closed.
async function verifyOneJob(job: JobResult, apiKey: string, signal: AbortSignal): Promise<VerifyOutcome> {
  const client = new Anthropic({ apiKey });

  const system = `You are verifying whether a single job posting is still open. Fetch the given URL and judge whether it's still accepting applications.

Default to CLOSED. Only judge OPEN if you can positively confirm ALL of the following are true on the fetched page:
1. The specific job title "${job.title}" (or an unmistakably identical role) is shown, not just the company name.
2. The page presents it as a live, currently-open posting — not a past/archived listing.
3. There is a real way to apply (an apply button/link, or equivalent application instructions) attached to that specific posting.

If you cannot clearly confirm all three from the fetched content, judge it CLOSED — regardless of what the page looks like or how it explains itself. Companies signal a dead posting in many different ways (an explicit "closed"/"filled"/"expired" message, a 404, a generic "search jobs" or "current openings" page instead of the specific role, a redirect, or even a custom-branded "oops, let's fix this" style error page) — do not rely on recognizing a specific known pattern. The absence of positive confirmation IS the signal; you do not need to identify why the job is gone.

Do not judge it OPEN just because the company name matches, the page loaded successfully, or a job board with that title exists elsewhere on the same domain — you are verifying this one specific posting, not the company's hiring status in general.

Respond with ONLY a JSON object, no markdown fences, no surrounding text:
{"status": "open"} or {"status": "closed", "reason": "brief reason"}`;

  const userPrompt = `Job posting to verify:
Company: ${job.company}
Title: ${job.title}
URL: ${job.link}

Fetch the URL and determine if this posting is still open.`;

  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

  try {
    for (let turn = 0; turn < MAX_VERIFY_TURNS; turn++) {
      // Cast needed: SDK types don't yet reflect the web_fetch_20260318 server-tool shape.
      // use_cache: false is load-bearing here — job postings close constantly, and the
      // default cached fetch was confirmed (via retrieved_at) to return snapshots up to
      // months old, making "open" verdicts unreliable. Requires web_fetch_20260309+.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: Anthropic.Message = await (client.messages as any).create(
        {
          model: VERIFY_MODEL,
          max_tokens: 512,
          tools: [
            { type: 'web_fetch_20260318', name: 'web_fetch', allowed_callers: ['direct'], use_cache: false },
          ],
          system,
          messages,
        },
        { signal }
      );

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      const verdict = textBlocks.length > 0 ? parseVerdict(textBlocks[textBlocks.length - 1].text) : null;
      if (verdict) return verdict.status;

      if (response.stop_reason === 'pause_turn') {
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: 'Continue, then respond with the required JSON verdict.' },
        ];
        continue;
      }

      break;
    }
  } catch (err) {
    console.warn(
      `[verify] call failed for "${job.title}" at ${job.company} — keeping unverified:`,
      err instanceof Error ? err.message : err
    );
    return 'unverified';
  }

  console.warn(`[verify] no verdict for "${job.title}" at ${job.company} — keeping unverified`);
  return 'unverified';
}

// Verifies jobs strictly one at a time — a for loop with await, never
// Promise.all — so verification calls are never in flight concurrently.
// If the shared time budget runs out mid-pass, remaining jobs in this batch
// are kept unverified rather than cut from the list.
async function verifyJobsSequentially(
  jobs: JobResult[],
  apiKey: string,
  runStartMs: number,
  timeBudgetMs: number
): Promise<JobResult[]> {
  const survivors: JobResult[] = [];
  let openCount = 0;
  let closedCount = 0;
  let unverifiedCount = 0;

  for (const job of jobs) {
    const remainingMs = timeBudgetMs - (Date.now() - runStartMs);
    if (remainingMs <= 0) {
      console.log('[verify] time budget exhausted mid-pass — keeping remaining jobs unverified');
      survivors.push(job);
      unverifiedCount++;
      continue;
    }

    const outcome = await verifyOneJob(job, apiKey, AbortSignal.timeout(remainingMs));
    if (outcome === 'closed') {
      closedCount++;
      console.log(`[verify] CLOSED: "${job.title}" at ${job.company}`);
    } else {
      survivors.push(job);
      if (outcome === 'open') openCount++;
      else unverifiedCount++;
    }
  }

  console.log(
    `[verify] pass result: ${jobs.length} checked — ${openCount} confirmed open, ${closedCount} confirmed closed, ${unverifiedCount} unverified (kept by default)`
  );

  return survivors;
}

export interface VerificationOutcome {
  results: JobResult[];
  passes: number;
}

// Orchestrates verification plus adaptive re-search. Keeps going only while
// ALL of: the latest pass removed more than half the jobs it checked, there's
// at least RESEARCH_TIME_RESERVE_MS left on the shared clock, and that pass
// found at least one new job. Stops as soon as ANY of those fails. Survivors
// from every pass are merged (deduped) into the final list — earlier passes'
// verified-open jobs are never discarded in favor of a later pass.
export async function verifyWithAdaptiveResearch(
  profile: SearchProfile,
  apiKey: string,
  initialJobs: JobResult[],
  runStartMs: number,
  excludedIdentities: Set<string>
): Promise<VerificationOutcome> {
  const timeBudgetMs = profile.time_budget_seconds * 1000;
  const seenIdentities = new Set(initialJobs.map((j) => j.job_identity ?? j.link));

  let survivors: JobResult[] = [];
  let currentBatch = initialJobs;
  let passes = 0;

  while (true) {
    passes++;
    console.log(`[verify] pass ${passes}: verifying ${currentBatch.length} job(s)`);
    const passSurvivors = await verifyJobsSequentially(currentBatch, apiKey, runStartMs, timeBudgetMs);
    survivors = survivors.concat(passSurvivors);

    const survivalRate = currentBatch.length > 0 ? passSurvivors.length / currentBatch.length : 1;
    const remainingMs = timeBudgetMs - (Date.now() - runStartMs);
    console.log(
      `[verify] pass ${passes} survival rate: ${(survivalRate * 100).toFixed(0)}%, remaining budget: ${Math.round(remainingMs / 1000)}s`
    );

    const removedTooMany = survivalRate < SURVIVAL_THRESHOLD;
    const enoughTimeLeft = remainingMs >= RESEARCH_TIME_RESERVE_MS;
    if (!removedTooMany || !enoughTimeLeft) break;

    console.log(`[verify] pass ${passes} dropped more than half — triggering additional search`);
    // Same profile, but time_budget_seconds is swapped for whatever's left of the
    // shared clock — this caps the re-search to the remaining overall budget
    // without any changes to lib/search.ts.
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const researchProfile: SearchProfile = { ...profile, time_budget_seconds: remainingSeconds };
    const researchOutput = await runSearch(researchProfile, apiKey);

    const dedupedNew = deduplicateResults(researchOutput.results).filter(
      (job) =>
        !seenIdentities.has(job.job_identity ?? job.link) &&
        !excludedIdentities.has(job.job_identity ?? '')
    );

    if (dedupedNew.length === 0) {
      console.log('[verify] additional search found no new jobs — stopping');
      break;
    }

    for (const job of dedupedNew) seenIdentities.add(job.job_identity ?? job.link);
    currentBatch = dedupedNew;
  }

  console.log(`[verify] done after ${passes} pass(es): ${survivors.length} survivor(s)`);
  return { results: survivors, passes };
}
