import { expect, test, type Page } from '@playwright/test';
import { pickDiscipline } from './helpers';

// Needs the Supabase TEST project with migrations 0001-0016 applied (see docs/supabase-setup.md).
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const shooter = { name: `E2E Finale ${stamp}`, email: `e2e-f-${stamp}@example.com`, password: `Pw-${stamp}-fK9` };

let page: Page;
let reportUrl = '';

/** The final entry is its own panel on a finale session; wait until it is there. */
async function openEntry(): Promise<void> {
  await expect(page.getByLabel('Pogodak 1', { exact: true })).toBeVisible();
}

/** Fills shots 1..n of the final form: 10.0 in the first series, 10.5 in the second, 10.2 after that. */
async function fillShots(n: number): Promise<void> {
  await openEntry();
  for (let i = 1; i <= n; i++) {
    const v = i <= 5 ? '10.0' : i <= 10 ? '10,5' : '10.2'; // a decimal comma works too
    await page.getByLabel(`Pogodak ${i}`, { exact: true }).fill(v);
  }
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

  // A finale session: the results panel becomes the final entry; saved empty, the finals are entered on the report.
  await page.goto('/trening/novi');
  await pickDiscipline(page, 'Vazdušna puška');
  await expect(page.getByLabel('Naziv')).toHaveAttribute('placeholder', /Vazdušna puška$/);
  await page.getByRole('radio', { name: 'Finale' }).check({ force: true });
  await expect(page.getByLabel('Pogodak 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sačuvaj sesiju' }).click();
  await page.getByRole('button', { name: 'Sačuvaj praznu sesiju' }).click();
  await page.getByRole('link', { name: 'Otvori izveštaj o sesiji' }).click();
  await expect(page).toHaveURL(/\/trening\/[0-9a-f-]{36}$/);
  reportUrl = page.url();
});

test('a training starts without finals', async () => {
  await expect(page.getByText('Nema unetih finala.')).toBeVisible();
});

test('a value with two decimals is refused and nothing is saved', async () => {
  await openEntry();
  await page.getByLabel('Pogodak 1', { exact: true }).fill('10.95');
  await page.getByRole('button', { name: 'Sačuvaj finale' }).click();
  await expect(page.locator('.final-entry').getByRole('alert')).toContainText('najviše jednu decimalu');
  await expect(page.getByText('Nema unetih finala.')).toBeVisible();
});

test('a final of 24 shots shows its stage totals', async () => {
  await fillShots(24);
  // The running total of the first series is shown while typing.
  await expect(page.getByRole('group', { name: /Serija 1/ })).toContainText('50.0');
  await page.getByLabel('Plasman').fill('2');
  await page.getByRole('button', { name: 'Sačuvaj finale' }).click();

  await expect(page.getByText('Finale je sačuvano.')).toBeVisible();
  const finals = page.getByTestId('final');
  await expect(finals).toHaveCount(1);
  const stages = finals.first().getByTestId('final-stage');
  await expect(stages).toHaveCount(3);
  await expect(stages.nth(0)).toContainText('50.0');
  await expect(stages.nth(1)).toContainText('52.5');
  await expect(stages.nth(2)).toContainText('142.8'); // 14 x 10.2
  await expect(finals.first().getByTestId('final-total')).toHaveText('245.3');
  await expect(finals.first()).toContainText('Plasman: 2');
  await expect(finals.first()).toContainText('Ispucao sve pogotke');
});

test('eliminating after shot 18 is stored and shown', async () => {
  await fillShots(18);
  await page.getByLabel('Eliminisan posle pogotka').fill('18');
  await page.getByLabel('Vremena pogodaka').fill('1792596598645\n1792596599645');
  await page.getByRole('button', { name: 'Primeni vremena' }).click();
  await expect(page.getByText('Dodeljeno vremena: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Sačuvaj finale' }).click();

  await expect(page.getByTestId('final')).toHaveCount(2);
  await expect(page.getByTestId('final').nth(1)).toContainText('Eliminisan posle pogotka: 18');
  // Survives a reload: it came from the database.
  await page.goto(reportUrl);
  await expect(page.getByTestId('final').nth(1)).toContainText('Eliminisan posle pogotka: 18');
});

test('an elimination point that does not match the shots is refused', async () => {
  await fillShots(10);
  await page.getByLabel('Eliminisan posle pogotka').fill('18');
  await page.getByRole('button', { name: 'Sačuvaj finale' }).click();
  await expect(page.locator('.final-entry').getByRole('alert')).toContainText('Mesto eliminacije');
  await expect(page.getByTestId('final')).toHaveCount(2);
});

test('a final can be deleted', async () => {
  await page.getByTestId('final').first().getByRole('button', { name: 'Obriši finale' }).click();
  await expect(page.getByTestId('final')).toHaveCount(1);
});
