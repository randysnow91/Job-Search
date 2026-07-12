'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 4000;
// Safety net in case a background search dies without ever reaching its own
// error handler (e.g. the process itself restarts) — stop polling silently
// forever and let the user decide to check again instead.
const MAX_POLL_MS = 15 * 60 * 1000;

export default function ReportStatusPoller({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }

      try {
        const res = await fetch(`/api/reports/${reportId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status && data.status !== 'running') {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [reportId, router]);

  if (timedOut) {
    return (
      <div className="text-zinc-600">
        <p>This is taking longer than expected.</p>
        <button
          onClick={() => router.refresh()}
          className="mt-2 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Refresh to check
        </button>
      </div>
    );
  }

  return (
    <div className="text-zinc-600">
      <p className="animate-pulse">Searching the web for job postings…</p>
      <p className="mt-1 text-sm text-zinc-400">
        This can take a few minutes. This page will update automatically when it&apos;s done.
      </p>
    </div>
  );
}
