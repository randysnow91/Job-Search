'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import type { SearchProfile } from '@/lib/types';

export default function RunSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
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

      router.push(`/reports/${data.reportId}`);
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
            This will call the Anthropic API and search the web for real job postings matching
            your profile.
            {profile &&
              ` The search runs for up to ${Math.round(profile.time_budget_seconds / 60)} minute${profile.time_budget_seconds >= 120 ? 's' : ''}.`}
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
            This may take a few minutes. The report will open automatically when done.
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
    </div>
  );
}
