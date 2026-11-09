import { expect, test, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pickDiscipline, pickToday } from './helpers';

// Needs the Supabase TEST project with migrations 0001-0009 applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const user = (tag: string, who: string) => ({
  name: `E2E ${who} ${stamp}`,
  email: `e2e-${tag}-${stamp}@example.com`,
  password: `Pw-${stamp}-${tag}K9`,
});
const coach = user('tc', 'Trener');
const alpha = user('sa', 'Alfa');
const beta = user('sb', 'Beta');
const gamma = user('sg', 'Gama'); // never linked to the coach
const fx = (n: string) => join(__dirname, '../fixtures', n);

async function register(browser: Browser, u: ReturnType<typeof user>): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Ime i prezime').fill(u.name);
  await page.getByLabel('E-pošta').fill(u.email);
  await page.getByLabel('Lozinka').fill(u.password);
  await page.getByRole('button', { name: 'Pošalji zahtev' }).click();
  await expect(page).toHaveURL(/\/cekanje-odobrenja$/);
  return page;
}

const item = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text });

let coachPage: Page;
let alphaPage: Page;
let betaPage: Page;
let gammaPage: Page;

test('a coach and three shooters register and the admin approves them', async ({ browser }) => {
  coachPage = await register(browser, coach);
  alphaPage = await register(browser, alpha);
  betaPage = await register(browser, beta);
  gammaPage = await register(browser, gamma);

  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/login');
  await admin.getByLabel('E-pošta').fill(adminEmail!);
  await admin.getByLabel('Lozinka').fill(adminPassword!);
  await admin.getByRole('button', { name: 'Prijavi se' }).click();
  await expect(admin).toHaveURL(/\/(admin\/approvals)?$/);
  await admin.goto('/admin/approvals');
  for (const s of [alpha, beta, gamma]) {
    await item(admin, s.name).getByRole('button', { name: 'Odobri kao strelca' }).click();
    await expect(item(admin, s.name)).toHaveCount(0);
  }
  await item(admin, coach.name).getByRole('button', { name: 'Odobri kao trenera' }).click();
  await expect(item(admin, coach.name)).toHaveCount(0);
});

test('the coach links with two of the shooters and sees a card for each, none for the third', async () => {
  for (const [s, page] of [[alpha, alphaPage], [beta, betaPage]] as const) {
    await coachPage.goto('/profil/veze');
    await coachPage.getByLabel('E-pošta osobe sa kojom se povezujete').fill(s.email);
    await coachPage.getByRole('button', { name: 'Pošalji zahtev' }).click();
    await expect(coachPage.getByText('Ako nalog postoji')).toBeVisible();
    await page.goto('/profil/veze');
    await item(page, coach.name).getByRole('button', { name: 'Potvrdi' }).click();
    await expect(item(page, coach.name)).toContainText('Aktivna veza');
  }

  await coachPage.goto('/');
  await expect(coachPage).toHaveURL(/\/strelci$/);
  await expect(coachPage.getByTestId('shooter-card')).toHaveCount(2);
  await expect(coachPage.getByTestId('shooter-card').filter({ hasText: alpha.name })).toContainText('Još nema treninga');
  await expect(coachPage.getByTestId('shooter-card').filter({ hasText: beta.name })).toBeVisible();
  await expect(coachPage.getByText(gamma.name)).toHaveCount(0);
});

test('a shooter that is not linked cannot be opened', async () => {
  await coachPage.goto('/strelci/00000000-0000-4000-8000-000000000000');
  await expect(coachPage.getByText('This page could not be found')).toBeVisible();
});

test('opening a shooter shows their (still empty) trainings', async () => {
  await coachPage.goto('/strelci');
  await coachPage.getByTestId('shooter-card').filter({ hasText: alpha.name }).getByRole('link').click();
  await expect(coachPage.getByRole('heading', { level: 1, name: alpha.name })).toBeVisible();
  await expect(coachPage.getByText('U ovom periodu nema treninga.')).toBeVisible();
});

test('the coach creates a training for the shooter and it shows on the card and the latest list', async () => {
  await coachPage.getByRole('link', { name: 'Dodaj trening' }).click();
  await expect(coachPage.getByRole('heading', { level: 1 })).toContainText(alpha.name);
  await pickDiscipline(coachPage, 'Vazdušna puška');
  await expect(coachPage.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
  await coachPage.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('2026-10-21T190309.csv'));
  await expect(coachPage.getByText('Učitano: 2026-10-21T190309.csv')).toBeVisible();
  await coachPage.getByLabel('SCATT fajl').setInputFiles(fx('export_2026-10-22_14.11.scatt-expert'));
  await expect(coachPage.locator('.flag-badge')).toHaveAttribute('data-state', 'proposed');
  await coachPage.getByRole('button', { name: 'Potvrdi' }).click();
  // The files carry October dates; train "today" so the card's month figures include it.
  await pickToday(coachPage);
  await coachPage.getByRole('button', { name: 'Sačuvaj sesiju' }).click();
  await expect(coachPage.getByText('Sesija je sačuvana')).toBeVisible();

  await coachPage.goto('/strelci');
  const card = coachPage.getByTestId('shooter-card').filter({ hasText: alpha.name });
  await expect(card).not.toContainText('Još nema treninga');
  await expect(card).toContainText('1 treninga');
  await expect(card).toContainText('105.1');
  await expect(coachPage.getByRole('listitem').filter({ hasText: 'Vazdušna puška' }).first()).toContainText(alpha.name);
});

test('the shooter sees the training and deletes it, after which the coach card is empty again', async () => {
  await alphaPage.goto('/?p=year');
  await expect(alphaPage.getByRole('link', { name: /Vazdušna puška/ }).first()).toBeVisible();
  await alphaPage.getByRole('link', { name: /Vazdušna puška/ }).first().click();
  await expect(alphaPage.getByTestId('series')).toHaveCount(8);
  await alphaPage.getByRole('button', { name: 'Obriši trening' }).click();
  await alphaPage.getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(alphaPage).toHaveURL(/\/$/);

  await coachPage.goto('/strelci');
  await expect(coachPage.getByTestId('shooter-card').filter({ hasText: alpha.name })).toContainText('Još nema treninga');
});

test('an ended link removes the card on reload', async () => {
  await betaPage.goto('/profil/veze');
  await item(betaPage, coach.name).getByRole('button', { name: 'Prekini vezu' }).click();
  await expect(betaPage.getByText('Nema aktivnih veza ni zahteva.')).toBeVisible();

  await coachPage.goto('/strelci');
  await expect(coachPage.getByTestId('shooter-card')).toHaveCount(1);
  await expect(coachPage.getByText(beta.name)).toHaveCount(0);
});
