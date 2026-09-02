import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArsHttpLookupService } from './ars-http-lookup.service';
import { InternalArsLookupDto } from './dto/internal-lookup.dto';

/**
 * AGI 가 부르는 내부 조회 엔드포인트.
 *
 * JWT 가 아니라 공유 시크릿을 쓴다 — 부르는 쪽이 사람이 아니라 같은 호스트의 dialplan 이다
 * (기존 수신거부·Smart ARS 훅과 같은 방식).
 *
 * **던지지 않는다.** 실패도 `{ status: 'ERROR' }` 로 돌려준다 — AGI 가 그것을 실패 갈래로
 * 바꾸므로, 여기서 5xx 를 내면 통화 처리가 아니라 스크립트 예외로 새어 나간다.
 */
@ApiExcludeController()
@Controller('internal/ars-http-lookup')
export class ArsHttpLookupInternalController {
  constructor(
    private readonly lookup: ArsHttpLookupService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async run(
    @Headers('x-kaster-internal-secret') secretHeader: string | undefined,
    @Body() dto: InternalArsLookupDto,
  ) {
    this.assertInternalSecret(secretHeader);

    return this.lookup.lookup({
      tenantId: dto.tenantId,
      endpointId: dto.endpointId,
      vars: {
        caller: dto.caller ?? '',
        collected: dto.collected ?? '',
        entryDid: dto.entryDid ?? '',
        linkedid: dto.linkedid ?? '',
      },
    });
  }

  private assertInternalSecret(secretHeader?: string) {
    const configuredSecret = this.config.get<string>('KASTER_INTERNAL_SECRET')?.trim();

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        'KASTER_INTERNAL_SECRET must be configured for ARS external lookups',
      );
    }
    if (secretHeader?.trim() !== configuredSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }
  }
}
