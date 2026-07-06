import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import Link from 'next/link';
import type { ReportResult } from '@/lib/types';
import ResultCard from './ResultCard';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: report } = await supabase
    .from('reports')
    .select('*, search_profiles(id, name, positions, location)')
    .eq('id', id)
    .eq('user_id', DEV_USER_ID)
    .single();

  const { data: results } = await supabase
    .from('results')
    .select('*')
    .eq('report_id', id)
    .eq('user_id', DEV_USER_ID)
    .order('rank', { ascending: true });

  const { data: exclusionRows } = await supabase
    .from('exclusions')
    .select('id, job_identity, reason')
    .eq('user_id', DEV_USER_ID);

  const excludedMap = new Map<string, { reason: string; exclusionId: string }>(
    (exclusionRows ?? []).map((e) => [e.job_identity, { reason: e.reason, exclusionId: e.id }])
  );

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-zinc-500">Report not found.</p>
        <Link href="/reports" className="mt-4 block text-sm text-zinc-500 underline">
          ← All reports
        </Link>
      </div>
    );
  }

  const profile = report.search_profiles as {
    id: string;
    name: string;
    positions: string[];
    location: { mode: string; city?: string; region?: string };
  } | null;

  const runDate = new Date(report.run_started_at).toLocaleString();
  const duration = Math.round(
    (new Date(report.run_finished_at).getTime() - new Date(report.run_started_at).getTime()) / 1000
  );
  const durationLabel = duration >= 60 ? `${Math.round(duration / 60)} min` : `${duration}s`;

  const stopBanner =
    report.stopped_reason === 'max_reached' ? (
      <p className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Search stopped after reaching the Max Jobs limit.
      </p>
    ) : report.stopped_reason === 'time_budget' ? (
      <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Search stopped at the time budget — results shown are what was found in that time.
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/reports" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← All reports
        </Link>
        {profile && (
          <Link
            href={`/profiles/${profile.id}/run`}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Run again
          </Link>
        )}
      </div>

      {/* Report header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">
          {profile?.name ?? 'Search report'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {runDate} · {durationLabel} · {report.jobs_found} job
          {report.jobs_found !== 1 ? 's' : ''} found
        </p>
        <p className="mt-2 text-sm text-zinc-700">{report.overview}</p>
      </div>

      {stopBanner && <div className="mb-6">{stopBanner}</div>}

      {/* Results */}
      {!results || results.length === 0 ? (
        <p className="text-zinc-500">No job results were captured for this run.</p>
      ) : (
        <ul className="space-y-4">
          {(results as ReportResult[]).map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              initialExcluded={excludedMap.has(result.job_identity)}
              initialReason={excludedMap.get(result.job_identity)?.reason}
              initialExclusionId={excludedMap.get(result.job_identity)?.exclusionId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
