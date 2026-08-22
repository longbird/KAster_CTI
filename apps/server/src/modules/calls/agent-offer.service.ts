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

type OfferResolver = (decision: AgentOfferDecision) => void;

interface PendingOffer {
  /**
   * 이 제안을 기다리는 롱폴들. **하나가 아니다** — AGI 가 재시도로 같은 제안을 다시 부를 수 있고,
   * 그때 앞선 기다림을 버리면 그쪽은 영영 답을 못 받는다. AGI 는 답이 없으면 ACCEPT 로
   * 열어 버리므로(고장 나도 전화는 받게 하려는 설계), 버려진 기다림 하나가 곧 자동 수락이 된다.
   */
  resolvers: Set<OfferResolver>;
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

      // 한 사람이 받았으면 그 호는 끝났다. 같은 호를 물어봐 둔 다른 자리도 같이 내린다.
      if (decision === 'ACCEPT') this.abandonSiblings(offerId);

      this.settle(offerId, decision);
    });
  }

  /**
   * 같은 호를 물어봐 둔 다른 상담원의 제안을 닫는다.
   *
   * 이걸 PBX 신호에 기대면 안 된다. 진 쪽 Local 채널이 끊겨도 AGI 는 `urlopen()` 안에서
   * 막혀 있어 우리 쪽 연결은 그대로 열려 있고, 그래서 "연결이 끊겼다" 는 신호가 오지 않는다.
   * 결국 이미 끝난 전화의 수락 버튼이 대기 시간을 다 채울 때까지 남는다.
   * 반면 **누가 받았다는 사실은 우리가 이미 알고 있다** — 그것으로 닫는 편이 확실하다.
   */
  private abandonSiblings(acceptedOfferId: string) {
    const separator = acceptedOfferId.lastIndexOf(':');
    if (separator <= 0) return;

    const prefix = `${acceptedOfferId.slice(0, separator)}:`;

    for (const offerId of [...this.pending.keys()]) {
      if (offerId === acceptedOfferId) continue;
      if (!offerId.startsWith(prefix)) continue;

      this.settle(offerId, 'ABANDONED');
    }
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
    const result = await this.enqueue(offerId, request, onAbort);

    // 다른 상담원이 받았든 시간이 지났든, 화면에 뜬 제안은 사라져야 한다.
    await this.eventBus.publish(AGENT_OFFER_CLOSED_EVENT, {
      offerId,
      extension: request.extension,
      decision: result,
    }, request.tenantId);

    return result;
  }

  /**
   * 이 제안의 결정을 기다리는 줄에 선다.
   *
   * 제안을 여는 것과 <b>닫혔다고 알리는 것</b>을 갈라 둔 이유가 있다. 예전에는 이미 떠 있는
   * 제안에 합류하는 길이 곧장 return 해서, 그 길로 들어온 요청은 결정을 받고도 닫힘을
   * 알리지 않았다. 화면의 제안은 그 알림으로만 내려가므로, 상담원 앞에는 이미 끝난 전화의
   * 수락 버튼이 계속 남았다. 이제 두 길 모두 <see cref="waitForDecision"/> 의 알림을 지난다.
   */
  private enqueue(
    offerId: string,
    request: AgentOfferRequest,
    onAbort?: AgentOfferAbortHook,
  ): Promise<AgentOfferDecision> {
    const existing = this.pending.get(offerId);

    // 이미 같은 제안이 떠 있으면 새로 열지 않는다. AGI 가 재시도로 두 번 부를 수 있고,
    // 그때 앞선 대기를 버리면 상담원이 누른 결정이 아무 데도 도착하지 않는다.
    if (existing) {
      return new Promise<AgentOfferDecision>((resolve) => {
        existing.resolvers.add(resolve);
        onAbort?.(() => this.dropWaiter(offerId, resolve));
      });
    }

    const decision = new Promise<AgentOfferDecision>((resolve) => {
      const timer = setTimeout(() => this.settle(offerId, 'TIMEOUT'), request.timeoutSeconds * 1000);
      this.pending.set(offerId, { resolvers: new Set([resolve]), timer });
      onAbort?.(() => this.dropWaiter(offerId, resolve));
    });

    return this.eventBus
      .publish(AGENT_OFFER_EVENT, {
        offerId,
        linkedid: request.linkedid,
        extension: request.extension,
        caller: request.caller ?? null,
        timeoutSeconds: request.timeoutSeconds,
      }, request.tenantId)
      .then(() => decision);
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
   * 기다리던 연결 하나가 끊겼다. 그 하나만 놓아주고, 아직 기다리는 쪽이 있으면 제안은 살려 둔다.
   *
   * 마지막 하나까지 끊겼을 때만 제안을 닫는 이유는 AGI 재시도 때문이다. 재시도가 같은 제안을
   * 넘겨받은 뒤 앞선 연결이 끊기는데, 그걸로 제안을 닫으면 지금 기다리는 재시도까지 같이 죽는다.
   *
   * 정상 응답 뒤에도 연결은 닫힌다. 그땐 `settle` 이 이미 pending 을 지웠으므로 걸리는 게 없다 —
   * 안 그러면 이미 수락된 제안을 한 번 더 닫아 다음 통화의 같은 제안을 엉뚱하게 내린다.
   */
  private dropWaiter(offerId: string, resolve: OfferResolver) {
    const offer = this.pending.get(offerId);
    if (!offer?.resolvers.delete(resolve)) return;

    resolve('ABANDONED');
    if (offer.resolvers.size === 0) this.settle(offerId, 'ABANDONED');
  }

  private settle(offerId: string, decision: AgentOfferDecision) {
    const offer = this.pending.get(offerId);
    if (!offer) return;

    // 결정은 자기 노드에도 되돌아온다. 먼저 지우고 풀어야 두 번 처리되지 않는다.
    this.pending.delete(offerId);
    clearTimeout(offer.timer);
    for (const resolve of offer.resolvers) resolve(decision);
  }
}
