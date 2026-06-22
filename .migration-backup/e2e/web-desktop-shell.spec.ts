import { test, expect } from '@playwright/test';

test.describe('Web shell (logged-out smoke)', () => {
  test('home loads at desktop width without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
    expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('desktop rail is not shown when logged out', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('web-desktop-rail')).toHaveCount(0);
    await expect(page.getByTestId('web-app-shell')).toHaveCount(0);
  });

  test('mobile width: bottom nav hidden when logged out', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('web-bottom-nav')).toHaveCount(0);
  });
});
