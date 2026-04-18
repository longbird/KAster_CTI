import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AmiConnectionService } from '../ami/ami-connection.service';

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

  originate(params: {
    agentExtension: string;
    phoneNumber: string;
    context?: string;
    callerId?: string;
    actionId?: string;
  }): { channel: string; actionId?: string } {
    const channel = `PJSIP/${params.agentExtension}`;
    this.ami.sendAction({
      Action: 'Originate',
      ...(params.actionId ? { ActionID: params.actionId } : {}),
      Channel: channel,
      Context: params.context || process.env.ASTERISK_OUTBOUND_CONTEXT || 'outbound-main',
      Exten: params.phoneNumber,
      Priority: 1,
      CallerID: params.callerId || params.agentExtension,
      Async: 'true',
    });
    this.logger.log(`Originate requested: ${channel} -> ${params.phoneNumber}`);
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
