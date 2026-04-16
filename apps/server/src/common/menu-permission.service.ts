import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

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

@Injectable()
export class MenuPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccess(tenantId: string, roleCode: string, menuKey: string): Promise<boolean> {
    const stored = await this.prisma.rolePermissions.findUnique({
      where: {
        tenantId_roleCode_menuKey: {
          tenantId,
          roleCode,
          menuKey,
        },
      },
      select: { canAccess: true },
    });

    if (stored) return stored.canAccess;
    return DEFAULT_ROLE_ACCESS[roleCode]?.has(menuKey) ?? false;
  }

  async assertMenuAccess(tenantId: string, roleCode: string, menuKey: string) {
    const allowed = await this.canAccess(tenantId, roleCode, menuKey);
    if (!allowed) {
      throw new ForbiddenException(`menu access denied: ${menuKey}`);
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
}
