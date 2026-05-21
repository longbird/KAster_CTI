import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  buildPayload,
  IntegrationAutomationRow,
  IntegrationFormModal,
} from './IntegrationFormModal';

interface IntegrationCard {
  id: string;
  name: string;
  code: string;
  desc: string;
  category: 'pbx' | 'messaging' | 'crm' | 'analytics';
  status: 'connected' | 'available' | 'error';
  detail?: string;
}

interface HealthResponse {
  ami?: { connected?: boolean; lastEventAt?: string };
  redis?: { connected?: boolean };
  db?: { connected?: boolean };
  checks?: {
    ami?: 'connected' | 'disconnected' | string;
    redis?: 'up' | 'down' | string;
    db?: 'up' | 'down' | string;
  };
}

export function resolveLiveIntegrationHealth(data: HealthResponse) {
  return {
    ami: data.checks?.ami
      ? data.checks.ami === 'connected' ? 'connected' : 'error'
      : data.ami?.connected ? 'connected' : 'error',
    redis: data.checks?.redis
      ? data.checks.redis === 'up' ? 'connected' : 'error'
      : data.redis?.connected ? 'connected' : 'error',
    db: data.checks?.db
      ? data.checks.db === 'up' ? 'connected' : 'error'
      : data.db?.connected ? 'connected' : 'error',
    lastEventAt: data.ami?.lastEventAt ?? null,
  } as const;
}

const CATEGORY_LABEL: Record<IntegrationCard['category'], string> = {
  pbx: 'PBX · 미디어',
  messaging: '메시징',
  crm: 'CRM · 티켓',
  analytics: '분석',
};

const STATIC_INTEGRATIONS: IntegrationCard[] = [
  {
    id: 'slack',
    name: 'Slack',
    code: 'SLACK',
    desc: '경보 채널로 장애 / 임계치 초과 알림 전송',
    category: 'messaging',
    status: 'available',
  },
  {
    id: 'webhook',
    name: 'Webhook',
    code: 'WEBHOOK',
    desc: '통화 종료 / 전환 이벤트를 외부 엔드포인트로 전송',
    category: 'messaging',
    status: 'available',
  },
  {
    id: 'crm',
    name: 'CRM 연동',
    code: 'CRM',
    desc: '인바운드 팝업 + 통화 결과 동기화 (Zendesk / Freshdesk / 자체)',
    category: 'crm',
    status: 'available',
  },
  {
    id: 'bi',
    name: '분석 / BI',
    code: 'BI',
    desc: 'CDR + 에이전트 KPI를 BigQuery / Snowflake 로 야간 덤프',
    category: 'analytics',
    status: 'available',
  },
];

const TYPE_LABEL: Record<string, string> = {
  VIX_PHONE: 'VIX 전화',
  VIX_SMS: 'VIX SMS',
  WEBHOOK: 'Webhook',
  SLACK_WEBHOOK: 'Slack',
};

export function IntegrationsPage() {
  const [ami, setAmi] = useState<'connected' | 'error' | 'available'>('available');
  const [redis, setRedis] = useState<'connected' | 'error' | 'available'>('available');
  const [db, setDb] = useState<'connected' | 'error' | 'available'>('available');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const [automations, setAutomations] = useState<IntegrationAutomationRow[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationAutomationRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const permission = usePermissionStore((s) => s.permissionsByMenu['integrations']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;
  const canOperate = permission?.canOperate ?? true;

  const loadAutomations = async () => {
    setAutomationsLoading(true);
    try {
      const res = await apiClient.get('/admin/settings/integrations');
      setAutomations(res.data?.data ?? []);
    } catch {
      setAutomations([]);
    } finally {
      setAutomationsLoading(false);
    }
  };

  const refresh = async () => {
    try {
      const res = await apiClient.get('/health');
      const data: HealthResponse = res.data?.data ?? res.data ?? {};
      const health = resolveLiveIntegrationHealth(data);
      setAmi(health.ami);
      setRedis(health.redis);
      setDb(health.db);
      setLastEventAt(health.lastEventAt);
    } catch {
      setAmi('error');
      setRedis('error');
      setDb('error');
    }
  };

  useEffect(() => {
    void refresh();
    void loadAutomations();
    const t = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(t);
  }, []);

  const submit = async (payload: ReturnType<typeof buildPayload>) => {
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.post(
          `/admin/settings/integrations/${editing.integrationAutomationId}`,
          payload,
        );
        message.success('자동화를 수정했습니다.');
      } else {
        await apiClient.post('/admin/settings/integrations', payload);
        message.success('자동화를 등록했습니다.');
      }
      setFormOpen(false);
      setEditing(null);
      await loadAutomations();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await apiClient.delete(`/admin/settings/integrations/${id}`);
      message.success('자동화를 삭제했습니다.');
      await loadAutomations();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const toggle = async (row: IntegrationAutomationRow, enabled: boolean) => {
    try {
      await apiClient.post(
        `/admin/settings/integrations/${row.integrationAutomationId}/toggle`,
        { enabled },
      );
      await loadAutomations();
    } catch {
      message.error('상태 변경에 실패했습니다.');
    }
  };

  const runTest = async (row: IntegrationAutomationRow) => {
    try {
      const res = await apiClient.post(
        `/admin/settings/integrations/${row.integrationAutomationId}/test`,
        { payload: { source: 'admin-test' } },
      );
      message.success(res.data?.data?.message ?? '테스트 전송 완료');
      await loadAutomations();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '테스트 실패');
    }
  };

  const liveCards: IntegrationCard[] = [
    {
      id: 'asterisk-ami',
      name: 'PBX AMI',
      code: 'AMI',
      desc: 'PBX 관리 인터페이스 · 세션 이벤트 소스',
      category: 'pbx',
      status: ami,
      detail: lastEventAt ? `마지막 이벤트 ${new Date(lastEventAt).toLocaleTimeString()}` : '이벤트 대기 중',
    },
    {
      id: 'redis',
      name: 'Redis',
      code: 'REDIS',
      desc: 'Pub/Sub · 리더 선출 · 중복 제거 캐시',
      category: 'pbx',
      status: redis,
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      code: 'DB',
      desc: '세션 / 통화 / CDR 저장소',
      category: 'pbx',
      status: db,
    },
  ];

  const all = [...liveCards, ...STATIC_INTEGRATIONS];
  const grouped = all.reduce<Record<string, IntegrationCard[]>>((acc, it) => {
    const key = it.category;
    (acc[key] ||= []).push(it);
    return acc;
  }, {});

  return (
    <>
      <AdmPageHead
        title="연동"
        sub="외부 시스템 · 인프라 엔드포인트 현황"
        right={
          <Button className="k-btn k-btn-sm" onClick={() => void refresh()}>
            재확인
          </Button>
        }
      />

      <Card
        title="외부 자동화 (VIX / Webhook)"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          canCreate ? (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              자동화 등록
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          전화/SMS/Webhook 자동화 대상을 등록하고 수동 테스트 전송을 실행합니다. 통화/이벤트 자동 트리거 연결은 follow-up PR.
        </Typography.Paragraph>
        <Table<IntegrationAutomationRow>
          rowKey="integrationAutomationId"
          dataSource={automations}
          loading={automationsLoading}
          size="small"
          pagination={false}
          columns={[
            {
              title: '타입',
              dataIndex: 'type',
              width: 130,
              render: (v: string) => <Tag>{TYPE_LABEL[v] ?? v}</Tag>,
            },
            { title: '이름', dataIndex: 'name' },
            {
              title: '설명',
              dataIndex: 'description',
              render: (v: string | null) => v ?? '',
            },
            {
              title: '마지막 실행',
              dataIndex: 'lastTriggeredAt',
              width: 170,
              render: (v: string | null) =>
                v ? new Date(v).toLocaleString() : <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '사용',
              dataIndex: 'enabled',
              width: 90,
              render: (v: boolean, row) => (
                <Switch
                  size="small"
                  checked={v}
                  disabled={!canOperate}
                  onChange={(checked) => void toggle(row, checked)}
                />
              ),
            },
            {
              title: '관리',
              width: 200,
              render: (_: unknown, row) => (
                <Space>
                  {canOperate ? (
                    <Button
                      size="small"
                      icon={<ExperimentOutlined />}
                      onClick={() => void runTest(row)}
                    >
                      테스트
                    </Button>
                  ) : null}
                  {canUpdate ? (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(row);
                        setFormOpen(true);
                      }}
                    />
                  ) : null}
                  {canDelete ? (
                    <Popconfirm
                      title="자동화를 삭제하시겠습니까?"
                      onConfirm={() => remove(row.integrationAutomationId)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <IntegrationFormModal
        open={formOpen}
        initial={editing}
        loading={submitting}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={submit}
      />

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat} className="adm-card" style={{ marginBottom: 16 }}>
          <div className="adm-card-head" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)' }}>
            <strong style={{ fontSize: 13 }}>{CATEGORY_LABEL[cat as IntegrationCard['category']]}</strong>
            <span className="k-mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 8, letterSpacing: '0.1em' }}>
              {cat.toUpperCase()}
            </span>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 'var(--r-sm, 4px)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{it.name}</div>
                  {it.status === 'connected' && (
                    <span className="k-chip" style={{ color: 'var(--signal)', borderColor: 'var(--signal-dim)', background: 'var(--signal-soft)' }}>
                      <span className="k-dot k-dot-live" style={{ background: 'var(--signal)' }} />
                      연결됨
                    </span>
                  )}
                  {it.status === 'error' && (
                    <span className="k-chip" style={{ color: 'var(--accent-danger, #f87171)', borderColor: 'var(--accent-danger, #f87171)' }}>
                      <span className="k-dot" style={{ background: 'var(--accent-danger, #f87171)' }} />
                      오류
                    </span>
                  )}
                  {it.status === 'available' && <Tag>미연동</Tag>}
                </div>
                <div className="k-mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.12em' }}>
                  {it.code}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>{it.desc}</div>
                {it.detail && (
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{it.detail}</div>
                )}
                <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 6 }}>
                  {it.status === 'available' ? (
                    <Button
                      size="small"
                      className="k-btn k-btn-sm"
                      onClick={() => message.info(`${it.name} 연동은 준비 중입니다.`)}
                    >
                      연동 시작 →
                    </Button>
                  ) : (
                    <Button size="small" className="k-btn k-btn-sm" onClick={() => void refresh()}>
                      상태 확인
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
