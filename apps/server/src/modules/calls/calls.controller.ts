import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { createReadStream, promises as fs } from 'node:fs';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { CommandAckResponseDto } from '../../common/dto/command-ack-response.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CallsService } from './calls.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { InternalOriginateDto } from './dto/internal-originate.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';
import { MuteCallDto } from './dto/mute-call.dto';
import { OriginateDto } from './dto/originate.dto';
import { TransferDto } from './dto/transfer.dto';

function buildDownloadDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\w.\-() ]+/g, '_') || 'recording';
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function getClientIp(req: any) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

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
  @ApiOperation({ summary: '활성 콜 목록', description: 'sessionStatus 가 ENDED 가 아닌 테넌트 통화 세션. 기본 최근 500건, 최대 1000건. agentName·waitSeconds 포함.' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '반환 건수. 기본 500, 최대 1000' })
  @ApiOkResponse({ type: ApiResponseDto })
  async getActiveCalls(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'view',
        req.user.sub,
      );
    }
    return this.callsService.getActiveCalls(req.user.tenantId, branchId, limit ? Number(limit) : undefined);
  }

  @Get('history')
  @ApiOperation({ summary: '통화내역 조회 (CDR)', description: '날짜/상담원/상태 필터, 최근 500건' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'agentId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'direction', required: false, enum: ['inbound', 'outbound', 'internal'] })
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
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'branchId', required: false })
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

  @Get('recordings/:recordingId/stream')
  @ApiOperation({ summary: '녹취 파일 스트리밍', description: '브라우저 재생용 인증 스트리밍. Range 요청을 지원한다.' })
  async streamRecording(@Req() req: any, @Param('recordingId') recordingId: string, @Res() res: Response) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertMenuAction(
        req.user.tenantId,
        req.user.role,
        'reports/recordings',
        'view',
        req.user.sub,
      );
    }

    const recording = await this.callsService.getRecordingFile(req.user.tenantId, recordingId);
    const stat = await fs.stat(recording.filePath).catch(() => null);
    if (!stat?.isFile()) {
      throw new NotFoundException('Recording file not found');
    }

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

    res.setHeader('Content-Type', recording.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (!rangeHeader) {
      res.setHeader('Content-Length', stat.size);
      createReadStream(recording.filePath).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    const requestedEnd = match?.[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
    const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, stat.size - 1) : stat.size - 1;

    if (!match || !Number.isFinite(start) || start < 0 || start > end || start >= stat.size) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    createReadStream(recording.filePath, { start, end }).pipe(res);
  }

  @Get('recordings/:recordingId/download')
  @ApiOperation({ summary: '녹취 파일 다운로드', description: '인증된 사용자만 녹취 파일을 attachment 로 내려받는다.' })
  async downloadRecording(@Req() req: any, @Param('recordingId') recordingId: string, @Res() res: Response) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertMenuAction(
        req.user.tenantId,
        req.user.role,
        'reports/recordings',
        'export',
        req.user.sub,
      );
    }

    const recording = await this.callsService.getRecordingFile(req.user.tenantId, recordingId);
    const stat = await fs.stat(recording.filePath).catch(() => null);
    if (!stat?.isFile()) {
      throw new NotFoundException('Recording file not found');
    }

    await this.callsService.recordRecordingDownloadAudit(req.user.tenantId, recording, {
      agentId: req.user.sub,
      userRole: req.user.role,
      clientIp: getClientIp(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });

    res.setHeader('Content-Type', recording.contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', buildDownloadDisposition(recording.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    createReadStream(recording.filePath).pipe(res);
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
      'AMI Action:Originate 를 상담원 내선으로 전송. 실제 성공 판정은 후속 DialBegin/DialEnd/BridgeEnter/Newstate 이벤트로 SessionEngine 이 담당하며, 이 응답은 즉시 accepted:true 를 반환한다 (conv 40). Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  originate(
    @Req() req: any,
    @Body() dto: OriginateDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      return this.menuPermissionService
        .assertAnyMenuAction(
          req.user.tenantId,
          req.user.role,
          ['dashboard', 'live-calls'],
          'operate',
          req.user.sub,
        )
        .then(() => this.callsService.originate(req.user.tenantId, dto, { correlationId, idempotencyKey }));
    }
    return this.callsService.originate(req.user.tenantId, dto, { correlationId, idempotencyKey });
  }

  @Post('originate/internal')
  @ApiOperation({
    summary: '상담원 간 내선 Click-to-Call 요청',
    description:
      '현재 로그인한 상담원 내선을 먼저 울린 뒤, 응답하면 targetExtension 으로 내선 연결을 시도한다. 상대 상담원이 응답하면 통화가 성립한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  originateInternal(
    @Req() req: any,
    @Body() dto: InternalOriginateDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      return this.menuPermissionService
        .assertAnyMenuAction(
          req.user.tenantId,
          req.user.role,
          ['dashboard', 'live-calls'],
          'operate',
          req.user.sub,
        )
        .then(() => this.callsService.originateInternal(req.user.tenantId, {
          agentId: req.user.sub,
          agentExtension: req.user.extension,
          targetExtension: dto.targetExtension,
          targetAgentId: dto.targetAgentId,
        }, { correlationId, idempotencyKey }));
    }
    return this.callsService.originateInternal(req.user.tenantId, {
      agentId: req.user.sub,
      agentExtension: req.user.extension,
      targetExtension: dto.targetExtension,
      targetAgentId: dto.targetAgentId,
    }, { correlationId, idempotencyKey });
  }

  @Post(':callId/transfer')
  @ApiOperation({
    summary: '호 전환 (blind / attended)',
    description:
      'legType=agent && !endedAt 인 상담원 leg 의 channelName 을 찾아 AMI Action:Redirect 로 transfer-target context 로 점프 (infra/asterisk/extensions_transfer.conf). BlindTransfer/AttendedTransfer AMI 이벤트 수신 시 TransferDetectorService 가 COMPLETED 로 확정. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async transfer(
    @Req() req: any,
    @Param('callId') callId: string,
    @Body() dto: TransferDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.transfer(req.user.tenantId, callId, dto, { correlationId, idempotencyKey });
  }

  @Post(':callId/transfer/attended/cancel')
  @ApiOperation({
    summary: '상담 전환 취소',
    description:
      '열린 attended transfer candidate 를 FAILED/CANCELED 로 닫고, AMI CancelAtxfer 로 취소를 요청한다. 실제 취소 동작은 Asterisk features.conf 의 atxferabort 설정에 의존한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async cancelAttendedTransfer(
    @Req() req: any,
    @Param('callId') callId: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.cancelAttendedTransfer(req.user.tenantId, callId, { correlationId, idempotencyKey });
  }

  @Post(':callId/transfer/attended/complete')
  @ApiOperation({
    summary: '상담 전환 완료',
    description:
      'Asterisk features.conf 의 atxfercomplete 기능 코드를 AMI PlayDTMF 로 제어 채널에 주입한다. 실제 완료 판정은 후속 AttendedTransfer 이벤트 수신 시 TransferDetectorService 가 COMPLETED 로 확정한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async completeAttendedTransfer(
    @Req() req: any,
    @Param('callId') callId: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.completeAttendedTransfer(req.user.tenantId, callId, { correlationId, idempotencyKey });
  }

  @Post(':callId/pickup')
  @ApiOperation({
    summary: '대기 콜 당겨받기 요청',
    description:
      '큐 대기 중 고객 leg 를 현재 로그인한 상담원 내선으로 Redirect 한다. 실제 연결 성공 판정은 후속 Dial/Bridge 이벤트로 SessionEngine 이 담당하며, 이 응답은 즉시 accepted:true 를 반환한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async pickup(
    @Param('callId') callId: string,
    @Req() req: any,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.pickup(req.user.tenantId, callId, {
      agentId: req.user.sub,
      extension: req.user.extension,
    }, { correlationId, idempotencyKey });
  }

  @Post(':callId/mute')
  @ApiOperation({
    summary: '통화 음소거/해제 요청',
    description:
      '상담원 leg 에 AMI MuteAudio 를 전송한다. 현재 구조에서는 후속 mute 상태 이벤트를 별도로 동기화하지 않으므로, UI는 요청 성공 기준으로 상태를 갱신한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async mute(
    @Req() req: any,
    @Param('callId') callId: string,
    @Body() dto: MuteCallDto,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.mute(req.user.tenantId, callId, dto, { correlationId, idempotencyKey });
  }

  @Post(':callId/hold')
  @ApiOperation({
    summary: '통화 hold 요청',
    description:
      '표준 AMI hold 액션이 없으므로, 운영자가 검증한 feature code 가 설정된 경우에만 AMI PlayDTMF 로 hold 요청을 전달한다. 실제 상태는 후속 Hold/Unhold 이벤트를 신뢰한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async hold(
    @Req() req: any,
    @Param('callId') callId: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hold(req.user.tenantId, callId, 'hold', { correlationId, idempotencyKey });
  }

  @Post(':callId/resume')
  @ApiOperation({
    summary: '통화 resume 요청',
    description:
      '표준 AMI resume 액션이 없으므로, 운영자가 검증한 feature code 가 설정된 경우에만 AMI PlayDTMF 로 resume 요청을 전달한다. 실제 상태는 후속 Hold/Unhold 이벤트를 신뢰한다. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async resume(
    @Req() req: any,
    @Param('callId') callId: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hold(req.user.tenantId, callId, 'resume', { correlationId, idempotencyKey });
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
    description: '상담원 leg 에 AMI Action:Hangup 을 쏜다. 세션 상태는 후속 Hangup 이벤트로 SessionEngine 이 ENDED 로 마감. Clients may send x-correlation-id and idempotency-key headers; the response echoes correlationId and requestedAt.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CommandAckResponseDto })
  async hangup(
    @Req() req: any,
    @Param('callId') callId: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user.role === 'supervisor' || req.user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        req.user.tenantId,
        req.user.role,
        ['dashboard', 'live-calls'],
        'operate',
        req.user.sub,
      );
    }
    return this.callsService.hangup(req.user.tenantId, callId, { correlationId, idempotencyKey });
  }
}
