import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../shared/lib/apiClient', () => ({ apiClient: { get: (...args: any[]) => get(...args) } }));

const { usePermissionStore } = await import('./usePermissionStore');

const AGENT = { agentId: 'a1', role: 'admin' } as any;

function permission(menuKey: string, canView = true) {
  return {
    menuKey,
    canView,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canOperate: true,
    canExport: true,
  };
}

function respond(data: Record<string, unknown>) {
  get.mockResolvedValue({ data: { data } });
}

describe('usePermissionStore 기능 자격', () => {
  beforeEach(() => {
    get.mockReset();
    usePermissionStore.getState().clear();
  });

  it('자격이 없어서 감출 메뉴는 allowedPaths 에서 뺀다', async () => {
    respond({
      permissions: [permission('dashboard'), permission('system/packet-capture')],
      hiddenMenuKeys: ['system/packet-capture'],
      featureEntitlements: { 'packet-capture': false },
    });

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().allowedPaths).toEqual(['/dashboard']);
  });

  it('감출 메뉴가 없으면 권한대로 남긴다', async () => {
    respond({
      permissions: [permission('dashboard'), permission('system/packet-capture')],
      hiddenMenuKeys: [],
      featureEntitlements: { 'packet-capture': true },
    });

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().allowedPaths).toContain('/system/packet-capture');
  });

  it('권한이 없으면 자격이 있어도 안 열린다', async () => {
    respond({
      permissions: [permission('dashboard'), permission('system/packet-capture', false)],
      hiddenMenuKeys: [],
      featureEntitlements: { 'packet-capture': true },
    });

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().allowedPaths).not.toContain('/system/packet-capture');
  });

  it('자격 목록을 그대로 보관한다 (메뉴 없는 기능의 탭 판정용)', async () => {
    respond({
      permissions: [permission('trends')],
      hiddenMenuKeys: [],
      featureEntitlements: { 'ai-insights': true, 'call-analysis': false },
    });

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().featureEntitlements).toEqual({
      'ai-insights': true,
      'call-analysis': false,
    });
  });

  // 서버가 아직 이 필드를 안 주는 경우에도 기존 동작을 깨지 않는다.
  it('서버가 자격 필드를 안 주면 감추지 않는다', async () => {
    respond({ permissions: [permission('dashboard'), permission('system/packet-capture')] });

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().allowedPaths).toContain('/system/packet-capture');
    expect(usePermissionStore.getState().featureEntitlements).toEqual({});
  });

  it('권한 API 가 실패하면 대시보드만 남기고 자격도 비운다', async () => {
    get.mockRejectedValue(new Error('down'));

    await usePermissionStore.getState().loadForAgent(AGENT);

    expect(usePermissionStore.getState().allowedPaths).toEqual(['/dashboard']);
    expect(usePermissionStore.getState().featureEntitlements).toEqual({});
  });
});
