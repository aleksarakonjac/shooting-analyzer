import { expect, test, type Browser, type Page } from '@playwright/test';

// Needs the Supabase TEST project with all migrations applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Strelac ${stamp}`, email: `e2e-s-${stamp}@example.com`, password: `Pw-${stamp}-sK9` };
const coach = { name: `E2E Trener ${stamp}`, email: `e2e-c-${stamp}@example.com`, password: `Pw-${stamp}-cK9` };

async function register(browser: Browser, u: typeof shooter): Promise<Page> {
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

let shooterPage: Page;
let coachPage: Page;

test('shooter and coach register and the admin approves both', async ({ browser }) => {
  shooterPage = await register(browser, shooter);
  coachPage = await register(browser, coach);

  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/login');
  await admin.getByLabel('E-pošta').fill(adminEmail!);
  await admin.getByLabel('Lozinka').fill(adminPassword!);
  await admin.getByRole('button', { name: 'Prijavi se' }).click();
  await expect(admin).toHaveURL(/\/$/);
  await admin.goto('/admin/approvals');
  await item(admin, shooter.name).getByRole('button', { name: 'Odobri kao strelca' }).click();
  await expect(item(admin, shooter.name)).toHaveCount(0);
  await item(admin, coach.name).getByRole('button', { name: 'Odobri kao trenera' }).click();
  await expect(item(admin, coach.name)).toHaveCount(0);
});

test('coach requests a link by email and the shooter confirms it', async () => {
  await coachPage.goto('/profil/veze');
  await coachPage.getByLabel('E-pošta osobe sa kojom se povezujete').fill(shooter.email);
  await coachPage.getByRole('button', { name: 'Pošalji zahtev' }).click();
  await expect(coachPage.getByText('Ako nalog postoji')).toBeVisible();
  await expect(item(coachPage, shooter.name)).toContainText('Čeka potvrdu druge strane');

  await shooterPage.goto('/profil/veze');
  await expect(item(shooterPage, coach.name)).toContainText('Traži vašu potvrdu');
  await item(shooterPage, coach.name).getByRole('button', { name: 'Potvrdi' }).click();
  await expect(item(shooterPage, coach.name)).toContainText('Aktivna veza');
  await coachPage.goto('/profil/veze');
  await expect(item(coachPage, shooter.name)).toContainText('Aktivna veza');
});

test('requesting an unknown email shows the same message and creates nothing', async () => {
  await coachPage.goto('/profil/veze');
  await coachPage.getByLabel('E-pošta osobe sa kojom se povezujete').fill(`nobody-${stamp}@example.com`);
  await coachPage.getByRole('button', { name: 'Pošalji zahtev' }).click();
  await expect(coachPage.getByText('Ako nalog postoji')).toBeVisible();
  await expect(coachPage.getByRole('listitem')).toHaveCount(1);
});

test('shooter shares a period, revokes it, then ends the link', async () => {
  await shooterPage.goto('/profil/deljenje');
  await shooterPage.getByLabel('Od').fill('2026-10-01');
  await shooterPage.getByLabel('Do').fill('2026-10-31');
  await shooterPage.getByRole('button', { name: 'Podeli za period' }).click();
  await expect(item(shooterPage, 'Period: 2026-10-01 – 2026-10-31')).toBeVisible();
  await item(shooterPage, 'Period').getByRole('button', { name: 'Ukini' }).click();
  await expect(shooterPage.getByText('Ništa dodatno nije podeljeno.')).toBeVisible();

  await shooterPage.goto('/profil/veze');
  await item(shooterPage, coach.name).getByRole('button', { name: 'Prekini vezu' }).click();
  await expect(shooterPage.getByText('Nema aktivnih veza ni zahteva.')).toBeVisible();
  await coachPage.goto('/profil/veze');
  await expect(coachPage.getByText('Nema aktivnih veza ni zahteva.')).toBeVisible();
});
