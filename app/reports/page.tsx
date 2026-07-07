import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: reports } = await supabase
    .from('reports')
    .select('*, search_profiles(name)')
    .eq('user_id', user.id)
    .order('run_started_at', { ascending: false });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Past reports</h1>
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Profiles
        </Link>
      </div>

      {!reports || reports.length === 0 ? (
        <p className="text-zinc-500">
          No reports yet.{' '}
          <Link href="/profiles" className="underline hover:text-zinc-900">
            Run a search
          </Link>{' '}
          to see results here.
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const profileName =
              (report.search_profiles as { name: string } | null)?.name ?? 'Unknown profile';
            const runDate = new Date(report.run_started_at).toLocaleString();
            const stopLabel =
              report.stopped_reason === 'max_reached'
                ? 'Max jobs reached'
                : report.stopped_reason === 'completed'
                ? 'Completed'
                : 'Time budget';

            return (
              <li key={report.id}>
                <Link
                  href={`/reports/${report.id}`}
                  className="block rounded border border-zinc-200 p-4 hover:border-zinc-400 hover:bg-zinc-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">{profileName}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">{runDate}</p>
                      <p className="mt-1 text-sm text-zinc-600">{report.overview}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-zinc-900">
                        {report.jobs_found} job{report.jobs_found !== 1 ? 's' : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">{stopLabel}</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
