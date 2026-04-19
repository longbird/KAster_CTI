import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { parseAllowedCallerIds } from '../../common/outbound-caller-id.util';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { buildPickupGroupName, normalizeAgentRuntimeProfile } from './renderers/agent-settings';
import { renderAgentDialplan } from './renderers/agent-dialplan.renderer';
import { renderDialplan } from './renderers/dialplan.renderer';
import { renderPjsip } from './renderers/pjsip.renderer';
import { renderQueuesConf } from './renderers/queues.renderer';

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

  scheduleReload(tenantId: string): void {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(tenantId);
      void this.executeReload(tenantId).catch((error) => {
        this.logger.error(
          `Asterisk reload failed for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 5000);
    this.debounceTimers.set(tenantId, timer);
  }

  async executeReload(tenantId: string): Promise<void> {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(tenantId);
    }
    const reloadable = await this.writeConfFiles(tenantId);
    if (!reloadable) {
      this.logger.warn(`Skipping AMI reload because Asterisk conf directory is not available for tenant ${tenantId}`);
      return;
    }
    this.logger.debug(`Sending AMI reload commands for tenant ${tenantId}`);
    this.ami.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' });
    this.ami.sendAction({ Action: 'Command', Command: 'dialplan reload' });
    this.ami.sendAction({ Action: 'Command', Command: 'queue reload all' });
    this.logger.log(`Asterisk reload triggered for tenant ${tenantId}`);
  }

  async writeConfFiles(tenantId: string): Promise<boolean> {
    const confDir = this.config.get<string>('ASTERISK_CONF_DIR', '/etc/asterisk');

    if (!path.isAbsolute(confDir)) {
      throw new Error(`ASTERISK_CONF_DIR must be an absolute path, got: "${confDir}"`);
    }

    if (!fs.existsSync(confDir)) {
      this.logger.warn(
        `Asterisk conf directory "${confDir}" does not exist. Skipping config file generation for tenant ${tenantId}`,
      );
      return false;
    }

    const {
      trunks,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);

    const pjsipContent = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus, forwardingRules, blocklistEntries });
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      trunks,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
        };
      }),
    });
    const queuesContent = renderQueuesConf(
      rawQueues.map((q) => ({
        queueName: q.queueName,
        strategy: q.strategy,
        ringTimeoutSeconds: q.ringTimeoutSeconds,
        retrySeconds: q.retrySeconds,
        wrapupSeconds: q.wrapupSeconds,
        maxWaitSeconds: q.maxWaitSeconds,
        autopause: q.autopause,
        members: q.members
          .filter((m) => {
            if (!m.agent.isActive) return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
            extension: m.agent.extension,
            agentName: m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );

    fs.writeFileSync(path.join(confDir, 'pjsip.conf'), pjsipContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_inbound.conf'), extensionsInbound, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_queue.conf'), extensionsQueue, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_agent.conf'), extensionsAgent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'queues.conf'), queuesContent, 'utf8');
    return true;
  }

  async previewConfFiles(tenantId: string): Promise<{
    pjsip: string;
    extensionsInbound: string;
    extensionsQueue: string;
    extensionsAgent: string;
    queues: string;
  }> {
    const {
      trunks,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);

    const pjsip = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus, forwardingRules, blocklistEntries });
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      trunks,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
        };
      }),
    });
    const queues = renderQueuesConf(
      rawQueues.map((q) => ({
        queueName: q.queueName,
        strategy: q.strategy,
        ringTimeoutSeconds: q.ringTimeoutSeconds,
        retrySeconds: q.retrySeconds,
        wrapupSeconds: q.wrapupSeconds,
        maxWaitSeconds: q.maxWaitSeconds,
        autopause: q.autopause,
        members: q.members
          .filter((m) => {
            if (!m.agent.isActive) return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
            extension: m.agent.extension,
            agentName: m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );

    const maskedPjsip = pjsip.replace(/^(password=).+$/gm, '$1***');

    return { pjsip: maskedPjsip, extensionsInbound, extensionsQueue, extensionsAgent, queues };
  }

  private async fetchTenantData(tenantId: string) {
    const [trunks, agents, dids, ivrMenus, forwardingRules, blocklistEntries, settings] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      this.prisma.agents.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskDid.findMany({ where: { tenantId } }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        include: { entries: true },
      }),
      this.prisma.asteriskForwardingRules.findMany({ where: { tenantId, enabled: true } }),
      this.prisma.asteriskBlocklistEntry.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.tenantSystemSettings.findUnique({
        where: { tenantId },
        select: {
          allowDirectSipDial: true,
          defaultSipPassword: true,
          allowedOutboundCallerIds: true,
          defaultOutboundCallerId: true,
          sipRegisterPort: true,
        },
      } as any),
    ]);
    const typedSettings = settings as
      | {
          allowDirectSipDial?: boolean | null;
          defaultSipPassword?: string | null;
          allowedOutboundCallerIds?: string | null;
          defaultOutboundCallerId?: string | null;
          sipRegisterPort?: number | null;
        }
      | null;
    const defaultSipPassword = settings?.defaultSipPassword ?? null;
    return {
      trunks,
      sipRegisterPort: typedSettings?.sipRegisterPort ?? 36070,
      allowDirectSipDial: typedSettings?.allowDirectSipDial ?? false,
      allowedOutboundCallerIds: parseAllowedCallerIds(typedSettings?.allowedOutboundCallerIds),
      defaultOutboundCallerId: typedSettings?.defaultOutboundCallerId ?? null,
      agents,
      pjsipAgents: agents.map((agent) => ({
        extension: agent.extension,
        agentName: agent.agentName,
        sipPassword: agent.sipPassword || defaultSipPassword,
        context: `agent-phone-${agent.extension}`,
        callerIdPrivacy: (
          normalizeAgentRuntimeProfile(agent.settingsProfile).numberMasking === 'USE'
            ? 'prohib'
            : 'allowed_not_screened'
        ) as 'prohib' | 'allowed_not_screened',
        pickupGroup: buildPickupGroupName(agent.defaultQueueId),
        pickupType: normalizeAgentRuntimeProfile(agent.settingsProfile).pickupType,
      })),
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
    };
  }

  private async fetchQueueData(tenantId: string) {
    return this.prisma.queues.findMany({
      where: { tenantId, isActive: true },
      include: {
        members: {
          where: { isActive: true },
          include: {
            agent: {
              select: { extension: true, agentName: true, isActive: true, settingsProfile: true },
            },
          },
        },
      },
      orderBy: { queueName: 'asc' },
    });
  }
}
