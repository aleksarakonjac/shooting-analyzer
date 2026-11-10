'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Passkeys are an experimental Supabase Auth API and must be opted into.
    { auth: { experimental: { passkey: true } } },
  );
}
