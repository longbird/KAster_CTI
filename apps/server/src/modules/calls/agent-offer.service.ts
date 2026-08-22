import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';

export type AgentOfferDecision = 'ACCEPT' | 'REJECT' | 'TIMEOUT';

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
  decision: Exclude<AgentOfferDecision, 'TIMEOUT'>;
}

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

  /** 상담원이 결정할 때까지 기다린다. 정해진 시간을 넘기면 TIMEOUT 이다. */
  async waitForDecision(request: AgentOfferRequest): Promise<AgentOfferDecision> {
    const offerId = agentOfferId(request.linkedid, request.extension);

    // 이미 같은 제안이 떠 있으면 새로 열지 않는다. AGI 가 재시도로 두 번 부를 수 있고,
    // 그때 앞선 대기를 버리면 상담원이 누른 결정이 아무 데도 도착하지 않는다.
    const existing = this.pending.get(offerId);
    if (existing) return new Promise((resolve) => { existing.resolve = resolve; });

    const decision = new Promise<AgentOfferDecision>((resolve) => {
      const timer = setTimeout(() => this.settle(offerId, 'TIMEOUT'), request.timeoutSeconds * 1000);
      this.pending.set(offerId, { resolve, timer });
    });

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

  private settle(offerId: string, decision: AgentOfferDecision) {
    const offer = this.pending.get(offerId);
    if (!offer) return;

    // 결정은 자기 노드에도 되돌아온다. 먼저 지우고 풀어야 두 번 처리되지 않는다.
    this.pending.delete(offerId);
    clearTimeout(offer.timer);
    offer.resolve(decision);
  }
}
