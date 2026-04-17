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

const DEFAULT_ROLE_ACCESS: Record<string, Set<string>> = {
  agent: new Set(['dashboard']),
  supervisor: new Set([
    'dashboard',
    'live-calls',
    'kpi',
    'reports/calls',
    'reports/missed',
    'reports/recordings',
    'reports/logs',
    'announcements',
    'settings/agents',
    'settings/queues',
    'settings/forwarding',
    'settings/prompts',
    'settings/branches',
    'settings/permissions',
    'blocklist',
    'system',
    'queues',
    'agents',
    'monitoring',
    'asterisk',
  ]),
  admin: new Set([
    'dashboard',
    'live-calls',
    'kpi',
    'reports/calls',
    'reports/missed',
    'reports/recordings',
    'reports/logs',
    'announcements',
    'settings/agents',
    'settings/queues',
    'settings/forwarding',
    'settings/prompts',
    'settings/branches',
    'settings/permissions',
    'blocklist',
    'system',
    'queues',
    'agents',
    'monitoring',
    'asterisk',
  ]),
};

const REPORT_MENU_PREFIX = 'reports/';
const MUTABLE_MENU_KEYS = new Set([
  'announcements',
  'settings/agents',
  'settings/queues',
  'settings/forwarding',
  'settings/prompts',
  'settings/branches',
  'settings/permissions',
  'blocklist',
  'system',
  'asterisk',
]);
const OPERABLE_MENU_KEYS = new Set([
  'dashboard',
  'live-calls',
  'queues',
  'agents',
  'monitoring',
  'asterisk',
  'settings/branches',
  'settings/queues',
  'settings/agents',
  'settings/permissions',
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

function defaultPermissionFlags(roleCode: string, menuKey: string): PermissionFlags {
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
    canExport: menuKey.startsWith(REPORT_MENU_PREFIX),
  };
}

@Injectable()
export class MenuPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(tenantId: string, roleCode: string, menuKey: string): Promise<PermissionFlags> {
    const defaults = defaultPermissionFlags(roleCode, menuKey);
    const rolePermissions = (this.prisma as any).rolePermissions;
    if (!rolePermissions?.findUnique) {
      return defaults;
    }

    const stored = await rolePermissions.findUnique({
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
    });

    if (!stored) return defaults;

    return {
      canView: stored.canView ?? stored.canAccess ?? defaults.canView,
      canCreate: stored.canCreate ?? defaults.canCreate,
      canUpdate: stored.canUpdate ?? defaults.canUpdate,
      canDelete: stored.canDelete ?? defaults.canDelete,
      canOperate: stored.canOperate ?? defaults.canOperate,
      canExport: stored.canExport ?? defaults.canExport,
    };
  }

  async canAccess(tenantId: string, roleCode: string, menuKey: string): Promise<boolean> {
    const permissions = await this.getPermissions(tenantId, roleCode, menuKey);
    return permissions.canView;
  }

  async canPerform(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    action: PermissionAction,
  ): Promise<boolean> {
    const permissions = await this.getPermissions(tenantId, roleCode, menuKey);
    return permissions[fieldForAction(action)];
  }

  async assertMenuAccess(tenantId: string, roleCode: string, menuKey: string) {
    const allowed = await this.canAccess(tenantId, roleCode, menuKey);
    if (!allowed) {
      throw new ForbiddenException(`menu access denied: ${menuKey}`);
    }
  }

  async assertMenuAction(
    tenantId: string,
    roleCode: string,
    menuKey: string,
    action: PermissionAction,
  ) {
    const allowed = await this.canPerform(tenantId, roleCode, menuKey, action);
    if (!allowed) {
      throw new ForbiddenException(`menu action denied: ${menuKey}:${action}`);
    }
  }

  async assertAnyMenuAccess(tenantId: string, roleCode: string, menuKeys: string[]) {
    for (const menuKey of menuKeys) {
      if (await this.canAccess(tenantId, roleCode, menuKey)) {
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
  ) {
    for (const menuKey of menuKeys) {
      if (await this.canPerform(tenantId, roleCode, menuKey, action)) {
        return;
      }
    }
    throw new ForbiddenException(`menu action denied: ${menuKeys.join(', ')}:${action}`);
  }
}
