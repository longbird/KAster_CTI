# Recordings Playback and Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated recording playback and file download to the admin recordings list so users with view permission can listen in a modal and users with export permission can download the file.

**Architecture:** Keep `GET /calls/recordings/list` as metadata-only and add two authenticated file endpoints under `CallsController`: one for streaming and one for attachment download. Put single-recording metadata lookup in `CallsService`, keep permission checks and local file response headers in the controller, and add admin-side action buttons plus a shared binary download helper without introducing new frontend test infrastructure.

**Tech Stack:** NestJS 10, Prisma 5, Jest 29, React 18, Ant Design 5, Axios, Vite 5

---

## File Map

### Server

- Modify: `apps/server/src/modules/calls/calls.service.ts`
  Responsibility: add tenant-scoped recording file metadata lookup for a single `recordingId`.
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
  Responsibility: expose authenticated `/stream` and `/download` endpoints, enforce `view` vs `export`, validate local storage/file existence, and send local files with the correct headers.
- Modify: `apps/server/test/calls-service.integration.spec.ts`
  Responsibility: add service-level tests for single recording lookup and content-type helper behavior.
- Create: `apps/server/test/calls-controller.recordings.spec.ts`
  Responsibility: add controller tests for permission routing, `Content-Disposition`, and delegation to `CallsService`.

### Admin

- Modify: `apps/admin/src/features/reports/RecordingsPage.tsx`
  Responsibility: add per-row `재생` and `다운로드` actions, modal state, audio player rendering, and row-level loading/error UX.
- Create: `apps/admin/src/shared/lib/downloadBinaryFile.ts`
  Responsibility: encapsulate authenticated blob download and filename extraction from response headers.

## Task 1: Add Single Recording Lookup in `CallsService`

**Files:**
- Modify: `apps/server/test/calls-service.integration.spec.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Test: `apps/server/test/calls-service.integration.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test near the existing `listRecordings` coverage in `apps/server/test/calls-service.integration.spec.ts`:

```ts
  it('getRecordingFile 는 tenant 범위 안의 녹취 파일 메타를 반환한다', async () => {
    prisma.callRecordings.findFirst.mockResolvedValue({
      recordingId: 'rec-file-1',
      tenantId: 'tenant-1',
      filePath: 'D:/Recordings/2026/04/22/rec-file-1.wav',
      fileName: 'rec-file-1.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });

    const result = await service.getRecordingFile('tenant-1', 'rec-file-1');

    expect(prisma.callRecordings.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        recordingId: 'rec-file-1',
      },
      select: {
        recordingId: true,
        tenantId: true,
        filePath: true,
        fileName: true,
        fileFormat: true,
        storageProvider: true,
      },
    });
    expect(result).toEqual({
      recordingId: 'rec-file-1',
      tenantId: 'tenant-1',
      filePath: 'D:/Recordings/2026/04/22/rec-file-1.wav',
      fileName: 'rec-file-1.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "getRecordingFile 는 tenant 범위 안의 녹취 파일 메타를 반환한다"
```

Expected: FAIL with `service.getRecordingFile is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add this method to `apps/server/src/modules/calls/calls.service.ts` below `listRecordings`:

```ts
  async getRecordingFile(tenantId: string, recordingId: string) {
    const recording = await this.prisma.callRecordings.findFirst({
      where: {
        tenantId,
        recordingId,
      },
      select: {
        recordingId: true,
        tenantId: true,
        filePath: true,
        fileName: true,
        fileFormat: true,
        storageProvider: true,
      },
    });

    return recording
      ? {
          ...recording,
          storageProvider: recording.storageProvider ?? 'local',
        }
      : null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "getRecordingFile 는 tenant 범위 안의 녹취 파일 메타를 반환한다"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/calls-service.integration.spec.ts apps/server/src/modules/calls/calls.service.ts
git commit -m "feat: add recording file lookup"
```

## Task 2: Add Recording Content-Type Helper in `CallsService`

**Files:**
- Modify: `apps/server/test/calls-service.integration.spec.ts`
- Test: `apps/server/test/calls-service.integration.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this test under the previous one:

```ts
  it('getRecordingContentType 는 확장자와 포맷에 맞는 audio mime type 을 반환한다', () => {
    expect(service.getRecordingContentType('wav', 'D:/Recordings/rec-1.wav')).toBe('audio/wav');
    expect(service.getRecordingContentType('mp3', 'D:/Recordings/rec-2.mp3')).toBe('audio/mpeg');
    expect(service.getRecordingContentType('', 'D:/Recordings/rec-3.gsm')).toBe('audio/gsm');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "getRecordingContentType 는 확장자와 포맷에 맞는 audio mime type 을 반환한다"
```

Expected: FAIL with `service.getRecordingContentType is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add this import and method to `apps/server/src/modules/calls/calls.service.ts`:

```ts
import { extname } from 'path';
```

```ts
  getRecordingContentType(fileFormat: string, filePath: string) {
    const format = (fileFormat || extname(filePath).replace('.', '') || 'wav').toLowerCase();
    if (format === 'mp3') return 'audio/mpeg';
    if (format === 'gsm') return 'audio/gsm';
    return 'audio/wav';
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts -t "getRecordingContentType 는 확장자와 포맷에 맞는 audio mime type 을 반환한다"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/calls-service.integration.spec.ts apps/server/src/modules/calls/calls.service.ts
git commit -m "feat: add recording content type helper"
```

## Task 3: Add Controller Tests for Playback and Download Permissions

**Files:**
- Create: `apps/server/test/calls-controller.recordings.spec.ts`
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
- Test: `apps/server/test/calls-controller.recordings.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/calls-controller.recordings.spec.ts` with this baseline:

```ts
import { Test, TestingModule } from '@nestjs/testing';
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ size: 128 }),
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

import { CallsController } from '../src/modules/calls/calls.controller';
import { CallsService } from '../src/modules/calls/calls.service';
import { MenuPermissionService } from '../src/common/menu-permission.service';

describe('CallsController recording file endpoints', () => {
  let controller: CallsController;
  const callsService = {
    getRecordingFile: jest.fn(),
    getRecordingContentType: jest.fn().mockReturnValue('audio/wav'),
  };
  const menuPermissionService = {
    assertMenuAction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallsController],
      providers: [
        { provide: CallsService, useValue: callsService },
        { provide: MenuPermissionService, useValue: menuPermissionService },
      ],
    }).compile();

    controller = module.get(CallsController);
  });

  it('streamRecording 은 reports/recordings view 권한을 검사한다', async () => {
    callsService.getRecordingFile.mockResolvedValue({
      recordingId: 'rec-1',
      tenantId: 'tenant-1',
      filePath: __filename,
      fileName: 'rec-1.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });

    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };

    await controller.streamRecording(
      { user: { tenantId: 'tenant-1', role: 'supervisor', sub: 'agent-1' } } as any,
      'rec-1',
      undefined,
      res as any,
    );

    expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
      'tenant-1',
      'supervisor',
      'reports/recordings',
      'view',
      'agent-1',
    );
    expect(callsService.getRecordingFile).toHaveBeenCalledWith('tenant-1', 'rec-1');
  });

  it('downloadRecording 은 reports/recordings export 권한을 검사한다', async () => {
    callsService.getRecordingFile.mockResolvedValue({
      recordingId: 'rec-2',
      tenantId: 'tenant-1',
      filePath: __filename,
      fileName: 'rec-2.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });

    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };

    await controller.downloadRecording(
      { user: { tenantId: 'tenant-1', role: 'supervisor', sub: 'agent-1' } } as any,
      'rec-2',
      res as any,
    );

    expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
      'tenant-1',
      'supervisor',
      'reports/recordings',
      'export',
      'agent-1',
    );
    expect(callsService.getRecordingFile).toHaveBeenCalledWith('tenant-1', 'rec-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-controller.recordings.spec.ts
```

Expected: FAIL with missing `streamRecording` and `downloadRecording` methods on `CallsController`.

- [ ] **Step 3: Write minimal implementation**

Add these method signatures and supporting imports to `apps/server/src/modules/calls/calls.controller.ts`:

```ts
import { Controller, Get, Param, Query, Req, Res, UseGuards, Headers, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
```

```ts
  private sendRecordingFile(
    recording: {
      filePath: string;
      fileName: string;
      fileFormat: string;
      storageProvider?: string | null;
    },
    res: Response,
    options: { asAttachment: boolean; range?: string },
  ) {
    return res;
  }

  @Get('recordings/:recordingId/stream')
  async streamRecording(
    @Req() req: any,
    @Param('recordingId') recordingId: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
    ) {
    await this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      'reports/recordings',
      'view',
      req.user.sub,
    );

    const recording = await this.callsService.getRecordingFile(req.user.tenantId, recordingId);
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    return this.sendRecordingFile(recording, res, { asAttachment: false, range });
  }

  @Get('recordings/:recordingId/download')
  async downloadRecording(
    @Req() req: any,
    @Param('recordingId') recordingId: string,
    @Res() res: Response,
  ) {
    await this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      'reports/recordings',
      'export',
      req.user.sub,
    );

    const recording = await this.callsService.getRecordingFile(req.user.tenantId, recordingId);
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    return this.sendRecordingFile(recording, res, { asAttachment: true });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-controller.recordings.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/calls-controller.recordings.spec.ts apps/server/src/modules/calls/calls.controller.ts
git commit -m "feat: add recording file controller endpoints"
```

## Task 4: Implement Local File Streaming and Download Helpers in `CallsController`

**Files:**
- Modify: `apps/server/test/calls-controller.recordings.spec.ts`
- Modify: `apps/server/src/modules/calls/calls.controller.ts`
- Test: `apps/server/test/calls-controller.recordings.spec.ts`

- [ ] **Step 1: Write the failing test**

Keep the existing `fs` mock from Task 3, add the named import, and extend `apps/server/test/calls-controller.recordings.spec.ts` with file-response focused tests:

```ts
import { createReadStream, existsSync, statSync } from 'fs';
```

```ts
  it('downloadRecording 은 attachment 헤더를 설정하고 파일을 내려준다', async () => {
    callsService.getRecordingFile.mockResolvedValue({
      recordingId: 'rec-3',
      tenantId: 'tenant-1',
      filePath: __filename,
      fileName: 'rec-3.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });

    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    (existsSync as jest.Mock).mockReturnValue(true);
    (statSync as jest.Mock).mockReturnValue({ size: 128 });
    (createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn().mockReturnValue(res) });

    await controller.downloadRecording(
      { user: { tenantId: 'tenant-1', role: 'admin', sub: 'admin-1' } } as any,
      'rec-3',
      res as any,
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="rec-3.wav"');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 128);
    expect(createReadStream).toHaveBeenCalledWith(__filename);
  });

  it('streamRecording 은 range 헤더가 있으면 206 partial content 로 응답한다', async () => {
    callsService.getRecordingFile.mockResolvedValue({
      recordingId: 'rec-4',
      tenantId: 'tenant-1',
      filePath: __filename,
      fileName: 'rec-4.wav',
      fileFormat: 'wav',
      storageProvider: 'local',
    });

    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    (existsSync as jest.Mock).mockReturnValue(true);
    (statSync as jest.Mock).mockReturnValue({ size: 200 });
    (createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn().mockReturnValue(res) });

    await controller.streamRecording(
      { user: { tenantId: 'tenant-1', role: 'admin', sub: 'admin-1' } } as any,
      'rec-4',
      'bytes=0-99',
      res as any,
    );

    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 0-99/200');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 100);
    expect(createReadStream).toHaveBeenCalledWith(__filename, { start: 0, end: 99 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-controller.recordings.spec.ts
```

Expected: FAIL because the controller does not yet set the file response headers or partial content response.

- [ ] **Step 3: Write minimal implementation**

Add the missing imports to `apps/server/src/modules/calls/calls.controller.ts`:

```ts
import { Controller, Get, Param, Query, Req, Res, UseGuards, Headers, BadRequestException, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'fs';
```

Add the `sendRecordingFile` helper introduced in Task 3 to `apps/server/src/modules/calls/calls.controller.ts`, and make sure its behavior exactly matches the spec:

```ts
  private sendRecordingFile(
    recording: {
      filePath: string;
      fileName: string;
      fileFormat: string;
      storageProvider?: string | null;
    },
    res: Response,
    options: { asAttachment: boolean; range?: string },
  ) {
    if ((recording.storageProvider ?? 'local') !== 'local') {
      throw new BadRequestException(
        options.asAttachment
          ? '현재 저장소 유형은 다운로드를 지원하지 않습니다.'
          : '현재 저장소 유형은 스트리밍을 지원하지 않습니다.',
      );
    }
    if (!existsSync(recording.filePath)) {
      throw new NotFoundException('녹취 파일을 찾을 수 없습니다.');
    }

    const stats = statSync(recording.filePath);
    const total = stats.size;
    const contentType = this.callsService.getRecordingContentType(recording.fileFormat, recording.filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (options.asAttachment) {
      res.setHeader('Content-Length', total);
      res.setHeader('Content-Disposition', `attachment; filename="${recording.fileName}"`);
      return createReadStream(recording.filePath).pipe(res);
    }

    if (options.range) {
      const [startText, endText] = options.range.replace(/bytes=/, '').split('-');
      const start = Number(startText);
      const end = endText ? Number(endText) : total - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      return createReadStream(recording.filePath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', total);
    return createReadStream(recording.filePath).pipe(res);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-controller.recordings.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/calls-controller.recordings.spec.ts apps/server/src/modules/calls/calls.service.ts apps/server/src/modules/calls/calls.controller.ts
git commit -m "feat: support local recording streaming and downloads"
```

## Task 5: Add Shared Binary Download Helper in Admin

**Files:**
- Create: `apps/admin/src/shared/lib/downloadBinaryFile.ts`
- Test: none, verify via TypeScript build because admin has no configured test runner

- [ ] **Step 1: Write the minimal helper first**

Create `apps/admin/src/shared/lib/downloadBinaryFile.ts` with:

```ts
import type { AxiosInstance } from 'axios';

function parseFileName(disposition: string | undefined, fallbackFileName: string) {
  if (!disposition) return fallbackFileName;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];
  return fallbackFileName;
}

export async function downloadBinaryFile(
  apiClient: AxiosInstance,
  url: string,
  fallbackFileName: string,
) {
  const response = await apiClient.get(url, { responseType: 'blob' });
  const fileName = parseFileName(
    response.headers['content-disposition'] as string | undefined,
    fallbackFileName,
  );
  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
```

- [ ] **Step 2: Run build to verify it succeeds**

Run:

```bash
cd apps/admin
npm run build
```

Expected: PASS with Vite production build finishing without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/shared/lib/downloadBinaryFile.ts
git commit -m "feat: add binary download helper for admin"
```

## Task 6: Add Recording Playback Modal and Download Buttons in Admin

**Files:**
- Modify: `apps/admin/src/features/reports/RecordingsPage.tsx`
- Modify: `apps/admin/src/shared/lib/downloadBinaryFile.ts`
- Test: manual browser verification plus `npm run build`

- [ ] **Step 1: Add state and imports**

Update the imports in `apps/admin/src/features/reports/RecordingsPage.tsx`:

```ts
import { DownloadOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { downloadBinaryFile } from '../../shared/lib/downloadBinaryFile';
```

Add local UI state inside the component:

```ts
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedRecording, setSelectedRecording] = useState<RecRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const streamUrl = useMemo(
    () => (selectedRecording ? `/calls/recordings/${selectedRecording.recordingId}/stream` : ''),
    [selectedRecording],
  );
```

- [ ] **Step 2: Render the modal and row actions**

Add `contextHolder` near the top of the JSX and append this modal after the table:

```tsx
      {contextHolder}
```

```tsx
      <Modal
        open={Boolean(selectedRecording)}
        title="녹취 재생"
        footer={null}
        onCancel={() => {
          setSelectedRecording(null);
          setPlayerError(null);
        }}
        destroyOnClose
      >
        {selectedRecording ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Typography.Text strong>{selectedRecording.fileName}</Typography.Text>
            <Typography.Text type="secondary">
              발신번호 {selectedRecording.session?.ani ?? '-'} / 상담원 {selectedRecording.session?.primaryAgent?.agentName ?? '-'}
            </Typography.Text>
            {playerError ? (
              <Typography.Text type="danger">{playerError}</Typography.Text>
            ) : (
              <audio
                key={selectedRecording.recordingId}
                controls
                autoPlay
                style={{ width: '100%' }}
                src={streamUrl}
                onError={() => setPlayerError('파일을 재생할 수 없습니다.')}
              />
            )}
          </Space>
        ) : null}
      </Modal>
```

Add a new table column:

```tsx
          {
            title: '액션',
            width: 170,
            render: (_: unknown, row: RecRow) => (
              <Space size="small">
                <Button
                  icon={<PlayCircleOutlined />}
                  onClick={() => {
                    setPlayerError(null);
                    setSelectedRecording(row);
                  }}
                >
                  재생
                </Button>
                {reportPermission?.canExport ? (
                  <Button
                    icon={<DownloadOutlined />}
                    loading={downloadingId === row.recordingId}
                    onClick={async () => {
                      try {
                        setDownloadingId(row.recordingId);
                        await downloadBinaryFile(
                          apiClient,
                          `/calls/recordings/${row.recordingId}/download`,
                          row.fileName,
                        );
                      } catch (error: any) {
                        messageApi.error(error?.response?.data?.error?.message ?? '녹취 파일 다운로드에 실패했습니다.');
                      } finally {
                        setDownloadingId(null);
                      }
                    }}
                  >
                    다운로드
                  </Button>
                ) : null}
              </Space>
            ),
          },
```

Keep playback visible to all viewers and only gate the download button with `reportPermission?.canExport`.

- [ ] **Step 3: Run build to verify it passes**

Run:

```bash
cd apps/admin
npm run build
```

Expected: PASS without TypeScript errors.

- [ ] **Step 4: Manual verification in the browser**

Run:

```bash
cd apps/admin
npm run dev -- --port 5174
```

Verify manually:

```text
1. 녹취 목록에서 재생 버튼이 모든 조회 가능 사용자에게 보인다.
2. 재생 버튼 클릭 시 모달이 열리고 audio 플레이어가 렌더된다.
3. canExport 없는 계정에서는 다운로드 버튼이 보이지 않는다.
4. canExport 있는 계정에서는 다운로드 버튼이 보이고 파일 저장이 시작된다.
5. 403/404 상황에서는 오류 메시지가 노출된다.
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/features/reports/RecordingsPage.tsx apps/admin/src/shared/lib/downloadBinaryFile.ts
git commit -m "feat: add recording playback and download actions"
```

## Task 7: Final Regression Pass

**Files:**
- Modify: none unless a regression is found
- Test: server Jest + admin build

- [ ] **Step 1: Run focused server tests**

Run:

```bash
cd apps/server
npm test -- --runTestsByPath test/calls-service.integration.spec.ts test/calls-controller.recordings.spec.ts
```

Expected: PASS for all recording-related server tests.

- [ ] **Step 2: Run admin build**

Run:

```bash
cd apps/admin
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the planned server/admin files are modified plus any intentional lockfile changes.

- [ ] **Step 4: Commit final follow-up only when Step 3 changed code**

```bash
git add apps/server/src/modules/calls/calls.controller.ts apps/server/src/modules/calls/calls.service.ts apps/server/test/calls-controller.recordings.spec.ts apps/server/test/calls-service.integration.spec.ts apps/admin/src/features/reports/RecordingsPage.tsx apps/admin/src/shared/lib/downloadBinaryFile.ts
git commit -m "fix: polish recording playback and download flow"
```
