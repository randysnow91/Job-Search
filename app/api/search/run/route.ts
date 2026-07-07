import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runSearch } from '@/lib/search';
import { deduplicateResults } from '@/lib/dedup';
import { rankResults } from '@/lib/rank';
import type { SearchProfile, RankedResult } from '@/lib/types';

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { profileId } = body as { profileId: string };

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on the server' },
      { status: 500 }
    );
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

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        profile_id: profileId,
        user_id: user.id,
        run_started_at: startedAt.toISOString(),
        run_finished_at: finishedAt.toISOString(),
        overview,
        stopped_reason: searchResult.stoppedReason,
        jobs_found: rankedResults.length,
      })
      .select('id')
      .single();

    if (reportError || !report) {
      console.error('[search/run] report insert error:', reportError);
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
    }

    if (rankedResults.length > 0) {
      const rows = rankedResults.map((job: RankedResult, index: number) => ({
        report_id: report.id,
        user_id: user.id,
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

    return NextResponse.json({ reportId: report.id });
  } catch (err) {
    console.error('[search/run]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}
