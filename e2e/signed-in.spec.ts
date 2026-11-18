import { test, expect } from '@playwright/test';

// Signed-in flow with a dedicated test account (never a real user's).
// Set E2E_EMAIL and E2E_PASSWORD to run it; it is skipped otherwise.
// Checks sign in -> leaves the auth form (lands in onboarding or the app shell, depending on the account).

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!EMAIL || !PASSWORD, 'set E2E_EMAIL and E2E_PASSWORD to run signed-in tests');

test('test account signs in and lands in the app', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await email.fill(EMAIL!);
  await page.getByPlaceholder('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();

  // Signed in = the sign-in form is gone and no error message is showing.
  await expect(email).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/sign in failed|invalid login/i)).toHaveCount(0);

  expect(pageErrors, `uncaught errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
