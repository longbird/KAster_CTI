import { platformApiClient } from '../lib/platformApiClient';
import type { PlatformTenantRow } from '../types/platform';

export async function listPlatformTenants() {
  const res = await platformApiClient.get('/platform/tenants');
  return (res.data?.data ?? []) as PlatformTenantRow[];
}
