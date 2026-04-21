import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CallsService } from './calls.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { InternalOriginateDto } from './dto/internal-originate.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';
import { MuteCallDto } from './dto/mute-call.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';

@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: '활성 콜 목록', description: 'sessionStatus 가 ENDED 가 아닌 테넌트 통화 세션 (최근 100건). agentName·waitSeconds 포함.' })
  @ApiOkResponse({ type: ApiResponseDto })
  async getActiveCalls(@Req() req: any, @Query('branchId') branchId?: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'view',
        req.user.sub,
      );
    }
    return this.callsService.getActiveCalls(req.user.tenantId, branchId);
  }

  @Get('history')
  @ApiOperation({ summary: '통화내역 조회 (CDR)', description: '날짜/상담원/상태 필터, 최근 500건' })
  @ApiOkResponse({ type: ApiResponseDto })
  async listHistory(@Req() req: any, @Query() q: ListCallsQueryDto) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertMenuAction(
        req.user.tenantId,
        req.user.role,
        'reports/calls',
        'view',
        req.user.sub,
      );
    }
    return this.callsService.listHistory(req.user.tenantId, q);
  }

  @Get('recordings/list')
  @ApiOperation({ summary: '녹취 목록 조회', description: '날짜 필터, 최근 200건' })
  @ApiOkResponse({ type: ApiResponseDto })
  async listRecordings(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertMenuAction(
        req.user.tenantId,
        req.user.role,
        'reports/recordings',
        'view',
        req.user.sub,
      );
    }
    return this.callsService.listRecordings(req.user.tenantId, { from, to, branchId });
  }

  @Get(':callId')
  @ApiOperation({ summary: '콜 상세', description: '콜 세션 + callLegs + callMemos + callTransfers + callRecordings + queueEvents' })
  @ApiOkResponse({ type: ApiResponseDto })
  async getCallDetail(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls', 'reports/calls', 'reports/missed', 'reports/recordings'],
        'view',
        req.user.sub,
      );
    }
    return this.callsService.getCallDetail(req.user.tenantId, callId);
  }

  @Post('originate')
  @ApiOperation({
    summary: 'Click-to-Call 발신 요청',
    description:
      'AMI Action:Originate 를 상담원 내선으로 전송. 실제 성공 판정은 후속 DialBegin/DialEnd/BridgeEnter/Newstate 이벤트로 SessionEngine 이 담당하며, 이 응답은 즉시 accepted:true 를 반환한다 (conv 40).',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  originate(@Req() req: any, @Body() dto: OriginateDto) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      return this.menuPermissionService
        .assertAnyMenuAction(
          req.user.tenantId,
          req.user.role,
          ['dashboard', 'live-calls'],
          'operate',
          req.user.sub,
        )
        .then(() => this.callsService.originate(req.user.tenantId, dto));
    }
    return this.callsService.originate(req.user.tenantId, dto);
  }

  @Post('originate/internal')
  @ApiOperation({
    summary: '상담원 간 내선 Click-to-Call 요청',
    description:
      '현재 로그인한 상담원 내선을 먼저 울린 뒤, 응답하면 targetExtension 으로 내선 연결을 시도한다. 상대 상담원이 응답하면 통화가 성립한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  originateInternal(@Req() req: any, @Body() dto: InternalOriginateDto) {
    return this.callsService.originateInternal(req.user.tenantId, {
      agentId: req.user.sub,
      agentExtension: req.user.extension,
      targetExtension: dto.targetExtension,
      targetAgentId: dto.targetAgentId,
    });
  }

  @Post(':callId/transfer')
  @ApiOperation({
    summary: '호 전환 (blind / attended)',
    description:
      'legType=agent && !endedAt 인 상담원 leg 의 channelName 을 찾아 AMI Action:Redirect 로 transfer-target context 로 점프 (infra/asterisk/extensions_transfer.conf). BlindTransfer/AttendedTransfer AMI 이벤트 수신 시 TransferDetectorService 가 COMPLETED 로 확정.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async transfer(@Req() req: any, @Param('callId') callId: string, @Body() dto: TransferDto) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.transfer(req.user.tenantId, callId, dto);
  }

  @Post(':callId/transfer/attended/cancel')
  @ApiOperation({
    summary: '상담 전환 취소',
    description:
      '열린 attended transfer candidate 를 FAILED/CANCELED 로 닫고, AMI CancelAtxfer 로 취소를 요청한다. 실제 취소 동작은 Asterisk features.conf 의 atxferabort 설정에 의존한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async cancelAttendedTransfer(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.cancelAttendedTransfer(req.user.tenantId, callId);
  }

  @Post(':callId/transfer/attended/complete')
  @ApiOperation({
    summary: '상담 전환 완료',
    description:
      'Asterisk features.conf 의 atxfercomplete 기능 코드를 AMI PlayDTMF 로 제어 채널에 주입한다. 실제 완료 판정은 후속 AttendedTransfer 이벤트 수신 시 TransferDetectorService 가 COMPLETED 로 확정한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async completeAttendedTransfer(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.completeAttendedTransfer(req.user.tenantId, callId);
  }

  @Post(':callId/pickup')
  @ApiOperation({
    summary: '대기 콜 당겨받기 요청',
    description:
      '큐 대기 중 고객 leg 를 현재 로그인한 상담원 내선으로 Redirect 한다. 실제 연결 성공 판정은 후속 Dial/Bridge 이벤트로 SessionEngine 이 담당하며, 이 응답은 즉시 accepted:true 를 반환한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async pickup(@Param('callId') callId: string, @Req() req: any) {
    return this.callsService.pickup(req.user.tenantId, callId, {
      agentId: req.user.sub,
      extension: req.user.extension,
    });
  }

  @Post(':callId/mute')
  @ApiOperation({
    summary: '통화 음소거/해제 요청',
    description:
      '상담원 leg 에 AMI MuteAudio 를 전송한다. 현재 구조에서는 후속 mute 상태 이벤트를 별도로 동기화하지 않으므로, UI는 요청 성공 기준으로 상태를 갱신한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async mute(@Req() req: any, @Param('callId') callId: string, @Body() dto: MuteCallDto) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.mute(req.user.tenantId, callId, dto);
  }

  @Post(':callId/hold')
  @ApiOperation({
    summary: '통화 hold 요청',
    description:
      '표준 AMI hold 액션이 없으므로, 운영자가 검증한 feature code 가 설정된 경우에만 AMI PlayDTMF 로 hold 요청을 전달한다. 실제 상태는 후속 Hold/Unhold 이벤트를 신뢰한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async hold(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hold(req.user.tenantId, callId, 'hold');
  }

  @Post(':callId/resume')
  @ApiOperation({
    summary: '통화 resume 요청',
    description:
      '표준 AMI resume 액션이 없으므로, 운영자가 검증한 feature code 가 설정된 경우에만 AMI PlayDTMF 로 resume 요청을 전달한다. 실제 상태는 후속 Hold/Unhold 이벤트를 신뢰한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async resume(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hold(req.user.tenantId, callId, 'resume');
  }

  @Post(':callId/memo')
  @ApiOperation({ summary: '상담 메모 / 후처리 코드 저장' })
  @ApiOkResponse({ type: ApiResponseDto })
  async memo(@Req() req: any, @Param('callId') callId: string, @Body() dto: CreateMemoDto) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.saveMemo(req.user.tenantId, callId, dto);
  }

  @Post(':callId/hangup')
  @ApiOperation({
    summary: '통화 종료 요청',
    description: '상담원 leg 에 AMI Action:Hangup 을 쏜다. 세션 상태는 후속 Hangup 이벤트로 SessionEngine 이 ENDED 로 마감.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  async hangup(@Req() req: any, @Param('callId') callId: string) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hangup(req.user.tenantId, callId);
  }
}
