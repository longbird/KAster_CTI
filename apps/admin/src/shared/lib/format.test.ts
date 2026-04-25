import { describe, expect, it } from 'vitest';
import { formatPhoneNumber } from './format';

describe('formatPhoneNumber', () => {
  it('applies the shared Korean phone display rule', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
    expect(formatPhoneNumber('07052346380')).toBe('070-5234-6380');
    expect(formatPhoneNumber('021234567')).toBe('02-123-4567');
    expect(formatPhoneNumber('15881234')).toBe('1588-1234');
    expect(formatPhoneNumber(null)).toBe('-');
  });
});
