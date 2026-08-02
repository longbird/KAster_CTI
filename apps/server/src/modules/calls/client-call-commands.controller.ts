import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandAckResponseDto } from '../../common/dto/command-ack-response.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CallsService } from './calls.service';
import { ClientOriginateCommandDto } from './dto/client-originate-command.dto';

function getCommandActor(req: any) {
  return {
    agentId: req.user.sub,
    extension: req.user.extension,
    role: req.user.role,
  };
}

@ApiTags('client-call-commands')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('client/call-commands')
export class ClientCallCommandsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('originate')
  @ApiOperation({
    summary: '상담원 클라이언트 전용 외부 발신 명령',
    description:
      '상담원 클라이언트가 별도 명령 프로토콜로 외부 발신을 요청한다. 상담원 내선은 요청 본문이 아니라 인증 세션과 DB 상담원 정보에서 파생한다. 응답은 요청 접수만 의미하며 실제 통화 성공은 후속 PBX 이벤트로 판정한다.',
  })
  @ApiHeader({ name: 'x-client-protocol', required: true })
  @ApiHeader({ name: 'x-command-timestamp', required: true })
  @ApiHeader({ name: 'x-command-nonce', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({ type: CommandAckResponseDto })
  originate(
    @Req() req: any,
    @Body() dto: ClientOriginateCommandDto,
    @Headers('x-client-protocol') protocol?: string,
    @Headers('x-command-timestamp') timestamp?: string,
    @Headers('x-command-nonce') nonce?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.callsService.originateFromClientProtocol(
      req.user.tenantId,
      dto,
      {
        protocol,
        timestamp,
        nonce,
      },
      {
        correlationId,
        idempotencyKey,
      },
      getCommandActor(req),
    );
  }
}
