'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { sr } from '@/lib/i18n/sr';
import type { FormState } from '@/lib/auth/actions';

type Props = {
  mode: 'login' | 'register';
  action: (state: FormState, form: FormData) => Promise<FormState>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, run, pending] = useActionState(action, undefined);
  const t = sr.auth;
  const login = mode === 'login';
  return (
    <main className="page page--narrow">
      <h1>{login ? t.login : t.register}</h1>
      <form action={run} style={{ display: 'grid', gap: '1rem' }}>
        {!login && (
          <label>
            {t.displayName}
            <input name="displayName" autoComplete="name" required style={{ display: 'block', width: '100%' }} />
          </label>
        )}
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          {t.password}
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={login ? 'current-password' : 'new-password'}
            required
            style={{ display: 'block', width: '100%' }}
          />
          {!login && <small>{t.passwordHint}</small>}
        </label>
        {state?.error && <p role="alert">{t[state.error as 'badCredentials' | 'registerFailed']}</p>}
        <button type="submit" disabled={pending}>{login ? t.submitLogin : t.submitRegister}</button>
      </form>
      <p>
        {login ? t.noAccount : t.haveAccount}{' '}
        <Link href={login ? '/register' : '/login'}>{login ? t.register : t.login}</Link>
      </p>
    </main>
  );
}
