import type { Metadata } from 'next';
import Link from 'next/link';
import { sr } from '@/lib/i18n/sr';

export const metadata: Metadata = {
  title: `Politika privatnosti | ${sr.appName}`,
  description: 'Koje podatke Shooting Analyzer čuva, zašto i kako ih možete obrisati.',
};

const UPDATED = '14. novembar 2026.';

export default function PrivacyPage() {
  // Optional public contact; set PRIVACY_CONTACT_EMAIL in the environment to show it.
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <main className="auth">
      <div className="auth__brand" aria-hidden="true">{sr.appName}</div>
      <article className="auth__card" aria-labelledby="privacy-title" style={{ maxWidth: '44rem' }}>
        <h1 id="privacy-title" className="auth__title">Politika privatnosti</h1>
        <p><small>Poslednja izmena: {UPDATED}</small></p>
        <p>
          {sr.appName} je aplikacija za vođenje streljačkih treninga. Ova stranica objašnjava koje podatke čuvamo, zašto i
          šta možete da uradite sa njima.
        </p>

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
          <li>Google: prijava preko Google naloga (samo ime i e-pošta).</li>
          <li>Servis za slanje e-pošte: obaveštenja administratoru o novim nalozima.</li>
        </ul>
        <p>
          Podatke koje dobijemo od Googlea koristimo samo za prijavu i prikaz vašeg imena u aplikaciji. Ne delimo ih sa
          trećim stranama.
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

        <p><Link href="/">Nazad na aplikaciju</Link></p>
      </article>
    </main>
  );
}
