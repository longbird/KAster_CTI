import { BadRequestException } from '@nestjs/common';
import {
  matchSourceNumber,
  validateCallerIdNumber,
  validateDisplayName,
  validateSourceNumberPattern,
} from './outbound-rule.sanitizer';

describe('outbound-rule.sanitizer', () => {
  describe('validateSourceNumberPattern', () => {
    it('rejects pattern with newline regardless of matchType', () => {
      expect(() => validateSourceNumberPattern('EXACT', '021234\n5678')).toThrow(BadRequestException);
    });
    it('EXACT/PREFIX accepts digits and +', () => {
      expect(() => validateSourceNumberPattern('EXACT', '01012345678')).not.toThrow();
      expect(() => validateSourceNumberPattern('PREFIX', '+82')).not.toThrow();
    });
    it('EXACT rejects letters', () => {
      expect(() => validateSourceNumberPattern('EXACT', 'abc')).toThrow(BadRequestException);
    });
    it('DIALPLAN_PATTERN requires leading _', () => {
      expect(() => validateSourceNumberPattern('DIALPLAN_PATTERN', '_NXX')).not.toThrow();
      expect(() => validateSourceNumberPattern('DIALPLAN_PATTERN', 'NXX')).toThrow(BadRequestException);
    });
    it('REGEX validates compilability', () => {
      expect(() => validateSourceNumberPattern('REGEX', '^010\\d+$')).not.toThrow();
      expect(() => validateSourceNumberPattern('REGEX', '[invalid')).toThrow(BadRequestException);
    });
    it('REGEX rejects pattern over 200 chars', () => {
      const long = '1'.repeat(201);
      expect(() => validateSourceNumberPattern('REGEX', long)).toThrow(BadRequestException);
    });
  });

  describe('validateCallerIdNumber', () => {
    it('accepts digits and +', () => {
      expect(() => validateCallerIdNumber('+821012345678')).not.toThrow();
    });
    it('rejects spaces or hyphens', () => {
      expect(() => validateCallerIdNumber('010-1234-5678')).toThrow(BadRequestException);
      expect(() => validateCallerIdNumber('010 1234')).toThrow(BadRequestException);
    });
  });

  describe('validateDisplayName', () => {
    it('accepts Korean and ASCII', () => {
      expect(() => validateDisplayName('대표 발신번호')).not.toThrow();
      expect(() => validateDisplayName('Branch-A')).not.toThrow();
      expect(() => validateDisplayName(null)).not.toThrow();
      expect(() => validateDisplayName('')).not.toThrow();
    });
    it('rejects newline', () => {
      expect(() => validateDisplayName('foo\nbar')).toThrow(BadRequestException);
    });
    it('rejects suspicious chars', () => {
      expect(() => validateDisplayName('alert<script>')).toThrow(BadRequestException);
    });
  });

  describe('matchSourceNumber', () => {
    it('EXACT matches identity', () => {
      expect(matchSourceNumber('EXACT', '01012345678', '01012345678')).toBe(true);
      expect(matchSourceNumber('EXACT', '010', '010123')).toBe(false);
    });
    it('PREFIX matches startsWith', () => {
      expect(matchSourceNumber('PREFIX', '010', '01012345678')).toBe(true);
      expect(matchSourceNumber('PREFIX', '02', '01012345678')).toBe(false);
    });
    it('REGEX matches', () => {
      expect(matchSourceNumber('REGEX', '^010\\d+$', '01012345')).toBe(true);
    });
    it('DIALPLAN_PATTERN _NXXNXXXXXX', () => {
      expect(matchSourceNumber('DIALPLAN_PATTERN', '_NXX', '212')).toBe(true);
      expect(matchSourceNumber('DIALPLAN_PATTERN', '_NXX', '012')).toBe(false);
      expect(matchSourceNumber('DIALPLAN_PATTERN', '_010.', '01012345678')).toBe(true);
      expect(matchSourceNumber('DIALPLAN_PATTERN', '_02XXXXXXXX', '0212345678')).toBe(true);
    });
  });
});
