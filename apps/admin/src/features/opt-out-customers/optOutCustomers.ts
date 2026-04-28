import dayjs from 'dayjs';
import type { BranchOption } from '../../shared/branches/useBranchOptions';
import { formatPhoneNumber } from '../../shared/lib/format';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';

export const OPT_OUT_CUSTOMERS_MENU_PATH = '/opt-out-customers';
export const OPT_OUT_CUSTOMERS_MENU_LABEL = '수신거부 고객 관리';

const OPT_OUT_SOURCE_LABELS: Record<string, string> = {
  OPT_OUT_080: '080 수신거부',
  OPT_OUT_080_ANI: '080 발신번호 등록',
  OPT_OUT_080_SMART: 'Smart 080 번호입력 등록',
  OPT_OUT_DTMF: 'DTMF 수신거부',
  OPT_OUT_SMART_ARS: 'Smart ARS 수신거부',
};

export function isOptOutCustomerEntry(row: Pick<AsteriskBlocklistEntry, 'sourceType'>) {
  return row.sourceType?.startsWith('OPT_OUT_') === true;
}

export function getOptOutSourceLabel(sourceType?: string | null) {
  if (!sourceType) return '-';
  return OPT_OUT_SOURCE_LABELS[sourceType] ?? sourceType;
}

export function getOptOutDisplayNumber(row: AsteriskBlocklistEntry) {
  return formatPhoneNumber(row.normalizedPhoneNumber ?? row.phoneNumber);
}

export function getOptOutRequesterNumber(row: AsteriskBlocklistEntry) {
  return formatPhoneNumber(row.normalizedRequesterPhone ?? row.requesterPhoneNumber);
}

export function getOptOutBranchLabel(branchById: Map<string, BranchOption>, branchId?: string | null) {
  if (!branchId) return '-';
  const branch = branchById.get(branchId);
  return branch ? `${branch.branchName} (${branch.branchCode})` : branchId;
}

export function toOptOutDeactivatePayload(row: AsteriskBlocklistEntry) {
  return {
    matchType: row.matchType,
    phoneNumber: row.phoneNumber,
    branchId: row.branchId ?? undefined,
    description: row.description ?? undefined,
    isActive: false,
  };
}

export function buildOptOutCustomerCsvRows(rows: AsteriskBlocklistEntry[], branches: BranchOption[]) {
  const branchById = new Map(branches.map((branch) => [branch.branchId, branch]));
  return rows.map((row) => [
    row.isActive ? '활성' : '해제',
    getOptOutDisplayNumber(row),
    getOptOutRequesterNumber(row),
    getOptOutBranchLabel(branchById, row.branchId),
    row.entryDid ? formatPhoneNumber(row.entryDid) : '-',
    getOptOutSourceLabel(row.sourceType),
    row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
    row.updatedAt ? dayjs(row.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
  ]);
}
