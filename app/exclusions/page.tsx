'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Exclusion } from '@/lib/types';

export default function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/exclusions')
      .then((r) => r.json())
      .then((data) => {
        setExclusions(data);
        setLoading(false);
      });
  }, []);

  async function restore(id: string) {
    const res = await fetch(`/api/exclusions/${id}/restore`, { method: 'POST' });
    if (res.ok) {
      setExclusions((prev) => prev.filter((e) => e.id !== id));
    }
  }

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Exclusions</h1>
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Profiles
        </Link>
      </div>

      <p className="mb-6 text-sm text-zinc-500">
        Jobs on this list are excluded from all future searches. Restore any entry to
        let it appear again.
      </p>

      {exclusions.length === 0 ? (
        <p className="text-zinc-500">
          No exclusions yet. Use the <strong>Applied</strong> or{' '}
          <strong>Dismiss</strong> buttons on a report to add jobs here.
        </p>
      ) : (
        <ul className="space-y-3">
          {exclusions.map((exclusion) => (
            <li
              key={exclusion.id}
              className="flex items-center justify-between gap-4 rounded border border-zinc-200 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">
                  {exclusion.company} — {exclusion.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {exclusion.reason === 'applied' ? 'Applied' : 'Dismissed'} ·{' '}
                  {new Date(exclusion.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => restore(exclusion.id)}
                className="shrink-0 text-sm text-zinc-500 underline hover:text-zinc-900"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
