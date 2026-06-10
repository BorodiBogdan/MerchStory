import { expect, test } from './fixtures/mockApi';

// Asset-generation journey (wallpaper): a user opens the wallpaper generator and produces a
// brand background, which debits one credit.
test('generating a wallpaper debits one credit', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });
  const before = mock.state.balance;

  await page.goto('/wallpapers');

  // Open the generate sheet, then generate (the prompt is optional).
  await page.getByRole('button', { name: 'Generate New' }).first().click();
  await page
    .getByRole('button', { name: /Generate.*1/ })
    .first()
    .click();

  await expect.poll(() => mock.called('POST', '/generate-image/wallpaper')).toBe(true);
  expect(mock.state.balance).toBe(before - 1);
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
});
