jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { createReadStream, existsSync, statSync } from 'fs';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AgentUpdatesController } from '../src/modules/agent-updates/agent-updates.controller';
import { AgentUpdatesService } from '../src/modules/agent-updates/agent-updates.service';

describe('AgentUpdatesController', () => {
  let controller: AgentUpdatesController;

  const service = {
    createUpdateSession: jest.fn(),
    validateUpdateSessionToken: jest.fn(),
    getManifest: jest.fn(),
    initDownload: jest.fn(),
    consumeDownloadToken: jest.fn(),
    findArtifact: jest.fn(),
    recordAudit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentUpdatesController],
      providers: [{ provide: AgentUpdatesService, useValue: service }],
    }).compile();

    controller = module.get(AgentUpdatesController);
  });

  it('manifest 는 update session token 검증 후 tenant 범위 manifest 를 반환한다', async () => {
    service.validateUpdateSessionToken.mockResolvedValue({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      deviceId: 'pc-001',
    });
    service.getManifest.mockResolvedValue({
      success: true,
      data: { latestVersion: '1.4.0' },
      error: null,
    });

    await controller.getManifest('Bearer session-token', '1.3.2');

    expect(service.validateUpdateSessionToken).toHaveBeenCalledWith('session-token');
    expect(service.getManifest).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      currentVersion: '1.3.2',
      channel: 'stable',
    });
  });

  it('downloadArtifact 는 다운로드 토큰과 artifact 가 일치할 때 파일 스트림을 반환한다', async () => {
    const pipe = jest.fn();
    const res = {
      setHeader: jest.fn(),
    };

    service.consumeDownloadToken.mockResolvedValue({
      tenantId: 'tenant-1',
      artifactId: 'artifact-1',
    });
    service.findArtifact.mockResolvedValue({
      artifactId: 'artifact-1',
      fileName: 'KAsterAgent.exe',
      filePath: 'D:/agent-updates/KAsterAgent.exe',
    });
    (existsSync as jest.Mock).mockReturnValue(true);
    (statSync as jest.Mock).mockReturnValue({ size: 128 });
    (createReadStream as jest.Mock).mockReturnValue({ pipe });

    await controller.downloadArtifact('artifact-1', 'Bearer download-token', res as any);

    expect(service.consumeDownloadToken).toHaveBeenCalledWith('download-token');
    expect(service.findArtifact).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      artifactId: 'artifact-1',
    });
    expect(res.setHeader).toHaveBeenNthCalledWith(1, 'Content-Type', 'application/octet-stream');
    expect(res.setHeader).toHaveBeenNthCalledWith(2, 'Content-Length', 128);
    expect(res.setHeader).toHaveBeenNthCalledWith(
      3,
      'Content-Disposition',
      'attachment; filename="KAsterAgent.exe"',
    );
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('downloadArtifact 는 다운로드 토큰의 artifact 와 요청 artifactId 가 다르면 거부한다', async () => {
    service.consumeDownloadToken.mockResolvedValue({
      tenantId: 'tenant-1',
      artifactId: 'artifact-1',
    });

    await expect(
      controller.downloadArtifact('artifact-2', 'Bearer download-token', { setHeader: jest.fn() } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(service.findArtifact).not.toHaveBeenCalled();
  });

  it('downloadArtifact 는 승인된 파일이 없으면 404 를 반환한다', async () => {
    service.consumeDownloadToken.mockResolvedValue({
      tenantId: 'tenant-1',
      artifactId: 'artifact-1',
    });
    service.findArtifact.mockResolvedValue({
      artifactId: 'artifact-1',
      fileName: 'KAsterAgent.exe',
      filePath: 'D:/agent-updates/KAsterAgent.exe',
    });
    (existsSync as jest.Mock).mockReturnValue(false);

    await expect(
      controller.downloadArtifact('artifact-1', 'Bearer download-token', { setHeader: jest.fn() } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('report 는 JWT 사용자 기준으로 audit row 를 기록한다', async () => {
    service.recordAudit.mockResolvedValue(undefined);

    const result = await controller.report(
      {
        user: {
          tenantId: 'tenant-1',
          sub: 'agent-1',
        },
      } as any,
      {
        eventType: 'install_completed',
        deviceId: 'pc-001',
        currentAppVersion: '1.3.2',
        targetVersion: '1.4.0',
        artifactId: 'artifact-1',
        metadata: { result: 'ok' },
      },
      '203.0.113.10',
    );

    expect(service.recordAudit).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      deviceId: 'pc-001',
      clientIp: '203.0.113.10',
      currentAppVersion: '1.3.2',
      targetVersion: '1.4.0',
      artifactId: 'artifact-1',
      eventType: 'install_completed',
      metadata: { result: 'ok' },
    });
    expect(result).toEqual({
      success: true,
      data: { recorded: true },
      error: null,
    });
  });
});
