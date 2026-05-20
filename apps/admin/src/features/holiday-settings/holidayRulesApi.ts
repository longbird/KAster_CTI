import { apiClient } from '../../shared/lib/apiClient';
import type { HolidayRulePayload, HolidayRuleRow } from './holidayRules';

function unwrap<T>(response: { data?: { data?: T } }) {
  return response.data?.data as T;
}

export async function listHolidayRules(branchId?: string | null) {
  const response = await apiClient.get('/admin/settings/holiday-rules', {
    params: branchId ? { branchId } : undefined,
  });
  return unwrap<HolidayRuleRow[]>(response) ?? [];
}

export async function createHolidayRule(payload: HolidayRulePayload) {
  const response = await apiClient.post('/admin/settings/holiday-rules', payload);
  return unwrap<HolidayRuleRow>(response);
}

export async function updateHolidayRule(holidayRuleId: string, payload: Partial<HolidayRulePayload>) {
  const response = await apiClient.patch(`/admin/settings/holiday-rules/${holidayRuleId}`, payload);
  return unwrap<HolidayRuleRow>(response);
}

export async function deleteHolidayRule(holidayRuleId: string) {
  await apiClient.delete(`/admin/settings/holiday-rules/${holidayRuleId}`);
}

