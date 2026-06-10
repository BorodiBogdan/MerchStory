import { expect, test } from './fixtures/mockApi';
import { typeIntoPlaceholder } from './fixtures/ui';

// Administration journey: an admin looks up a user and grants credits. The grant flows through the
// mock's ledger as a positive entry, mirroring the backend's credit ledger.
test('an admin grants credits to a user', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isAdmin: true, isShopSetupComplete: true });

  await page.goto('/admin-grant-credits');

  // Searching by email hits the admin lookup; the mock returns one match.
  await typeIntoPlaceholder(page, 'name@example.com', 'target@test.com');
  await expect.poll(() => mock.called('GET', '/wallet/admin/users')).toBe(true);

  // Pick the matched user, enter an amount, and grant.
  await page.getByText('5 credits').click();
  await typeIntoPlaceholder(page, 'e.g. 10', '25');
  await page.getByText('Grant', { exact: true }).click();

  await expect.poll(() => mock.called('POST', '/wallet/grant')).toBe(true);
  // The ledger recorded a positive grant of 25 and the balance rose by 25.
  expect(mock.state.ledger.some((t) => t.amount === 25)).toBe(true);
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
});
