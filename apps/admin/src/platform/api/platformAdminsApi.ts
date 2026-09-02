import { platformApiClient } from '../lib/platformApiClient';
import type { CreatePlatformAdminInput, PlatformAdminRow } from '../types/platform';

export async function listPlatformAdmins() {
  const res = await platformApiClient.get('/platform/admins');
  return (res.data?.data ?? []) as PlatformAdminRow[];
}

export async function createPlatformAdmin(input: CreatePlatformAdminInput) {
  const res = await platformApiClient.post('/platform/admins', input);
  return res.data?.data as PlatformAdminRow;
}

export async function setPlatformAdminActive(platformAdminId: string, isActive: boolean) {
  const res = await platformApiClient.patch(`/platform/admins/${platformAdminId}`, { isActive });
  return res.data?.data as PlatformAdminRow;
}
