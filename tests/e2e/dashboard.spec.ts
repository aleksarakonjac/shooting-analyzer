import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pickDiscipline } from './helpers';

// Needs the Supabase TEST project with migrations 0001-0009 applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Tabla ${stamp}`, email: `e2e-d-${stamp}@example.com`, password: `Pw-${stamp}-dK9` };
const fx = (n: string) => join(__dirname, '../fixtures', n);

let page: Page;

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

const plate = (label: string) => page.locator('.lane-plate').filter({ hasText: label });

test('a new shooter sees an empty period with a way to add a training', async () => {
  await page.goto('/?p=year');
  await expect(page.getByText('U ovom periodu nema treninga.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dodaj trening' })).toBeVisible();
});

test('after saving the fixtures the year view shows counts, averages, trends and the list', async () => {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
  await page.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('2026-10-21T190309.csv'));
  await expect(page.getByText('Učitano: 2026-10-21T190309.csv')).toBeVisible();
  await page.getByLabel('SCATT fajl').setInputFiles(fx('export_2026-10-22_14.11.scatt-expert'));
  await expect(page.locator('.flag-badge')).toHaveAttribute('data-state', 'proposed');
  await page.getByRole('button', { name: 'Potvrdi' }).click();
  await page.getByRole('button', { name: 'Sačuvaj trening' }).click();
  await expect(page.getByText('Trening je sačuvan')).toBeVisible();

  await page.goto('/?p=year');
  await expect(plate('Treninga').locator('.lane-plate__value')).toHaveText('1');
  await expect(plate('Pogodaka').locator('.lane-plate__value')).toHaveText('129'); // 80 match + 49 warm-up/attempts
  await expect(plate('Prosek serije').locator('.lane-plate__value')).toHaveText('105.1'); // 841.1 / 8
  await expect(plate('Prosečna grupa').locator('.lane-plate__value')).not.toHaveText('—');
  await expect(plate('Prosečan puls').locator('.lane-plate__value')).toHaveText('—'); // no heart-rate file
  await expect(page.locator('[data-point]')).toHaveCount(2); // one bucket (okt) in each trend chart
  await expect(page.getByRole('listitem').filter({ hasText: 'Vazdušna puška' })).toContainText('841.1');
});

test('the period tabs switch and a period without the training is empty', async () => {
  await page.goto('/?p=year');
  await page.getByRole('link', { name: 'Nedelja' }).click();
  await expect(page).toHaveURL(/p=week/);
  await expect(page.getByText('U ovom periodu nema treninga.')).toBeVisible();
});

test('a list row opens the training report', async () => {
  await page.goto('/?p=year');
  await page.getByRole('link', { name: /Vazdušna puška/ }).first().click();
  await expect(page).toHaveURL(/\/trening\/[0-9a-f-]{36}$/);
  // The previous route stays in the DOM hidden (cacheComponents), so only count visible plates.
  await expect(page.getByTestId('series')).toHaveCount(8);
  await expect(page.locator('.lane-plate__value:visible')).toHaveText('841.1');
});
