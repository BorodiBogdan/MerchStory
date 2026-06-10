import { expect, test } from './fixtures/mockApi';

// Asset-generation journey (announcement): a user generates an announcement from a brief. The
// content is pre-filled via the recommendation handoff route param, then generation debits a credit.
test('generating an announcement debits one credit', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });
  const before = mock.state.balance;

  await page.goto('/studio/announcements?brief=Summer%20sale%20this%20weekend');

  await page
    .getByRole('button', { name: /Generate Graphic/ })
    .first()
    .click();
  // Confirmation steps may precede the charged call; click any "Continue" that appears.
  for (let i = 0; i < 2; i++) {
    const btn = page.getByRole('button', { name: /^Continue/ }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
  }

  await expect.poll(() => mock.called('POST', '/generate-image/announcement')).toBe(true);
  expect(mock.state.balance).toBe(before - 1);
  expect(mock.state.balance).toBe(mock.state.startBalance + mock.ledgerSum());
});
