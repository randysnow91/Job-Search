import Anthropic from '@anthropic-ai/sdk';
import type { JobResult, RankedResult, SearchProfile } from './types';

// Override in .env.local: RANK_MODEL=claude-sonnet-5
// Haiku is sufficient for this task — no tools, just text-in/JSON-out.
const RANK_MODEL = process.env.RANK_MODEL ?? 'claude-haiku-4-5-20251001';

export async function rankResults(
  profile: SearchProfile,
  candidates: JobResult[],
  apiKey: string
): Promise<RankedResult[]> {
  if (candidates.length === 0) return [];

  console.log(`[rank] ranking ${candidates.length} candidates with ${RANK_MODEL}`);

  const client = new Anthropic({ apiKey });

  const locationDesc =
    profile.location.mode === 'remote'
      ? 'fully remote only'
      : profile.location.mode === 'city'
      ? `on-site in or near ${profile.location.city ?? 'the specified city'}${profile.location.region ? `, ${profile.location.region}` : ''}`
      : `remote or in ${profile.location.city ?? 'the specified city'}`;

  const candidateList = candidates
    .map((c, i) => {
      const salary = c.salary ? `salary: ${c.salary}` : 'salary: not listed';
      return `${i + 1}. ${c.company} — ${c.title}\n   ${salary}\n   ${c.summary}`;
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
1. Hard gate — drop a job ONLY if location is genuinely incompatible: the candidate requires remote and the posting is explicitly office-only with no remote option. A mismatched title is NEVER a reason to drop a job.
2. Light relevance floor — drop only jobs that are clearly unrelated to the candidate's field (e.g. a nursing role in a software engineering search). When in doubt, keep it.
3. A stretch role — wrong title but matching skills — MUST appear in results. Do NOT bury it at the bottom. Over-demoting a good stretch is as bad as dropping it.

RANKING ORDER (judgment, not a numeric score):
1. Position fit — how closely the role matches the candidate's listed positions, in preference order
2. Industry relevance — how well the employer's domain matches the candidate's industry
3. Skill overlap — how many of the candidate's keywords this role requires
4. Overall usefulness — is this genuinely worth applying to?
5. Location fit — remote preferred if the candidate requires or prefers remote

WHY-LINE (required for every result, 1–2 sentences):
- Explain why this role was included and why it sits at this rank.
- Strong fit: name what makes it a strong match.
- Stretch fit: be honest — name the stretch AND why it still belongs. Example: "Stretch on title — posted as 'Data Analyst' but the responsibilities include Python and ML modeling that match your skills; ranked mid-list because the title gap is real but the day-to-day work looks right."
- Never write a generic line like "This role matches your profile." Be specific.

CANDIDATES TO RANK:
${candidateList}

Return ONLY a valid JSON array — no markdown fences, no surrounding text.
Use the candidate NUMBER (from the list above) as "index". Include only qualifying candidates.

[{"index": 1, "why": "..."}, {"index": 3, "why": "..."}, ...]

Ranked best-fit first. Omit candidates that fail the hard gate.`;

  try {
    const response = await client.messages.create({
      model: RANK_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.warn('[rank] no text block in response — using fallback');
      return fallback(candidates);
    }

    const items = parseJsonArray(textBlock.text);
    if (!items) {
      console.warn('[rank] could not parse ranked output — using fallback');
      return fallback(candidates);
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
        job_identity: original.job_identity,
      });
    }

    if (results.length === 0) {
      console.warn('[rank] no valid results after index lookup — using fallback');
      return fallback(candidates);
    }

    console.log(`[rank] done: ${results.length} results`);
    return results;
  } catch (err) {
    console.error('[rank] error:', err);
    return fallback(candidates);
  }
}

// If ranking fails for any reason, return candidates in original order with
// the search summary standing in for the why-line.
function fallback(candidates: JobResult[]): RankedResult[] {
  console.log('[rank] fallback: returning original order with summary as why');
  return candidates.map((c) => ({
    company: c.company,
    title: c.title,
    why: c.summary,
    salary: c.salary,
    source: c.source,
    link: c.link,
    job_identity: c.job_identity,
  }));
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
