import { test, expect } from '@playwright/test';

// Dark mode: the saved choice applies before first paint, and the side menu switch flips and persists it.

test('saved dark choice paints dark on load, light choice stays light', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('synth.colorScheme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const pageBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neutral-50').trim());
  expect(pageBg.toUpperCase()).toBe('#121110');

  await page.evaluate(() => localStorage.setItem('synth.colorScheme', 'light'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  expect(errors, errors.join(' | ')).toEqual([]);
});

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test('side menu switch turns dark mode on and it survives a reload', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_EMAIL and E2E_PASSWORD to run signed-in tests');
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('dm-init')) {
      localStorage.setItem('synth.colorScheme', 'light');
      sessionStorage.setItem('dm-init', '1');
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) await page.getByRole('button', { name: /sign in/i }).first().click();
  await email.fill(EMAIL!);
  await page.getByPlaceholder('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();
  await expect(email).toBeHidden({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Open menu' }).click();
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
