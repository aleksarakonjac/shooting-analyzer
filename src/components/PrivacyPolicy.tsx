import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

export type PolicyLang = 'sr' | 'en';

const APP = 'ZeroIn';
const PERMISSIONS_URL = 'https://myaccount.google.com/permissions';
const GOOGLE_POLICY_URL = 'https://developers.google.com/terms/api-services-user-data-policy';

const ext = { rel: 'noopener noreferrer' } as const;

type Doc = {
  title: string;
  updatedLabel: string;
  updated: string;
  back: string;
  switchLabel: string;
  intro: string;
  body: (contact: string | undefined) => ReactNode;
};

const sr: Doc = {
  title: 'Politika privatnosti',
  updatedLabel: 'Poslednja izmena',
  updated: '14. novembar 2026.',
  back: 'Nazad na aplikaciju',
  switchLabel: 'Jezik',
  intro: `${APP} je aplikacija za vođenje streljačkih treninga. Ova stranica objašnjava koje podatke čuvamo, zašto i šta možete da uradite sa njima.`,
  body: (contact) => (
    <>
      <h2>Koje podatke čuvamo</h2>
      <ul>
        <li>Nalog: ime, adresu e-pošte i tip naloga (strelac ili trener). Ako se prijavite preko Google naloga, od Googlea dobijamo samo ime i adresu e-pošte.</li>
        <li>Treninzi: sesije, serije, pogoci, beleške i rezultati koje unesete.</li>
        <li>Fajlovi koje sami otpremite: SCATT, SIUS i slični izvozi i PDF-ovi, kao i podaci o pulsu ako ih uvezete.</li>
        <li>Podešavanja: vremenska zona, prikaz i passkey-i za prijavu (čuva se samo javni ključ, nikada biometrija).</li>
        <li>Evidenciju izmena (ko je i kada menjao sesiju) radi pregleda i oporavka podataka.</li>
      </ul>

      <h2>Zašto ih koristimo</h2>
      <p>
        Isključivo da bi aplikacija radila: prijava, prikaz i analiza vaših treninga i deljenje sa trenerom koga sami
        povežete. Ne prodajemo podatke, ne koristimo ih za reklame i ne pravimo profile za treće strane.
      </p>

      <h2>Ko može da ih vidi</h2>
      <p>
        Vi. Trener ili strelac vidi samo ono što ste im izričito podelili u delu „Veze i deljenje“, i to možete da
        promenite ili opozovete u svakom trenutku. Administrator aplikacije odobrava nove naloge i prima obaveštenje o
        registraciji (ime, e-pošta, tip naloga).
      </p>

      <h2>Servisi koje koristimo</h2>
      <ul>
        <li>Supabase: baza podataka, prijava i čuvanje fajlova.</li>
        <li>Vercel: hosting aplikacije.</li>
        <li>Google: prijava preko Google naloga (samo ime i e-pošta) i, ako to izričito dozvolite, uvoz pulsa iz Google Health (opisano ispod).</li>
        <li>Servis za slanje e-pošte: obaveštenja administratoru o novim nalozima.</li>
      </ul>
      <p>
        Podatke koje dobijemo od Googlea za prijavu koristimo samo za prijavu i prikaz vašeg imena u aplikaciji. Ne
        delimo ih sa trećim stranama.
      </p>

      <h2>Google Health podaci (puls)</h2>
      <p>
        Povezivanje sa Google Health je potpuno opciono i uključuje se samo na vaš zahtev. Služi da se uz svaki hitac
        prikaže puls, kako biste vi i vaš trener videli odnos pulsa, vremena hica i rezultata. Tražimo tri dozvole, sve
        samo za čitanje:
      </p>
      <ul>
        <li>
          <strong>Zdravstvene metrike i merenja</strong> (<code>googlehealth.health_metrics_and_measurements.readonly</code>):
          čitamo uzorke pulsa samo za vremenski prozor treninga koji izaberete. Koristimo ih da poravnamo puls sa hicima
          i da izračunamo prosečan puls tokom meča.
        </li>
        <li>
          <strong>Aktivnost i kondicija</strong> (<code>googlehealth.activity_and_fitness.readonly</code>): izlistavamo
          vaše vežbe da bismo pronašli onu koja se poklapa sa streljačkim treningom i preuzeli njen TCX fajl.
        </li>
        <li>
          <strong>Lokacija</strong> (<code>googlehealth.location.readonly</code>): Google je zahteva za preuzimanje TCX
          fajla. GPS podatke ne koristimo, ne prikazujemo i ne čuvamo; iz fajla čitamo samo tačke sa pulsom.
        </li>
      </ul>
      <p>
        Podaci iz Google Health se čitaju samo kada vi to zatražite, nikada se ne upisuju nazad u vaš Google nalog i ne
        dele se ni sa kim. Sirovi uzorci pulsa se ne čuvaju; sačuva se samo izračunati prosečan puls po treningu. (Ako
        sami otpremite TCX fajl, on se čuva kao i drugi fajlovi koje otpremite.) Pristup možete da opozovete u bilo kom
        trenutku na stranici <a href={PERMISSIONS_URL} {...ext}>myaccount.google.com/permissions</a>.
      </p>
      <p>
        Korišćenje i prenos informacija koje primimo od Google API-ja u bilo koju drugu aplikaciju poštovaće{' '}
        <a href={GOOGLE_POLICY_URL} {...ext}>Google API Services User Data Policy</a>, uključujući zahteve ograničene
        upotrebe (Limited Use). Podatke iz Google Health koristimo isključivo da bismo vam prikazali puls u aplikaciji,
        ne prodajemo ih, ne koristimo za reklame ni za procenu kreditne sposobnosti, ne prenosimo trećim stranama, a
        ljudi ih ne čitaju osim uz vašu saglasnost, radi bezbednosti ili kada to zakon zahteva.
      </p>

      <h2>Čuvanje i brisanje</h2>
      <p>
        Podatke čuvamo dok imate nalog. Obrisana sesija ostaje 30 dana u Korpi, a zatim se trajno briše. Brisanje celog
        naloga i svih podataka možete zatražiti u bilo kom trenutku, a mi ćemo ga izvršiti bez nepotrebnog odlaganja.
      </p>

      <h2>Bezbednost</h2>
      <p>
        Veza je šifrovana (HTTPS), a pristup podacima je ograničen pravilima na nivou baze tako da svaki korisnik
        pristupa samo svojim podacima i onome što je podeljeno sa njim.
      </p>

      <h2>Vaša prava</h2>
      <p>Imate pravo da pristupite svojim podacima, ispravite ih, preuzmete ih i zatražite brisanje.</p>

      <h2>Kontakt</h2>
      <p>
        {contact ? (
          <>Za pitanja i zahteve pišite na <a href={`mailto:${contact}`}>{contact}</a>.</>
        ) : (
          <>Za pitanja i zahteve obratite se administratoru aplikacije.</>
        )}
      </p>
    </>
  ),
};

const en: Doc = {
  title: 'Privacy Policy',
  updatedLabel: 'Last updated',
  updated: 'November 14, 2026',
  back: 'Back to the app',
  switchLabel: 'Language',
  intro: `${APP} is a training log for sport shooters. This page explains what data we keep, why, and what you can do with it.`,
  body: (contact) => (
    <>
      <h2>What data we keep</h2>
      <ul>
        <li>Account: your name, email address and account type (shooter or coach). If you sign in with Google, we receive only your name and email address from Google.</li>
        <li>Training: the sessions, series, shots, notes and scores you enter.</li>
        <li>Files you upload yourself: SCATT, SIUS and similar exports and PDFs, and heart-rate data if you import it.</li>
        <li>Settings: time zone, display preferences and sign-in passkeys (only the public key is stored, never biometrics).</li>
        <li>An audit log (who changed a session, and when) so changes can be reviewed and recovered.</li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        Only to make the app work: signing in, showing and analysing your training, and sharing with a coach you
        choose to connect. We do not sell data, we do not use it for advertising, and we do not build profiles for
        third parties.
      </p>

      <h2>Who can see it</h2>
      <p>
        You. A coach or shooter sees only what you have explicitly shared with them under &ldquo;Connections and
        sharing&rdquo;, and you can change or revoke that at any time. The app administrator approves new accounts and
        receives a notification about each registration (name, email, account type).
      </p>

      <h2>Services we use</h2>
      <ul>
        <li>Supabase: database, authentication and file storage.</li>
        <li>Vercel: hosting.</li>
        <li>Google: sign-in with a Google account (name and email only) and, if you explicitly allow it, heart-rate import from Google Health (described below).</li>
        <li>An email delivery service: notifications to the administrator about new accounts.</li>
      </ul>
      <p>
        Data we receive from Google for sign-in is used only to sign you in and to show your name in the app. We do not
        share it with third parties.
      </p>

      <h2>Google Health data (heart rate)</h2>
      <p>
        Connecting Google Health is entirely optional and happens only when you ask for it. It lets the app show your
        heart rate alongside each shot, so you and your coach can see how pulse relates to shot timing and score. We
        request three permissions, all read-only:
      </p>
      <ul>
        <li>
          <strong>Health metrics and measurements</strong> (<code>googlehealth.health_metrics_and_measurements.readonly</code>):
          we read heart-rate samples only for the time window of the training session you select. We use them to align
          pulse with shots and to compute your average heart rate during the match.
        </li>
        <li>
          <strong>Activity and fitness</strong> (<code>googlehealth.activity_and_fitness.readonly</code>): we list your
          exercise sessions to find the workout that overlaps your shooting training and to export its TCX file.
        </li>
        <li>
          <strong>Location</strong> (<code>googlehealth.location.readonly</code>): required by Google for exporting the
          TCX file. We do not use, display or store GPS data; we read only the heart-rate trackpoints from the file.
        </li>
      </ul>
      <p>
        Google Health data is read only when you request it, is never written back to your Google account, and is never
        shared with anyone. Raw heart-rate samples are not stored; only the computed average heart rate per session is
        kept. (If you upload a TCX file yourself, it is stored like any other file you upload.) You can revoke access at
        any time at <a href={PERMISSIONS_URL} {...ext}>myaccount.google.com/permissions</a>.
      </p>
      <p>
        {APP}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
        <a href={GOOGLE_POLICY_URL} {...ext}>Google API Services User Data Policy</a>, including the Limited Use
        requirements. We use Google Health data solely to show you your heart rate in the app. We do not sell it, use
        it for advertising or to determine creditworthiness, or transfer it to third parties, and humans do not read it
        unless you give consent, it is needed for security purposes, or the law requires it.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your data while you have an account. A deleted session stays in the Trash for 30 days and is then
        permanently removed. You can request deletion of your whole account and all your data at any time, and we will
        carry it out without undue delay.
      </p>

      <h2>Security</h2>
      <p>
        Connections are encrypted (HTTPS), and access is restricted by database-level rules so each user can reach only
        their own data and what has been shared with them.
      </p>

      <h2>Your rights</h2>
      <p>You have the right to access, correct and download your data and to request its deletion.</p>

      <h2>Contact</h2>
      <p>
        {contact ? (
          <>For questions and requests, write to <a href={`mailto:${contact}`}>{contact}</a>.</>
        ) : (
          <>For questions and requests, contact the app administrator.</>
        )}
      </p>
    </>
  ),
};

const DOCS: Record<PolicyLang, Doc> = { sr, en };
export const POLICY_PATH: Record<PolicyLang, string> = { sr: '/privatnost', en: '/privacy' };
export const policyTitle = (lang: PolicyLang) => `${DOCS[lang].title} | ${APP}`;
export const policyDescription = (lang: PolicyLang) =>
  lang === 'sr'
    ? `Koje podatke ${APP} čuva, zašto i kako ih možete obrisati.`
    : `What data ${APP} keeps, why, and how you can delete it.`;

export function PrivacyPolicy({ lang }: { lang: PolicyLang }) {
  const doc = DOCS[lang];
  // Optional public contact; set PRIVACY_CONTACT_EMAIL in the environment to show it.
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <main className="auth">
      <div className="auth__brand"><Wordmark /></div>
      <article className="auth__card" aria-labelledby="privacy-title" style={{ width: 'min(44rem, calc(100vw - 2rem))' }}>
        <nav className="lang-switch" aria-label={doc.switchLabel}>
          <Link href={POLICY_PATH.sr} hrefLang="sr" lang="sr" aria-current={lang === 'sr' ? 'true' : undefined}>Srpski</Link>
          <Link href={POLICY_PATH.en} hrefLang="en" lang="en" aria-current={lang === 'en' ? 'true' : undefined}>English</Link>
        </nav>
        <h1 id="privacy-title" className="auth__title">{doc.title}</h1>
        <p><small>{doc.updatedLabel}: {doc.updated}</small></p>
        <p>{doc.intro}</p>
        {doc.body(contact)}
        <p><Link href="/">{doc.back}</Link></p>
      </article>
    </main>
  );
}
