# 상담원 설정 CRUD + 호 분배룰 CRUD Implementation Plan

## 구현 상태 메모 (2026-04-16)

- 상담원 CRUD 백엔드/프론트 1차 구현 완료
- 큐 CRUD + 멤버 관리 백엔드/프론트 1차 구현 완료
- `queues.conf` 렌더러 및 `AsteriskReloadService` 연동 완료
- 서버 검증:
  - `prisma generate` 통과
  - `nest build` 통과
  - `jest --runInBand` 통과 (`7 suites`, `52 tests`)
- 관리자 앱 검증:
  - `vite build` 통과

남은 후속:
- 실제 Asterisk 환경에서 `queues.conf` 파일 생성 및 `queue reload all` 반영 확인
- 수동 테스트 체크리스트 수행
- 필요 시 큐 멤버 penalty/memberOrder 편집 UI 고도화

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담원 설정과 호 분배룰 설정을 실 업무 수준의 완전한 CRUD로 완성하고, 큐 변경 시 Asterisk queues.conf를 자동 재로드하는 CTI 서버 연동까지 구현한다.

**Architecture:**
- Backend (NestJS): 상담원 Create/Update(역할·큐)/Deactivate/ResetPassword + 큐 Create/Deactivate/MemberManagement. 큐 변경 시 queues.conf 렌더러가 파일을 쓰고 AMI `queue reload` 명령으로 Asterisk에 반영.
- Frontend (React + Ant Design): 기존 AgentSettingsPage/QueueSettingsPage에 신규 등록·비활성화·멤버 관리 UI를 추가. 별도 Modal/Drawer 컴포넌트로 분리.
- **No DB migration needed** — 기존 `agents`, `queues`, `queueAgentMembers` 테이블 구조로 모두 지원 가능.

**Tech Stack:** NestJS, Prisma, bcryptjs, class-validator, React 18, Ant Design 5, axios (apiClient)

**No test infrastructure** — Jest 설정이 없으므로 TDD 대신 빌드 검증으로 대체한다.

---

## File Map

### Backend (apps/server/src)

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `modules/agents/dto/create-agent.dto.ts` | **NEW** | 신규 상담원 등록 DTO |
| `modules/agents/dto/update-agent.dto.ts` | **MODIFY** | role, defaultQueueId, isActive 필드 추가 |
| `modules/agents/agents.service.ts` | **MODIFY** | create, deactivate, resetPassword 메서드 추가 |
| `modules/agents/agents.controller.ts` | **MODIFY** | POST /agents, DELETE /agents/:id, POST /agents/:id/reset-password 추가 |
| `modules/queues/dto/create-queue.dto.ts` | **NEW** | 신규 큐 생성 DTO |
| `modules/queues/queues.service.ts` | **MODIFY** | create, deactivate, listMembers, setMembers + AsteriskReloadService 주입 |
| `modules/queues/queues.controller.ts` | **MODIFY** | POST/DELETE /queues, GET/PUT /queues/:id/members 추가 |
| `modules/queues/queues.module.ts` | **MODIFY** | AsteriskConfigModule import 추가 |
| `modules/asterisk-config/renderers/queues.renderer.ts` | **NEW** | queues.conf INI 생성 함수 |
| `modules/asterisk-config/asterisk-reload.service.ts` | **MODIFY** | queues.conf 쓰기 + `queue reload all` AMI 명령 추가 |
| `modules/asterisk-config/asterisk-config.module.ts` | **MODIFY** | AsteriskReloadService export 추가 |

### Frontend (apps/admin/src)

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `features/agent-settings/AgentCreateModal.tsx` | **NEW** | 신규 상담원 등록 모달 |
| `features/agent-settings/AgentEditModal.tsx` | **MODIFY** | role, defaultQueueId, isActive 필드 추가 |
| `features/agent-settings/AgentSettingsPage.tsx` | **MODIFY** | 신규 등록·비활성화·비밀번호 초기화 버튼 추가 |
| `features/queue-settings/QueueCreateModal.tsx` | **NEW** | 신규 큐 생성 모달 |
| `features/queue-settings/QueueMembersDrawer.tsx` | **NEW** | 큐 멤버(상담원) 관리 Drawer |
| `features/queue-settings/QueueSettingsPage.tsx` | **MODIFY** | 신규 생성·비활성화·멤버 관리 버튼 추가 |

---

## Chunk 1: Backend — 상담원 CRUD

### Task 1: CreateAgentDto 생성

**Files:**
- Create: `apps/server/src/modules/agents/dto/create-agent.dto.ts`

- [ ] **Step 1: CreateAgentDto 파일 생성**

```typescript
// apps/server/src/modules/agents/dto/create-agent.dto.ts
import {
  IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength,
} from 'class-validator';

const ROLES = ['agent', 'supervisor', 'admin'] as const;

export class CreateAgentDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  loginId: string;

  @IsString() @IsNotEmpty() @MaxLength(32)
  agentCode: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  agentName: string;

  /** 내선번호: 숫자만 허용 */
  @IsString() @IsNotEmpty() @MaxLength(16) @Matches(/^\d+$/, { message: '내선번호는 숫자만 허용합니다' })
  extension: string;

  /** 초기 로그인 비밀번호 (평문) */
  @IsString() @MinLength(8) @MaxLength(64)
  password: string;

  @IsIn(ROLES) @IsOptional()
  role?: string;

  @IsUUID() @IsOptional()
  defaultQueueId?: string;
}
```

---

### Task 2: UpdateAgentDto 확장

**Files:**
- Modify: `apps/server/src/modules/agents/dto/update-agent.dto.ts`

- [ ] **Step 1: role, defaultQueueId, isActive 필드 추가**

현재 파일 전체를 아래로 교체:

```typescript
// apps/server/src/modules/agents/dto/update-agent.dto.ts
import {
  IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength,
} from 'class-validator';

const ROLES = ['agent', 'supervisor', 'admin'] as const;

export class UpdateAgentDto {
  @IsOptional() @IsString() @MaxLength(128)
  agentName?: string;

  @IsOptional() @IsString() @MaxLength(16)
  extension?: string;

  @IsOptional() @IsIn(ROLES)
  role?: string;

  /** null 전달 시 기본 큐 해제 */
  @IsOptional() @IsUUID()
  defaultQueueId?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
```

---

### Task 3: AgentsService — create, deactivate, resetPassword 추가

**Files:**
- Modify: `apps/server/src/modules/agents/agents.service.ts`

- [ ] **Step 1: import bcryptjs 추가 + create 메서드**

파일 상단에 import 추가:
```typescript
import * as bcrypt from 'bcryptjs';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
```

기존 `update()` 메서드 뒤에 다음 메서드들 추가:

```typescript
async create(tenantId: string, dto: CreateAgentDto) {
  // 중복 체크: loginId, agentCode, extension
  const existing = await this.prisma.agents.findFirst({
    where: {
      tenantId,
      OR: [
        { loginId: dto.loginId },
        { agentCode: dto.agentCode },
        { extension: dto.extension },
      ],
    },
    select: { loginId: true, agentCode: true, extension: true },
  });
  if (existing) {
    if (existing.loginId === dto.loginId)
      throw new ConflictException(`loginId '${dto.loginId}' 이미 사용 중`);
    if (existing.agentCode === dto.agentCode)
      throw new ConflictException(`agentCode '${dto.agentCode}' 이미 사용 중`);
    if (existing.extension === dto.extension)
      throw new ConflictException(`extension '${dto.extension}' 이미 사용 중`);
  }

  const hash = await bcrypt.hash(dto.password, 10);

  const agent = await this.prisma.agents.create({
    data: {
      tenantId,
      loginId: dto.loginId,
      agentCode: dto.agentCode,
      agentName: dto.agentName,
      extension: dto.extension,
      loginPasswordHash: hash,
      role: dto.role ?? 'agent',
      defaultQueueId: dto.defaultQueueId ?? null,
    },
    select: {
      agentId: true, loginId: true, agentCode: true, agentName: true,
      extension: true, role: true, defaultQueueId: true,
    },
  });
  return { success: true, data: agent, error: null };
}

async deactivate(tenantId: string, agentId: string) {
  const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
  if (!agent) throw new NotFoundException('Agent not found');

  await this.prisma.agents.update({
    where: { agentId },
    data: { isActive: false, updatedAt: new Date() },
  });
  return { success: true, data: { agentId, isActive: false }, error: null };
}

async resetPassword(tenantId: string, agentId: string) {
  const agent = await this.prisma.agents.findFirst({ where: { agentId, tenantId } });
  if (!agent) throw new NotFoundException('Agent not found');

  // 12자리 임시 비밀번호 생성 (영소문자+숫자)
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const tempPassword = Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('');

  const hash = await bcrypt.hash(tempPassword, 10);
  await this.prisma.agents.update({
    where: { agentId },
    data: { loginPasswordHash: hash, updatedAt: new Date() },
  });

  return {
    success: true,
    data: { agentId, tempPassword },  // 관리자에게만 한 번 표시 후 폐기
    error: null,
  };
}
```

- [ ] **Step 2: update() 메서드에 role, defaultQueueId, isActive 반영**

기존 `update()` 메서드의 `data` 블록을 아래로 교체:

```typescript
data: {
  ...(dto.agentName !== undefined && { agentName: dto.agentName }),
  ...(dto.extension !== undefined && { extension: dto.extension }),
  ...(dto.role !== undefined && { role: dto.role }),
  ...(dto.defaultQueueId !== undefined && { defaultQueueId: dto.defaultQueueId }),
  ...(dto.isActive !== undefined && { isActive: dto.isActive }),
  updatedAt: new Date(),
},
```

그리고 `select` 블록에 `role`, `defaultQueueId`, `isActive` 추가:
```typescript
select: {
  agentId: true, agentName: true, extension: true,
  role: true, loginId: true, defaultQueueId: true, isActive: true,
},
```

---

### Task 4: AgentsController — 새 엔드포인트 추가

**Files:**
- Modify: `apps/server/src/modules/agents/agents.controller.ts`

- [ ] **Step 1: import 추가 + POST/DELETE/reset-password 엔드포인트 추가**

`import` 부분에 `Post`, `Delete` 추가:
```typescript
import {
  Body, Controller, Delete, ForbiddenException,
  Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
```

`CreateAgentDto` import 추가:
```typescript
import { CreateAgentDto } from './dto/create-agent.dto';
```

컨트롤러 클래스 안 기존 `@Patch(':agentId')` 앞에 새 엔드포인트 추가:

```typescript
@Post()
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
create(@CurrentUser() user: any, @Body() dto: CreateAgentDto) {
  return this.agentsService.create(user.tenantId, dto);
}

@Delete(':agentId')
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
deactivate(@CurrentUser() user: any, @Param('agentId') agentId: string) {
  return this.agentsService.deactivate(user.tenantId, agentId);
}

@Post(':agentId/reset-password')
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
resetPassword(@CurrentUser() user: any, @Param('agentId') agentId: string) {
  return this.agentsService.resetPassword(user.tenantId, agentId);
}
```

---

### Task 5: 서버 빌드 검증 + 커밋

- [ ] **Step 1: 서버 빌드**

```bash
cd apps/server && npm run build 2>&1 | tail -20
```

Expected: 0 TS errors.

- [ ] **Step 2: 커밋**

```bash
cd apps/server
git add src/modules/agents/
git commit -m "feat(api): 상담원 CRUD — POST /agents, DELETE /agents/:id, POST /agents/:id/reset-password"
```

---

## Chunk 2: Backend — 큐 CRUD + 멤버 관리 + Asterisk 연동

### Task 6: queues.conf 렌더러

**Files:**
- Create: `apps/server/src/modules/asterisk-config/renderers/queues.renderer.ts`

- [ ] **Step 1: 렌더러 생성**

```typescript
// apps/server/src/modules/asterisk-config/renderers/queues.renderer.ts

export interface QueueMemberInput {
  extension: string;
  agentName: string;
  penalty: number;
  memberOrder: number;
}

export interface QueueInput {
  queueName: string;
  strategy: string;
  ringTimeoutSeconds: number;
  retrySeconds: number;
  wrapupSeconds: number;
  maxWaitSeconds: number;
  autopause: boolean;
  members: QueueMemberInput[];
}

export function renderQueuesConf(queues: QueueInput[]): string {
  const lines: string[] = [
    '; Auto-generated by KAster CTI — do not edit manually',
    '[general]',
    'persistentmembers=yes',
    'autofill=yes',
    'ringinuse=no',
    '',
  ];

  for (const q of queues) {
    lines.push(`[${q.queueName}]`);
    lines.push(`strategy=${q.strategy}`);
    lines.push(`timeout=${q.ringTimeoutSeconds}`);
    lines.push(`retry=${q.retrySeconds}`);
    lines.push(`wrapuptime=${q.wrapupSeconds}`);
    lines.push(`maxlen=0`);
    lines.push(`autopause=${q.autopause ? 'yes' : 'no'}`);

    // 멤버를 memberOrder → penalty 순으로 정렬
    const sorted = [...q.members].sort(
      (a, b) => a.memberOrder - b.memberOrder || a.penalty - b.penalty,
    );
    for (const m of sorted) {
      lines.push(`member => PJSIP/${m.extension},${m.penalty},${m.agentName}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
```

---

### Task 7: AsteriskReloadService — queues.conf 추가

**Files:**
- Modify: `apps/server/src/modules/asterisk-config/asterisk-reload.service.ts`
- Modify: `apps/server/src/modules/asterisk-config/asterisk-config.module.ts`

- [ ] **Step 1: queues.renderer import + fetchQueueData + writeConfFiles 확장**

파일 상단 import 추가:
```typescript
import { renderQueuesConf } from './renderers/queues.renderer';
```

`fetchTenantData` 아래에 새 메서드 추가:
```typescript
private async fetchQueueData(tenantId: string) {
  const queues = await this.prisma.queues.findMany({
    where: { tenantId, isActive: true },
    include: {
      members: {
        where: { isActive: true },
        include: {
          agent: {
            select: { extension: true, agentName: true, isActive: true },
          },
        },
      },
    },
    orderBy: { queueName: 'asc' },
  });
  return queues;
}
```

`writeConfFiles()` 메서드 안 기존 코드 뒤에 추가:
```typescript
// queues.conf
const rawQueues = await this.fetchQueueData(tenantId);
const queuesContent = renderQueuesConf(
  rawQueues.map((q) => ({
    queueName: q.queueName,
    strategy: q.strategy,
    ringTimeoutSeconds: q.ringTimeoutSeconds,
    retrySeconds: q.retrySeconds,
    wrapupSeconds: q.wrapupSeconds,
    maxWaitSeconds: q.maxWaitSeconds,
    autopause: q.autopause,
    members: q.members
      .filter((m) => m.agent.isActive)
      .map((m) => ({
        extension: m.agent.extension,
        agentName: m.agent.agentName,
        penalty: m.penalty,
        memberOrder: m.memberOrder,
      })),
  })),
);
fs.writeFileSync(path.join(confDir, 'queues.conf'), queuesContent, 'utf8');
```

`executeReload()` 메서드의 AMI 명령 블록에 queue reload 추가:
```typescript
this.ami.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' });
this.ami.sendAction({ Action: 'Command', Command: 'dialplan reload' });
this.ami.sendAction({ Action: 'Command', Command: 'queue reload all' });
```

- [ ] **Step 2: AsteriskConfigModule에 AsteriskReloadService export 추가**

```typescript
// apps/server/src/modules/asterisk-config/asterisk-config.module.ts
@Module({
  imports: [AmiModule],
  controllers: [AsteriskConfigController],
  providers: [AsteriskConfigService, AsteriskReloadService, PrismaService],
  exports: [AsteriskReloadService],  // ← 추가
})
export class AsteriskConfigModule {}
```

---

### Task 8: CreateQueueDto 생성

**Files:**
- Create: `apps/server/src/modules/queues/dto/create-queue.dto.ts`

- [ ] **Step 1: DTO 생성**

```typescript
// apps/server/src/modules/queues/dto/create-queue.dto.ts
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min,
} from 'class-validator';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear'] as const;

export class CreateQueueDto {
  /** Asterisk 큐명 (영소문자·숫자·하이픈만 허용) */
  @IsString() @IsNotEmpty() @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: '큐명은 영소문자·숫자·하이픈만 허용합니다' })
  queueName: string;

  /** 큐 내선번호 (숫자만) */
  @IsString() @IsNotEmpty() @MaxLength(16)
  @Matches(/^\d+$/, { message: '내선번호는 숫자만 허용합니다' })
  queueExten: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  queueDisplayName: string;

  @IsOptional() @IsIn(STRATEGIES)
  strategy?: string;

  @IsOptional() @IsInt() @Min(5)
  ringTimeoutSeconds?: number;

  @IsOptional() @IsInt() @Min(0)
  wrapupSeconds?: number;

  @IsOptional() @IsInt() @Min(0)
  maxWaitSeconds?: number;

  @IsOptional() @IsBoolean()
  autopause?: boolean;
}
```

---

### Task 9: QueuesService — create, deactivate, member management + AsteriskReloadService 주입

**Files:**
- Modify: `apps/server/src/modules/queues/queues.service.ts`
- Modify: `apps/server/src/modules/queues/queues.module.ts`

- [ ] **Step 1: AsteriskReloadService import + constructor 주입**

파일 상단 import 추가:
```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import { CreateQueueDto } from './dto/create-queue.dto';
```

생성자 수정:
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly reload: AsteriskReloadService,
) {}
```

- [ ] **Step 2: create() 메서드 추가**

기존 `update()` 뒤에 추가:

```typescript
async create(tenantId: string, dto: CreateQueueDto) {
  const existing = await this.prisma.queues.findFirst({
    where: {
      tenantId,
      OR: [{ queueName: dto.queueName }, { queueExten: dto.queueExten }],
    },
    select: { queueName: true, queueExten: true },
  });
  if (existing) {
    if (existing.queueName === dto.queueName)
      throw new ConflictException(`큐명 '${dto.queueName}' 이미 사용 중`);
    if (existing.queueExten === dto.queueExten)
      throw new ConflictException(`내선번호 '${dto.queueExten}' 이미 사용 중`);
  }

  const queue = await this.prisma.queues.create({
    data: {
      tenantId,
      queueName: dto.queueName,
      queueExten: dto.queueExten,
      queueDisplayName: dto.queueDisplayName,
      strategy: dto.strategy ?? 'leastrecent',
      ringTimeoutSeconds: dto.ringTimeoutSeconds ?? 15,
      wrapupSeconds: dto.wrapupSeconds ?? 30,
      maxWaitSeconds: dto.maxWaitSeconds ?? 45,
      autopause: dto.autopause ?? true,
    },
    select: {
      queueId: true, queueName: true, queueExten: true,
      queueDisplayName: true, strategy: true, isActive: true,
    },
  });

  this.reload.scheduleReload(tenantId);
  return { success: true, data: queue, error: null };
}

async deactivate(tenantId: string, queueId: string) {
  const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
  if (!queue) throw new NotFoundException('Queue not found');

  await this.prisma.queues.update({
    where: { queueId },
    data: { isActive: false, updatedAt: new Date() },
  });

  this.reload.scheduleReload(tenantId);
  return { success: true, data: { queueId, isActive: false }, error: null };
}
```

- [ ] **Step 3: update()에 reload 트리거 추가**

기존 `update()` 메서드의 return 바로 앞에 추가:
```typescript
this.reload.scheduleReload(tenantId);
return { success: true, data: updated, error: null };
```

- [ ] **Step 4: 큐 멤버 관리 메서드 추가**

```typescript
async listMembers(tenantId: string, queueId: string) {
  const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
  if (!queue) throw new NotFoundException('Queue not found');

  const members = await this.prisma.queueAgentMembers.findMany({
    where: { queueId, isActive: true },
    include: {
      agent: {
        select: {
          agentId: true, agentName: true, extension: true,
          role: true, isActive: true,
        },
      },
    },
    orderBy: [{ memberOrder: 'asc' }, { penalty: 'asc' }],
  });

  return { success: true, data: members, error: null };
}

/**
 * 큐 멤버 일괄 교체 — 기존 멤버를 모두 비활성화하고 새 목록으로 upsert.
 * members: [{ agentId, penalty?, memberOrder? }]
 */
async setMembers(
  tenantId: string,
  queueId: string,
  members: Array<{ agentId: string; penalty?: number; memberOrder?: number }>,
) {
  const queue = await this.prisma.queues.findFirst({ where: { queueId, tenantId } });
  if (!queue) throw new NotFoundException('Queue not found');

  await this.prisma.$transaction(async (tx) => {
    // 기존 멤버 전부 비활성화
    await tx.queueAgentMembers.updateMany({
      where: { queueId },
      data: { isActive: false },
    });

    // 새 목록 upsert
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      await tx.queueAgentMembers.upsert({
        where: { queueId_agentId: { queueId, agentId: m.agentId } },
        create: {
          tenantId,
          queueId,
          agentId: m.agentId,
          penalty: m.penalty ?? 0,
          memberOrder: m.memberOrder ?? i,
          isActive: true,
        },
        update: {
          penalty: m.penalty ?? 0,
          memberOrder: m.memberOrder ?? i,
          isActive: true,
        },
      });
    }
  });

  this.reload.scheduleReload(tenantId);
  return this.listMembers(tenantId, queueId);
}
```

- [ ] **Step 5: QueuesModule — AsteriskConfigModule import 추가**

```typescript
// apps/server/src/modules/queues/queues.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskConfigModule } from '../asterisk-config/asterisk-config.module';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';

@Module({
  imports: [AsteriskConfigModule],
  controllers: [QueuesController],
  providers: [QueuesService, PrismaService],
  exports: [QueuesService],
})
export class QueuesModule {}
```

---

### Task 10: QueuesController — 새 엔드포인트 추가

**Files:**
- Modify: `apps/server/src/modules/queues/queues.controller.ts`

- [ ] **Step 1: import 확장 + 새 엔드포인트 추가**

import 블록 교체:
```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueuesService } from './queues.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
```

기존 `@Get('summary')` 앞에 추가:
```typescript
@Post()
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
create(@CurrentUser() user: any, @Body() dto: CreateQueueDto) {
  return this.queuesService.create(user.tenantId, dto);
}

@Delete(':queueId')
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
deactivate(@CurrentUser() user: any, @Param('queueId') queueId: string) {
  return this.queuesService.deactivate(user.tenantId, queueId);
}

@Get(':queueId/members')
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
listMembers(@CurrentUser() user: any, @Param('queueId') queueId: string) {
  return this.queuesService.listMembers(user.tenantId, queueId);
}

@Put(':queueId/members')
@UseGuards(RolesGuard)
@Roles('supervisor', 'admin')
setMembers(
  @CurrentUser() user: any,
  @Param('queueId') queueId: string,
  @Body() body: { members: Array<{ agentId: string; penalty?: number; memberOrder?: number }> },
) {
  return this.queuesService.setMembers(user.tenantId, queueId, body.members);
}
```

> **주의:** `@Get(':queueId/members')`은 반드시 `@Get('summary')` 앞 또는 특정 위치 확인. NestJS 라우터는 선언 순서대로 매칭하므로 `:queueId`가 `summary`보다 먼저 선언되면 `/queues/summary` 요청이 queueId로 잡힐 수 있다. 최종 컨트롤러 순서: `POST /`, `GET summary`, `GET /`, `PATCH /:id`, `DELETE /:id`, `GET /:id/members`, `PUT /:id/members`.

---

### Task 11: 서버 빌드 검증 + 커밋

- [ ] **Step 1: 서버 빌드**

```bash
cd apps/server && npm run build 2>&1 | tail -20
```

Expected: 0 TS errors.

- [ ] **Step 2: 커밋**

```bash
cd apps/server
git add src/modules/queues/ src/modules/asterisk-config/
git commit -m "feat(api): 큐 CRUD + 멤버 관리 + queues.conf Asterisk 연동"
```

---

## Chunk 3: Frontend — 상담원 CRUD UI

### Task 12: AgentCreateModal

**Files:**
- Create: `apps/admin/src/features/agent-settings/AgentCreateModal.tsx`

- [ ] **Step 1: 모달 생성**

큐 목록은 `GET /queues`로 불러온다 (역할 선택, 기본 큐 선택 포함).

```tsx
// apps/admin/src/features/agent-settings/AgentCreateModal.tsx
import { Form, Input, Modal, Select, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueOption { queueId: string; queueName: string; queueDisplayName?: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: '상담원' },
  { value: 'supervisor', label: '수퍼바이저' },
  { value: 'admin', label: '관리자' },
];

export function AgentCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();
  const [queues, setQueues] = useState<QueueOption[]>([]);

  useEffect(() => {
    if (!open) return;
    apiClient.get('/queues').then((res) => {
      setQueues(res.data?.data ?? []);
    }).catch(() => setQueues([]));
  }, [open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.post('/agents', values);
      message.success('상담원 등록 완료');
      form.resetFields();
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '등록 실패';
      message.error(msg);
    }
  };

  return (
    <Modal
      title="신규 상담원 등록"
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="등록"
      cancelText="취소"
      width={480}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item label="로그인 ID" name="loginId" rules={[{ required: true, max: 64 }]}>
          <Input placeholder="예: agent1003" />
        </Form.Item>
        <Form.Item label="상담원 코드" name="agentCode" rules={[{ required: true, max: 32 }]}>
          <Input placeholder="예: A1003" />
        </Form.Item>
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="내선번호"
          name="extension"
          rules={[
            { required: true, max: 16 },
            { pattern: /^\d+$/, message: '숫자만 입력하세요' },
          ]}
        >
          <Input placeholder="예: 1003" />
        </Form.Item>
        <Form.Item
          label="초기 비밀번호"
          name="password"
          rules={[{ required: true, min: 8, max: 64 }]}
        >
          <Input.Password placeholder="8자 이상" />
        </Form.Item>
        <Form.Item label="역할" name="role" initialValue="agent">
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item label="기본 큐" name="defaultQueueId">
          <Select
            allowClear
            placeholder="선택 안 함"
            options={queues.map((q) => ({
              value: q.queueId,
              label: q.queueDisplayName ?? q.queueName,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

### Task 13: AgentEditModal 확장

**Files:**
- Modify: `apps/admin/src/features/agent-settings/AgentEditModal.tsx`

- [ ] **Step 1: AgentRow 타입 + 폼 필드 확장**

파일 전체를 아래로 교체:

```tsx
// apps/admin/src/features/agent-settings/AgentEditModal.tsx
import { Form, Input, Modal, Select, Switch, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

export interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  defaultQueueId?: string | null;
  isActive?: boolean;
  currentStatus: { statusCode: string } | null;
}

interface QueueOption { queueId: string; queueName: string; queueDisplayName?: string; }

interface Props {
  agent: AgentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: '상담원' },
  { value: 'supervisor', label: '수퍼바이저' },
  { value: 'admin', label: '관리자' },
];

export function AgentEditModal({ agent, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const [queues, setQueues] = useState<QueueOption[]>([]);

  useEffect(() => {
    if (!agent) { form.resetFields(); return; }
    apiClient.get('/queues').then((res) => {
      setQueues(res.data?.data ?? []);
    }).catch(() => setQueues([]));

    form.setFieldsValue({
      agentName: agent.agentName,
      extension: agent.extension,
      role: agent.role,
      defaultQueueId: agent.defaultQueueId ?? undefined,
      isActive: agent.isActive ?? true,
    });
  }, [agent, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.patch(`/agents/${agent!.agentId}`, values);
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch {
      message.error('저장 실패');
    }
  };

  return (
    <Modal
      title={`상담원 수정 — ${agent?.agentName ?? ''}`}
      open={!!agent}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      width={480}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="내선번호"
          name="extension"
          rules={[{ required: true, max: 16 }, { pattern: /^\d+$/, message: '숫자만' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="역할" name="role" rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item label="기본 큐" name="defaultQueueId">
          <Select
            allowClear
            placeholder="선택 안 함"
            options={queues.map((q) => ({
              value: q.queueId,
              label: q.queueDisplayName ?? q.queueName,
            }))}
          />
        </Form.Item>
        <Form.Item label="활성 여부" name="isActive" valuePropName="checked">
          <Switch checkedChildren="활성" unCheckedChildren="비활성" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

### Task 14: AgentSettingsPage 확장

**Files:**
- Modify: `apps/admin/src/features/agent-settings/AgentSettingsPage.tsx`

- [ ] **Step 1: 신규 등록 버튼, 비활성화, 비밀번호 초기화 추가**

파일 전체를 아래로 교체:

```tsx
// apps/admin/src/features/agent-settings/AgentSettingsPage.tsx
import {
  Button, Card, Modal, Popconfirm, Skeleton, Space, Table, Tag, Typography, message,
} from 'antd';
import { EditOutlined, KeyOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AgentCreateModal } from './AgentCreateModal';
import { AgentEditModal, type AgentRow } from './AgentEditModal';

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'green', TALKING: 'blue', RINGING: 'gold',
  AFTER_CALL_WORK: 'purple', BREAK: 'red', MEAL: 'orange', MANUAL_PAUSED: 'default',
};

export function AgentSettingsPage() {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);

  const load = async () => {
    try {
      // isActive=true 필터 없이 모두 조회 (비활성 상담원도 표시)
      const res = await apiClient.get('/agents');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  const deactivate = async (agentId: string) => {
    try {
      await apiClient.delete(`/agents/${agentId}`);
      message.success('비활성화 완료');
      void load();
    } catch {
      message.error('비활성화 실패');
    }
  };

  const resetPassword = async (agentId: string, agentName: string) => {
    try {
      const res = await apiClient.post(`/agents/${agentId}/reset-password`);
      const tempPassword: string = res.data?.data?.tempPassword ?? '';
      Modal.success({
        title: `${agentName} 임시 비밀번호`,
        content: (
          <div>
            <Typography.Text strong copyable>{tempPassword}</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              이 비밀번호는 한 번만 표시됩니다. 안전한 방법으로 상담원에게 전달하세요.
            </Typography.Paragraph>
          </div>
        ),
      });
    } catch {
      message.error('비밀번호 초기화 실패');
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>상담원 설정</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
          신규 등록
        </Button>
      </Space>

      <Table<AgentRow>
        rowKey="agentId"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        rowClassName={(r) => (!r.isActive ? 'ant-table-row-disabled' : '')}
        columns={[
          { title: '이름', dataIndex: 'agentName' },
          { title: '로그인 ID', dataIndex: 'loginId' },
          { title: '내선', dataIndex: 'extension' },
          { title: '역할', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> },
          {
            title: '현재 상태',
            render: (_: unknown, r: AgentRow) =>
              !r.isActive ? (
                <Tag color="default">비활성</Tag>
              ) : r.currentStatus ? (
                <Tag color={STATUS_COLOR[r.currentStatus.statusCode] ?? 'default'}>
                  {r.currentStatus.statusCode}
                </Tag>
              ) : (
                <Tag>OFFLINE</Tag>
              ),
          },
          {
            title: '액션',
            width: 200,
            render: (_: unknown, r: AgentRow) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditing(r)}
                  disabled={!r.isActive}
                >
                  수정
                </Button>
                <Button
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => void resetPassword(r.agentId, r.agentName)}
                  disabled={!r.isActive}
                >
                  PW 초기화
                </Button>
                <Popconfirm
                  title="정말 비활성화할까요?"
                  onConfirm={() => void deactivate(r.agentId)}
                  okText="예"
                  cancelText="아니오"
                  disabled={!r.isActive}
                >
                  <Button size="small" danger icon={<StopOutlined />} disabled={!r.isActive}>
                    비활성화
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <AgentCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
      />
      <AgentEditModal
        agent={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Card>
  );
}
```

---

## Chunk 4: Frontend — 큐 CRUD UI

### Task 15: QueueCreateModal

**Files:**
- Create: `apps/admin/src/features/queue-settings/QueueCreateModal.tsx`

- [ ] **Step 1: 신규 큐 생성 모달**

```tsx
// apps/admin/src/features/queue-settings/QueueCreateModal.tsx
import { Form, Input, InputNumber, Modal, Select, Switch, message } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const STRATEGY_OPTIONS = [
  { value: 'rrmemory',    label: 'Round Robin (Memory)' },
  { value: 'leastrecent', label: 'Least Recent' },
  { value: 'fewestcalls', label: 'Fewest Calls' },
  { value: 'random',      label: 'Random' },
  { value: 'linear',      label: 'Linear' },
];

export function QueueCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.post('/queues', values);
      message.success('큐 생성 완료');
      form.resetFields();
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? '생성 실패';
      message.error(msg);
    }
  };

  return (
    <Modal
      title="신규 큐 생성"
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="생성"
      cancelText="취소"
      width={480}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="큐명 (Asterisk)"
          name="queueName"
          rules={[
            { required: true, max: 64 },
            { pattern: /^[a-z0-9-]+$/, message: '영소문자·숫자·하이픈만 허용' },
          ]}
          extra="Asterisk queues.conf에 그대로 사용됩니다. 예: sales-queue"
        >
          <Input placeholder="sales-queue" />
        </Form.Item>
        <Form.Item
          label="큐 내선번호"
          name="queueExten"
          rules={[
            { required: true, max: 16 },
            { pattern: /^\d+$/, message: '숫자만 허용' },
          ]}
        >
          <Input placeholder="9001" />
        </Form.Item>
        <Form.Item label="표시명" name="queueDisplayName" rules={[{ required: true, max: 128 }]}>
          <Input placeholder="영업팀 콜센터" />
        </Form.Item>
        <Form.Item label="분배 전략" name="strategy" initialValue="leastrecent">
          <Select options={STRATEGY_OPTIONS} />
        </Form.Item>
        <Form.Item label="링 타임아웃(초)" name="ringTimeoutSeconds" initialValue={15}>
          <InputNumber min={5} max={120} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="후처리 시간(초)" name="wrapupSeconds" initialValue={30}>
          <InputNumber min={0} max={600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds" initialValue={45}>
          <InputNumber min={0} max={3600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Auto Pause" name="autopause" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

### Task 16: QueueMembersDrawer

**Files:**
- Create: `apps/admin/src/features/queue-settings/QueueMembersDrawer.tsx`

- [ ] **Step 1: 큐 멤버 관리 Drawer**

이 컴포넌트는 큐를 선택하면 현재 멤버 목록을 보여주고, 상담원을 추가/제거할 수 있다. 전체 상담원 목록은 `GET /agents`로, 현재 멤버는 `GET /queues/:id/members`로 조회한다.

```tsx
// apps/admin/src/features/queue-settings/QueueMembersDrawer.tsx
import {
  Button, Drawer, InputNumber, Popconfirm, Select, Space, Table, Typography, message,
} from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueInfo { queueId: string; queueName: string; queueDisplayName?: string; }

interface Member {
  queueMemberId: string;
  agentId: string;
  penalty: number;
  memberOrder: number;
  agent: {
    agentId: string; agentName: string; extension: string; isActive: boolean;
  };
}

interface AgentOption { agentId: string; agentName: string; extension: string; }

interface Props {
  queue: QueueInfo | null;
  onClose: () => void;
}

export function QueueMembersDrawer({ queue, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [adding, setAdding] = useState<{ agentId?: string; penalty: number; memberOrder: number }>({
    penalty: 0, memberOrder: 0,
  });
  const [saving, setSaving] = useState(false);

  const loadMembers = async () => {
    if (!queue) return;
    const res = await apiClient.get(`/queues/${queue.queueId}/members`);
    setMembers(res.data?.data ?? []);
  };

  const loadAgents = async () => {
    const res = await apiClient.get('/agents');
    setAllAgents(
      (res.data?.data ?? []).filter((a: AgentOption & { isActive: boolean }) => a.isActive),
    );
  };

  useEffect(() => {
    if (!queue) return;
    void Promise.all([loadMembers(), loadAgents()]);
  }, [queue]);

  const addMember = async () => {
    if (!adding.agentId) { message.warning('상담원을 선택하세요'); return; }
    if (members.some((m) => m.agentId === adding.agentId)) {
      message.warning('이미 멤버로 등록된 상담원입니다');
      return;
    }
    const newList = [
      ...members.map((m) => ({
        agentId: m.agentId, penalty: m.penalty, memberOrder: m.memberOrder,
      })),
      { agentId: adding.agentId, penalty: adding.penalty, memberOrder: members.length },
    ];
    await saveMembers(newList);
  };

  const removeMember = async (agentId: string) => {
    const newList = members
      .filter((m) => m.agentId !== agentId)
      .map((m, i) => ({ agentId: m.agentId, penalty: m.penalty, memberOrder: i }));
    await saveMembers(newList);
  };

  const saveMembers = async (list: Array<{ agentId: string; penalty: number; memberOrder: number }>) => {
    if (!queue) return;
    setSaving(true);
    try {
      await apiClient.put(`/queues/${queue.queueId}/members`, { members: list });
      message.success('멤버 저장 완료');
      await loadMembers();
    } catch {
      message.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const nonMembers = allAgents.filter((a) => !members.some((m) => m.agentId === a.agentId));

  return (
    <Drawer
      title={`큐 멤버 관리 — ${queue?.queueDisplayName ?? queue?.queueName ?? ''}`}
      open={!!queue}
      onClose={onClose}
      width={560}
    >
      {/* 멤버 추가 영역 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 200 }}
          placeholder="상담원 선택"
          value={adding.agentId}
          onChange={(v) => setAdding((prev) => ({ ...prev, agentId: v }))}
          options={nonMembers.map((a) => ({
            value: a.agentId,
            label: `${a.agentName} (${a.extension})`,
          }))}
          showSearch
          filterOption={(input, opt) =>
            (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
        <InputNumber
          min={0}
          max={9}
          value={adding.penalty}
          onChange={(v) => setAdding((prev) => ({ ...prev, penalty: v ?? 0 }))}
          addonBefore="Penalty"
          style={{ width: 120 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => void addMember()}
          loading={saving}
        >
          추가
        </Button>
      </Space>

      {/* 현재 멤버 테이블 */}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        현재 멤버 ({members.length}명)
      </Typography.Text>
      <Table<Member>
        rowKey="queueMemberId"
        dataSource={members}
        size="small"
        pagination={false}
        columns={[
          {
            title: '순서',
            dataIndex: 'memberOrder',
            width: 60,
            render: (_: unknown, __: Member, idx: number) => idx + 1,
          },
          { title: '이름', render: (_: unknown, r: Member) => r.agent.agentName },
          { title: '내선', render: (_: unknown, r: Member) => r.agent.extension, width: 80 },
          { title: 'Penalty', dataIndex: 'penalty', width: 80 },
          {
            title: '',
            width: 60,
            render: (_: unknown, r: Member) => (
              <Popconfirm
                title="멤버에서 제거할까요?"
                onConfirm={() => void removeMember(r.agentId)}
                okText="예"
                cancelText="아니오"
              >
                <Button size="small" danger icon={<MinusOutlined />} loading={saving} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
```

---

### Task 17: QueueSettingsPage 확장

**Files:**
- Modify: `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx`

- [ ] **Step 1: 신규 생성, 비활성화, 멤버 관리 버튼 추가**

파일 전체 교체:

```tsx
// apps/admin/src/features/queue-settings/QueueSettingsPage.tsx
import {
  Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message,
} from 'antd';
import {
  EditOutlined, PlusOutlined, StopOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { QueueCreateModal } from './QueueCreateModal';
import { QueueEditModal, type QueueRow } from './QueueEditModal';
import { QueueMembersDrawer } from './QueueMembersDrawer';

export function QueueSettingsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [managingMembers, setManagingMembers] = useState<QueueRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/queues');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  const deactivate = async (queueId: string) => {
    try {
      await apiClient.delete(`/queues/${queueId}`);
      message.success('비활성화 완료');
      void load();
    } catch {
      message.error('비활성화 실패');
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>호 분배룰 설정</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
          신규 생성
        </Button>
      </Space>

      <Table<QueueRow>
        rowKey="queueId"
        dataSource={rows}
        pagination={false}
        rowClassName={(r) => (!r.isActive ? 'ant-table-row-disabled' : '')}
        columns={[
          { title: '큐명', render: (_: unknown, r: QueueRow) => r.queueDisplayName ?? r.queueName },
          { title: '내부명', dataIndex: 'queueName' },
          {
            title: '분배 전략',
            dataIndex: 'strategy',
            render: (v?: string) => v ? <Tag>{v}</Tag> : '-',
          },
          { title: '링 TM(초)', dataIndex: 'ringTimeoutSeconds', render: (v?: number) => v ?? '-' },
          { title: '후처리(초)', dataIndex: 'wrapupSeconds', render: (v?: number) => v ?? '-' },
          { title: '대기 TM(초)', dataIndex: 'maxWaitSeconds', render: (v?: number) => v ?? '-' },
          {
            title: 'Auto Pause',
            dataIndex: 'autopause',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'ON' : 'OFF'}</Tag>,
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            render: (v?: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
          },
          {
            title: '액션',
            width: 220,
            render: (_: unknown, r: QueueRow) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditing(r)}
                  disabled={!r.isActive}
                >
                  수정
                </Button>
                <Button
                  size="small"
                  icon={<TeamOutlined />}
                  onClick={() => setManagingMembers(r)}
                  disabled={!r.isActive}
                >
                  멤버
                </Button>
                <Popconfirm
                  title="정말 비활성화할까요?"
                  onConfirm={() => void deactivate(r.queueId)}
                  okText="예"
                  cancelText="아니오"
                  disabled={!r.isActive}
                >
                  <Button size="small" danger icon={<StopOutlined />} disabled={!r.isActive}>
                    비활성화
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <QueueCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
      />
      <QueueEditModal
        queue={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <QueueMembersDrawer
        queue={managingMembers}
        onClose={() => setManagingMembers(null)}
      />
    </Card>
  );
}
```

---

## Chunk 5: 최종 검증 + 커밋

### Task 18: 프론트엔드 빌드 검증

- [ ] **Step 1: admin 타입 체크**

```bash
cd apps/admin && npm run build 2>&1 | tail -30
```

Expected: 0 TS errors, dist/ 생성.

- [ ] **Step 2: 서버 최종 빌드 재확인**

```bash
cd apps/server && npm run build 2>&1 | tail -20
```

Expected: 0 TS errors.

### Task 19: AgentsService listForTenant — isActive=false 상담원도 포함 여부 결정

현재 `listForTenant()`는 `isActive: true` 필터가 적용되어 있다. 관리 화면에서는 비활성 상담원도 목록에 표시해야 하므로 수정한다.

**Files:**
- Modify: `apps/server/src/modules/agents/agents.service.ts`

- [ ] **Step 1: listForTenant isActive 필터 제거 (관리 목적)**

`listForTenant()` 안의 `where` 조건에서 `isActive: true` 제거:
```typescript
const agents = await this.prisma.agents.findMany({
  where: { tenantId },  // isActive 필터 제거 — 관리 화면에서 비활성 상담원도 표시
  orderBy: { extension: 'asc' },
  select: {
    agentId: true, loginId: true, agentCode: true, agentName: true,
    extension: true, role: true, employmentStatus: true,
    defaultQueueId: true, lastLoginAt: true, isActive: true,  // isActive 필드 포함
  },
});
```

> **주의:** 이 변경은 `/agents` 전체에 영향. 상담원 앱(`apps/web`)도 이 엔드포인트를 쓴다면 서버 측에서 역할에 따라 분기 또는 별도 엔드포인트 고려. 현재 구조에서는 supervisor/admin 역할 가드가 있으므로 agent는 이 목록에 접근 불가 — 수정 안전.

- [ ] **Step 2: 커밋 (백엔드 + 프론트엔드 통합)**

```bash
cd D:/Work/AI_Projects/KAster_CTI
git add apps/server/src/modules/agents/ apps/server/src/modules/queues/ apps/server/src/modules/asterisk-config/
git add apps/admin/src/features/agent-settings/ apps/admin/src/features/queue-settings/
git commit -m "feat: 상담원·큐 CRUD 완성 + queues.conf Asterisk 연동"
```

---

## 수동 테스트 체크리스트

### 상담원 설정

- [ ] 신규 등록: loginId/extension 중복 시 오류 메시지 확인
- [ ] 신규 등록: 성공 후 목록 새로고침 확인
- [ ] 수정: 역할, 기본 큐, 활성 여부 변경 후 저장 확인
- [ ] 비밀번호 초기화: 임시 비밀번호 모달 표시 + 해당 비밀번호로 실제 로그인 확인
- [ ] 비활성화: Popconfirm 후 비활성화, 목록에서 회색 처리 확인
- [ ] 비활성 상담원: 수정/PW초기화/비활성화 버튼 disabled 상태 확인

### 호 분배룰 설정

- [ ] 신규 생성: queueName/queueExten 중복 시 오류 메시지 확인
- [ ] 신규 생성: 성공 후 목록 새로고침 확인
- [ ] 수정: strategy/timing 변경 후 저장 + Asterisk queues.conf 5초 후 업데이트 확인
- [ ] 멤버 관리: 상담원 추가/제거 + 저장 확인
- [ ] 멤버 관리: Penalty 설정 반영 확인
- [ ] 비활성화: 큐가 비활성화되면 queues.conf에서 제거 확인

### Asterisk 연동

- [ ] 큐 생성/수정/비활성화 후 5초 내 `/etc/asterisk/queues.conf` 갱신 확인
- [ ] `asterisk -rx "queue show"` 명령으로 큐 상태 확인
