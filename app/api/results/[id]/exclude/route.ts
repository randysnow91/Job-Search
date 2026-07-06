import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { reason } = body as { reason: string };

  if (!reason || !['applied', 'dismissed'].includes(reason)) {
    return NextResponse.json({ error: 'reason must be applied or dismissed' }, { status: 400 });
  }

  // Look up the result to get job_identity, company, title.
  const { data: result, error: resultError } = await supabase
    .from('results')
    .select('job_identity, company, title')
    .eq('id', id)
    .eq('user_id', DEV_USER_ID)
    .single();

  if (resultError || !result) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }

  // Upsert so excluding the same job twice (from different reports) doesn't error.
  const { data: exclusion, error } = await supabase
    .from('exclusions')
    .upsert(
      {
        user_id: DEV_USER_ID,
        job_identity: result.job_identity,
        company: result.company,
        title: result.title,
        reason,
      },
      { onConflict: 'user_id,job_identity' }
    )
    .select('id')
    .single();

  if (error || !exclusion) {
    console.error('[exclude] error:', error);
    return NextResponse.json({ error: 'Failed to exclude' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exclusionId: exclusion.id });
}
