import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { completeOnboarding } from '@/lib/auth/actions';

export default function OnboardingPage() {
  return (
    <main className="auth">
      <div className="auth__brand" aria-hidden="true">{sr.appName}</div>
      <section className="auth__card" aria-labelledby="onb-title">
        <h1 id="onb-title" className="auth__title">{sr.onboarding.title}</h1>
        <p>{sr.onboarding.lead}</p>
        <Suspense fallback={null}>
          <Form />
        </Suspense>
      </section>
    </main>
  );
}

async function Form() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: p } = await supabase.from('profiles').select('display_name').eq('id', auth.user?.id ?? '').maybeSingle();
  const t = sr.auth;
  return (
    <form action={completeOnboarding} className="stack">
      <label>
        {t.displayName}
        <input name="displayName" autoComplete="name" defaultValue={p?.display_name ?? ''} required />
      </label>
      <fieldset>
        <legend>{t.accountType}</legend>
        <label>
          <input type="radio" name="role" value="shooter" defaultChecked /> {t.roleShooter}
        </label>
        <label>
          <input type="radio" name="role" value="coach" /> {t.roleCoach}
        </label>
      </fieldset>
      <button type="submit">{sr.onboarding.submit}</button>
    </form>
  );
}
