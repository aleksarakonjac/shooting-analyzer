import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pickDiscipline } from './helpers';

// Needs the Supabase TEST project with migrations 0001-0010 applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Korpa ${stamp}`, email: `e2e-k-${stamp}@example.com`, password: `Pw-${stamp}-kK9` };
const fx = (n: string) => join(__dirname, '../fixtures', n);
const TRAINING = 'Korpa test trening';

let page: Page;
let reportUrl = '';

async function deleteFromReport(): Promise<void> {
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Obriši trening' }).click();
  await page.getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Ime i prezime').fill(shooter.name);
  await page.getByLabel('E-pošta').fill(shooter.email);
  await page.getByLabel('Lozinka').fill(shooter.password);
  await page.getByRole('button', { name: 'Pošalji zahtev' }).click();
  await expect(page).toHaveURL(/\/cekanje-odobrenja$/);

  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/login');
  await admin.getByLabel('E-pošta').fill(adminEmail!);
  await admin.getByLabel('Lozinka').fill(adminPassword!);
  await admin.getByRole('button', { name: 'Prijavi se' }).click();
  await expect(admin).toHaveURL(/\/$/);
  await admin.goto('/admin/approvals');
  const row = admin.getByRole('listitem').filter({ hasText: shooter.name });
  await row.getByRole('button', { name: 'Odobri kao strelca' }).click();
  await expect(row).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
});

test('an empty trash says so', async () => {
  await page.goto('/korpa');
  await expect(page.getByText('Korpa je prazna.')).toBeVisible();
});

test('a deleted training appears in the trash and restore returns it to the list', async () => {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
  await page.getByLabel('Naziv').fill(TRAINING);
  await page.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('2026-10-21T190309.csv'));
  await expect(page.getByText('Učitano: 2026-10-21T190309.csv')).toBeVisible();
  await page.getByRole('button', { name: 'Sačuvaj trening' }).click();
  await page.getByRole('link', { name: 'Otvori izveštaj o treningu' }).click();
  await expect(page).toHaveURL(/\/trening\/[0-9a-f-]{36}$/);
  reportUrl = page.url();

  await deleteFromReport();
  await page.goto('/?p=year');
  await expect(page.getByText(TRAINING)).toHaveCount(0);

  await page.goto('/korpa');
  const item = page.getByTestId('trash-item').filter({ hasText: TRAINING });
  await expect(item).toContainText('Preostalo dana: 30');
  await item.getByRole('button', { name: 'Vrati' }).click();
  await expect(page.getByText('Korpa je prazna.')).toBeVisible();

  await page.goto(reportUrl);
  await expect(page.getByRole('heading', { level: 1, name: TRAINING })).toBeVisible();
});

test('delete forever asks first and then removes the training for good', async () => {
  await deleteFromReport();
  await page.goto('/korpa');
  const item = page.getByTestId('trash-item').filter({ hasText: TRAINING });
  await item.getByRole('button', { name: 'Obriši trajno' }).click();
  await expect(page.getByText('Trening i svi njegovi podaci se brišu zauvek.')).toBeVisible();
  await page.getByRole('button', { name: 'Obriši zauvek' }).click();
  await expect(page.getByText('Korpa je prazna.')).toBeVisible();

  await page.goto(reportUrl);
  await expect(page.getByText('This page could not be found')).toBeVisible();
});

test('the audit log lists create, delete, restore and permanent delete with the actor', async () => {
  await page.goto('/dnevnik');
  const rows = page.getByTestId('audit-row').filter({ hasText: TRAINING });
  await expect(rows.filter({ hasText: 'Napravljen trening' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Trening prebačen u korpu' })).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Trening vraćen iz korpe' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Trening trajno obrisan' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Vi' })).toHaveCount(5);
});
