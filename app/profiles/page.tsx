'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SearchProfile } from '@/lib/types';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function fetchProfiles() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data, error } = await supabase
      .from('search_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) setProfiles(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function deleteProfile(id: string) {
    if (!confirm('Delete this profile?')) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('search_profiles').delete().eq('id', id).eq('user_id', user.id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Search Profiles</h1>
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-sm text-zinc-500 hover:text-zinc-900">
            All reports
          </Link>
          <Link href="/exclusions" className="text-sm text-zinc-500 hover:text-zinc-900">
            Exclusions
          </Link>
          <Link
            href="/profiles/new"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New profile
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-zinc-400 hover:text-zinc-700"
          >
            Sign out
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <p className="mt-8 text-zinc-500">No profiles yet. Create one to get started.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {profiles.map((profile) => (
            <li key={profile.id} className="rounded border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-zinc-900">{profile.name}</p>
                  {profile.positions.length > 0 && (
                    <p className="mt-1 text-sm text-zinc-500">
                      {profile.positions.slice(0, 2).join(', ')}
                      {profile.positions.length > 2 && ` +${profile.positions.length - 2} more`}
                    </p>
                  )}
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {profile.industry && `${profile.industry} · `}
                    {profile.location.mode === 'remote'
                      ? 'Remote'
                      : profile.location.mode === 'city'
                      ? profile.location.city ?? 'City'
                      : `Remote or ${profile.location.city ?? 'city'}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <Link
                    href={`/profiles/${profile.id}/run`}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Run search
                  </Link>
                  <Link
                    href={`/profiles/${profile.id}/edit`}
                    className="text-sm text-zinc-600 underline hover:text-zinc-900"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteProfile(profile.id)}
                    className="text-sm text-red-600 underline hover:text-red-900"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
