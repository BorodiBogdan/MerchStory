import { expect, test } from './fixtures/mockApi';
import { typeIntoPlaceholder } from './fixtures/ui';

// Product-library journey: an authenticated user adds a product through the add-product modal and
// it appears in their library.
test('a user creates a product', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });

  await page.goto('/products');
  await page.getByLabel('Add product').first().click();

  await typeIntoPlaceholder(page, 'e.g. Artisan Coffee Blend', 'E2E Product');
  await typeIntoPlaceholder(page, '0.00', '12.50');
  await page.getByLabel('Save product').click();

  await expect.poll(() => mock.called('POST', '/products')).toBe(true);
  expect(mock.state.products.some((p) => p.name === 'E2E Product')).toBe(true);
  await expect(page.getByText('E2E Product').first()).toBeVisible();
});
