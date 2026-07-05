import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import { runSearch } from '@/lib/search';
import type { SearchProfile, JobResult } from '@/lib/types';

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
    .eq('user_id', DEV_USER_ID)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const startedAt = new Date();

  try {
    const searchResult = await runSearch(profile, apiKey);
    const finishedAt = new Date();

    const overview = buildOverview(profile, searchResult.results.length, searchResult.stoppedReason);
    const locationDisplay = buildLocationDisplay(profile);

    // Save the report row first.
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        profile_id: profileId,
        user_id: DEV_USER_ID,
        run_started_at: startedAt.toISOString(),
        run_finished_at: finishedAt.toISOString(),
        overview,
        stopped_reason: searchResult.stoppedReason,
        jobs_found: searchResult.results.length,
      })
      .select('id')
      .single();

    if (reportError || !report) {
      console.error('[search/run] report insert error:', reportError);
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
    }

    // Save one results row per job.
    if (searchResult.results.length > 0) {
      const rows = searchResult.results.map((job: JobResult, index: number) => ({
        report_id: report.id,
        user_id: DEV_USER_ID,
        company: job.company,
        title: job.title,
        why: job.summary,          // M6 replaces with judgment-ranking explanation
        salary: job.salary,
        location_display: locationDisplay, // M6 replaces with per-job proximity
        source: job.source,
        link: job.link,
        rank: index + 1,
        job_identity: job.link,    // M5 replaces with proper dedup key
        status: 'in_report',
      }));

      const { error: resultsError } = await supabase.from('results').insert(rows);
      if (resultsError) {
        console.error('[search/run] results insert error:', resultsError);
        // Report header saved — return the id so the user still sees a (empty) report.
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
