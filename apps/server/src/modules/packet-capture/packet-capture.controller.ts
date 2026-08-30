import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { PACKET_CAPTURE_MENU_KEY } from './packet-capture.constants';
import { PacketCaptureService } from './packet-capture.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { StartCaptureDto } from './dto/start-capture.dto';
import { UpdatePacketCaptureSettingsDto } from './dto/update-packet-capture-settings.dto';

// calls.controller.ts 의 동명 헬퍼와 같은 규칙을 쓴다. 그쪽은 모듈 로컬 함수라 재사용할 수 없다.
function buildDownloadDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\w.\-() ]+/g, '_') || 'capture.pcap';
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

function auditContext(req: any) {
  return {
    agentId: req.user?.sub ?? null,
    userRole: req.user?.role ?? null,
    clientIp: getClientIp(req),
    userAgent: typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

@ApiTags('packet-capture')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/packet-captures')
// 패킷 캡처는 통화 제어가 아니고, 시작/중지까지 모두 DB 행(작업+감사)을 남긴다.
// 쓰기 저하 모드에서는 어차피 실패하므로 가드에서 명확히 끊는다.
// GET(조회·다운로드)은 WriteAvailabilityGuard 를 그대로 통과한다.
@RequiresWriteAvailability('general')
export class PacketCaptureController {
  constructor(
    private readonly packetCapture: PacketCaptureService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get('settings')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '패킷 캡처 설정 조회', description: '토글 상태와 현재 캡처 가능 여부를 함께 준다.' })
  async getSettings(@Req() req: any) {
    await this.assert(req, 'view');
    return this.packetCapture.getSettings(req.user.tenantId);
  }

  @Patch('settings')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '패킷 캡처 온/오프' })
  async updateSettings(@Req() req: any, @Body() dto: UpdatePacketCaptureSettingsDto) {
    await this.assert(req, 'operate');
    return this.packetCapture.updateSettings(req.user.tenantId, dto.enabled);
  }

  @Get()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '캡처 작업 목록' })
  async list(@Req() req: any, @Query('limit') limit?: string) {
    await this.assert(req, 'view');
    return this.packetCapture.listJobs(req.user.tenantId, limit ? Number(limit) : undefined);
  }

  @Post()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '시한부 캡처 시작', description: '지정한 시간이 지나면 dumpcap 이 스스로 멈춘다.' })
  async start(@Req() req: any, @Body() dto: StartCaptureDto) {
    await this.assert(req, 'operate');
    return this.packetCapture.startCapture(req.user.tenantId, dto, auditContext(req));
  }

  @Post(':packetCaptureJobId/stop')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '캡처 조기 종료' })
  async stop(@Req() req: any, @Param('packetCaptureJobId') packetCaptureJobId: string) {
    await this.assert(req, 'operate');
    return this.packetCapture.stopCapture(req.user.tenantId, packetCaptureJobId, auditContext(req));
  }

  /**
   * pcap 다운로드. 통화 음성(RTP)이 담기므로 export 권한을 따로 요구한다.
   * 기본값은 모든 역할에서 false 이며, 관리자가 `설정 > 권한` 에서 명시적으로 켜야 한다.
   */
  @Get(':packetCaptureJobId/download')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '캡처 파일 다운로드' })
  async download(
    @Req() req: any,
    @Param('packetCaptureJobId') packetCaptureJobId: string,
    @Res() res: Response,
  ) {
    await this.assert(req, 'export');

    const payload = await this.packetCapture.openDownload(
      req.user.tenantId,
      packetCaptureJobId,
      auditContext(req),
    );

    res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
    res.setHeader('Content-Disposition', buildDownloadDisposition(payload.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    payload.stream.pipe(res);
  }

  private assert(req: any, action: 'view' | 'operate' | 'export') {
    return this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      PACKET_CAPTURE_MENU_KEY,
      action,
      req.user.sub,
    );
  }
}
