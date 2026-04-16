import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { renderDialplan } from './renderers/dialplan.renderer';
import { renderPjsip } from './renderers/pjsip.renderer';

@Injectable()
export class AsteriskReloadService implements OnModuleDestroy {
  private readonly logger = new Logger(AsteriskReloadService.name);
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ami: AmiConnectionService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  /** 5초 debounce — 테넌트별로 독립 관리, 연속 저장 시 마지막 호출만 실행 */
  scheduleReload(tenantId: string): void {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(tenantId);
      void this.executeReload(tenantId);
    }, 5000);
    this.debounceTimers.set(tenantId, timer);
  }

  /** 즉시 실행 — 수동 reload 또는 debounce timer에서 호출. 기존 타이머 취소. */
  async executeReload(tenantId: string): Promise<void> {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(tenantId);
    }
    await this.writeConfFiles(tenantId);
    this.logger.debug(`Sending AMI reload commands for tenant ${tenantId}`);
    this.ami.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' });
    this.ami.sendAction({ Action: 'Command', Command: 'dialplan reload' });
    this.logger.log(`Asterisk reload triggered for tenant ${tenantId}`);
  }

  async writeConfFiles(tenantId: string): Promise<void> {
    const confDir = this.config.get<string>('ASTERISK_CONF_DIR', '/etc/asterisk');

    if (!path.isAbsolute(confDir)) {
      throw new Error(`ASTERISK_CONF_DIR must be an absolute path, got: "${confDir}"`);
    }

    const { trunks, agents, dids, ivrMenus } = await this.fetchTenantData(tenantId);

    const pjsipContent = renderPjsip({ trunks, agents });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus });

    fs.writeFileSync(path.join(confDir, 'pjsip.conf'), pjsipContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_inbound.conf'), extensionsInbound, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_queue.conf'), extensionsQueue, 'utf8');
  }

  async previewConfFiles(tenantId: string): Promise<{
    pjsip: string;
    extensionsInbound: string;
    extensionsQueue: string;
  }> {
    const { trunks, agents, dids, ivrMenus } = await this.fetchTenantData(tenantId);

    const pjsip = renderPjsip({ trunks, agents });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus });

    // 미리보기에서 패스워드 마스킹
    const maskedPjsip = pjsip.replace(/^(password=).+$/gm, '$1***');

    return { pjsip: maskedPjsip, extensionsInbound, extensionsQueue };
  }

  private async fetchTenantData(tenantId: string) {
    const [trunks, agents, dids, ivrMenus] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      this.prisma.agents.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskDid.findMany({ where: { tenantId } }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        include: { entries: true },
      }),
    ]);
    return { trunks, agents, dids, ivrMenus };
  }
}
