'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SearchProfile } from '@/lib/types';

interface Props {
  profile?: SearchProfile;
  userId: string;
}

export default function ProfileForm({ profile, userId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const positionsTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(profile?.name ?? '');
  const [positions, setPositions] = useState(profile?.positions.join('\n') ?? '');
  const [industry, setIndustry] = useState(profile?.industry ?? '');
  const [keywords, setKeywords] = useState(profile?.keywords.join(', ') ?? '');
  const [locationMode, setLocationMode] = useState<'remote' | 'city' | 'both'>(
    profile?.location.mode ?? 'remote'
  );
  const [city, setCity] = useState(profile?.location.city ?? '');
  const [region, setRegion] = useState(profile?.location.region ?? '');
  const [minPay, setMinPay] = useState(profile?.filters.min_pay?.toString() ?? '');
  const [maxJobs, setMaxJobs] = useState(profile?.max_jobs?.toString() ?? '');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(
    Math.round((profile?.time_budget_seconds ?? 180) / 60).toString()
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNameError(null);
    setPositionsError(null);

    if (!name.trim()) {
      setNameError('Profile name is required.');
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInputRef.current?.focus();
      return;
    }
    const positionList = positions.split('\n').map((p) => p.trim()).filter(Boolean);
    if (positionList.length === 0) {
      setPositionsError('Please select at least one target position.');
      positionsTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      positionsTextareaRef.current?.focus();
      return;
    }

    setSaving(true);

    const supabase = createClient();

    const data = {
      user_id: userId,
      name: name.trim(),
      positions: positionList,
      industry: industry.trim(),
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      location: {
        mode: locationMode,
        ...(locationMode !== 'remote' && city ? { city: city.trim() } : {}),
        ...(locationMode !== 'remote' && region ? { region: region.trim() } : {}),
      },
      filters: {
        ...(minPay ? { min_pay: parseInt(minPay) } : {}),
      },
      max_jobs: maxJobs.trim() ? parseInt(maxJobs) : null,
      time_budget_seconds: (parseInt(timeBudgetMinutes) || 3) * 60,
    };

    const result = profile
      ? await supabase
          .from('search_profiles')
          .update(data)
          .eq('id', profile.id)
          .eq('user_id', userId)
      : await supabase.from('search_profiles').insert(data);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
    } else {
      router.push('/profiles');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700">Profile name</label>
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Target positions{' '}
          <span className="font-normal text-zinc-500">(one per line, top = most preferred)</span>
        </label>
        <textarea
          ref={positionsTextareaRef}
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
          rows={4}
          placeholder={"Senior Software Engineer\nStaff Engineer\nTech Lead"}
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {positionsError && <p className="mt-1 text-xs text-red-600">{positionsError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Industry</label>
        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Fintech, Healthcare, SaaS"
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Keywords / skills{' '}
          <span className="font-normal text-zinc-500">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="TypeScript, Node.js, PostgreSQL, AWS"
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Location preference</label>
        <div className="mt-2 space-y-2">
          {(['remote', 'city', 'both'] as const).map((mode) => (
            <div key={mode}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="locationMode"
                  value={mode}
                  checked={locationMode === mode}
                  onChange={() => setLocationMode(mode)}
                />
                {mode === 'remote' ? 'Remote only' : mode === 'city' ? 'Specific city' : 'Remote or city'}
              </label>
              {mode === 'remote' && (
                <p className="ml-6 mt-1 text-xs text-zinc-500">
                  Remote searches for jobs listed as &quot;remote,&quot; which means &quot;work from home.&quot;
                </p>
              )}
            </div>
          ))}
        </div>
        {locationMode !== 'remote' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Chicago"
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Region / State</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Illinois"
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Minimum salary{' '}
          <span className="font-normal text-zinc-500">(optional, $/year)</span>
        </label>
        <input
          type="number"
          value={minPay}
          onChange={(e) => setMinPay(e.target.value)}
          placeholder="e.g. 120000"
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Search Time Budget (minutes)
        </label>
        <input
          type="number"
          value={timeBudgetMinutes}
          onChange={(e) => setTimeBudgetMinutes(e.target.value)}
          min={1}
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-500">
          How long to search. More time finds more jobs but costs more — most of your cost comes from this setting.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">
          Max Jobs to Find{' '}
          <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          type="number"
          value={maxJobs}
          onChange={(e) => setMaxJobs(e.target.value)}
          min={1}
          placeholder="Leave blank to search the whole time budget"
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-zinc-500">
          A stopping point. If you only have time to review, say, 10 jobs a day, set that here and the search stops once it finds them — no sense paying to find more than you&apos;ll read. Leave blank to search the whole time budget.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/profiles')}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
