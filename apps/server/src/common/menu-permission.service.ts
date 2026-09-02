import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'operate'
  | 'export';

export interface PermissionFlags {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canOperate: boolean;
  canExport: boolean;
}

export const MENU_KEYS = [
  'dashboard',
  'live-calls',
  'kpi',
  'trends',
  'reports/calls',
  'reports/missed',
  'reports/recordings',
  'reports/logs',
  'reports/ivr-failures',
  'history',
  'customers',
  'opt-out-customers',
  'announcements',
  'settings/agents',
  'settings/agent-groups',
  'settings/queues',
  'settings/forwarding',
  'settings/holidays',
  'settings/prompts',
  'settings/sms-templates',
  'settings/consult-categories',
  'settings/ars-flows',
  'settings/branches',
  'settings/outbound-rules',
  'settings/share-rules',
  'settings/permissions',
  'blocklist',
  'system',
  'system/packet-capture',
  'queues',
  'agents',
  'monitoring',
  'monitoring/agents',
  'asterisk',
  'numbers',
  'integrations',
] as const;

export const ROLE_CODES = ['agent', 'supervisor', 'admin'] as const;

const DEFAULT_ROLE_ACCESS: Record<string, Set<string>> = {
  agent: new Set(['dashboard']),
  supervisor: new Set(MENU_KEYS),
  admin: new Set(MENU_KEYS),
};

const REPORT_MENU_PREFIX = 'reports/';
const MUTABLE_MENU_KEYS = new Set([
  'announcements',
  'settings/agents',
  'settings/agent-groups',
  'settings/queues',
  'settings/forwarding',
  'settings/holidays',
  'settings/prompts',
  'settings/sms-templates',
  'settings/consult-categories',
  'settings/ars-flows',
  'settings/branches',
  'settings/outbound-rules',
  'settings/share-rules',
  'settings/permissions',
  'customers',
  'blocklist',
  'system',
  'asterisk',
  'numbers',
  'integrations',
]);
const OPERABLE_MENU_KEYS = new Set([
  'system/packet-capture',
  'dashboard',
  'live-calls',
  'queues',
  'agents',
  'monitoring',
  'monitoring/agents',
  'asterisk',
  'settings/branches',
  'settings/queues',
  'settings/agents',
  'settings/permissions',
  'settings/sms-templates',
  'customers',
  'blocklist',
]);

function fieldForAction(action: PermissionAction): keyof PermissionFlags {
  switch (action) {
    case 'view':
      return 'canView';
    case 'create':
      return 'canCreate';
    case 'update':
      return 'canUpdate';
    case 'delete':
      return 'canDelete';
    case 'operate':
      return 'canOperate';
    case 'export':
      return 'canExport';
  }
}

type PersistedPermissionFlags = Partial<PermissionFlags> & {
  canAccess?: boolean | null;
};

export function mergePermissionFlags(
  base: PermissionFlags,
  override?: PersistedPermissionFlags | null,
): PermissionFlags {
  if (!override) return base;

  return {
    canView: override.canView ?? override.canAccess ?? base.canView,
    canCreate: override.canCreate ?? base.canCreate,
    canUpdate: override.canUpdate ?? base.canUpdate,
    canDelete: override.canDelete ?? base.canDelete,
    canOperate: override.canOperate ?? base.canOperate,
    canExport: override.canExport ?? base.canExport,
  };
}

export function defaultPermissionFlags(roleCode: string, menuKey: string): PermissionFlags {
  const canView = DEFAULT_ROLE_ACCESS[roleCode]?.has(menuKey) ?? false;
  if (!canView) {
    return {
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canOperate: false,
      canExport: false,
    };
  }

  if (roleCode === 'agent') {
    return {
      canView,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canOperate: false,
      canExport: false,
    };
  }

  return {
    canView,
    canCreate: MUTABLE_MENU_KEYS.has(menuKey),
    canUpdate: MUTABLE_MENU_KEYS.has(menuKey),
    canDelete: MUTABLE_MENU_KEYS.has(menuKey),
    canOperate: MUTABLE_MENU_KEYS.has(menuKey) || OPERABLE_MENU_KEYS.has(menuKey),
    canExport:
      menuKey.startsWith(REPORT_MENU_PREFIX) ||
      menuKey === 'queues' ||
      menuKey === 'agents' ||
      menuKey === 'customers' ||
      menuKey === 'settings/sms-templates',
  };
}

@Injectable()
export class MenuPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(
    tenantId: string,
    roleCode: string,
    agentId?: string | null,
  ): Promise<Array<{ menuKey: string; permissions: PermissionFlags }>> {
    const rolePermissions = (this.prisma as any).rolePermissions;
    const agentMenuPermissions = (this.prisma as any).agentMenuPermissions;

    const [roleRows, agentRows] = await Promise.all([
      rolePermissions?.findMany
        ? rolePermissions.findMany({
            where: {
              tenantId,
              roleCode,
              menuKey: { in: MENU_KEYS as unknown as string[] },
            },
            select: {
              menuKey: true,
              canAccess: true,
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
              canOperate: true,
              canExport: true,
            },
          })
        : Promise.resolve([]),
      agentId && agentMenuPermissions?.findMany
        ? agentMenuPermissions.findMany({
            where: {
              tenantId,
              agentId,
              menuKey: { in: MENU_KEYS as unknown as string[] },
            },
            select: {
              menuKey: true,
              canAccess: true,
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
              canOperate: true,
              canExport: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const roleMap = new Map<string, PersistedPermissionFlags>(
      roleRows.map((row: PersistedPermissionFlags & { menuKey: string }) => [row.menuKey, row]),
    );
    const agentMap = new Map<string, PersistedPermissionFlags>(
      agentRows.map((row: PersistedPermissionFlags & { menuKey: string }) => [row.menuKey, row]),
    );

    return MENU_KEYS.map((menuKey) => {
      const defaults = defaultPermissionFlags(roleCode, menuKey);
      const rolePermission = mergePermissionFlags(defaults, roleMap.get(menuKey));
      const effectivePermission = mergePermissionFlags(rolePermission, agentMap.get(menuKey));
      return {
        menuKey,
        permissions: effectivePermission,
      };
    });
  }

  async getPermissions(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    agentId?: string | null,
  ): Promise<PermissionFlags> {
    const defaults = defaultPermissionFlags(roleCode, menuKey);
    const rolePermissions = (this.prisma as any).rolePermissions;
    const agentMenuPermissions = (this.prisma as any).agentMenuPermissions;

    const [storedRolePermission, storedAgentPermission] = await Promise.all([
      rolePermissions?.findUnique
        ? rolePermissions.findUnique({
            where: {
              tenantId_roleCode_menuKey: {
                tenantId,
                roleCode,
                menuKey,
              },
            },
            select: {
              canAccess: true,
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
              canOperate: true,
              canExport: true,
            },
          })
        : Promise.resolve(null),
      agentId && agentMenuPermissions?.findUnique
        ? agentMenuPermissions.findUnique({
            where: {
              tenantId_agentId_menuKey: {
                tenantId,
                agentId,
                menuKey,
              },
            },
            select: {
              canAccess: true,
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
              canOperate: true,
              canExport: true,
            },
          })
        : Promise.resolve(null),
    ]);

    return mergePermissionFlags(
      mergePermissionFlags(defaults, storedRolePermission),
      storedAgentPermission,
    );
  }

  async canAccess(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    agentId?: string | null,
  ): Promise<boolean> {
    const permissions = await this.getPermissions(tenantId, roleCode, menuKey, agentId);
    return permissions.canView;
  }

  async canPerform(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    action: PermissionAction,
    agentId?: string | null,
  ): Promise<boolean> {
    const permissions = await this.getPermissions(tenantId, roleCode, menuKey, agentId);
    return permissions[fieldForAction(action)];
  }

  async assertMenuAccess(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    agentId?: string | null,
  ) {
    const allowed = await this.canAccess(tenantId, roleCode, menuKey, agentId);
    if (!allowed) {
      throw new ForbiddenException(`menu access denied: ${menuKey}`);
    }
  }

  async assertMenuAction(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    action: PermissionAction,
    agentId?: string | null,
  ) {
    const allowed = await this.canPerform(tenantId, roleCode, menuKey, action, agentId);
    if (!allowed) {
      throw new ForbiddenException(`menu action denied: ${menuKey}:${action}`);
    }
  }

  async assertAnyMenuAccess(
    tenantId: string,
    roleCode: string,
    menuKeys: string[],
    agentId?: string | null,
  ) {
    for (const menuKey of menuKeys) {
      if (await this.canAccess(tenantId, roleCode, menuKey, agentId)) {
        return;
      }
    }
    throw new ForbiddenException(`menu access denied: ${menuKeys.join(', ')}`);
  }

  async assertAnyMenuAction(
    tenantId: string,
    roleCode: string,
    menuKeys: string[],
    action: PermissionAction,
    agentId?: string | null,
  ) {
    for (const menuKey of menuKeys) {
      if (await this.canPerform(tenantId, roleCode, menuKey, action, agentId)) {
        return;
      }
    }
    throw new ForbiddenException(`menu action denied: ${menuKeys.join(', ')}:${action}`);
  }
}
