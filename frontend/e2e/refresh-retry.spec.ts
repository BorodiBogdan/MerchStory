import { expect, test } from './fixtures/mockApi';

// Token-refresh journey: a protected request returns 401 once; the API client transparently
// refreshes the access token and retries, so the screen still loads. This exercises the
// single-flight refresh path in utils/api.ts.
test('a 401 triggers a transparent refresh and retry', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });
  mock.expireOnce('GET', '/wallet');

  await page.goto('/wallet');

  await expect.poll(() => mock.called('POST', '/auth/refresh')).toBe(true);
  // The wallet request is retried after the refresh and the balance still renders.
  await expect(page.getByText(String(mock.state.balance)).first()).toBeVisible();
});
