import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';

/** ABANDONED 는 사람이 고르는 값이 아니다. 기다리던 롱폴이 끊겨 제안이 무의미해졌다는 뜻이다. */
export type AgentOfferDecision = 'ACCEPT' | 'REJECT' | 'TIMEOUT' | 'ABANDONED';

export const AGENT_OFFER_EVENT = 'agent.offer';
export const AGENT_OFFER_CLOSED_EVENT = 'agent.offer.closed';
export const AGENT_OFFER_DECIDED_EVENT = 'agent.offer.decided';

export interface AgentOfferRequest {
  tenantId: string;
  linkedid: string;
  extension: string;
  caller?: string | null;
  timeoutSeconds: number;
}

export interface AgentOfferDecisionInput {
  tenantId: string;
  linkedid: string;
  extension: string;
  decision: Exclude<AgentOfferDecision, 'TIMEOUT' | 'ABANDONED'>;
}

/**
 * 롱폴이 끊겼을 때 이 제안을 닫는 함수를 받아 가는 갈고리.
 *
 * 컨트롤러가 HTTP 요청의 close 에 걸어 준다. 서비스가 요청 객체를 직접 알지 않게 두려고 넘겨받는다.
 */
export type AgentOfferAbortHook = (abandon: () => void) => void;

/** 한 호를 한 상담원에게 제안한 건을 가리키는 값. 저장소 없이 양쪽이 같은 값을 만들 수 있다. */
export function agentOfferId(linkedid: string, extension: string): string {
  return `${linkedid}:${extension}`;
}

interface PendingOffer {
  resolve: (decision: AgentOfferDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * 큐가 상담원에게 호를 넘기기 전에 수락/거절을 묻고 기다린다.
 *
 * PBX 의 AGI 가 이 서비스에 롱폴을 건다. 상담원이 앱에서 누른 결정은 다른 노드에 도착할 수
 * 있으므로(WS 노드와 AGI 를 받은 노드가 다를 수 있다) Redis Pub/Sub 으로 넘겨받는다.
 */
@Injectable()
export class AgentOfferService implements OnModuleInit {
  private readonly logger = new Logger(AgentOfferService.name);
  private readonly pending = new Map<string, PendingOffer>();

  constructor(private readonly eventBus: EventBusService) {}

  onModuleInit() {
    this.eventBus.subscribe((event, payload) => {
      if (event !== AGENT_OFFER_DECIDED_EVENT) return;

      const { offerId, decision } = (payload ?? {}) as { offerId?: string; decision?: AgentOfferDecision };
      if (!offerId || !decision) return;

      this.settle(offerId, decision);
    });
  }

  /**
   * 상담원이 결정할 때까지 기다린다. 정해진 시간을 넘기면 TIMEOUT 이다.
   *
   * `onAbort` 는 이 기다림이 끊겼을 때를 알려주는 갈고리다. 다른 상담원이 먼저 받으면
   * PBX 가 진 쪽 Local 채널을 끊고, 그러면 이쪽에는 롱폴 연결이 끊기는 것만 보인다.
   * 이걸 잡지 않으면 진 상담원 화면에 이미 끝난 전화의 수락 버튼이 타임아웃까지 남는다.
   */
  async waitForDecision(
    request: AgentOfferRequest,
    onAbort?: AgentOfferAbortHook,
  ): Promise<AgentOfferDecision> {
    const offerId = agentOfferId(request.linkedid, request.extension);

    // 이미 같은 제안이 떠 있으면 새로 열지 않는다. AGI 가 재시도로 두 번 부를 수 있고,
    // 그때 앞선 대기를 버리면 상담원이 누른 결정이 아무 데도 도착하지 않는다.
    const existing = this.pending.get(offerId);
    if (existing) {
      return new Promise((resolve) => {
        existing.resolve = resolve;
        onAbort?.(() => this.abandonIfOwned(offerId, resolve));
      });
    }

    let ownResolve: (decision: AgentOfferDecision) => void;
    const decision = new Promise<AgentOfferDecision>((resolve) => {
      ownResolve = resolve;
      const timer = setTimeout(() => this.settle(offerId, 'TIMEOUT'), request.timeoutSeconds * 1000);
      this.pending.set(offerId, { resolve, timer });
    });
    onAbort?.(() => this.abandonIfOwned(offerId, ownResolve));

    await this.eventBus.publish(AGENT_OFFER_EVENT, {
      offerId,
      linkedid: request.linkedid,
      extension: request.extension,
      caller: request.caller ?? null,
      timeoutSeconds: request.timeoutSeconds,
    }, request.tenantId);

    const result = await decision;

    // 다른 상담원이 받았든 시간이 지났든, 화면에 뜬 제안은 사라져야 한다.
    await this.eventBus.publish(AGENT_OFFER_CLOSED_EVENT, {
      offerId,
      extension: request.extension,
      decision: result,
    }, request.tenantId);

    return result;
  }

  /** 상담원이 누른 결정을 기다리고 있는 노드로 보낸다. */
  async submitDecision(input: AgentOfferDecisionInput): Promise<void> {
    const offerId = agentOfferId(input.linkedid, input.extension);
    this.logger.log(`offer ${offerId} -> ${input.decision}`);

    await this.eventBus.publish(AGENT_OFFER_DECIDED_EVENT, {
      offerId,
      decision: input.decision,
    }, input.tenantId);
  }

  /** 이 노드가 그 제안을 기다리고 있는지. 컨트롤러가 없는 제안을 거르는 데 쓴다. */
  isPending(linkedid: string, extension: string): boolean {
    return this.pending.has(agentOfferId(linkedid, extension));
  }

  /**
   * 기다리던 연결이 끊겼으니 제안을 닫는다. 단, 그 기다림이 아직 이 제안의 주인일 때만.
   *
   * 두 가지를 이 확인 하나로 막는다.
   * - 정상 응답 뒤에도 연결은 닫힌다. `settle` 이 pending 을 먼저 지우므로 그땐 걸리는 게 없다.
   *   안 막으면 이미 수락된 제안을 한 번 더 닫아, 다음 통화의 같은 제안을 엉뚱하게 내린다.
   * - AGI 재시도가 같은 제안을 넘겨받았을 수 있다. 그땐 우리 것이 아니므로 두고 나간다.
   *   안 막으면 앞선 연결이 끊길 때 지금 기다리는 재시도까지 같이 죽는다.
   */
  private abandonIfOwned(offerId: string, resolve: (decision: AgentOfferDecision) => void) {
    if (this.pending.get(offerId)?.resolve !== resolve) return;
    this.settle(offerId, 'ABANDONED');
  }

  private settle(offerId: string, decision: AgentOfferDecision) {
    const offer = this.pending.get(offerId);
    if (!offer) return;

    // 결정은 자기 노드에도 되돌아온다. 먼저 지우고 풀어야 두 번 처리되지 않는다.
    this.pending.delete(offerId);
    clearTimeout(offer.timer);
    offer.resolve(decision);
  }
}
