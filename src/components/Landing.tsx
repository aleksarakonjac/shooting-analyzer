import Link from 'next/link';
import { sr } from '@/lib/i18n/sr';
import { Wordmark } from '@/components/Wordmark';

/** Public homepage for signed-out visitors (and Google's OAuth verification review). */
export function Landing() {
  return (
    <main className="landing">
      <header className="landing__hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={96} height={96} className="landing__logo" />
        <h1 className="landing__name"><Wordmark /></h1>
        <p className="landing__lead">
          Aplikacija za streljače i trenere: trening, SIUS, SCATT i puls na jednoj vremenskoj liniji.
        </p>
        <p className="landing__cta">
          <Link href="/login" className="button">Prijava</Link>
          <Link href="/register" className="button button--ghost">Registracija</Link>
        </p>
      </header>

      <section className="landing__grid" aria-label="Šta aplikacija radi">
        <article>
          <h2>Dnevnik treninga</h2>
          <p>Sesije, serije, pogoci i beleške na jednom mestu, sa pregledom napretka kroz vreme.</p>
        </article>
        <article>
          <h2>SIUS i SCATT</h2>
          <p>Uvoz SIUS i SCATT izvoza i PDF-ova, pregled putanje nišana i poređenje serija.</p>
        </article>
        <article>
          <h2>Puls</h2>
          <p>
            Ako to dozvolite, aplikacija preuzima podatke o pulsu sa vašeg Google naloga (Google Health) i poravnava ih
            sa serijama, da vidite kako telo reaguje na svaki hitac.
          </p>
        </article>
        <article>
          <h2>Trener</h2>
          <p>Trener vidi samo ono što mu strelac izričito podeli i to može da opozove u svakom trenutku.</p>
        </article>
      </section>

      <footer className="landing__foot">
        <span className="landing__links">
          <Link href="/privatnost">Politika privatnosti</Link>
          <Link href="/privacy" hrefLang="en" lang="en">Privacy Policy</Link>
        </span>
        <span>© {sr.appName}</span>
      </footer>
    </main>
  );
}
