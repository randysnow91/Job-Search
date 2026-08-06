import Anthropic from '@anthropic-ai/sdk';
import type { JobResult, RankedResult, SearchProfile } from './types';

// Override in .env.local: RANK_MODEL=claude-sonnet-5
// Haiku is sufficient for this task — no tools, just text-in/JSON-out.
const RANK_MODEL = process.env.RANK_MODEL ?? 'claude-haiku-4-5-20251001';

// Ranking is a plain text-in/JSON-out call with no tools — it should never
// legitimately take more than a few seconds. Unlike search/verify, it isn't
// bounded by the profile's time budget (it runs after that budget is spent),
// so it needs its own fixed cap. A stall here falls through to the existing
// catch block's fallback (original order, summary as why) rather than
// hanging the background job indefinitely.
const RANK_TIMEOUT_MS = 60_000;

// Normalizes for loose comparison: lowercase, strip punctuation, "st" -> "saint"
// so "St. Louis" / "St Louis" / "Saint Louis" all match.
function normalizeLocationText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deterministic backstop for the prompt's location hard gate (rule 1 above). The
// model has twice, even after an explicit "mandatory exclusion" rewrite of the
// prompt, included jobs it correctly identified as location-incompatible instead
// of omitting them — so this can't be left to instruction-following alone. Only
// filters when we have real location text to check; an unstated location is kept,
// matching the prompt's own carve-out.
function passesLocationGate(location: string | undefined, profile: SearchProfile): boolean {
  const loc = location?.trim();
  if (!loc) return true;

  const normalized = normalizeLocationText(loc);
  const isRemote = /\bremote\b/.test(normalized);

  if (profile.location.mode === 'remote') return isRemote;

  const targetCity = profile.location.city ? normalizeLocationText(profile.location.city) : '';
  const matchesCity = targetCity.length > 0 && (normalized.includes(targetCity) || targetCity.includes(normalized));

  // city and both modes: remote is never disqualifying, even for city-only
  // candidates, matching the prompt's own "no remote option offered" carve-out.
  return isRemote || matchesCity;
}

// Applies the location gate to a ranked list, logging what it drops so a run
// where the model already excluded everything correctly shows zero drops here.
function applyLocationGate(results: RankedResult[], profile: SearchProfile): RankedResult[] {
  return results.filter((r) => {
    const ok = passesLocationGate(r.location, profile);
    if (!ok) {
      console.log(
        `[rank] location gate: dropped "${r.title}" at ${r.company} — location "${r.location}" incompatible with profile requirement`
      );
    }
    return ok;
  });
}

export async function rankResults(
  profile: SearchProfile,
  candidates: JobResult[],
  apiKey: string
): Promise<RankedResult[]> {
  if (candidates.length === 0) return [];

  console.log(`[rank] ranking ${candidates.length} candidates with ${RANK_MODEL}`);

  const client = new Anthropic({ apiKey });

  const targetCity = `${profile.location.city ?? 'the specified city'}${profile.location.region ? `, ${profile.location.region}` : ''}`;
  const locationDesc =
    profile.location.mode === 'remote'
      ? 'fully remote only'
      : profile.location.mode === 'city'
      ? `on-site in or near ${targetCity}`
      : `remote or in ${targetCity}`;

  // What makes a posting's location a hard-gate drop, per mode — mirrors locationDesc
  // above but phrased as an exclusion rule for the prompt below.
  const locationGateRule =
    profile.location.mode === 'remote'
      ? 'the candidate requires remote and the posting is explicitly office-only with no remote option'
      : profile.location.mode === 'city'
      ? `the candidate requires on-site work in or near ${targetCity}, and the posting's stated location is a different, unrelated place with no remote option offered`
      : `the candidate accepts remote or on-site in or near ${targetCity}, and the posting's stated location is neither remote nor in/near ${targetCity}`;

  const candidateList = candidates
    .map((c, i) => {
      const salary = c.salary ? `salary: ${c.salary}` : 'salary: not listed';
      const location = c.location?.trim() ? c.location : 'not stated';
      return `${i + 1}. ${c.company} — ${c.title}\n   location: ${location}\n   ${salary}\n   ${c.summary}`;
    })
    .join('\n\n');

  // The model returns only the candidate index and why-line.
  // All other fields (source, link, salary, job_identity) come from the
  // original candidates — the model never needs to echo them back.
  const prompt = `You are evaluating job postings for a candidate. Apply recall-first ranking.

CANDIDATE PROFILE:
- Target positions (in preference order): ${profile.positions.join(', ')}
- Industry: ${profile.industry || 'any'}
- Skills/keywords: ${profile.keywords.length > 0 ? profile.keywords.join(', ') : 'none specified'}
- Location: ${locationDesc}${profile.filters.min_pay ? `\n- Minimum pay: $${profile.filters.min_pay.toLocaleString()}` : ''}

RECALL-FIRST RULES (critical — read before ranking):
1. Hard gate — MANDATORY FULL EXCLUSION, not a ranking factor. If ${locationGateRule}, you MUST completely omit that job from your output — do not include it, do not rank it last, do not include it as a "stretch." No amount of title match, salary, or seniority justifies including a job that fails this gate; that tradeoff belongs to rule 3 below, not this one. If a posting's location isn't stated ("not stated" above), do NOT drop it on location grounds alone — the gate only applies when the posting's location is known and incompatible. A mismatched title is NEVER a reason to drop a job.
   Example: profile requires "remote or in St. Louis, Missouri"; a posting is on-site only in Irving, TX with no remote option offered → omit this job entirely from the output, even if the title and skills are a perfect match.
2. Light relevance floor — drop only jobs that are clearly unrelated to the candidate's field (e.g. a nursing role in a software engineering search). When in doubt, keep it.
3. A stretch role — wrong title but matching skills, or a location that passed the hard gate but isn't the candidate's top preference — MUST appear in results. Do NOT bury it at the bottom. Over-demoting a good stretch is as bad as dropping it. This does not apply to jobs that fail rule 1 — those are excluded outright, never treated as a "stretch."

RANKING ORDER (judgment, not a numeric score — applies only to candidates that already passed the hard gate in rule 1):
1. Position fit — how closely the role matches the candidate's listed positions, in preference order
2. Industry relevance — how well the employer's domain matches the candidate's industry
3. Skill overlap — how many of the candidate's keywords this role requires
4. Overall usefulness — is this genuinely worth applying to?
5. Location fit — among jobs that already passed the hard gate, remote is preferred if the candidate requires or prefers remote

WHY-LINE (required for every result, 1–2 sentences):
- Explain why this role was included and why it sits at this rank.
- Strong fit: name what makes it a strong match.
- Stretch fit: be honest — name the stretch AND why it still belongs. Example: "Stretch on title — posted as 'Data Analyst' but the responsibilities include Python and ML modeling that match your skills; ranked mid-list because the title gap is real but the day-to-day work looks right."
- Never write a generic line like "This role matches your profile." Be specific.
- Self-check before finalizing: if a why-line you're about to write describes a job's location as a "hard miss," "incompatible," "hard gate," or similar — that job fails rule 1 and must NOT be in your output. Remove it instead of explaining why you kept it anyway.

CANDIDATES TO RANK:
${candidateList}

Return ONLY a valid JSON array — no markdown fences, no surrounding text.
Use the candidate NUMBER (from the list above) as "index". Include only qualifying candidates.

[{"index": 1, "why": "..."}, {"index": 3, "why": "..."}, ...]

Ranked best-fit first. Omit candidates that fail the hard gate.`;

  try {
    const response = await client.messages.create(
      {
        model: RANK_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: AbortSignal.timeout(RANK_TIMEOUT_MS) }
    );

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.warn('[rank] no text block in response — using fallback');
      return fallback(candidates, profile);
    }

    const items = parseJsonArray(textBlock.text);
    if (!items) {
      console.warn('[rank] could not parse ranked output — using fallback');
      return fallback(candidates, profile);
    }

    // Look up each candidate by its 1-based index from the model output.
    // All data fields come from the original — the model only contributes
    // the ranking order and the why-line.
    const results: RankedResult[] = [];
    for (const item of items) {
      const idx = typeof item.index === 'number' ? item.index - 1 : -1;
      const original = candidates[idx];
      if (!original) {
        console.warn(`[rank] index ${item.index} out of range — skipping`);
        continue;
      }
      results.push({
        company: original.company,
        title: original.title,
        why: typeof item.why === 'string' && item.why.trim() ? item.why.trim() : original.summary,
        salary: original.salary,
        source: original.source,
        link: original.link,
        location: original.location,
        verification_status: original.verification_status,
        job_identity: original.job_identity,
      });
    }

    if (results.length === 0) {
      console.warn('[rank] no valid results after index lookup — using fallback');
      return fallback(candidates, profile);
    }

    const gated = applyLocationGate(results, profile);
    console.log(`[rank] done: ${gated.length} results (${results.length} before location gate)`);
    return gated;
  } catch (err) {
    console.error('[rank] error:', err);
    return fallback(candidates, profile);
  }
}

// If ranking fails for any reason, return candidates in original order with
// the search summary standing in for the why-line. Still passes through the
// location gate — a ranking failure shouldn't bypass it.
function fallback(candidates: JobResult[], profile: SearchProfile): RankedResult[] {
  console.log('[rank] fallback: returning original order with summary as why');
  const results = candidates.map((c) => ({
    company: c.company,
    title: c.title,
    why: c.summary,
    salary: c.salary,
    source: c.source,
    link: c.link,
    location: c.location,
    verification_status: c.verification_status,
    job_identity: c.job_identity,
  }));
  return applyLocationGate(results, profile);
}

function parseJsonArray(text: string): Array<{ index: number; why: string }> | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to bracket extraction.
  }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through.
    }
  }
  return null;
}
