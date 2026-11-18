import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Full web onboarding with the dedicated test account (E2E_EMAIL / E2E_PASSWORD, never a real user).
// Before the run, the test account's onboarding flags are reset so the flow is repeatable.
// The reset only touches the row of the user that E2E_EMAIL signs in as.

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!EMAIL || !PASSWORD || !URL || !ANON || !SERVICE, 'needs E2E_EMAIL, E2E_PASSWORD and Supabase keys in .env.local');

let userId = '';
const startedAt = new Date().toISOString();

test.beforeAll(async () => {
  const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
  if (error || !data.user) throw new Error(`test account sign-in failed: ${error?.message}`);
  userId = data.user.id;
  const admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
  const { error: resetErr } = await admin
    .from('users')
    .update({ onboarding_completed: false, onboarding_skipped: false, tour_completed: false })
    .eq('user_id', data.user.id);
  if (resetErr) throw new Error(`reset failed: ${resetErr.message}`);
});

test('test account completes web onboarding and reaches the app', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const consoleErrors: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

  // Headless has no GPS and the test profile has no city, so location falls back to /api/geo
  // (Vercel IP headers in prod; absent on localhost). Stand in for it with DC.
  await page.route('**/api/geo', (route) =>
    route.fulfill({ json: { lat: 38.9, lng: -77.04, city: 'Washington' } })
  );
  const feedCalls: { fn: string; lat: unknown; status: number }[] = [];
  page.on('response', (r) => {
    const m = r.url().match(/rpc\/(get_or_refresh_feed_v5_cached|get_personalized_feed_v5)/);
    if (m) { const b = r.request().postDataJSON() ?? {}; feedCalls.push({ fn: m[1], lat: b.p_city_lat, status: r.status(), section: b.p_section, limit: b.p_limit, city: b.p_city_filter, at: Date.now() % 100000 } as any); }
  });

  await page.goto('/');
  const email = page.getByPlaceholder('Email');
  if (!(await email.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /sign in/i }).first().click();
  }
  await email.fill(EMAIL!);
  await page.getByPlaceholder('Password').fill(PASSWORD!);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();

  // Screen 1: profile.
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Your name').fill('E2E Tester');
  await page.locator('#username').fill(`e2e_${Date.now().toString(36)}`);
  await page.locator('#birthday').fill('2000-01-01');
  await page.locator('#acquisition_source_select').click();
  await page.getByRole('option').first().click();
  // Music taste (optional): one genre, checked in the DB at the end.
  await page.getByPlaceholder('Or type a custom genre...').fill('jam band');
  await page.getByPlaceholder('Or type a custom genre...').press('Enter');
  await page.getByRole('button', { name: 'Complete setup' }).click();

  // Screen 2: follow artists (minimum may already be met by earlier runs).
  await expect(page.getByText('Follow your Favorite Artists')).toBeVisible({ timeout: 30_000 });
  const done = page.getByRole('button', { name: 'Done' });
  // Footer reads "Pick N more" until the minimum is met, then "Done".
  if ((await page.getByRole('button', { name: /^Pick \d+ more$/ }).count()) > 0) {
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  }
  await expect(done).toBeEnabled();
  await done.click();

  // Out of onboarding: the modal closed, the whole onboarding card is gone, and no save error showed.
  await expect(page.getByText('Follow your Favorite Artists')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Complete setup' })).toBeHidden({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/failed to save|something went wrong/i)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/onboarding-finished.png' });

  // Welcome tour: step through every step to the end.
  await expect(page.getByText('Welcome to Synth!')).toBeVisible({ timeout: 15_000 });
  // Steps wait up to 15s for their target (some switch tabs first), so wait for each button.
  const tourButton = page.getByRole('button', { name: /^(Next \(Step|Finish)/ });
  const tourTitles: string[] = [];
  for (let step = 1; step <= 7; step++) {
    await expect(tourButton.first(), `tour step ${step} never showed its button`).toBeVisible({ timeout: 20_000 });
    const label = (await tourButton.first().textContent()) ?? '';
    tourTitles.push((await page.locator('.react-joyride__tooltip h3, .react-joyride__tooltip h2').first().textContent().catch(() => '')) ?? '');
    await tourButton.first().click();
    if (label.startsWith('Finish')) break;
  }
  await expect(page.locator('.react-joyride__overlay')).toHaveCount(0, { timeout: 10_000 });
  // Every tour step must show; a step whose target is missing gets silently skipped by Joyride.
  expect(tourTitles.length, `tour steps seen: ${tourTitles.join(' > ')}`).toBe(7);
  await page.screenshot({ path: 'test-results/tour-finished.png' });

  // Every main tab opens without crashing.
  for (const tab of ['Community', 'Messages', 'Profile', 'Home']) {
    await page.getByRole('button', { name: tab, exact: true }).or(page.getByRole('link', { name: tab, exact: true })).first().click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/tab-${tab.toLowerCase()}.png` });
  }

  // The feed used the IP location (not a nationwide query, which timed out) and loaded.
  const feedSummary = JSON.stringify(feedCalls);
  expect(feedCalls.length, 'no feed request made').toBeGreaterThan(0);
  expect(feedCalls.every((c) => c.lat === 38.9), `feed ran without location: ${feedSummary}`).toBe(true);
  expect(feedCalls.every((c) => c.status === 200), `feed request failed: ${feedSummary}`).toBe(true);

  // The genre typed in onboarding reached the preference signals the feed reads.
  const admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('user_preference_signals')
        .select('genre')
        .eq('user_id', userId)
        .eq('signal_type', 'genre_manual_preference')
        .gte('occurred_at', startedAt);
      // The DB canonicalizes genre names ("jam band" is stored as "Jamband").
      return (data ?? []).map((r) => String(r.genre).toLowerCase().replace(/[^a-z]/g, ''));
    }, { timeout: 15_000 })
    .toContain('jamband');

  // Console errors are reported, not failed on: third-party noise lands here too.
  if (consoleErrors.length) console.log('CONSOLE ERRORS:\n' + [...new Set(consoleErrors)].join('\n'));
  expect(pageErrors, `uncaught errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
