export interface JobResult {
  company: string;
  title: string;
  summary: string;
  salary: string | null;
  source: string;
  link: string;
}

export interface SearchOutput {
  results: JobResult[];
  stoppedReason: 'time_budget' | 'max_reached' | 'completed';
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
