import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabase
    .from('exclusions')
    .delete()
    .eq('id', id)
    .eq('user_id', DEV_USER_ID);

  if (error) {
    console.error('[restore] error:', error);
    return NextResponse.json({ error: 'Failed to restore' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
