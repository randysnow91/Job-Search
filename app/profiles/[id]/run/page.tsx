'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { SearchProfile } from '@/lib/types';

const SESSION_KEY = 'anthropic_api_key';

export default function RunSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'error' | 'no_key'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setApiKey(saved);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('search_profiles')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      setProfile(data);
    }
    load();
  }, [id]);

  function handleKeyChange(value: string) {
    setApiKey(value);
    sessionStorage.setItem(SESSION_KEY, value);
    if (status === 'no_key') setStatus('idle');
  }

  async function startSearch() {
    if (!apiKey.trim()) {
      setStatus('no_key');
      return;
    }

    setStatus('running');
    setErrorMsg('');

    try {
      const res = await fetch('/api/search/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, apiKey: apiKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Search failed');
        setErrorCode(data.code ?? 'generic');
        setStatus('error');
        return;
      }

      router.push(`/reports/${data.reportId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setErrorCode('network_error');
      setStatus('error');
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
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
        <Link href="/profiles" className="shrink-0 text-sm text-zinc-500 hover:text-zinc-900">
          ← Profiles
        </Link>
      </div>

      {/* API key input — always visible */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Your Anthropic API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-500 focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          We never store your key. It is used for this run only and discarded when the search finishes.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Heads up: running a search uses your own Anthropic API credits. If a search
          won&apos;t run, check your balance at{' '}
          <a
            href="https://platform.claude.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-700"
          >
            platform.claude.com/dashboard
          </a>
          .
        </p>
      </div>

      {/* No-key message */}
      {status === 'no_key' && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Please enter your Anthropic API key to run a search. Don&apos;t have one? Create an
          account and generate a key at{' '}
          <a
            href="https://platform.claude.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-900"
          >
            platform.claude.com/settings/keys
          </a>{' '}
          — you&apos;ll also need to add billing credits before searches will run.
        </div>
      )}

      {status === 'idle' || status === 'no_key' ? (
        <div>
          <p className="mb-4 text-zinc-600">
            This will search the web for real job postings matching your profile.
            {profile &&
              ` It can take up to ${Math.round(profile.time_budget_seconds / 60)} minute${profile.time_budget_seconds >= 120 ? 's' : ''} — you'll be taken to the report right away and it will update automatically when the search finishes.`}
          </p>
          <button
            onClick={startSearch}
            className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Start search
          </button>
        </div>
      ) : null}

      {status === 'running' && (
        <div className="text-zinc-600">
          <p className="animate-pulse">Starting your search…</p>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorCode === 'auth_error' && (
              <>
                That API key wasn&apos;t accepted. Please double-check it and try again. You
                can view or create keys at{' '}
                <a
                  href="https://platform.claude.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-900"
                >
                  platform.claude.com/settings/keys
                </a>
                .
              </>
            )}
            {errorCode === 'billing_error' && (
              <>
                Your API key is valid, but the search couldn&apos;t run — this usually means
                your Anthropic account is out of credits. Check your balance at{' '}
                <a
                  href="https://platform.claude.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-900"
                >
                  platform.claude.com/dashboard
                </a>
                .
              </>
            )}
            {errorCode === 'rate_limit' && (
              <>Too many requests right now. Please wait a moment and try again.</>
            )}
            {errorCode === 'network_error' && (
              <>
                Couldn&apos;t reach the server{errorMsg ? ` (${errorMsg})` : ''}. Check your
                connection and try again.
              </>
            )}
            {(errorCode === 'api_error' || errorCode === 'generic' || !errorCode) && (
              <>
                {errorMsg || "The search couldn't be completed. Please try again."} If it
                keeps happening, check your API key and account at{' '}
                <a
                  href="https://platform.claude.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-900"
                >
                  platform.claude.com
                </a>
                .
              </>
            )}
          </div>
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
