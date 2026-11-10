'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { PasskeyLogin } from '@/components/PasskeyLogin';
import { sr } from '@/lib/i18n/sr';
import { signInWithGoogle, type FormState } from '@/lib/auth/actions';

type Props = {
  mode: 'login' | 'register';
  action: (state: FormState, form: FormData) => Promise<FormState>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, run, pending] = useActionState(action, undefined);
  const t = sr.auth;
  const login = mode === 'login';
  return (
    <main className="auth">
      <div className="auth__brand" aria-hidden="true">{sr.appName}</div>
      <section className="auth__card" aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth__title">{login ? t.login : t.register}</h1>
      <form action={run} className="stack">
        {!login && (
          <label>
            {t.displayName}
            <input name="displayName" autoComplete="name" required />
          </label>
        )}
        {!login && (
          <fieldset>
            <legend>{t.accountType}</legend>
            <label>
              <input type="radio" name="role" value="shooter" defaultChecked /> {t.roleShooter}
            </label>
            <label>
              <input type="radio" name="role" value="coach" /> {t.roleCoach}
            </label>
          </fieldset>
        )}
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {t.password}
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={login ? 'current-password' : 'new-password'}
            required
           
          />
          {!login && <small>{t.passwordHint}</small>}
        </label>
        {state?.error && <p role="alert">{t[state.error as 'badCredentials' | 'registerFailed']}</p>}
        <button type="submit" disabled={pending}>{login ? t.submitLogin : t.submitRegister}</button>
        <button type="submit" formAction={signInWithGoogle} formNoValidate className="button--quiet">{t.google}</button>
      </form>
      {login && <PasskeyLogin />}
      <p className="auth__switch">
        {login ? t.noAccount : t.haveAccount}{' '}
        <Link href={login ? '/register' : '/login'}>{login ? t.register : t.login}</Link>
      </p>
      </section>
    </main>
  );
}
