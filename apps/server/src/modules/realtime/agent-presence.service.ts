import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';

/**
 * 상담원 앱이 지금 붙어 있는가를 보관한다.
 *
 * Redis 여야 하는 이유: WS 노드는 여러 개일 수 있다. 상담원이 A 노드에 붙어 있는데
 * B 노드가 "아무도 없다"고 판단해 큐 멤버를 정지시키면 그 자리로 전화가 영영 안 간다.
 *
 * TTL 이 필요한 이유: 노드가 죽으면 handleDisconnect 가 아예 안 돈다. 그 경우 키가
 * 스스로 만료돼야 한다. 정상 종료는 자기 자리를 지우고, 비정상 종료는 TTL 이 처리한다.
 *
 * <b>왜 상담원별 hash 인가</b> — field 가 노드, value 가 그 노드의 만료 시각이다.
 * 상담원당 키 하나에 노드 여럿이 공유하면, A 의 연결이 끊길 때 키를 통째로 지우게 되고
 * B 에 붙어 있는 상담원이 pause 된 채 남는다 (B 의 하트비트가 키를 되살려도 그때는
 * 재계산을 돌릴 계기가 없다). 노드별로 키를 쪼개면 그 문제는 없지만 "이 상담원의 키가
 * 하나라도 있는가" 를 물으려면 SCAN 이 필요하고, 그건 WS 연결/해제마다 키스페이스를
 * 훑는다는 뜻이다. hash 는 왕복 한 번(HGETALL)으로 답이 나오고, 노드는 자기 field 만
 * 건드리며, 키 전체 TTL 은 살아 있는 아무 노드의 하트비트가 갱신해 준다.
 * Set 을 쓰지 않은 이유는 멤버별 TTL 이 없어서 죽은 노드가 영원히 남기 때문이다 —
 * 여기서는 field 값에 만료 시각을 넣어 읽는 쪽이 걸러낸다.
 */
export const AGENT_PRESENCE_TTL_SECONDS = 30;
export const AGENT_PRESENCE_HEARTBEAT_MS = 15_000;

export interface AgentPresenceChange {
  tenantId: string;
  agentId: string;
  connected: boolean;
}

type PresenceListener = (change: AgentPresenceChange) => void | Promise<void>;

interface TrackedAgent {
  tenantId: string;
  agentId: string;
  connections: Set<string>;
}

@Injectable()
export class AgentPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentPresenceService.name);
  // AmiLeaderElectionService 와 같은 방식. 프로세스 인스턴스마다 고유해야 하며,
  // 재시작한 프로세스가 pid 를 재사용해도 남의 자리를 물려받으면 안 된다.
  private readonly nodeId = randomUUID();
  private readonly tracked = new Map<string, TrackedAgent>();
  private readonly listeners = new Set<PresenceListener>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly redis: RedisService) {}

  onChange(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * connectionId 로 세는 이유: 웹 앱과 데스크톱 소프트폰을 같이 띄운 상담원이 하나를
   * 닫았다고 큐에서 빠지면 안 된다. 이 노드의 마지막 연결이 끊길 때만 자리를 비운다.
   */
  async markConnected(tenantId: string, agentId: string, connectionId: string): Promise<void> {
    if (!tenantId || !agentId) return;

    const key = this.presenceKey(tenantId, agentId);
    const entry = this.tracked.get(key);
    if (entry) {
      entry.connections.add(connectionId);
      await this.writeField(key);
      return;
    }

    this.tracked.set(key, { tenantId, agentId, connections: new Set([connectionId]) });
    this.startHeartbeat();
    await this.writeField(key);
    await this.notify({ tenantId, agentId, connected: true });
  }

  async markDisconnected(tenantId: string, agentId: string, connectionId: string): Promise<void> {
    if (!tenantId || !agentId) return;

    const key = this.presenceKey(tenantId, agentId);
    const entry = this.tracked.get(key);
    if (!entry) return;

    entry.connections.delete(connectionId);
    if (entry.connections.size > 0) return;

    this.tracked.delete(key);
    this.stopHeartbeatWhenIdle();
    await this.clearField(key);
    await this.notify({ tenantId, agentId, connected: false });
  }

  /**
   * Redis 를 못 읽으면 "접속 중" 으로 본다.
   *
   * 못 읽었다고 상담원을 큐에서 빼면 Redis 장애가 그대로 콜센터 정지로 번진다.
   * 반대로 잘못 붙여 두면 최악이 벨 몇 번 울리고 다음 상담원으로 넘어가는 것이다.
   * 두 오답의 크기가 다르므로 읽기 실패는 배정을 막지 않는 쪽으로 기운다.
   */
  async isConnected(tenantId: string, agentId: string): Promise<boolean> {
    if (!tenantId || !agentId) return true;

    try {
      const nodes = await this.redis.getClient().hgetall(this.presenceKey(tenantId, agentId));
      const now = Date.now();
      // 죽은 노드는 hdel 을 못 했으므로 field 가 남는다. 자기 만료 시각으로 걸러낸다.
      return Object.values(nodes ?? {}).some((expiresAt) => Number(expiresAt) > now);
    } catch (err) {
      this.logger.warn(`presence read failed, assuming connected: ${(err as Error).message}`);
      return true;
    }
  }

  /**
   * 여러 상담원의 접속 여부를 한 번에 읽는다.
   *
   * 목록 화면은 상담원 전원을 5초마다 다시 묻는다. isConnected 를 사람 수만큼
   * 이어 부르면 그만큼 왕복이 늘어나므로 파이프라인으로 한 번에 보낸다.
   * 읽기 실패 시 전원을 접속 중으로 보는 것은 isConnected 와 같은 이유다.
   */
  async connectedAgentIds(tenantId: string, agentIds: ReadonlyArray<string>): Promise<Set<string>> {
    if (!tenantId || agentIds.length === 0) return new Set();

    try {
      const pipeline = this.redis.getClient().pipeline();
      for (const agentId of agentIds) {
        pipeline.hgetall(this.presenceKey(tenantId, agentId));
      }
      const results = await pipeline.exec();
      const now = Date.now();
      const connected = new Set<string>();
      agentIds.forEach((agentId, index) => {
        const [err, nodes] = results?.[index] ?? [null, null];
        if (err) {
          connected.add(agentId);
          return;
        }
        const values = Object.values((nodes as Record<string, string> | null) ?? {});
        if (values.some((expiresAt) => Number(expiresAt) > now)) {
          connected.add(agentId);
        }
      });
      return connected;
    } catch (err) {
      this.logger.warn(`presence bulk read failed, assuming connected: ${(err as Error).message}`);
      return new Set(agentIds);
    }
  }

  async onModuleDestroy() {
    this.stopHeartbeat();
    // 프로세스가 내려가는 중이므로 내가 들고 있던 자리는 즉시 비운다. 남겨 두면
    // 다음 30초 동안 다른 노드가 이 상담원을 접속 중으로 보고 전화를 넘긴다.
    const keys = [...this.tracked.keys()];
    this.tracked.clear();
    for (const key of keys) {
      await this.clearField(key);
    }
  }

  private presenceKey(tenantId: string, agentId: string): string {
    return `presence:${tenantId}:${agentId}`;
  }

  private async writeField(key: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      const expiresAt = Date.now() + AGENT_PRESENCE_TTL_SECONDS * 1000;
      await client.hset(key, this.nodeId, String(expiresAt));
      // 키 전체 TTL 은 살아 있는 아무 노드의 하트비트가 갱신한다. 모든 노드가
      // 죽으면 아무도 갱신하지 않으므로 키가 통째로 사라진다.
      await client.expire(key, AGENT_PRESENCE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`presence write failed for ${key}: ${(err as Error).message}`);
    }
  }

  private async clearField(key: string): Promise<void> {
    try {
      // 내 field 만 지운다. 키를 지우면 다른 노드에 붙어 있는 연결까지 없앤다.
      await this.redis.getClient().hdel(key, this.nodeId);
    } catch (err) {
      // 못 지워도 field 의 만료 시각이 30초 안에 무효화한다.
      // 여기서 던지면 소켓 종료 경로가 깨진다.
      this.logger.warn(`presence clear failed for ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * 하트비트는 리더 가드를 걸지 않는다. 각 노드는 자기 소켓만 알고 있으므로
   * 리더 한 대만 갱신하면 나머지 노드에 붙은 상담원이 30초마다 사라진다.
   */
  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      void this.refreshAll();
    }, AGENT_PRESENCE_HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  private stopHeartbeatWhenIdle(): void {
    if (this.tracked.size === 0) {
      this.stopHeartbeat();
    }
  }

  private stopHeartbeat(): void {
    if (!this.heartbeat) return;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private async refreshAll(): Promise<void> {
    for (const key of this.tracked.keys()) {
      await this.writeField(key);
    }
  }

  private async notify(change: AgentPresenceChange): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(change);
      } catch (err) {
        this.logger.warn(`presence listener failed: ${(err as Error).message}`);
      }
    }
  }
}
