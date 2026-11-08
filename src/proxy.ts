import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { decideRoute, type SessionProfile } from '@/lib/auth/guard';

// Optimistic redirects only; row-level security is the real gate.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: auth } = await supabase.auth.getUser();
  let profile: SessionProfile | null = null;
  if (auth.user) {
    const { data } = await supabase.from('profiles').select('id, role, status, tz').eq('id', auth.user.id).maybeSingle();
    profile = (data as SessionProfile | null) ?? null;
  }

  const decision = decideRoute(request.nextUrl.pathname, profile, Boolean(auth.user));
  if ('redirect' in decision) {
    const redirect = NextResponse.redirect(new URL(decision.redirect, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|wasm|mjs)$).*)'],
};
