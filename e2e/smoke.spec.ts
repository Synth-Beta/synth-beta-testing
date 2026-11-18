import { test, expect } from '@playwright/test';

// Signed-out smoke test: the app boots without crashing and the sign-in form works.
// Needs no account, so it is safe to run on every change.

test('app boots and shows the sign-in form without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  // The landing page may need a tap on "Sign In" before the form appears.
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await expect(email).toBeVisible();
  await expect(page.getByPlaceholder('Password')).toBeVisible();

  expect(pageErrors, `uncaught errors: ${pageErrors.join(' | ')}`).toEqual([]);
});

test('wrong password shows an error instead of hanging', async ({ page }) => {
  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await email.fill('e2e-nobody@example.com');
  await page.getByPlaceholder('Password').fill('definitely-wrong-password');
  await page.getByRole('button', { name: /^sign in$/i }).last().click();

  await expect(page.getByText(/invalid|failed|incorrect/i).first()).toBeVisible({ timeout: 15_000 });
});
