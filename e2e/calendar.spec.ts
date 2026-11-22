import { test, expect } from '@playwright/test';

// Calendar with the dedicated test account (E2E_EMAIL / E2E_PASSWORD): it opens from the
// side menu, loads the viewer's taste (follows + genre scores) for day ranking, and
// renders a day without page errors.

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
test.skip(!EMAIL || !PASSWORD, 'needs E2E_EMAIL and E2E_PASSWORD in .env.local');

test('calendar opens, loads taste for ranking, shows a day', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const tasteReads = new Set<string>();
  page.on('request', (r) => {
    const m = r.url().match(/\/rest\/v1\/(artist_follows|user_venue_relationships|user_preferences)\?select=(artist_id|venue_id|genre_preference_scores)/);
    if (m) tasteReads.add(m[1]);
  });

  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await email.fill(EMAIL!);
  await page.getByPlaceholder('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();

  await page.getByRole('button', { name: 'Open menu' }).first().click({ timeout: 30_000 });
  await page.getByText('Calendar', { exact: true }).first().click();

  const heading = page.getByRole('heading', { name: /^(Tonight|\w+day, \w+ \d+)/ }).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tasteReads.size, { timeout: 15_000 }).toBe(3);
  console.log(`calendar day heading: ${(await heading.textContent())?.trim()}`);

  expect(pageErrors).toEqual([]);
});
