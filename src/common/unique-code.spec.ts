import {
  formatUniqueCodeForStorage,
  isValidUniqueCode,
  UNIQUE_CODE_LENGTH,
  UNIQUE_CODE_MAX,
  UNIQUE_CODE_MIN,
} from './unique-code';

describe('unique-code', () => {
  describe('isValidUniqueCode', () => {
    it.each(['10000001', '00000001', '99999999', '12345678'])(
      'accepts valid 8-digit code %s',
      (code) => {
        expect(isValidUniqueCode(code)).toBe(true);
      },
    );

    it.each(['chdemo01', '1234567', '123456789', 'abcd1234', ''])(
      'rejects invalid code %s',
      (code) => {
        expect(isValidUniqueCode(code)).toBe(false);
      },
    );
  });

  describe('formatUniqueCodeForStorage', () => {
    it('zero-pads numbers below 8 digits', () => {
      expect(formatUniqueCodeForStorage(1)).toBe('00000001');
      expect(formatUniqueCodeForStorage('42')).toBe('00000042');
    });

    it('preserves 8-digit values', () => {
      expect(formatUniqueCodeForStorage(10000001)).toBe('10000001');
      expect(formatUniqueCodeForStorage('99999999')).toBe('99999999');
    });

    it('throws for out-of-range values', () => {
      expect(() => formatUniqueCodeForStorage(-1)).toThrow(RangeError);
      expect(() => formatUniqueCodeForStorage(UNIQUE_CODE_MAX + 1)).toThrow(
        RangeError,
      );
      expect(() => formatUniqueCodeForStorage('not-a-number')).toThrow(
        RangeError,
      );
    });

    it('exports expected constants', () => {
      expect(UNIQUE_CODE_LENGTH).toBe(8);
      expect(UNIQUE_CODE_MIN).toBe(0);
      expect(UNIQUE_CODE_MAX).toBe(99_999_999);
    });
  });
});
