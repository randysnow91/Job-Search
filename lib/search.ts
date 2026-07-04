import Anthropic from '@anthropic-ai/sdk';
import type { SearchProfile, JobResult, SearchOutput } from './types';

// Override in .env.local for cheap dev runs:
//   SEARCH_MODEL=claude-haiku-4-5-20251001
// Default: Opus 4.8 (highest quality, highest cost).
const SEARCH_MODEL = process.env.SEARCH_MODEL ?? 'claude-opus-4-8';
// Only Opus benefits from adaptive thinking here; Sonnet/Haiku spend too long
// in the thinking phase and exhaust the time budget before searching.
const THINKING_SUPPORTED = SEARCH_MODEL.includes('opus');

export async function runSearch(
  profile: SearchProfile,
  apiKey: string
): Promise<SearchOutput> {
  const client = new Anthropic({ apiKey });
  const startMs = Date.now();
  const timeBudgetMs = profile.time_budget_seconds * 1000;

  const verificationEnabled = process.env.VERIFICATION_ENABLED === 'true';
  console.log('[search] model:', SEARCH_MODEL);
  console.log('[search] verification:', verificationEnabled ? 'on' : 'off');
  console.log('[search] time budget:', profile.time_budget_seconds, 's, max_jobs:', profile.max_jobs ?? 'none');

  const locationDesc =
    profile.location.mode === 'remote'
      ? 'fully remote'
      : profile.location.mode === 'city'
      ? `in or near ${profile.location.city ?? 'the specified city'}${profile.location.region ? `, ${profile.location.region}` : ''}`
      : `remote or in ${profile.location.city ?? 'the specified city'}`;

  const verificationInstructions = verificationEnabled
    ? `4. For each candidate posting you find, fetch the URL and confirm the job is still open before including it. Signs a posting is closed: the page says "no longer accepting applications", "position filled", "job expired", or the listing is missing entirely. Discard any posting that shows those signs.
5. Only include postings that are currently accepting applications and were posted within the last 60 days.`
    : `4. Prioritise postings listed within the last 30 days.`;

  const system = `You are a job search assistant. Search the web for real, current job postings that match the user's profile.

Search strategy:
1. Reason first about WHO the relevant employers likely are — include smaller companies, startups, and regional employers, not just major corporations.
2. Search job boards: LinkedIn, Indeed, Greenhouse, Lever, Wellfound, etc.
3. Search direct company career pages for the most promising employers.
${verificationInstructions}

After each batch of searches, output any job results found so far as a raw JSON array — even if you plan to keep searching. In later turns, output the full updated list. This ensures results are captured even if the search stops early.

Format (no markdown fences, no surrounding text):
[{"company":"...","title":"...","summary":"One or two sentence description of the role","salary":"$X–$Y or null if not listed","source":"LinkedIn / Company careers / etc","link":"https://..."}]

Only include postings that have real, reachable URLs.`;

  const maxJobsClause = profile.max_jobs != null
    ? `\n- Stop once you've found ${profile.max_jobs} qualifying postings.`
    : '';

  const userPrompt = `Find job postings matching this profile:
- Positions: ${profile.positions.join(', ')}
- Industry: ${profile.industry || 'any'}
- Keywords: ${profile.keywords.length > 0 ? profile.keywords.join(', ') : 'none specified'}
- Location: ${locationDesc}${profile.filters.min_pay ? `\n- Minimum pay: $${profile.filters.min_pay.toLocaleString()}` : ''}${maxJobsClause}

Search broadly, including smaller and regional employers. Output results as a JSON array.`;

  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  let stoppedReason: SearchOutput['stoppedReason'] = 'time_budget';

  // Accumulates results across all loop iterations. Each completed API response
  // (pause_turn or end_turn) contributes here — so results from early iterations
  // survive even if a later call is aborted by the time budget.
  const allResults: JobResult[] = [];

  let iteration = 0;

  function mergeResults(incoming: JobResult[]) {
    const seenLinks = new Set(allResults.map((j) => j.link));
    for (const job of incoming) {
      if (job.link && !seenLinks.has(job.link)) {
        console.log(`[search] JOB FOUND: "${job.title}" at ${job.company} (${job.link.slice(0, 60)})`);
        allResults.push(job);
        seenLinks.add(job.link);
        console.log(`[search] accumulator size: ${allResults.length}`);
      }
    }
  }

  while (true) {
    iteration++;
    const elapsed = Date.now() - startMs;
    console.log(`[search] --- iteration ${iteration}, elapsed ${Math.round(elapsed / 1000)}s, budget ${profile.time_budget_seconds}s, allResults.length=${allResults.length}`);

    if (elapsed >= timeBudgetMs) {
      console.log(`[search] BUDGET ELAPSED before API call. allResults.length=${allResults.length} — this is what will be returned.`);
      stoppedReason = 'time_budget';
      break;
    }

    const remainingMs = timeBudgetMs - elapsed;
    console.log(`[search] calling API, remaining budget: ${Math.round(remainingMs / 1000)}s`);
    const signal = AbortSignal.timeout(remainingMs);

    try {
      // Cast needed: SDK types don't yet reflect the adaptive thinking shape
      // or the _20260209 server-tool variants.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: Anthropic.Message = await (client.messages as any).create(
        {
          model: SEARCH_MODEL,
          max_tokens: 4096,
          ...(THINKING_SUPPORTED ? { thinking: { type: 'adaptive' } } : {}),
          tools: [
            { type: 'web_search_20260209', name: 'web_search' },
            ...(verificationEnabled ? [{ type: 'web_fetch_20260209', name: 'web_fetch' }] : []),
          ],
          system,
          messages,
        },
        { signal }
      );

      const elapsedAfter = Math.round((Date.now() - startMs) / 1000);
      console.log(`[search] API call COMPLETED at ${elapsedAfter}s, stop_reason: ${response.stop_reason}`);
      console.log(`[search] content blocks: ${response.content.length} total, types: ${response.content.map(b => b.type).join(', ')}`);

      const textBlocks = response.content.filter((b) => b.type === 'text');
      if (textBlocks.length > 0) {
        const last = (textBlocks[textBlocks.length - 1] as Anthropic.TextBlock).text;
        console.log('[search] last text block (500 chars):', last.slice(0, 500));
      } else {
        console.log('[search] NO text blocks in this response — extractJobResults will return []');
      }

      // Incremental capture: extract and merge results from every completed response.
      const newResults = extractJobResults(response);
      console.log(`[search] extractJobResults found ${newResults.length} jobs in this response`);
      mergeResults(newResults);

      // Check max_jobs ceiling after each accumulation.
      if (profile.max_jobs != null && allResults.length >= profile.max_jobs) {
        stoppedReason = 'max_reached';
        break;
      }

      if (response.stop_reason === 'end_turn') {
        stoppedReason = 'completed';
        break;
      }

      if (response.stop_reason === 'pause_turn') {
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content:
              'Continue searching. Output the full updated JSON array of all results found so far, then keep searching for more.',
          },
        ];
        continue;
      }

      break;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.name === 'TimeoutError' ||
          err.name === 'APIUserAbortError' ||
          err.name === 'APIConnectionError' ||
          err.message === 'Request was aborted.')
      ) {
        console.log(`[search] ABORT CAUGHT at ${Math.round((Date.now() - startMs) / 1000)}s. allResults.length=${allResults.length} — this is what will be returned.`);
        stoppedReason = 'time_budget';
        break;
      }
      throw err;
    }
  }

  const finalResults =
    profile.max_jobs != null ? allResults.slice(0, profile.max_jobs) : allResults;

  console.log('[search] done:', finalResults.length, 'results, stoppedReason:', stoppedReason);

  return { results: finalResults, stoppedReason };
}

function extractJobResults(response: Anthropic.Message): JobResult[] {
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (textBlocks.length === 0) {
    console.log('[search] extractJobResults: no text blocks');
    return [];
  }

  // Check text blocks from last to first.
  for (let i = textBlocks.length - 1; i >= 0; i--) {
    const text = textBlocks[i].text.trim();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed as JobResult[];
    } catch {
      // Fall through to bracket-matching extraction.
    }

    let idx = 0;
    while (idx < text.length) {
      const start = text.indexOf('[', idx);
      if (start === -1) break;
      let depth = 0;
      let end = -1;
      for (let j = start; j < text.length; j++) {
        if (text[j] === '[') depth++;
        else if (text[j] === ']') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end !== -1) {
        try {
          const candidate = text.slice(start, end + 1);
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed as JobResult[];
        } catch {
          // Try the next '['.
        }
      }
      idx = start + 1;
    }
  }

  console.log('[search] extractJobResults: no parseable JSON array found');
  return [];
}
