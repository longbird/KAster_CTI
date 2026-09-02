import { platformApiClient } from '../lib/platformApiClient';
import type {
  EntitlementHistoryEntry,
  TenantEntitlements,
  UpdateEntitlementInput,
  UpdateEntitlementResult,
} from '../types/platform';

export async function getTenantEntitlements(tenantId: string) {
  const res = await platformApiClient.get(`/platform/tenants/${tenantId}/entitlements`);
  return res.data?.data as TenantEntitlements;
}

export async function updateTenantEntitlement(
  tenantId: string,
  featureKey: string,
  input: UpdateEntitlementInput,
) {
  const res = await platformApiClient.put(
    `/platform/tenants/${tenantId}/entitlements/${featureKey}`,
    input,
  );
  return res.data?.data as UpdateEntitlementResult;
}

export async function listTenantEntitlementHistory(tenantId: string, limit = 50) {
  const res = await platformApiClient.get(`/platform/tenants/${tenantId}/entitlements/history`, {
    params: { limit },
  });
  return (res.data?.data ?? []) as EntitlementHistoryEntry[];
}
