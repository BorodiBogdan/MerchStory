import { type CatalogOfferGroup, offerHasGrouping } from '../utils/api';

function group(overrides: Partial<CatalogOfferGroup>): CatalogOfferGroup {
  return {
    kind: 'group',
    productIds: [],
    percent: 0,
    freebies: [],
    ...overrides,
  };
}

describe('offerHasGrouping', () => {
  it('is false for an empty offer', () => {
    expect(offerHasGrouping([])).toBe(false);
  });

  it('is false for a single-product group', () => {
    expect(offerHasGrouping([group({ kind: 'group', productIds: ['a'] })])).toBe(false);
  });

  it('is true for a group of two or more products', () => {
    expect(offerHasGrouping([group({ kind: 'group', productIds: ['a', 'b'] })])).toBe(true);
  });

  it('is true for any bundle, even with a single product', () => {
    expect(offerHasGrouping([group({ kind: 'bundle', productIds: ['a'] })])).toBe(true);
  });

  it('is true when at least one group qualifies', () => {
    expect(
      offerHasGrouping([
        group({ kind: 'group', productIds: ['a'] }),
        group({ kind: 'group', productIds: ['b', 'c'] }),
      ])
    ).toBe(true);
  });
});
