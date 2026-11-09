import { expect, type Page } from '@playwright/test';

/** Picks a discipline in the custom select (it is a button plus a listbox, not a native <select>). */
export async function pickDiscipline(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: /Disciplina/ }).click();
  await page.getByRole('option', { name: label }).click();
  await expect(page.getByRole('button', { name: /Disciplina/ })).toContainText(label);
}

/** Sets the training day to today through the date-and-time picker. */
export async function pickToday(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Datum i vreme/ }).click();
  await page.getByRole('button', { name: 'Danas' }).click();
  await page.getByRole('button', { name: 'Gotovo' }).click();
}
