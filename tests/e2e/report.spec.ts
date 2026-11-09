import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pickDiscipline } from './helpers';

// Needs the Supabase TEST project with all migrations applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Izvestaj ${stamp}`, email: `e2e-r-${stamp}@example.com`, password: `Pw-${stamp}-rK9` };
const fx = (n: string) => join(__dirname, '../fixtures', n);

let page: Page;
let reportUrl = '';
let hrReportUrl = '';

/** Opens the form and waits until React is live. */
async function openForm(): Promise<void> {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
}

async function saveWithFixtures(withHr: boolean, confirm = true): Promise<string> {
  await openForm();
  await page.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('2026-10-21T190309.csv'));
  await expect(page.getByText('Učitano: 2026-10-21T190309.csv')).toBeVisible();
  await page.getByLabel('SCATT fajl').setInputFiles(fx('export_2026-10-22_14.11.scatt-expert'));
  await expect(page.locator('.flag-badge')).toHaveAttribute('data-state', 'proposed');
  if (withHr) {
    await page.getByLabel('TCX fajl').setInputFiles(fx('4740240563405875576.tcx'));
    await expect(page.getByText(/uzoraka pulsa/)).toBeVisible();
  }
  if (confirm) await page.getByRole('button', { name: 'Potvrdi', exact: true }).click();
  await page.getByRole('button', { name: 'Sačuvaj sesiju' }).click();
  // The same sample files are imported more than once in this spec: accept the duplicate warning.
  const again = page.getByRole('button', { name: 'Sačuvaj ipak' });
  const link = page.getByRole('link', { name: 'Otvori izveštaj o sesiji' });
  await expect(again.or(link)).toBeVisible();
  if (await again.isVisible()) await again.click();
  await page.getByRole('link', { name: 'Otvori izveštaj o sesiji' }).click();
  await expect(page).toHaveURL(/\/trening\/[0-9a-f-]{36}$/);
  return page.url();
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
  await expect(admin).toHaveURL(/\/(admin\/approvals)?$/);
  await admin.goto('/admin/approvals');
  const row = admin.getByRole('listitem').filter({ hasText: shooter.name });
  await row.getByRole('button', { name: 'Odobri kao strelca' }).click();
  await expect(row).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
});

test('the report shows total 841.1, 8 series, a group of 8.0 mm and separate warm-up and attempts', async () => {
  reportUrl = await saveWithFixtures(false);
  await expect(page.locator('.lane-plate__value')).toHaveText('841.1');
  await expect(page.getByTestId('series')).toHaveCount(8);
  await expect(page.getByTestId('series').first()).toContainText('8.0 mm');
  await expect(page.getByTestId('warmup')).toHaveText('Zagrevanje: 26');
  await expect(page.getByTestId('attempt')).toHaveText('Neuspeli pokušaji: 23');
});

test('a proposed alignment is confirmed from the report', async () => {
  await saveWithFixtures(false, false);
  await expect(page.locator('.flag-badge')).toHaveAttribute('data-state', 'proposed');
  await page.getByRole('button', { name: 'Potvrdi poravnanje' }).click();
  await expect(page.locator('.flag-badge')).toHaveAttribute('data-state', 'confirmed');
  await expect(page.getByRole('button', { name: 'Potvrdi poravnanje' })).toHaveCount(0);
});

test('a training without heart rate shows "nema pulsa"', async () => {
  await page.goto(reportUrl);
  await expect(page.getByText('nema pulsa')).toBeVisible();
});

test('a heart-rate file outside the training window also shows "nema pulsa"', async () => {
  hrReportUrl = await saveWithFixtures(true);
  await expect(page.getByText('nema pulsa')).toBeVisible(); // the sample TCX is from 4 Nov, the shots from 21 Oct
});

test('editing changes the name', async () => {
  await page.goto(hrReportUrl);
  await page.getByRole('link', { name: 'Izmeni' }).click();
  await page.getByLabel('Naziv').fill('Preimenovan trening');
  await page.getByRole('button', { name: 'Sačuvaj izmene' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Preimenovan trening' })).toBeVisible();
});

test('delete moves the training to the trash and the report is gone', async () => {
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Obriši trening' }).click();
  await page.getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(reportUrl);
  await expect(page.getByText('This page could not be found')).toBeVisible();
});
