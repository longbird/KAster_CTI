import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, Server, Socket } from 'net';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { buildSmdrCallReport, type SmdrCallSessionPayload } from './smdr-call-report.formatter';

type CidProgramKey = 'LOGI' | 'CALLMANOR' | 'ICON';

interface CidProgramPort {
  key: CidProgramKey;
  label: string;
  envName: string;
  defaultPort: number;
}

interface SmdrClient {
  id: string;
  socket: Socket;
  connectedAt: Date;
}

interface ProgramRule {
  enabled: boolean;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  includeOriginalCallerId: boolean;
}

interface PortServer {
  program: CidProgramPort;
  port: number;
  server: Server;
  clients: Map<string, SmdrClient>;
}

const CID_PROGRAM_PORTS: CidProgramPort[] = [
  { key: 'LOGI', label: '로지', envName: 'CID_LOGI_TCP_PORT', defaultPort: 28002 },
  { key: 'CALLMANOR', label: '콜마너', envName: 'CID_CALLMANOR_TCP_PORT', defaultPort: 28004 },
  { key: 'ICON', label: '아이콘', envName: 'CID_ICON_TCP_PORT', defaultPort: 28003 },
];

@Injectable()
export class SmdrTcpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmdrTcpServerService.name);
  private readonly servers = new Map<CidProgramKey, PortServer>();
  private readonly branchRules = new Map<string, Map<CidProgramKey, ProgramRule>>();
  private readonly lastReportByCallId = new Map<string, string>();
  private unsubscribe: (() => boolean) | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private nextClientSeq = 1;

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.eventBus.subscribe((event, payload, tenantId) => {
      void this.handleEvent(event, payload as SmdrCallSessionPayload, tenantId);
    });
    this.openFixedServers();
    void this.refreshBranchRules();
    this.refreshTimer = setInterval(() => {
      void this.refreshBranchRules();
    }, 10_000);
    this.refreshTimer.unref();
  }

  onModuleDestroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    for (const state of this.servers.values()) {
      this.closePortServer(state);
    }
    this.servers.clear();
  }

  getClientCount() {
    let count = 0;
    for (const state of this.servers.values()) {
      count += state.clients.size;
    }
    return count;
  }

  private host() {
    return this.config.get<string>('CID_TCP_HOST')?.trim()
      || this.config.get<string>('SMDR_TCP_HOST')?.trim()
      || '0.0.0.0';
  }

  private openFixedServers() {
    for (const program of CID_PROGRAM_PORTS) {
      const port = this.resolvePort(program);
      const clients = new Map<string, SmdrClient>();
      const server = createServer((socket) => this.accept(program.key, clients, socket));
      const state: PortServer = { program, port, server, clients };
      this.servers.set(program.key, state);

      server.on('error', (error) => {
        this.logger.error(`CID TCP server error ${program.label} ${port}: ${(error as Error).message}`);
      });
      server.listen(port, this.host(), () => {
        this.logger.log(`CID TCP server listening on ${this.host()}:${port} (${program.label})`);
      });
    }
  }

  private resolvePort(program: CidProgramPort) {
    const configured = Number(this.config.get<string>(program.envName) ?? program.defaultPort);
    return Number.isInteger(configured) && configured > 0 && configured <= 65535
      ? configured
      : program.defaultPort;
  }

  private closePortServer(state: PortServer) {
    for (const client of state.clients.values()) {
      client.socket.destroy();
    }
    state.clients.clear();
    state.server.close();
  }

  private accept(programKey: CidProgramKey, clients: Map<string, SmdrClient>, socket: Socket) {
    const id = `${programKey}-${Date.now()}-${this.nextClientSeq++}`;
    const client: SmdrClient = { id, socket, connectedAt: new Date() };
    clients.set(id, client);
    socket.setKeepAlive(true);
    this.logger.log(`CID client connected ${id} ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on('data', () => {
      // Legacy CID popup programs receive only.
    });
    socket.on('error', (error) => {
      this.logger.warn(`CID client error ${id}: ${(error as Error).message}`);
      clients.delete(id);
    });
    socket.on('close', () => {
      clients.delete(id);
      this.logger.log(`CID client disconnected ${id}`);
    });
  }

  private async refreshBranchRules() {
    const rows = await this.prisma.branches.findMany({
      where: { isActive: true },
      select: {
        tenantId: true,
        branchId: true,
        settingsProfile: true,
      },
    });

    const next = new Map<string, Map<CidProgramKey, ProgramRule>>();
    for (const row of rows) {
      const profile =
        row.settingsProfile && typeof row.settingsProfile === 'object' && !Array.isArray(row.settingsProfile)
          ? row.settingsProfile as Record<string, any>
          : {};
      const smdr = profile.smdr && typeof profile.smdr === 'object' && !Array.isArray(profile.smdr)
        ? profile.smdr as Record<string, any>
        : {};
      if (smdr.enabled !== true || !Array.isArray(smdr.programs)) continue;

      const rules = new Map<CidProgramKey, ProgramRule>();
      for (const raw of smdr.programs) {
        if (!raw || typeof raw !== 'object') continue;
        if (!this.isProgramKey(raw.programKey)) continue;
        rules.set(raw.programKey, {
          enabled: raw.enabled === true,
          inboundEnabled: raw.inboundEnabled !== false,
          outboundEnabled: raw.outboundEnabled !== false,
          includeOriginalCallerId: raw.includeOriginalCallerId !== false,
        });
      }

      if (rules.size > 0) {
        next.set(this.branchRuleKey(row.tenantId, row.branchId), rules);
      }
    }

    this.branchRules.clear();
    for (const [key, rules] of next) {
      this.branchRules.set(key, rules);
    }
  }

  private isProgramKey(value: unknown): value is CidProgramKey {
    return value === 'LOGI' || value === 'CALLMANOR' || value === 'ICON';
  }

  private branchRuleKey(tenantId: string, branchId: string) {
    return `${tenantId}:${branchId}`;
  }

  private async handleEvent(event: string, payload: SmdrCallSessionPayload, tenantId?: string) {
    const effectiveTenantId = tenantId ?? (payload as any)?.tenantId;
    if (!effectiveTenantId) return;

    const branchId = await this.resolveBranchId(effectiveTenantId, payload);
    if (!branchId) return;

    const rules = this.branchRules.get(this.branchRuleKey(effectiveTenantId, branchId));
    if (!rules) return;

    for (const state of this.servers.values()) {
      if (state.clients.size === 0) continue;
      const rule = rules.get(state.program.key);
      if (!rule?.enabled || !this.allowsDirection(rule, payload.direction)) continue;

      const report = buildSmdrCallReport(event, payload, new Date(), {
        includeOriginalCallerId: rule.includeOriginalCallerId,
      });
      if (!report) continue;

      const dedupeKey = `${state.program.key}:${event}:${report.reportType}`;
      const callKey = `${state.program.key}:${report.callId}`;
      if (this.lastReportByCallId.get(callKey) === dedupeKey) continue;
      this.lastReportByCallId.set(callKey, dedupeKey);
      setTimeout(() => this.lastReportByCallId.delete(callKey), 60_000).unref();

      this.broadcast(state, report.line);
    }
  }

  private allowsDirection(rule: ProgramRule, direction?: string | null) {
    if (direction === 'outbound') return rule.outboundEnabled;
    return rule.inboundEnabled;
  }

  private async resolveBranchId(tenantId: string, payload: SmdrCallSessionPayload) {
    const branchId = typeof (payload as any).branchId === 'string' ? (payload as any).branchId : null;
    if (branchId) return branchId;

    if (payload.primaryAgentId) {
      const mapping = await this.prisma.branchAgents.findFirst({
        where: { tenantId, agentId: payload.primaryAgentId },
        select: { branchId: true },
      });
      if (mapping) return mapping.branchId;
    }

    if (payload.queueName) {
      const queue = await this.prisma.queues.findFirst({
        where: { tenantId, queueName: payload.queueName },
        select: { queueId: true },
      });
      if (queue) {
        const mapping = await this.prisma.branchQueues.findFirst({
          where: { tenantId, queueId: queue.queueId },
          select: { branchId: true },
        });
        if (mapping) return mapping.branchId;
      }
    }

    if (payload.dnis) {
      const did = await this.prisma.asteriskDid.findFirst({
        where: { tenantId, did: payload.dnis },
        select: { id: true },
      });
      if (did) {
        const mapping = await this.prisma.branchDids.findFirst({
          where: { tenantId, didId: did.id },
          select: { branchId: true },
        });
        if (mapping) return mapping.branchId;
      }
    }

    return null;
  }

  private broadcast(state: PortServer, line: string) {
    const dead: string[] = [];
    for (const [id, client] of state.clients) {
      if (client.socket.destroyed || !client.socket.writable) {
        dead.push(id);
        continue;
      }

      const ok = client.socket.write(line, 'utf8');
      if (!ok) {
        this.logger.debug(`CID client backpressure ${id}`);
      }
    }

    for (const id of dead) {
      state.clients.delete(id);
    }
  }
}
