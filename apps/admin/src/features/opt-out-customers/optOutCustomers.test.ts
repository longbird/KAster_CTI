import { describe, expect, it } from 'vitest';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';
import {
  buildOptOutCustomerCsvRows,
  getOptOutSourceLabel,
  isOptOutCustomerEntry,
  toOptOutDeactivatePayload,
} from './optOutCustomers';

const baseRow: AsteriskBlocklistEntry = {
  id: 'row-1',
  matchType: 'EXACT',
  phoneNumber: '01012345678',
  normalizedPhoneNumber: '01012345678',
  requesterPhoneNumber: '0215990000',
  normalizedRequesterPhone: '0215990000',
  sourceType: 'OPT_OUT_080_SMART',
  branchId: 'branch-1',
  entryDid: '0801234567',
  description: null,
  isActive: true,
  createdAt: '2026-04-28T10:02:03',
  updatedAt: '2026-04-28T13:05:06',
};

describe('opt-out customer helpers', () => {
  it('keeps only customer-selected opt-out entries', () => {
    expect(isOptOutCustomerEntry({ sourceType: 'OPT_OUT_080_SMART' })).toBe(true);
    expect(isOptOutCustomerEntry({ sourceType: 'OPT_OUT_DTMF' })).toBe(true);
    expect(isOptOutCustomerEntry({ sourceType: null })).toBe(false);
    expect(isOptOutCustomerEntry({ sourceType: 'MANUAL_BLOCKLIST' })).toBe(false);
  });

  it('maps known source types to operator labels', () => {
    expect(getOptOutSourceLabel('OPT_OUT_080_SMART')).toBe('Smart 080 번호입력 등록');
    expect(getOptOutSourceLabel('CUSTOM_OPT_OUT')).toBe('CUSTOM_OPT_OUT');
    expect(getOptOutSourceLabel(null)).toBe('-');
  });

  it('preserves source metadata while deactivating an opt-out entry', () => {
    expect(toOptOutDeactivatePayload(baseRow)).toEqual({
      matchType: 'EXACT',
      phoneNumber: '01012345678',
      branchId: 'branch-1',
      description: undefined,
      isActive: false,
    });
  });

  it('builds csv rows with branch and opt-out source labels', () => {
    expect(
      buildOptOutCustomerCsvRows(baseRow ? [baseRow] : [], [
        { branchId: 'branch-1', branchCode: 'SEOUL', branchName: '서울지사' },
      ])[0],
    ).toEqual([
      '활성',
      '010-1234-5678',
      '02-1599-0000',
      '서울지사 (SEOUL)',
      '080-123-4567',
      'Smart 080 번호입력 등록',
      '2026-04-28 10:02:03',
      '2026-04-28 13:05:06',
    ]);
  });
});
