import { Skeleton, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import {
  buildNumberResourceRows,
  type NumberResourceRow,
  type NumberResourceType,
} from './numberResources';

interface DidRow {
  id: string;
  did: string;
  description?: string | null;
  primaryQueueName?: string | null;
  ivrMenuName?: string | null;
  directQueue?: string | null;
  ivrMenuId?: string | null;
  recordingEnabled?: boolean;
  representativeNumber?: string | null;
  isActive?: boolean;
}

interface AgentExtRow {
  agentId: string;
  loginId: string;
  agentName: string;
  extension: string;
  isActive: boolean;
}

interface QueueNumberRow {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
  queueExten?: string | null;
  isActive?: boolean;
}

const RESOURCE_TYPE_LABEL: Record<NumberResourceType, string> = {
  DID: 'DID',
  EXTENSION: '상담원 내선',
  QUEUE: '호 분배룰 내선',
  FEATURE_CODE: '기능 코드',
};

export function NumbersPage() {
  const [dids, setDids] = useState<DidRow[] | null>(null);
  const [agents, setAgents] = useState<AgentExtRow[] | null>(null);
  const [queues, setQueues] = useState<QueueNumberRow[] | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [didsRes, agentsRes, queuesRes] = await Promise.all([
          apiClient.get('/asterisk-config/dids').catch(() => ({ data: { data: [] } })),
          apiClient.get('/agents').catch(() => ({ data: { data: [] } })),
          apiClient.get('/queues').catch(() => ({ data: { data: [] } })),
        ]);
        if (!active) return;
        setDids(didsRes.data?.data ?? []);
        setAgents(agentsRes.data?.data ?? []);
        setQueues(queuesRes.data?.data ?? []);
      } catch {
        if (!active) return;
        setDids([]);
        setAgents([]);
        setQueues([]);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const extRange = useMemo(() => {
    if (!agents || agents.length === 0) return '-';
    const nums = agents.map((a) => Number(a.extension)).filter((n) => !Number.isNaN(n));
    if (!nums.length) return '-';
    return `${Math.min(...nums)} – ${Math.max(...nums)}`;
  }, [agents]);

  const numberResources = useMemo(
    () => buildNumberResourceRows({ dids: dids ?? [], agents: agents ?? [], queues: queues ?? [] }),
    [dids, agents, queues],
  );

  if (!dids || !agents || !queues) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <>
      <AdmPageHead
        title="DID / 내선"
        sub={`대표번호 ${dids.length}개 · 내선 ${agents.length}개 · 범위 ${extRange}`}
      />

      <div className="adm-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <div className="adm-kpi">
          <div className="adm-kpi-label"><span>DID 총 개수</span><span className="k-mono">ACTIVE</span></div>
          <div className="adm-kpi-value">{dids.filter((d) => d.isActive !== false).length}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi-label"><span>녹취 활성</span><span className="k-mono">REC</span></div>
          <div className="adm-kpi-value">{dids.filter((d) => d.recordingEnabled).length}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi-label"><span>내선 총 개수</span><span className="k-mono">EXT</span></div>
          <div className="adm-kpi-value">{agents.length}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi-label"><span>활성 내선</span><span className="k-mono">ONLINE</span></div>
          <div className="adm-kpi-value">{agents.filter((a) => a.isActive).length}</div>
        </div>
      </div>

      <section className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-head" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)' }}>
          <strong style={{ fontSize: 13 }}>번호 자원 / 기능 코드</strong>
          <span className="k-mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 8, letterSpacing: '0.1em' }}>
            ROUTING INDEX
          </span>
        </div>
        <Table<NumberResourceRow>
          rowKey="id"
          dataSource={numberResources}
          pagination={false}
          size="small"
          columns={[
            {
              title: '번호',
              dataIndex: 'number',
              width: 140,
              render: (value: string, row) => (
                <Typography.Text className="k-mono" type={row.hasConflict ? 'danger' : undefined}>
                  {value}
                </Typography.Text>
              ),
            },
            {
              title: '유형',
              dataIndex: 'resourceType',
              width: 140,
              render: (value: NumberResourceType) => RESOURCE_TYPE_LABEL[value],
            },
            { title: '이름', dataIndex: 'label' },
            { title: '연결/동작', dataIndex: 'routeSummary' },
            {
              title: '화면 이동',
              dataIndex: 'targetRoute',
              render: (value: string | null) => value ? <span className="k-mono">{value}</span> : '-',
            },
            {
              title: '충돌',
              dataIndex: 'hasConflict',
              width: 80,
              render: (value: boolean) => value ? <Tag color="red">충돌</Tag> : <Tag color="green">정상</Tag>,
            },
          ]}
        />
      </section>

      <section className="adm-card">
        <div className="adm-card-head" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)' }}>
          <strong style={{ fontSize: 13 }}>DID</strong>
          <span className="k-mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 8, letterSpacing: '0.1em' }}>
            REPRESENTATIVE NUMBERS
          </span>
        </div>
        <Table<DidRow>
          rowKey="id"
          dataSource={dids}
          pagination={false}
          size="small"
          locale={{ emptyText: '등록된 DID가 없습니다.' }}
          columns={[
            {
              title: '번호',
              dataIndex: 'did',
              width: 160,
              render: (v: string) => <span className="k-mono">{v}</span>,
            },
            { title: '설명', dataIndex: 'description', render: (v?: string | null) => v || '-' },
            {
              title: '대표번호',
              dataIndex: 'representativeNumber',
              render: (v?: string | null) => v ? <span className="k-mono">{v}</span> : '-',
            },
            {
              title: '큐 / IVR',
              render: (_: unknown, r: DidRow) => {
                if (r.ivrMenuName || r.ivrMenuId) return r.ivrMenuName || 'ARS 사용';
                return r.primaryQueueName || r.directQueue || '-';
              },
            },
            {
              title: '녹취',
              dataIndex: 'recordingEnabled',
              width: 80,
              render: (v?: boolean) => v ? <Tag color="green">REC</Tag> : <Tag>OFF</Tag>,
            },
            {
              title: '상태',
              dataIndex: 'isActive',
              width: 80,
              render: (v?: boolean) => v === false ? <Tag>비활성</Tag> : <Tag color="green">활성</Tag>,
            },
          ]}
        />
      </section>

      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)' }}>
          <strong style={{ fontSize: 13 }}>내선</strong>
          <span className="k-mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 8, letterSpacing: '0.1em' }}>
            EXTENSIONS
          </span>
        </div>
        <Table<AgentExtRow>
          rowKey="agentId"
          dataSource={agents}
          pagination={false}
          size="small"
          columns={[
            {
              title: '내선',
              dataIndex: 'extension',
              width: 120,
              render: (v: string) => <span className="k-mono">{v}</span>,
            },
            { title: '이름', dataIndex: 'agentName', width: 160 },
            { title: '로그인 ID', dataIndex: 'loginId', render: (v: string) => <span className="k-mono">{v}</span> },
            {
              title: '상태',
              dataIndex: 'isActive',
              width: 80,
              render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>,
            },
          ]}
        />
      </section>
    </>
  );
}
