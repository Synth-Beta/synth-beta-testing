import { test, expect } from '@playwright/test';

// Search + artist page with the dedicated test account (E2E_EMAIL / E2E_PASSWORD).
// Runs after onboarding.spec (alphabetical, workers: 1), so the account is past onboarding.

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
test.skip(!EMAIL || !PASSWORD, 'needs E2E_EMAIL and E2E_PASSWORD in .env.local');

test('search finds an artist, tab switch does not re-search, artist page opens', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  // Every catalog search request (RPC, or the table fallback when the RPC is not deployed).
  const searchCalls: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/rpc\/search_(artists|venues|events)_fuzzy|\/rest\/v1\/(artists|venues)\?.*ilike/.test(u)) searchCalls.push(u.slice(0, 120));
  });

  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await email.fill(EMAIL!);
  await page.getByPlaceholder('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();

  // Search lives in the Home tab's search bar.
  const box = page.getByPlaceholder('Try "Radiohead"').first();
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.click();
  await box.fill('phish');
  const t0 = Date.now();
  const artistHit = page.getByText(/^Phish$/).first();
  await expect(artistHit).toBeVisible({ timeout: 15_000 });
  console.log(`search "phish": first artist result in ${Date.now() - t0} ms`);

  // Switching result tabs reuses the results already fetched.
  await page.waitForLoadState('networkidle');
  const before = searchCalls.length;
  await page.getByRole('button', { name: /^Artists/ }).or(page.getByRole('tab', { name: /^Artists/ })).first().click();
  await page.waitForLoadState('networkidle');
  expect(searchCalls.length, `tab switch re-ran search: ${searchCalls.slice(before).join(' | ')}`).toBe(before);

  // Artist page opens and finishes loading (its sections render after the spinner).
  await page.getByText(/^Phish$/).first().click();
  const t1 = Date.now();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /^Reviews/ })).toBeVisible({ timeout: 20_000 });
  console.log(`artist page loaded in ${Date.now() - t1} ms`);
  await page.screenshot({ path: 'test-results/artist-phish.png' });

  expect(pageErrors, `uncaught errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
