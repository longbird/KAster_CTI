import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Query,
  Req,
  Res,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync, statSync } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AgentUpdatesService } from './agent-updates.service';
import { DownloadInitDto } from './dto/download-init.dto';
import { ReportUpdateDto } from './dto/report-update.dto';
import { CreateUpdateSessionDto } from './dto/create-update-session.dto';

@ApiTags('agent-updates')
@ApiBearerAuth()
@Controller('agent-updates')
export class AgentUpdatesController {
  constructor(private readonly agentUpdatesService: AgentUpdatesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('session')
  @ApiOperation({
    summary: '업데이트 세션 발급',
    description: '일반 CTI access token 을 updateSessionToken 으로 교환한다. updateSessionToken 은 manifest 와 download-init 호출에만 사용한다.',
  })
  createSession(@Req() req: any, @Body() dto: CreateUpdateSessionDto, @Ip() clientIp?: string) {
    return this.agentUpdatesService.createUpdateSession(req.user, dto, clientIp);
  }

  @Get('manifest')
  @ApiOperation({
    summary: '승인된 데스크톱 앱 manifest 조회',
    description: '콜센터 서버에 승인된 최신 에이전트 데스크톱 버전과 강제 업데이트 정책을 반환한다. Authorization 헤더에는 updateSessionToken 을 보낸다.',
  })
  async getManifest(
    @Headers('authorization') authorization: string | undefined,
    @Query('currentVersion') currentVersion: string,
    @Query('channel') channel = 'stable',
  ) {
    const session = await this.agentUpdatesService.validateUpdateSessionToken(this.extractBearerToken(authorization));

    return this.agentUpdatesService.getManifest({
      tenantId: session.tenantId,
      currentVersion,
      channel,
    });
  }

  @Post('download-init')
  @ApiOperation({
    summary: '업데이트 다운로드 토큰 발급',
    description: 'updateSessionToken 으로 tenant 범위의 승인된 artifact 를 확인한 뒤, artifactId 에 묶인 1회성 downloadToken 을 발급한다.',
  })
  async downloadInit(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: DownloadInitDto,
    @Ip() clientIp?: string,
  ) {
    const session = await this.agentUpdatesService.validateUpdateSessionToken(this.extractBearerToken(authorization));
    return this.agentUpdatesService.initDownload(session, dto, clientIp);
  }

  @Get('artifacts/:artifactId')
  @ApiOperation({
    summary: '업데이트 설치 파일 다운로드',
    description: 'Authorization 헤더의 downloadToken 이 가리키는 artifact 와 요청 artifactId 가 일치할 때만 파일을 내려준다.',
  })
  async downloadArtifact(
    @Param('artifactId') artifactId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const token = this.extractBearerToken(authorization);
    const access = await this.agentUpdatesService.consumeDownloadToken(token);

    if (access.artifactId !== artifactId) {
      throw new UnauthorizedException('Download token is not valid for this artifact');
    }

    const artifact = await this.agentUpdatesService.findArtifact({
      tenantId: access.tenantId,
      artifactId,
    });

    if (!artifact || !existsSync(artifact.filePath)) {
      throw new NotFoundException('Approved desktop artifact not found');
    }

    const stats = statSync(artifact.filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    return createReadStream(artifact.filePath).pipe(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('report')
  @ApiOperation({
    summary: '업데이트 결과 보고',
    description: '다운로드/설치/롤백 상태와 임의 metadata 를 감사 로그로 누적한다. 이 엔드포인트는 일반 CTI access token 을 사용한다.',
  })
  async report(@Req() req: any, @Body() dto: ReportUpdateDto, @Ip() clientIp?: string) {
    await this.agentUpdatesService.recordAudit({
      tenantId: req.user.tenantId,
      agentId: req.user.sub,
      deviceId: dto.deviceId ?? null,
      clientIp: clientIp ?? null,
      currentAppVersion: dto.currentAppVersion ?? null,
      targetVersion: dto.targetVersion ?? null,
      artifactId: dto.artifactId ?? null,
      eventType: dto.eventType,
      metadata: dto.metadata,
    });

    return {
      success: true,
      data: { recorded: true },
      error: null,
    };
  }

  private extractBearerToken(authorization?: string) {
    return authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
  }
}
