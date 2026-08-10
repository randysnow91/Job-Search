import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePublicOrigin } from '@/lib/publicOrigin';

// Handles the confirmation link Supabase sends for email confirmation, OAuth, and
// password recovery. `next` lets a caller land somewhere other than /profiles after
// the code exchange — the password-reset flow passes next=/reset-password so the
// user sees a set-new-password form instead of being dropped straight into the app.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/profiles';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Only allow a relative, same-app path — next is caller-controlled via the URL,
  // so this guards against it being used as an open redirect.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/profiles';
  return NextResponse.redirect(new URL(safeNext, resolvePublicOrigin(request)));
}
