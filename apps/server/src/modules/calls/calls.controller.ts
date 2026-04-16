import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CreateMemoDto } from './dto/create-memo.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';
import { CallsService } from './calls.service';

@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('active')
  @ApiOperation({ summary: '활성 콜 목록', description: 'sessionStatus 가 ENDED 가 아닌 테넌트 통화 세션 (최근 100건). agentName·waitSeconds 포함.' })
  @ApiOkResponse({ type: ApiResponseDto })
  getActiveCalls(@Req() req: any) {
    return this.callsService.getActiveCalls(req.user.tenantId);
  }

  @Get(':callId')
  @ApiOperation({ summary: '콜 상세', description: '콜 세션 + callLegs + callMemos + callTransfers + callRecordings + queueEvents' })
  @ApiOkResponse({ type: ApiResponseDto })
  getCallDetail(@Param('callId') callId: string) {
    return this.callsService.getCallDetail(callId);
  }

  @Post('originate')
  @ApiOperation({
    summary: 'Click-to-Call 발신 요청',
    description:
      'AMI Action:Originate 를 상담원 내선으로 전송. 실제 성공 판정은 후속 DialBegin/DialEnd/BridgeEnter/Newstate 이벤트로 SessionEngine 이 담당하며, 이 응답은 즉시 accepted:true 를 반환한다 (conv 40).',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  originate(@Body() dto: OriginateDto) {
    return this.callsService.originate(dto);
  }

  @Post(':callId/transfer')
  @ApiOperation({
    summary: '호 전환 (blind / attended)',
    description:
      'legType=agent && !endedAt 인 상담원 leg 의 channelName 을 찾아 AMI Action:Redirect 로 transfer-target context 로 점프 (infra/asterisk/extensions_transfer.conf). BlindTransfer/AttendedTransfer AMI 이벤트 수신 시 TransferDetectorService 가 COMPLETED 로 확정.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  transfer(@Param('callId') callId: string, @Body() dto: TransferDto) {
    return this.callsService.transfer(callId, dto);
  }

  @Post(':callId/memo')
  @ApiOperation({ summary: '상담 메모 / 후처리 코드 저장' })
  @ApiOkResponse({ type: ApiResponseDto })
  memo(@Param('callId') callId: string, @Body() dto: CreateMemoDto) {
    return this.callsService.saveMemo(callId, dto);
  }

  @Post(':callId/hangup')
  @ApiOperation({
    summary: '통화 종료 요청',
    description: '상담원 leg 에 AMI Action:Hangup 을 쏜다. 세션 상태는 후속 Hangup 이벤트로 SessionEngine 이 ENDED 로 마감.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  hangup(@Param('callId') callId: string) {
    return this.callsService.hangup(callId);
  }
}
