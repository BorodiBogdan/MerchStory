import { expect, test } from './fixtures/mockApi';

// Daily-recommendation journey (read path): an authenticated user opens the studio hub and the
// day's idea is fetched and rendered, ready to hand off into the generation pipeline.
test('the daily recommendation is loaded and shown on the hub', async ({
  page,
  mock,
  seedAuth,
}) => {
  await seedAuth({ isShopSetupComplete: true });

  await page.goto('/');

  await expect.poll(() => mock.called('GET', '/recommendations/today')).toBe(true);
  await expect(page.getByText('Summer sale idea').first()).toBeAttached();
});
