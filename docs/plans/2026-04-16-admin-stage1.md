# Admin 1단계 기능 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 대시보드에 통화 현황 조회, 업무 현황 조회, 상담원 설정 CRUD, 호 분배룰 설정 CRUD를 추가한다.

**Architecture:** 기존 `features/` 도메인 분리 패턴을 따른다. 신규 백엔드 엔드포인트(PATCH agents, queues CRUD)를 추가한 뒤, 프론트엔드 페이지를 기능별 `features/` 디렉토리에 구현하고 `router.tsx`와 `AppLayout.tsx`에 연결한다.

**Tech Stack:** NestJS + Prisma (백엔드), React 18 + Ant Design 5 + axios (프론트엔드), react-router-dom

---

## 파일 구조

### 백엔드 (apps/server)
| 동작 | 파일 |
|------|------|
| Modify | `src/modules/agents/agents.controller.ts` |
| Create | `src/modules/agents/dto/update-agent.dto.ts` |
| Modify | `src/modules/agents/agents.service.ts` |
| Modify | `src/modules/queues/queues.controller.ts` |
| Create | `src/modules/queues/dto/update-queue.dto.ts` |
| Modify | `src/modules/queues/queues.service.ts` |

### 프론트엔드 (apps/admin)
| 동작 | 파일 |
|------|------|
| Modify | `src/app/router.tsx` |
| Modify | `src/components/AppLayout.tsx` |
| Create | `src/features/live-calls/LiveCallsPage.tsx` |
| Create | `src/features/live-calls/CallDetailDrawer.tsx` |
| Create | `src/features/kpi/KpiPage.tsx` |
| Create | `src/features/agent-settings/AgentSettingsPage.tsx` |
| Create | `src/features/agent-settings/AgentEditModal.tsx` |
| Create | `src/features/queue-settings/QueueSettingsPage.tsx` |
| Create | `src/features/queue-settings/QueueEditModal.tsx` |
| Create | `src/shared/lib/apiClient.ts` (공통 axios 인스턴스) |

---

## Chunk 1: 공통 인프라 + 메뉴 구조

### Task 1: 공통 apiClient 추출

현재 각 페이지가 `readToken()` + `axios.get(...)` 패턴을 중복 구현 중이다.
공통 axios 인스턴스로 추출해 이후 모든 신규 페이지에서 재사용한다.

**Files:**
- Create: `apps/admin/src/shared/lib/apiClient.ts`

- [ ] **Step 1: apiClient 생성**

```typescript
// apps/admin/src/shared/lib/apiClient.ts
import axios from 'axios';
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '../../config';

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  return config;
});
```

- [ ] **Step 2: 커밋**

```bash
git add apps/admin/src/shared/lib/apiClient.ts
git commit -m "feat(admin): add shared apiClient axios instance"
```

---

### Task 2: AppLayout 메뉴 그룹화 + router.tsx 라우트 추가

**Files:**
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Modify: `apps/admin/src/app/router.tsx`

- [ ] **Step 1: AppLayout.tsx 메뉴 items를 그룹 구조로 교체**

```typescript
items={[
  { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
  {
    key: 'realtime',
    icon: <MonitorOutlined />,
    label: '실시간 운영',
    children: [
      { key: '/live-calls', label: '통화 현황 조회' },
      { key: '/kpi', label: '업무 현황 조회' },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '운영 설정',
    children: [
      { key: '/settings/agents', label: '상담원 설정' },
      { key: '/settings/queues', label: '호 분배룰 설정' },
    ],
  },
  { key: '/monitoring', icon: <DesktopOutlined />, label: '시스템 모니터링' },
  { key: '/asterisk', icon: <SettingOutlined />, label: 'Asterisk 설정' },
]}
```

`defaultOpenKeys={['realtime', 'settings']}` 를 Menu에 추가해 기본 펼침.
`MonitorOutlined` import 추가.

`selectedKeys` 계산: 현재 `[location.pathname]`이 그룹 children key와 일치하므로 그대로 동작.

- [ ] **Step 2: router.tsx에 신규 라우트 추가**

```typescript
{ path: 'live-calls', element: <LiveCallsPage /> },
{ path: 'kpi', element: <KpiPage /> },
{ path: 'settings/agents', element: <AgentSettingsPage /> },
{ path: 'settings/queues', element: <QueueSettingsPage /> },
```

플레이스홀더 컴포넌트로 임시 연결 후 각 Task에서 교체.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/components/AppLayout.tsx apps/admin/src/app/router.tsx
git commit -m "feat(admin): add grouped sidebar menu and new routes"
```

---

## Chunk 2: 통화 현황 조회 + 업무 현황 조회

### Task 3: 통화 현황 조회 페이지 (`/live-calls`)

기존 `/calls/active` 엔드포인트를 3초 폴링해 실시간 콜 테이블 표시.
행 클릭 시 상세 Drawer 열림. 강제 종료 버튼은 `POST /calls/:callId/hangup`.

**Files:**
- Create: `apps/admin/src/features/live-calls/LiveCallsPage.tsx`
- Create: `apps/admin/src/features/live-calls/CallDetailDrawer.tsx`

- [ ] **Step 1: CallDetailDrawer 작성**

```typescript
// apps/admin/src/features/live-calls/CallDetailDrawer.tsx
import { Drawer, Descriptions, Tag, Button, Popconfirm, message } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';

interface CallRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis?: string;
  queueName?: string;
  primaryAgentId?: string;
  agentName?: string;
  sessionStatus: string;
  queuedAt?: string;
  answeredAt?: string;
  waitSeconds?: number;
  talkSeconds?: number;
}

interface Props {
  call: CallRow | null;
  onClose: () => void;
  onHangup: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  QUEUED: 'gold',
  RINGING_AGENT: 'blue',
  TALKING: 'green',
  AFTER_CALL_WORK: 'purple',
};

export function CallDetailDrawer({ call, onClose, onHangup }: Props) {
  const handleHangup = async () => {
    if (!call) return;
    try {
      await apiClient.post(`/calls/${call.callId}/hangup`);
      message.success('강제 종료 요청 완료');
      onHangup();
      onClose();
    } catch {
      message.error('강제 종료 실패');
    }
  };

  return (
    <Drawer
      title="통화 상세"
      open={!!call}
      onClose={onClose}
      width={480}
      extra={
        <Popconfirm title="강제 종료하시겠습니까?" onConfirm={handleHangup}>
          <Button danger size="small">강제 종료</Button>
        </Popconfirm>
      }
    >
      {call && (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Call ID">{call.callId}</Descriptions.Item>
          <Descriptions.Item label="Linked ID">{call.linkedid}</Descriptions.Item>
          <Descriptions.Item label="고객 번호">{call.ani}</Descriptions.Item>
          <Descriptions.Item label="DID">{call.dnis ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="큐">{call.queueName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="상담원">{call.agentName || call.primaryAgentId || '-'}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Tag color={STATUS_COLOR[call.sessionStatus] ?? 'default'}>{call.sessionStatus}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="대기시간">{call.waitSeconds ?? 0}s</Descriptions.Item>
          <Descriptions.Item label="통화시간">{call.talkSeconds ?? 0}s</Descriptions.Item>
          <Descriptions.Item label="큐 진입">{call.queuedAt ? new Date(call.queuedAt).toLocaleString() : '-'}</Descriptions.Item>
          <Descriptions.Item label="응답">{call.answeredAt ? new Date(call.answeredAt).toLocaleString() : '-'}</Descriptions.Item>
        </Descriptions>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: LiveCallsPage 작성**

```typescript
// apps/admin/src/features/live-calls/LiveCallsPage.tsx
import { Badge, Card, Table, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { CallDetailDrawer } from './CallDetailDrawer';

interface CallRow {
  callId: string;
  linkedid: string;
  ani: string;
  dnis?: string;
  queueName?: string;
  primaryAgentId?: string;
  agentName?: string;
  sessionStatus: string;
  queuedAt?: string;
  answeredAt?: string;
  waitSeconds?: number;
  talkSeconds?: number;
}

const STATUS_COLOR: Record<string, string> = {
  QUEUED: 'gold',
  RINGING_AGENT: 'blue',
  TALKING: 'green',
  AFTER_CALL_WORK: 'purple',
};

function fmtSec(sec?: number) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function LiveCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/calls/active');
      setRows(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          통화 현황 조회
        </Typography.Title>
        <Typography.Text type="secondary">
          {lastUpdated ? `${lastUpdated.toLocaleTimeString()} 기준` : '로딩 중...'}&nbsp;
          <Badge status="processing" text="3초 갱신" />
        </Typography.Text>
      </div>

      <Table<CallRow>
        rowKey="callId"
        dataSource={rows}
        pagination={false}
        onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: '상태',
            dataIndex: 'sessionStatus',
            width: 120,
            render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
          },
          { title: '고객 번호', dataIndex: 'ani', width: 140 },
          { title: '큐', dataIndex: 'queueName', render: (v) => v ?? '-' },
          {
            title: '상담원',
            render: (_, r) => r.agentName || r.primaryAgentId || '-',
          },
          {
            title: '대기시간',
            dataIndex: 'waitSeconds',
            render: (v) => fmtSec(v),
          },
          {
            title: '통화시간',
            dataIndex: 'talkSeconds',
            render: (v) => fmtSec(v),
          },
          {
            title: '큐 진입',
            dataIndex: 'queuedAt',
            render: (v?: string) => v ? new Date(v).toLocaleTimeString() : '-',
          },
        ]}
      />

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onHangup={() => void load()}
      />
    </Card>
  );
}
```

- [ ] **Step 3: router.tsx에서 import 연결 확인 후 커밋**

```bash
git add apps/admin/src/features/live-calls/
git commit -m "feat(admin): add live calls page with detail drawer and hangup"
```

---

### Task 4: 업무 현황 조회 페이지 (`/kpi`)

기존 `/admin/dashboard` 데이터를 재활용해 오늘의 KPI 카드 + 큐별 성과 테이블 + 시간대별 트래픽을 보여준다.
차트는 Antd 내장 Progress/Statistic 으로 구현 (recharts/echarts 의존성 추가 없이).

**Files:**
- Create: `apps/admin/src/features/kpi/KpiPage.tsx`

- [ ] **Step 1: KpiPage 작성**

```typescript
// apps/admin/src/features/kpi/KpiPage.tsx
import { Card, Col, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueKpi {
  queueName: string;
  waiting: number;
  talking: number;
  available: number;
  longestWaitSeconds: number;
  recentAnswered: number;
  recentAbandoned: number;
}

interface DashboardData {
  today?: { answered: number; abandoned: number };
  queues?: QueueKpi[];
  traffic?: { hour: string; inbound: number; answered: number; abandoned: number }[];
  generatedAt?: string;
}

export function KpiPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await apiClient.get('/admin/dashboard');
        if (active) setData(res.data?.data ?? {});
      } catch {
        if (active) setData({});
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;

  const queues: QueueKpi[] = data.queues ?? [];
  const today = data.today ?? { answered: 0, abandoned: 0 };
  const total = today.answered + today.abandoned;
  const answerRate = total > 0 ? Math.round((today.answered / total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>업무 현황 조회</Typography.Title>

      {/* KPI 카드 */}
      <Row gutter={16}>
        {[
          { title: '오늘 응답', value: today.answered, suffix: '건', color: 'green' },
          { title: '오늘 포기', value: today.abandoned, suffix: '건', color: 'red' },
          { title: '응답률', value: answerRate, suffix: '%', color: answerRate >= 80 ? 'green' : 'orange' },
          { title: '현재 대기', value: queues.reduce((s, q) => s + q.waiting, 0), suffix: '건', color: 'blue' },
          { title: '현재 통화 중', value: queues.reduce((s, q) => s + q.talking, 0), suffix: '건', color: 'cyan' },
          { title: '가용 상담원', value: queues.reduce((s, q) => s + q.available, 0), suffix: '명', color: 'purple' },
        ].map((kpi) => (
          <Col key={kpi.title} xs={24} sm={12} md={8} lg={4}>
            <Card size="small">
              <Statistic
                title={kpi.title}
                value={kpi.value}
                suffix={kpi.suffix}
                valueStyle={{ color: kpi.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 큐별 현황 */}
      <Card title="큐별 현황">
        <Table<QueueKpi>
          rowKey="queueName"
          dataSource={queues}
          pagination={false}
          size="small"
          columns={[
            { title: '큐', dataIndex: 'queueName' },
            { title: '대기', dataIndex: 'waiting' },
            { title: '통화 중', dataIndex: 'talking' },
            { title: '가용', dataIndex: 'available' },
            { title: '최장 대기', dataIndex: 'longestWaitSeconds', render: (v: number) => `${v}s` },
            {
              title: '최근 30분 응답률',
              render: (_, r) => {
                const t = r.recentAnswered + r.recentAbandoned;
                const rate = t > 0 ? Math.round((r.recentAnswered / t) * 100) : 0;
                return (
                  <>
                    <Tag color="green">{r.recentAnswered}건</Tag>
                    <Tag color="red">포기 {r.recentAbandoned}</Tag>
                    <Tag color={rate >= 80 ? 'green' : 'orange'}>{rate}%</Tag>
                  </>
                );
              },
            },
          ]}
        />
      </Card>

      {/* 시간대별 트래픽 */}
      {data.traffic && data.traffic.length > 0 && (
        <Card title="시간대별 트래픽">
          <Table
            rowKey="hour"
            dataSource={data.traffic}
            pagination={false}
            size="small"
            columns={[
              { title: '시간대', dataIndex: 'hour' },
              { title: '인입', dataIndex: 'inbound' },
              { title: '응답', dataIndex: 'answered' },
              { title: '포기', dataIndex: 'abandoned' },
              {
                title: '응답률',
                render: (_, r) => {
                  const t = r.inbound;
                  const rate = t > 0 ? Math.round((r.answered / t) * 100) : 0;
                  return <Tag color={rate >= 80 ? 'green' : 'orange'}>{rate}%</Tag>;
                },
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps/admin/src/features/kpi/
git commit -m "feat(admin): add KPI page reusing dashboard API"
```

---

## Chunk 3: 상담원 설정 CRUD

### Task 5: 백엔드 - PATCH /agents/:agentId

**Files:**
- Create: `apps/server/src/modules/agents/dto/update-agent.dto.ts`
- Modify: `apps/server/src/modules/agents/agents.service.ts`
- Modify: `apps/server/src/modules/agents/agents.controller.ts`

- [ ] **Step 1: UpdateAgentDto 작성**

```typescript
// apps/server/src/modules/agents/dto/update-agent.dto.ts
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  extension?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapUpSeconds?: number;
}
```

- [ ] **Step 2: AgentsService에 update 메서드 추가**

`apps/server/src/modules/agents/agents.service.ts` 하단에 추가:

```typescript
async update(tenantId: string, agentId: string, dto: UpdateAgentDto) {
  return this.prisma.agents.update({
    where: { agentId, tenantId },
    data: {
      ...(dto.agentName !== undefined && { agentName: dto.agentName }),
      ...(dto.extension !== undefined && { extension: dto.extension }),
      ...(dto.wrapUpSeconds !== undefined && { wrapUpSeconds: dto.wrapUpSeconds }),
    },
    select: {
      agentId: true,
      agentName: true,
      extension: true,
      wrapUpSeconds: true,
      role: true,
      loginId: true,
    },
  });
}
```

- [ ] **Step 3: AgentsController에 PATCH 엔드포인트 추가**

```typescript
@Patch(':agentId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
async update(
  @CurrentUser() user: any,
  @Param('agentId') agentId: string,
  @Body() dto: UpdateAgentDto,
) {
  return this.agentsService.update(user.tenantId, agentId, dto);
}
```

`Patch`, `RolesGuard`, `Roles` import 추가.

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/server && npm run build 2>&1 | tail -5
```

Expected: 0 errors

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/modules/agents/
git commit -m "feat(server): add PATCH /agents/:agentId for supervisor/admin"
```

---

### Task 6: 프론트엔드 - 상담원 설정 페이지 (`/settings/agents`)

**Files:**
- Create: `apps/admin/src/features/agent-settings/AgentEditModal.tsx`
- Create: `apps/admin/src/features/agent-settings/AgentSettingsPage.tsx`

- [ ] **Step 1: AgentEditModal 작성**

```typescript
// apps/admin/src/features/agent-settings/AgentEditModal.tsx
import { Form, Input, InputNumber, Modal, message } from 'antd';
import { useEffect } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  wrapUpSeconds?: number;
}

interface Props {
  agent: AgentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AgentEditModal({ agent, onClose, onSaved }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (agent) form.setFieldsValue(agent);
    else form.resetFields();
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
      title="상담원 정보 수정"
      open={!!agent}
      onOk={handleOk}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="이름" name="agentName" rules={[{ required: true, max: 50 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="내선번호" name="extension" rules={[{ required: true, max: 10 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="후처리 시간(초)" name="wrapUpSeconds">
          <InputNumber min={0} max={600} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: AgentSettingsPage 작성**

```typescript
// apps/admin/src/features/agent-settings/AgentSettingsPage.tsx
import { Button, Card, Skeleton, Table, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AgentEditModal } from './AgentEditModal';

interface AgentRow {
  agentId: string;
  agentName: string;
  loginId: string;
  extension: string;
  role: string;
  wrapUpSeconds?: number;
  employmentStatus?: string;
  currentStatus: { statusCode: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'green',
  TALKING: 'blue',
  RINGING: 'gold',
  AFTER_CALL_WORK: 'purple',
  BREAK: 'red',
  MEAL: 'orange',
};

export function AgentSettingsPage() {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [editing, setEditing] = useState<AgentRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/agents');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>상담원 설정</Typography.Title>
      <Table<AgentRow>
        rowKey="agentId"
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '이름', dataIndex: 'agentName' },
          { title: '로그인 ID', dataIndex: 'loginId' },
          { title: '내선', dataIndex: 'extension' },
          { title: '역할', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> },
          {
            title: '현재 상태',
            render: (_, r) =>
              r.currentStatus ? (
                <Tag color={STATUS_COLOR[r.currentStatus.statusCode] ?? 'default'}>
                  {r.currentStatus.statusCode}
                </Tag>
              ) : <Tag>OFFLINE</Tag>,
          },
          { title: '후처리(초)', dataIndex: 'wrapUpSeconds', render: (v) => v ?? '-' },
          {
            title: '액션',
            width: 80,
            render: (_, r) => (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(r)}
              >
                수정
              </Button>
            ),
          },
        ]}
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

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/agent-settings/
git commit -m "feat(admin): add agent settings page with edit modal"
```

---

## Chunk 4: 호 분배룰 설정 CRUD

### Task 7: 백엔드 - GET /queues + PATCH /queues/:queueId

**Files:**
- Create: `apps/server/src/modules/queues/dto/update-queue.dto.ts`
- Modify: `apps/server/src/modules/queues/queues.service.ts`
- Modify: `apps/server/src/modules/queues/queues.controller.ts`

- [ ] **Step 1: UpdateQueueDto 작성**

```typescript
// apps/server/src/modules/queues/dto/update-queue.dto.ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear'] as const;

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  queueDisplayName?: string;

  @IsOptional()
  @IsIn(STRATEGIES)
  strategy?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxWaitSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ringTimeout?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapUpSeconds?: number;
}
```

- [ ] **Step 2: QueuesService에 list + update 메서드 추가**

```typescript
// apps/server/src/modules/queues/queues.service.ts 하단 추가
async listForTenant(tenantId: string) {
  return this.prisma.queues.findMany({
    where: { tenantId },
    select: {
      queueId: true,
      queueName: true,
      queueDisplayName: true,
      strategy: true,
      maxWaitSeconds: true,
      ringTimeout: true,
      wrapUpSeconds: true,
      isActive: true,
    },
    orderBy: { queueName: 'asc' },
  });
}

async update(tenantId: string, queueId: string, dto: UpdateQueueDto) {
  return this.prisma.queues.update({
    where: { queueId, tenantId },
    data: {
      ...(dto.queueDisplayName !== undefined && { queueDisplayName: dto.queueDisplayName }),
      ...(dto.strategy !== undefined && { strategy: dto.strategy }),
      ...(dto.maxWaitSeconds !== undefined && { maxWaitSeconds: dto.maxWaitSeconds }),
      ...(dto.ringTimeout !== undefined && { ringTimeout: dto.ringTimeout }),
      ...(dto.wrapUpSeconds !== undefined && { wrapUpSeconds: dto.wrapUpSeconds }),
    },
    select: {
      queueId: true,
      queueName: true,
      queueDisplayName: true,
      strategy: true,
      maxWaitSeconds: true,
      ringTimeout: true,
      wrapUpSeconds: true,
      isActive: true,
    },
  });
}
```

- [ ] **Step 3: QueuesController에 list + patch 엔드포인트 추가**

```typescript
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
list(@CurrentUser() user: any) {
  return this.queuesService.listForTenant(user.tenantId);
}

@Patch(':queueId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
async update(
  @CurrentUser() user: any,
  @Param('queueId') queueId: string,
  @Body() dto: UpdateQueueDto,
) {
  return this.queuesService.update(user.tenantId, queueId, dto);
}
```

필요 import: `Patch`, `RolesGuard`, `Roles`, `UpdateQueueDto`.

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/server && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/modules/queues/
git commit -m "feat(server): add GET /queues and PATCH /queues/:queueId"
```

---

### Task 8: 프론트엔드 - 호 분배룰 설정 페이지 (`/settings/queues`)

**Files:**
- Create: `apps/admin/src/features/queue-settings/QueueEditModal.tsx`
- Create: `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx`

- [ ] **Step 1: QueueEditModal 작성**

```typescript
// apps/admin/src/features/queue-settings/QueueEditModal.tsx
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import { useEffect } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface QueueRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  strategy?: string;
  maxWaitSeconds?: number;
  ringTimeout?: number;
  wrapUpSeconds?: number;
}

interface Props {
  queue: QueueRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const STRATEGY_OPTIONS = [
  { value: 'rrmemory', label: 'Round Robin (Memory)' },
  { value: 'leastrecent', label: 'Least Recent' },
  { value: 'fewestcalls', label: 'Fewest Calls' },
  { value: 'random', label: 'Random' },
  { value: 'linear', label: 'Linear' },
];

export function QueueEditModal({ queue, onClose, onSaved }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (queue) form.setFieldsValue(queue);
    else form.resetFields();
  }, [queue, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.patch(`/queues/${queue!.queueId}`, values);
      message.success('저장 완료');
      onSaved();
      onClose();
    } catch {
      message.error('저장 실패');
    }
  };

  return (
    <Modal
      title={`큐 설정 수정 - ${queue?.queueName ?? ''}`}
      open={!!queue}
      onOk={handleOk}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
    >
      <Form form={form} layout="vertical">
        <Form.Item label="표시명" name="queueDisplayName">
          <Input placeholder="표시용 이름 (없으면 queueName 사용)" />
        </Form.Item>
        <Form.Item label="분배 전략" name="strategy">
          <Select options={STRATEGY_OPTIONS} />
        </Form.Item>
        <Form.Item label="최대 대기시간(초)" name="maxWaitSeconds">
          <InputNumber min={0} max={3600} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="링 타임아웃(초)" name="ringTimeout">
          <InputNumber min={5} max={120} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="후처리 시간(초)" name="wrapUpSeconds">
          <InputNumber min={0} max={600} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: QueueSettingsPage 작성**

```typescript
// apps/admin/src/features/queue-settings/QueueSettingsPage.tsx
import { Button, Card, Skeleton, Table, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { QueueEditModal } from './QueueEditModal';

interface QueueRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  strategy?: string;
  maxWaitSeconds?: number;
  ringTimeout?: number;
  wrapUpSeconds?: number;
  isActive?: boolean;
}

export function QueueSettingsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [editing, setEditing] = useState<QueueRow | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.get('/queues');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Typography.Title level={4} style={{ marginTop: 0 }}>호 분배룰 설정</Typography.Title>
      <Table<QueueRow>
        rowKey="queueId"
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: '큐명',
            render: (_, r) => r.queueDisplayName ?? r.queueName,
          },
          { title: '내부명', dataIndex: 'queueName' },
          {
            title: '분배 전략',
            dataIndex: 'strategy',
            render: (v) => v ? <Tag>{v}</Tag> : '-',
          },
          { title: '최대 대기(초)', dataIndex: 'maxWaitSeconds', render: (v) => v ?? '-' },
          { title: '링 타임아웃(초)', dataIndex: 'ringTimeout', render: (v) => v ?? '-' },
          { title: '후처리(초)', dataIndex: 'wrapUpSeconds', render: (v) => v ?? '-' },
          {
            title: '상태',
            dataIndex: 'isActive',
            render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? '활성' : '비활성'}</Tag>,
          },
          {
            title: '액션',
            width: 80,
            render: (_, r) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
                수정
              </Button>
            ),
          },
        ]}
      />

      <QueueEditModal
        queue={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </Card>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/features/queue-settings/
git commit -m "feat(admin): add queue settings page with edit modal"
```

---

## Chunk 5: 최종 연결 및 검증

### Task 9: router.tsx 최종 import 연결

- [ ] **Step 1: router.tsx에 모든 신규 페이지 import 추가**

```typescript
import { LiveCallsPage } from '../features/live-calls/LiveCallsPage';
import { KpiPage } from '../features/kpi/KpiPage';
import { AgentSettingsPage } from '../features/agent-settings/AgentSettingsPage';
import { QueueSettingsPage } from '../features/queue-settings/QueueSettingsPage';
```

- [ ] **Step 2: 프론트엔드 빌드 확인**

```bash
cd apps/admin && npm run build 2>&1 | tail -10
```

Expected: 0 errors

- [ ] **Step 3: 최종 커밋**

```bash
git add apps/admin/src/app/router.tsx
git commit -m "feat(admin): wire all stage-1 pages into router"
```

---

## 검증 체크리스트

- [ ] `npm run build` (server) → 0 errors
- [ ] `npm run build` (admin) → 0 errors
- [ ] `/live-calls` 접속 → 콜 테이블 표시, 3초마다 자동 갱신
- [ ] `/live-calls` 행 클릭 → 상세 Drawer 열림
- [ ] `/kpi` 접속 → KPI 카드 + 큐별 현황 테이블 표시
- [ ] `/settings/agents` 접속 → 상담원 목록 표시
- [ ] `/settings/agents` 수정 버튼 → Modal 열림, 저장 시 API 호출
- [ ] `/settings/queues` 접속 → 큐 목록 표시
- [ ] `/settings/queues` 수정 버튼 → Modal 열림, 저장 시 API 호출
- [ ] 사이드바 메뉴 그룹 (실시간 운영 / 운영 설정) 정상 표시
