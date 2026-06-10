import { expect, test } from './fixtures/mockApi';

// Asset-generation journey (catalogue): a user selects a product and generates a catalogue. The
// charged endpoint debits one credit, and the wallet/ledger invariant is asserted after.
test('generating a catalogue debits one credit', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });
  mock.seedProduct('Studio Product');
  const before = mock.state.balance;

  await page.goto('/studio/catalog');

  // Select the product (rendered as a checkbox named by the product), then generate.
  await page
    .getByRole('checkbox', { name: /Studio Product/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Generate Catalog/ })
    .first()
    .click();
  // Two confirmation steps precede the charged call: "Review catalog" then "Generation options".
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect.poll(() => mock.called('POST', '/generate-image/catalog')).toBe(true);
  expect(mock.state.balance).toBe(before - 1);
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
});
