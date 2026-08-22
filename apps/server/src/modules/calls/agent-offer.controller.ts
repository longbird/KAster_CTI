import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AgentOfferService } from './agent-offer.service';
import { AgentOfferDecisionDto } from './dto/agent-offer-decision.dto';
import { AgentOfferWaitDto } from './dto/agent-offer-wait.dto';

/**
 * PBX 의 AGI 가 상담원의 결정을 기다리는 곳.
 *
 * 사람이 아니라 다이얼플랜이 부르므로 JWT 가 아니라 공유 시크릿을 쓴다.
 * `AsteriskConfigInternalController` 와 같은 방식이다.
 */
@ApiTags('internal-agent-offer')
@Controller('internal/agent-offer')
export class AgentOfferInternalController {
  constructor(
    private readonly offers: AgentOfferService,
    private readonly config: ConfigService,
  ) {}

  @Post('wait')
  @ApiOperation({ summary: '상담원이 호를 수락/거절할 때까지 기다린다 (PBX AGI 전용)' })
  async wait(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: AgentOfferWaitDto,
    @Req() req: any,
  ) {
    this.assertInternalSecret(secretHeader);

    const decision = await this.offers.waitForDecision(
      {
        tenantId: dto.tenantId ?? DEFAULT_TENANT_ID,
        linkedid: dto.linkedid,
        extension: dto.extension,
        caller: dto.caller ?? null,
        timeoutSeconds: dto.timeoutSeconds,
      },
      // 다른 상담원이 먼저 받으면 PBX 가 진 쪽 Local 채널을 끊는다. 서버에는 이 연결이
      // 끊기는 것만 보이므로, 여기서 안 잡으면 끝난 전화의 수락 버튼이 타임아웃까지 남는다.
      (abandon) => req.on('close', abandon),
    );

    return { decision };
  }

  private assertInternalSecret(secretHeader?: string) {
    const configuredSecret = this.config.get<string>('KASTER_INTERNAL_SECRET')?.trim();

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        'KASTER_INTERNAL_SECRET must be configured for agent offer decisions',
      );
    }

    if (secretHeader?.trim() !== configuredSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }
  }
}

/**
 * AMI 이벤트에 TenantId 가 없을 때 쓰는 값. `AmiEventNormalizerService` 와 같은 폴백이다.
 * 두 곳이 갈리면 제안이 다른 테넌트로 발행되어 상담원 화면에 뜨지 않는다.
 */
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

@ApiTags('client-call-commands')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('client/call-commands/offer')
export class AgentOfferController {
  constructor(private readonly offers: AgentOfferService) {}

  @Post('decision')
  @ApiOperation({ summary: '상담원이 제안받은 호를 수락하거나 거절한다' })
  async decide(@Req() req: any, @Body() dto: AgentOfferDecisionDto) {
    // 제안은 테넌트 전체에 브로드캐스트된다. 내선을 확인하지 않으면 옆자리 상담원이
    // 남의 호를 대신 수락하거나 거절할 수 있다.
    const extension = req.user?.extension?.toString().trim();
    if (!extension || extension !== dto.extension.trim()) {
      throw new ForbiddenException('본인에게 제안된 통화만 응답할 수 있습니다.');
    }

    await this.offers.submitDecision({
      tenantId: req.user.tenantId ?? DEFAULT_TENANT_ID,
      linkedid: dto.linkedid,
      extension: dto.extension,
      decision: dto.decision,
    });

    return { accepted: true };
  }
}
