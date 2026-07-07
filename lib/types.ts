export interface JobResult {
  company: string;
  title: string;
  summary: string;
  salary: string | null;
  source: string;
  link: string;
  job_identity?: string; // set by deduplicateResults() before results are saved
}

// Produced by rankResults() — replaces JobResult.summary with a genuine why-line.
export interface RankedResult {
  company: string;
  title: string;
  why: string;
  salary: string | null;
  source: string;
  link: string;
  job_identity?: string;
}

export interface SearchOutput {
  results: JobResult[];
  stoppedReason: 'time_budget' | 'max_reached' | 'completed';
}

export interface Report {
  id: string;
  profile_id: string;
  user_id: string;
  run_started_at: string;
  run_finished_at: string;
  overview: string;
  stopped_reason: string;
  jobs_found: number;
  created_at: string;
}

export interface ReportResult {
  id: string;
  report_id: string;
  user_id: string;
  company: string;
  title: string;
  why: string;
  salary: string | null;
  location_display: string;
  source: string;
  link: string;
  rank: number;
  job_identity: string;
  status: string;
  created_at: string;
}

export interface Exclusion {
  id: string;
  user_id: string;
  job_identity: string;
  company: string;
  title: string;
  reason: string;
  created_at: string;
}

export interface SearchProfile {
  id: string;
  user_id: string;
  name: string;
  positions: string[];
  industry: string;
  keywords: string[];
  location: {
    mode: 'remote' | 'city' | 'both';
    city?: string;
    region?: string;
  };
  filters: {
    min_pay?: number;
  };
  max_jobs: number | null;
  time_budget_seconds: number;
  created_at: string;
  updated_at: string;
}
