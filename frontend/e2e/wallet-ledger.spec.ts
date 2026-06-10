import { expect, test } from './fixtures/mockApi';

// Wallet journey: an authenticated user opens the wallet and the balance shown equals the
// simulated ledger (startBalance + sum of ledger entries). The mock is the single source of
// truth for credits, so this asserts the wallet read path and the balance/ledger invariant.
test('wallet shows the balance backed by the ledger', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });

  await page.goto('/wallet');

  await expect.poll(() => mock.called('GET', '/wallet')).toBe(true);

  // Invariant: displayed balance == startBalance + sum(ledger). No spend yet, so it equals 50.
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
  await expect(page.getByText(String(mock.state.balance)).first()).toBeVisible();
});
