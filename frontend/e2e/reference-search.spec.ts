import { expect, test } from './fixtures/mockApi';
import { typeIntoPlaceholder } from './fixtures/ui';

// Reference-search (search-by-photo) journey: from the add-product modal a user searches the
// curated professional library and picks a match to seed their product. The by-name search path
// is driven here (it needs no uploaded photo) and hits the same CLIP-backed reference endpoint.
test('a user finds a product in the reference library', async ({ page, mock, seedAuth }) => {
  await seedAuth({ isShopSetupComplete: true });

  await page.goto('/products');
  await page.getByLabel('Add product').first().click();

  await typeIntoPlaceholder(page, 'e.g. chips, coffee, sneakers', 'coffee');
  await page.getByLabel('Search the professional library by name').click();

  await expect.poll(() => mock.called('POST', '/reference-images/search-text')).toBe(true);
  await expect(page.getByText('Matched product').first()).toBeVisible();
});
