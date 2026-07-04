import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import { runSearch } from '@/lib/search';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { profileId } = body as { profileId: string };

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 });
  }

  const { data: profile, error } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('user_id', DEV_USER_ID)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  try {
    const result = await runSearch(profile, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[search/run]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}
