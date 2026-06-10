import { expect, test } from './fixtures/mockApi';

// Library-and-print journey: an admin picks a generated asset and exports it to an A4 PDF. The
// print render debits one credit (the seeded asset is below print resolution, so it upscales).
test('exporting an asset to A4 PDF debits one credit', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isAdmin: true, isShopSetupComplete: true });
  mock.seedGallery('My Catalogue');
  const before = mock.state.balance;

  await page.goto('/print');

  // Pick an asset from the gallery picker (A4 is the default paper size).
  await page.getByLabel('Browse assets').first().click();
  await page.getByLabel('My Catalogue').first().click();

  await page.getByLabel('Generate PDF').first().click();

  await expect.poll(() => mock.called('POST', '/print/render')).toBe(true);
  expect(mock.state.balance).toBe(before - 1);
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
});
