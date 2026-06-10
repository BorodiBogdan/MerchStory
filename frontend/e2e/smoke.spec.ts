import { expect, test } from './fixtures/mockApi';

// Validates the harness end to end: the Expo web bundle boots, RN-web renders accessibility
// labels as ARIA attributes, and the mock network layer is installed.
test('login screen renders with accessible inputs', async ({ page, mock }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email address input')).toBeVisible();
  await expect(page.getByLabel('Password input')).toBeVisible();
  expect(mock.state.balance).toBe(50);
});
