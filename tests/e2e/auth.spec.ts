import { expect, test } from '@playwright/test';

// Needs a Supabase TEST project (never production): see docs/supabase-setup.md.
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: an existing active admin of that project.
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;
const password = `Pw-${stamp}-xK9`;
const name = `E2E Strelac ${stamp}`;

test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');

test.describe.configure({ mode: 'serial' });

test('registering creates a pending account that cannot open the app', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Ime i prezime').fill(name);
  await page.getByLabel('E-pošta').fill(email);
  await page.getByLabel('Lozinka').fill(password);
  await page.getByRole('button', { name: 'Pošalji zahtev' }).click();
  await expect(page).toHaveURL(/\/cekanje-odobrenja$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/cekanje-odobrenja$/);
});

test('admin sees the registration, approves it, and the user can then open the app', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByLabel('E-pošta').fill(adminEmail!);
  await page.getByLabel('Lozinka').fill(adminPassword!);
  await page.getByRole('button', { name: 'Prijavi se' }).click();
  await page.goto('/admin/approvals');
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Odobri kao strelca' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);

  const user = await browser.newPage();
  await user.goto('http://localhost:3100/login');
  await user.getByLabel('E-pošta').fill(email);
  await user.getByLabel('Lozinka').fill(password);
  await user.getByRole('button', { name: 'Prijavi se' }).click();
  await expect(user).toHaveURL('http://localhost:3100/');
  await expect(user.getByRole('heading', { name: 'Dnevnik streljaštva' })).toBeVisible();

  // A non-admin is redirected away from the admin pages.
  await user.goto('http://localhost:3100/admin/approvals');
  await expect(user).toHaveURL('http://localhost:3100/');
});
