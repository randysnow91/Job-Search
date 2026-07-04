'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import type { SearchProfile, JobResult } from '@/lib/types';

export default function RunSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<JobResult[]>([]);
  const [stoppedReason, setStoppedReason] = useState<'time_budget' | 'max_reached' | 'completed' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    supabase
      .from('search_profiles')
      .select('*')
      .eq('id', id)
      .eq('user_id', DEV_USER_ID)
      .single()
      .then(({ data }) => setProfile(data));
  }, [id]);

  async function startSearch() {
    setStatus('running');
    setResults([]);
    setStoppedReason(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/search/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Search failed');
        setStatus('error');
        return;
      }

      setResults(data.results ?? []);
      setStoppedReason(data.stoppedReason ?? null);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Back to profiles
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">
          {profile ? profile.name : 'Run job search'}
        </h1>
        {profile && (
          <p className="mt-1 text-sm text-zinc-500">
            {profile.positions.slice(0, 2).join(', ')}
            {profile.positions.length > 2 && ` +${profile.positions.length - 2} more`}
            {profile.industry && ` · ${profile.industry}`}
          </p>
        )}
      </div>

      {status === 'idle' && (
        <div>
          <p className="mb-4 text-zinc-600">
            This will call the Anthropic API and search the web for real job postings matching your
            profile.{profile && ` The search runs for up to ${Math.round(profile.time_budget_seconds / 60)} minute${profile.time_budget_seconds >= 120 ? 's' : ''}.`}
          </p>
          <button
            onClick={startSearch}
            className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Start search
          </button>
        </div>
      )}

      {status === 'running' && (
        <div className="text-zinc-600">
          <p className="animate-pulse">Searching the web for job postings…</p>
          <p className="mt-1 text-sm text-zinc-400">
            This may take a few minutes. Please wait.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="mb-4 text-red-600">{errorMsg}</p>
          <button
            onClick={startSearch}
            className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'done' && (
        <div>
          {stoppedReason === 'time_budget' && (
            <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {results.length > 0
                ? 'Search stopped at the time budget — here is what was found.'
                : 'Search stopped at the time budget before any results were captured. Try a longer time budget on your profile.'}
            </p>
          )}
          {stoppedReason === 'max_reached' && (
            <p className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Search stopped after reaching your Max Jobs limit of {profile?.max_jobs}.
            </p>
          )}

          {results.length === 0 ? (
            <p className="text-zinc-500">No matching job postings found. Try broadening your profile.</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-zinc-500">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
              <ul className="space-y-4">
                {results.map((job, i) => (
                  <li key={i} className="rounded border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{job.title}</p>
                        <p className="text-sm text-zinc-600">{job.company}</p>
                        <p className="mt-1 text-sm text-zinc-500">{job.summary}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
                          <span>{job.salary ?? 'No salary listed'}</span>
                          <span>{job.source}</span>
                        </div>
                      </div>
                      <a
                        href={job.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        View →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            onClick={startSearch}
            className="mt-6 rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
