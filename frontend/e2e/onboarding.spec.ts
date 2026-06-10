import { expect, test } from './fixtures/mockApi';
import { typeInto } from './fixtures/ui';

// Account-creation journey: a new user registers and is routed into the three-stage shop
// onboarding flow (the mock reports the shop as not yet set up, so the app sends them to step 1).
test('registration creates an account and enters onboarding', async ({ page, mock }) => {
  await page.goto('/register');
  // Let the auth-screen entrance animation settle before typing so no early keystrokes are lost.
  await expect(page.getByLabel('Email address input')).toBeVisible();
  await page.waitForTimeout(600);

  await typeInto(page, 'Email address input', 'newshop@test.com');
  await typeInto(page, 'Password input', 'Test1234!', true);
  await typeInto(page, 'Confirm password input', 'Test1234!');

  const submit = page.getByLabel('Create account', { exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect.poll(() => mock.called('POST', '/auth/register')).toBe(true);

  // The user lands on the first onboarding step (Visual Identity), keyed off isShopSetupComplete.
  await expect(page.getByLabel('Brand name')).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  expect(token).toBeTruthy();
});
