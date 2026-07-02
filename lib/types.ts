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
  min_jobs: number;
  time_budget_seconds: number;
  created_at: string;
  updated_at: string;
}
