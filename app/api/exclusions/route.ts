import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';

export async function GET() {
  const { data, error } = await supabase
    .from('exclusions')
    .select('*')
    .eq('user_id', DEV_USER_ID)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to load exclusions' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
