import { currencySymbol, formatPrice } from '../utils/api';

describe('currencySymbol', () => {
  it('maps known currencies to their symbol', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('RON')).toBe('lei');
  });

  it('is case-insensitive', () => {
    expect(currencySymbol('eur')).toBe('€');
    expect(currencySymbol('ron')).toBe('lei');
  });

  it('falls back to $ for null, undefined, or unknown currencies', () => {
    expect(currencySymbol(null)).toBe('$');
    expect(currencySymbol(undefined)).toBe('$');
    expect(currencySymbol('GBP')).toBe('$');
  });
});

describe('formatPrice', () => {
  it('prefixes the symbol for USD and EUR', () => {
    expect(formatPrice(9.99, 'USD')).toBe('$9.99');
    expect(formatPrice(9.5, 'EUR')).toBe('€9.50');
  });

  it('appends "lei" after the amount for RON', () => {
    expect(formatPrice(10, 'RON')).toBe('10.00 lei');
  });

  it('always renders two decimal places', () => {
    expect(formatPrice(9.005, 'USD')).toBe('$9.01');
    expect(formatPrice(9.999, 'USD')).toBe('$10.00');
    expect(formatPrice(0, 'EUR')).toBe('€0.00');
  });

  it('defaults to $ when the currency is missing', () => {
    expect(formatPrice(5, null)).toBe('$5.00');
    expect(formatPrice(5, undefined)).toBe('$5.00');
  });
});
