import type { JobResult } from './types';

// Normalize a string for comparison: lowercase, strip punctuation, collapse whitespace.
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a canonical identity key from company + title.
// Two jobs with the same key are treated as the same opening.
export function computeJobIdentity(company: string, title: string): string {
  return `${normalize(company)}||${normalize(title)}`;
}

// Deduplicate a list of job results and stamp job_identity on each survivor.
//
// Step 1 — identical URL: a definite duplicate; keep the first occurrence.
// Step 2 — identical normalized company+title key: a definite duplicate; keep first.
// Step 3 (deferred) — near-match model judgment: same normalized company AND
//   title word-overlap > ~60%. Would call a lightweight model ("are these the
//   same opening?") and collapse on a clear yes. Conservative default: keep both
//   when the answer is uncertain. Not yet implemented.
export function deduplicateResults(jobs: JobResult[]): JobResult[] {
  const seenLinks = new Set<string>();
  const seenIdentities = new Set<string>();
  const deduped: JobResult[] = [];

  for (const job of jobs) {
    // Step 1: identical URL is a definite match.
    if (seenLinks.has(job.link)) {
      console.log(`[dedup] dropped duplicate URL: ${job.link}`);
      continue;
    }
    seenLinks.add(job.link);

    // Step 2: identical normalized company+title is a definite match.
    const identity = computeJobIdentity(job.company, job.title);
    if (seenIdentities.has(identity)) {
      console.log(`[dedup] dropped duplicate identity: ${identity}`);
      continue;
    }
    seenIdentities.add(identity);

    deduped.push({ ...job, job_identity: identity });
  }

  console.log(`[dedup] ${jobs.length} raw → ${deduped.length} after dedup`);
  return deduped;
}
