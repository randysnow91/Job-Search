import type { NextRequest } from 'next/server';

// Behind Render's reverse proxy, request.url/nextUrl reflect the internal address
// the container is bound to (e.g. http://localhost:10000) — not the public domain
// the browser actually hit. X-Forwarded-Host/-Proto carry the real origin; only
// Render's own proxy sets these (the container isn't otherwise publicly exposed),
// so trusting them here is safe. Falls back to the request's own origin when
// they're absent — the case for local dev, where there's no proxy in front.
export function resolvePublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (!forwardedHost) return new URL(request.url).origin;
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${forwardedProto}://${forwardedHost}`;
}
