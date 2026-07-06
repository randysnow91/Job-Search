'use client';

import { useState } from 'react';
import type { ReportResult } from '@/lib/types';

interface Props {
  result: ReportResult;
  initialExcluded: boolean;
  initialReason?: string;
  initialExclusionId?: string;
}

export default function ResultCard({ result, initialExcluded, initialReason, initialExclusionId }: Props) {
  const [excluded, setExcluded] = useState(initialExcluded);
  const [reason, setReason] = useState<string | null>(initialReason ?? null);
  const [exclusionId, setExclusionId] = useState<string | null>(initialExclusionId ?? null);
  const [loading, setLoading] = useState(false);

  async function exclude(r: 'applied' | 'dismissed') {
    setLoading(true);
    const res = await fetch(`/api/results/${result.id}/exclude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: r }),
    });
    if (res.ok) {
      const data = await res.json();
      setExcluded(true);
      setReason(r);
      setExclusionId(data.exclusionId);
    }
    setLoading(false);
  }

  async function restore() {
    if (!exclusionId) return;
    setLoading(true);
    const res = await fetch(`/api/exclusions/${exclusionId}/restore`, { method: 'POST' });
    if (res.ok) {
      setExcluded(false);
      setReason(null);
      setExclusionId(null);
    }
    setLoading(false);
  }

  return (
    <li
      className={`rounded border p-4 ${
        excluded ? 'border-zinc-100 bg-zinc-50' : 'border-zinc-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`min-w-0 transition-opacity ${excluded ? 'opacity-50' : ''}`}>
          <p className="font-medium text-zinc-900">
            {result.company} — {result.title}
          </p>

          {result.why && (
            <p className="mt-1 text-sm text-zinc-600">{result.why}</p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
            <span>{result.salary ?? 'No salary listed'}</span>
            {result.location_display && <span>{result.location_display}</span>}
            {result.source && <span>{result.source}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <a
            href={result.link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            View →
          </a>

          {excluded ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-zinc-400">
                {reason === 'applied' ? 'Applied ✓' : 'Dismissed ✓'}
              </span>
              <button
                onClick={restore}
                disabled={loading}
                className="text-xs text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
              >
                Restore
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => exclude('applied')}
                disabled={loading}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Applied
              </button>
              <button
                onClick={() => exclude('dismissed')}
                disabled={loading}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
