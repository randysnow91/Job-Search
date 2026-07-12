import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { runSearch } from '@/lib/search';
import { deduplicateResults } from '@/lib/dedup';
import { rankResults } from '@/lib/rank';
import type { SearchProfile, RankedResult } from '@/lib/types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function buildOverview(profile: SearchProfile, jobCount: number, stoppedReason: string): string {
  const positions = profile.positions.slice(0, 2).join(', ');
  const extra = profile.positions.length > 2 ? ` +${profile.positions.length - 2} more` : '';
  const locationParts = [profile.location.city, profile.location.region].filter(Boolean).join(', ');
  const locationStr =
    profile.location.mode === 'remote'
      ? 'Remote'
      : profile.location.mode === 'city'
      ? locationParts || 'specified city'
      : `Remote or ${locationParts || 'specified city'}`;
  const stopText =
    stoppedReason === 'max_reached'
      ? `stopped at max ${profile.max_jobs} jobs`
      : stoppedReason === 'completed'
      ? 'search completed'
      : 'stopped at time budget';
  return `Found ${jobCount} job${jobCount !== 1 ? 's' : ''} for ${positions}${extra} · ${locationStr} — ${stopText}`;
}

function buildLocationDisplay(profile: SearchProfile): string {
  if (profile.location.mode === 'remote') return 'Remote';
  const parts = [profile.location.city, profile.location.region].filter(Boolean).join(', ');
  if (profile.location.mode === 'city') return parts || 'On-site';
  return parts ? `Remote or ${parts}` : 'Remote or on-site';
}

// Classifies a search failure into the same (code, message) pairs the UI already
// knows how to render — used to persist the error onto the report row instead of
// returning it in an HTTP response, since this runs after the request has ended.
function classifySearchError(err: unknown): { code: string; message: string } {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const errBody = err.error as { error?: { type?: string; message?: string } } | undefined;
    const errType = errBody?.error?.type ?? '';
    const errMsg = (errBody?.error?.message ?? '').toLowerCase();

    // Log only safe scalar fields — never the full error object, which may
    // contain request headers that include the API key.
    console.error('[search/run] Anthropic API error', { status, errType });

    if (status === 401 || errType === 'authentication_error') {
      return {
        code: 'auth_error',
        message: "That API key wasn't accepted. Please double-check it and try again.",
      };
    }
    if (
      status === 402 ||
      errType === 'billing_error' ||
      errMsg.includes('credit') ||
      errMsg.includes('billing') ||
      errMsg.includes('balance')
    ) {
      return {
        code: 'billing_error',
        message:
          "Your API key is valid, but the search couldn't run — this usually means your Anthropic account is out of credits.",
      };
    }
    if (status === 429 || errType === 'rate_limit_error') {
      return {
        code: 'rate_limit',
        message: 'Too many requests right now. Please wait a moment and try again.',
      };
    }
    return { code: 'api_error', message: "The search couldn't be completed. Please try again." };
  }

  // Non-Anthropic error (network failure, unexpected exception).
  // Log the message string only — not the full object, which could contain request context.
  console.error('[search/run] unexpected error:', err instanceof Error ? err.message : String(err));
  return { code: 'generic', message: "The search couldn't be completed. Please try again." };
}

// Runs the actual search after the HTTP response has already been sent. Safe here
// because the app runs as a persistent Node process (Render), not a serverless
// function that gets frozen once a response is returned. Every failure path below
// writes to the report row instead of throwing, so a stuck 'running' report can
// only happen if the process itself dies.
async function runSearchInBackground(
  supabase: SupabaseServerClient,
  reportId: string,
  userId: string,
  profile: SearchProfile,
  apiKey: string,
  excludedIdentities: Set<string>
) {
  try {
    const searchResult = await runSearch(profile, apiKey);
    const finishedAt = new Date();

    const dedupedResults = deduplicateResults(searchResult.results);

    const filteredResults = dedupedResults.filter(
      (job) => !excludedIdentities.has(job.job_identity ?? '')
    );

    if (dedupedResults.length !== filteredResults.length) {
      console.log(
        `[search/run] excluded ${dedupedResults.length - filteredResults.length} result(s) matching exclusion list`
      );
    }

    const rankedResults = await rankResults(profile, filteredResults, apiKey);

    const overview = buildOverview(profile, rankedResults.length, searchResult.stoppedReason);
    const locationDisplay = buildLocationDisplay(profile);

    const { error: updateError } = await supabase
      .from('reports')
      .update({
        run_finished_at: finishedAt.toISOString(),
        overview,
        stopped_reason: searchResult.stoppedReason,
        jobs_found: rankedResults.length,
        status: 'complete',
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('[search/run] report update error:', updateError);
    }

    if (rankedResults.length > 0) {
      const rows = rankedResults.map((job: RankedResult, index: number) => ({
        report_id: reportId,
        user_id: userId,
        company: job.company,
        title: job.title,
        why: job.why,
        salary: job.salary,
        location_display: locationDisplay,
        source: job.source,
        link: job.link,
        rank: index + 1,
        job_identity: job.job_identity ?? job.link,
        status: 'in_report',
      }));

      const { error: resultsError } = await supabase.from('results').insert(rows);
      if (resultsError) {
        console.error('[search/run] results insert error:', resultsError);
      }
    }
  } catch (err) {
    const { code, message } = classifySearchError(err);
    const { error: updateError } = await supabase
      .from('reports')
      .update({ status: 'error', error_code: code, error_message: message })
      .eq('id', reportId);

    if (updateError) {
      console.error('[search/run] failed to record error status:', updateError);
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { profileId, apiKey } = body as { profileId: string; apiKey: string };

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const { data: exclusionRows } = await supabase
    .from('exclusions')
    .select('job_identity')
    .eq('user_id', user.id);

  const excludedIdentities = new Set(
    (exclusionRows ?? []).map((e: { job_identity: string }) => e.job_identity)
  );

  const startedAt = new Date();

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert({
      profile_id: profileId,
      user_id: user.id,
      run_started_at: startedAt.toISOString(),
      status: 'running',
    })
    .select('id')
    .single();

  if (reportError || !report) {
    console.error('[search/run] report insert error:', reportError);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }

  // Fire-and-forget: the search runs after this function returns. Any failure
  // inside is already caught and recorded on the report row; this .catch is
  // only a last-resort net for something throwing before that inner try runs.
  runSearchInBackground(supabase, report.id, user.id, profile, apiKey, excludedIdentities).catch((err) => {
    console.error(
      '[search/run] background task crashed unexpectedly:',
      err instanceof Error ? err.message : String(err)
    );
  });

  return NextResponse.json({ reportId: report.id });
}
