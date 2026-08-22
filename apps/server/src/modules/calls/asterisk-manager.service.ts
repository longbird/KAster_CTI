import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { queueMemberInterface } from '../../common/queue-member.util';

// conv 26 의 AsteriskManagerService 추상화 + 현재 레포의 실제 sendAction 구현.
// CallsService 는 AMI 프로토콜 디테일을 몰라야 하고, 여기서 Action 이름/필드
// 조합만 담당한다. 실제 성공/실패는 후속 AMI 이벤트로 SessionEngine 이 판정.
@Injectable()
export class AsteriskManagerService {
  private readonly logger = new Logger(AsteriskManagerService.name);

  constructor(
    @Inject(forwardRef(() => AmiConnectionService))
    private readonly ami: AmiConnectionService,
  ) {}

  /**
   * 큐 배정 일시정지. 내선이 없으면 아무것도 하지 않는다 —
   * 큐에 없는 상담원을 정지시키려 하면 AMI 가 오류를 돌려준다.
   */
  setQueuePaused(extension: string | null | undefined, paused: boolean, reason?: string | null): void {
    const trimmed = extension?.trim();
    if (!trimmed) return;

    // queues.conf 에 렌더된 멤버 문자열과 같아야 한다. 다르면 AMI 가 멤버를 못 찾고
    // pause 가 조용히 실패하는데, 화면에는 이석으로 보여 전화가 계속 온다.
    const memberInterface = queueMemberInterface(trimmed);

    this.ami.sendAction({
      Action: 'QueuePause',
      Interface: memberInterface,
      Paused: paused ? 'true' : 'false',
      ...(reason ? { Reason: reason } : {}),
    });
    this.logger.log(`Queue pause ${paused} for ${memberInterface}`);
  }

  originate(params: {
    agentExtension: string;
    phoneNumber: string;
    context?: string;
    callerId?: string;
    actionId?: string;
  }): { channel: string; actionId?: string } {
    const channel = `PJSIP/${params.agentExtension}`;
    const outboundContextBase = process.env.ASTERISK_OUTBOUND_CONTEXT || 'outbound-main';
    const context =
      params.context
      || `${outboundContextBase}-${params.agentExtension}`;
    this.ami.sendAction({
      Action: 'Originate',
      ...(params.actionId ? { ActionID: params.actionId } : {}),
      Channel: channel,
      Context: context,
      Exten: params.phoneNumber,
      Priority: 1,
      CallerID: params.callerId || params.agentExtension,
      Async: 'true',
    });
    this.logger.log(`Originate requested: ${channel} -> ${params.phoneNumber}@${context}`);
    return { channel, actionId: params.actionId };
  }

  originateInternal(params: {
    agentExtension: string;
    targetExtension: string;
    context?: string;
    actionId?: string;
  }): { channel: string; actionId?: string } {
    const channel = `PJSIP/${params.agentExtension}`;
    this.ami.sendAction({
      Action: 'Originate',
      ...(params.actionId ? { ActionID: params.actionId } : {}),
      Channel: channel,
      Context: params.context || 'transfer-target',
      Exten: params.targetExtension,
      Priority: 1,
      CallerID: params.agentExtension,
      Async: 'true',
    });
    this.logger.log(`Internal originate requested: ${channel} -> ${params.targetExtension}`);
    return { channel, actionId: params.actionId };
  }

  blindTransfer(channel: string, exten: string, context = 'transfer-target'): void {
    this.ami.sendAction({
      Action: 'Redirect',
      Channel: channel,
      Exten: exten,
      Context: context,
      Priority: 1,
    });
    this.logger.log(`Blind transfer: ${channel} -> ${exten}@${context}`);
  }

  // conv 32 attended transfer 상태머신은 별도 서브모듈 (transfer-detector) 에서
  // 완료 판정을 한다. consult 시작은 AMI Atxfer 로 요청한다.
  attendedTransfer(channel: string, exten: string, context = 'transfer-target'): void {
    this.ami.sendAction({
      Action: 'Atxfer',
      Channel: channel,
      Exten: exten,
      Context: context,
    });
    this.logger.log(`Attended transfer (consult start): ${channel} -> ${exten}@${context}`);
  }

  cancelAttendedTransfer(channel: string): void {
    this.ami.sendAction({
      Action: 'CancelAtxfer',
      Channel: channel,
    });
    this.logger.log(`Attended transfer cancel requested: ${channel}`);
  }

  completeAttendedTransfer(channel: string, featureCode?: string): void {
    const digits = (featureCode ?? process.env.ASTERISK_ATXFER_COMPLETE_CODE ?? '*2')
      .trim()
      .replace(/\s+/g, '');
    this.sendFeatureCode(channel, digits);
    this.logger.log(`Attended transfer complete requested: ${channel} -> ${digits}`);
  }

  pickup(channel: string, exten: string, context = 'transfer-target'): void {
    this.ami.sendAction({
      Action: 'Redirect',
      Channel: channel,
      Exten: exten,
      Context: context,
      Priority: 1,
    });
    this.logger.log(`Pickup requested: ${channel} -> ${exten}@${context}`);
  }

  muteAudio(
    channel: string,
    state: 'on' | 'off' = 'on',
    direction: 'in' | 'out' | 'all' = 'all',
  ): void {
    this.ami.sendAction({
      Action: 'MuteAudio',
      Channel: channel,
      Direction: direction,
      State: state,
    });
    this.logger.log(`MuteAudio requested: ${channel} state=${state} direction=${direction}`);
  }

  sendFeatureCode(channel: string, featureCode: string): void {
    const digits = featureCode.trim().replace(/\s+/g, '');
    if (!digits) {
      throw new Error('Feature code is empty');
    }

    this.playDtmf(channel, digits);
  }

  /**
   * 상담원이 통화 중에 누른 키를 상대(ARS 등)에게 그대로 보낸다.
   *
   * sendFeatureCode 와 나눠 둔 이유: 기능코드는 PBX 가 가로채는 제어 신호이고
   * 이쪽은 상대 장비로 흘러가는 사용자 입력이다. 정규화 규칙(기능코드는 공백을
   * 걷어내지만 키 입력의 공백은 오입력이라 거절해야 한다)과 로깅 정책(누른 값이
   * 인증번호일 수 있어 자릿값을 남기지 않는다)이 서로 다르다. 한 함수로 묶으면
   * 한쪽 요구로 고친 것이 다른 쪽을 조용히 바꾼다.
   */
  sendDtmf(channel: string, digits: string): void {
    if (!digits) {
      throw new Error('DTMF digits are empty');
    }

    this.playDtmf(channel, digits);
    this.logger.log(`DTMF requested: ${channel} (${digits.length} digits)`);
  }

  /**
   * PlayDTMF 로 나가는 마지막 지점. 값이 AMI 프로토콜 필드에 그대로 실리므로
   * 여기서 문자를 검증한다. HTTP DTO 검증은 REST 경로만 덮지만 기능코드는
   * 관리자가 DB(featureCodes)와 env 로 넣는 값이라 그 경로를 지나지 않는다.
   * 허용 집합은 DTMF 규격 그대로(0-9 * # A-D)라 개행·공백·구분자가 전부 걸린다.
   */
  private playDtmf(channel: string, digits: string): void {
    // 앞자리를 보낸 뒤에 던지면 상대 장비에 반쪽짜리 입력이 남는다. 먼저 전부 검사한다.
    if (!/^[0-9*#A-D]+$/.test(digits)) {
      throw new Error('DTMF digits contain characters outside 0-9 * # A-D');
    }

    for (const digit of digits) {
      this.ami.sendAction({
        Action: 'PlayDTMF',
        Channel: channel,
        Digit: digit,
        Receive: 'true',
      });
    }
  }

  hangup(channel: string): void {
    this.ami.sendAction({ Action: 'Hangup', Channel: channel });
    this.logger.log(`Hangup: ${channel}`);
  }
}
