import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { pickDiscipline } from './helpers';

// Needs the Supabase TEST project with all migrations (incl. 0008) applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Novi ${stamp}`, email: `e2e-n-${stamp}@example.com`, password: `Pw-${stamp}-nK9` };
const fx = (n: string) => join(__dirname, '../fixtures', n);

let page: Page;

/** Opens the form and waits until React is live (the default name appears once a discipline is chosen). */
async function openForm(): Promise<void> {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
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

test('a discipline alone asks for confirmation, then saves an empty training', async () => {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await page.getByRole('button', { name: 'Sačuvaj trening' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Sačuvati prazan trening?');
  await page.getByRole('button', { name: 'Sačuvaj prazan trening' }).click();
  await expect(page.getByText('Trening je sačuvan')).toBeVisible();
});

test('the default name is dd.mm. plus the discipline for today', async () => {
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  const date = await page.locator('input[name="trained_date"]').inputValue();
  const [, mm, dd] = date.split('-');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', `${dd}.${mm}. Vazdušna puška`);
});

test('CSV + SCATT propose last 80 (orange), mismatch 0, "Potvrdi" turns it black; first 80 shows another first shot', async () => {
  await openForm();
  await page.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('2026-10-21T190309.csv'));
  await expect(page.getByText('Učitano: 2026-10-21T190309.csv')).toBeVisible();
  await page.getByLabel('SCATT fajl').setInputFiles(fx('export_2026-10-22_14.11.scatt-expert'));

  const badge = page.locator('.flag-badge');
  await expect(badge).toHaveAttribute('data-state', 'proposed');
  await expect(page.getByText('Broj pogodaka se poklapa.')).toBeVisible();
  const firstLast = await page.getByTestId('first-scatt').innerText();

  await page.getByRole('button', { name: 'Potvrdi' }).click();
  await expect(badge).toHaveAttribute('data-state', 'confirmed');

  await page.getByLabel('Prvih').check();
  await expect(badge).toHaveAttribute('data-state', 'proposed'); // changing the selection withdraws the confirmation
  await expect(page.getByTestId('first-scatt')).not.toHaveText(firstLast);

  await page.getByLabel('Poslednjih').check();
  await page.getByRole('button', { name: 'Potvrdi' }).click();
  await page.getByRole('button', { name: 'Sačuvaj trening' }).click();
  await expect(page.getByText('Trening je sačuvan')).toBeVisible();
  await expect(page.getByText('nije otpremljeno')).toHaveCount(0); // every source file uploaded (Next's own empty alert is ignored)
});

test('the PDF fixture creates three position groups', async () => {
  await openForm();
  await page.getByLabel('SIUS fajl (CSV ili PDF)').setInputFiles(fx('50m Rifle 3x20.pdf'));
  await expect(page.getByTestId('position-group')).toHaveCount(3);
});

test('manual entry: number of series, a typed total and a series built from its shots', async () => {
  await openForm();
  await page.getByRole('tab', { name: 'Ručno' }).click();
  const count = page.getByRole('textbox', { name: 'Broj serija' });
  await count.fill('2');
  await count.press('Tab');
  await page.getByLabel('Zbir serije 1', { exact: true }).fill('104,5');
  await page.getByRole('button', { name: 'Pogoci' }).nth(1).click();
  const shots = ['10.6', '10.4', '10.5', '10.1', '9.9', '10.8', '10.2', '10.3', '10.0', '10.7'];
  for (let k = 0; k < shots.length; k++) await page.getByLabel(`Serija 2, pogodak ${k + 1}`, { exact: true }).fill(shots[k]);
  await expect(page.getByLabel('Zbir serije 2', { exact: true })).toHaveValue('103.5');
  await page.getByRole('button', { name: 'Primeni ručni unos' }).click();
  await expect(page.locator('.lane-plate__value')).toHaveText('208');
});

test('paste: shots with times are recognised and become series', async () => {
  await openForm();
  await page.getByRole('tab', { name: 'Nalepi' }).click();
  const lines = Array.from({ length: 12 }, (_, i) => `${i + 1}. 10.${i % 9} 17:0${Math.floor(i / 6)}:${String((i % 6) * 9).padStart(2, '0')}`);
  await page.getByLabel('Nalepite pogotke (jedan po redu)').fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Prepoznaj' }).click();
  await expect(page.getByText('Prepoznato: 12 pogodaka u 2 serija, 12 sa vremenom.')).toBeVisible();
});

test('date and from-to time are chosen in one picker and saved with the training', async () => {
  await openForm();
  await page.getByRole('button', { name: /^Datum i vreme/ }).click();
  const hours = page.getByRole('spinbutton', { name: /sat/i });
  await hours.nth(0).click();
  await page.keyboard.type('17');
  await page.getByRole('spinbutton', { name: /minut/i }).nth(0).click();
  await page.keyboard.type('00');
  await hours.nth(1).click();
  await page.keyboard.type('18');
  await page.getByRole('spinbutton', { name: /minut/i }).nth(1).click();
  await page.keyboard.type('30');
  await page.getByRole('button', { name: 'Gotovo' }).click();
  await expect(page.getByRole('button', { name: /^Datum i vreme/ })).toContainText('17:00–18:30');
  await page.getByRole('button', { name: 'Sačuvaj trening' }).click();
  await page.getByRole('button', { name: 'Sačuvaj prazan trening' }).click();
  await expect(page.getByText('Trening je sačuvan')).toBeVisible();
});
