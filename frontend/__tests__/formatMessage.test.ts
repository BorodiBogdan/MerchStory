import { formatMessage } from '../utils/formatMessage';

test('formatMessage trims surrounding whitespace', () => {
  expect(formatMessage('  Hello World  ')).toBe('Hello World');
});
