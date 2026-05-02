import { DeleteOutlined, EditOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { apiClient } from '../../shared/lib/apiClient';
import { AdmPageHead } from '../../shared/ui/AdmPageHead';
import {
  createForwardingRule,
  deleteForwardingRule,
  getForwardingRules,
  updateForwardingRule,
} from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskDid, AsteriskForwardingRule } from '../asterisk-config/types/asterisk-config';
import { ForwardingRuleModal, type ForwardingRuleFormValue } from './ForwardingRuleModal';

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  isActive: boolean;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string;
  isActive: boolean;
}

export function ForwardingSettingsPage() {
  const forwardingPermission = usePermissionStore((state) => state.permissionsByMenu['settings/forwarding']);
  const [rows, setRows] = useState<AsteriskForwardingRule[] | null>(null);
  const [dids, setDids] = useState<AsteriskDid[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [editing, setEditing] = useState<AsteriskForwardingRule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    try {
      const [rulesRes, didsRes, agentsRes, queuesRes] = await Promise.all([
        getForwardingRules(),
        apiClient.get('/asterisk-config/dids'),
        apiClient.get('/agents'),
        apiClient.get('/queues'),
      ]);
      setRows(rulesRes);
      setDids(didsRes.data?.data ?? []);
      setAgents((agentsRes.data?.data ?? []).filter((item: AgentOption) => item.isActive));
      setQueues((queuesRes.data?.data ?? []).filter((item: QueueOption) => item.isActive));
    } catch {
      setRows([]);
      message.error('착신전환 설정을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const didOptions = useMemo(
    () => dids.map((did) => ({
      value: did.id,
      label: did.description ? `${did.did} (${did.description})` : did.did,
      directQueue: did.directQueue,
    })),
    [dids],
  );

  const extensionOptions = useMemo(
    () => agents.map((agent) => ({
      value: agent.extension,
      label: `${agent.extension} · ${agent.agentName}`,
    })),
    [agents],
  );

  const queueOptions = useMemo(
    () => queues.map((queue) => ({
      value: queue.queueName,
      label: `${queue.queueDisplayName ?? queue.queueName} (${queue.queueName})`,
    })),
    [queues],
  );

  const remove = async (id: string) => {
    try {
      await deleteForwardingRule(id);
      message.success('착신전환 규칙을 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  const save = async (values: ForwardingRuleFormValue) => {
    const payload = {
      ...values,
      conditionType: values.schedules[0]?.conditionType ?? 'ALWAYS',
      timeStart: values.schedules[0]?.timeStart ?? null,
      timeEnd: values.schedules[0]?.timeEnd ?? null,
      daysOfWeek: values.schedules[0]?.daysOfWeek ?? [],
      description: values.description?.trim() ? values.description : null,
    };

    try {
      if (editing) {
        await updateForwardingRule(editing.id, payload);
        message.success('착신전환 규칙을 수정했습니다.');
      } else {
        await createForwardingRule(payload);
        message.success('착신전환 규칙을 등록했습니다.');
      }
      setEditing(null);
      setCreateOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
      throw error;
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <>
      <AdmPageHead
        title="라우팅 룰"
        sub="DID별 우선 라우팅 규칙 · 활성 규칙이 있으면 기존 DID의 IVR/큐 설정보다 먼저 적용됩니다."
        right={
          forwardingPermission?.canCreate !== false ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              className="k-btn k-btn-primary k-btn-sm"
            >
              규칙 등록
            </Button>
          ) : null
        }
      />
      <section className="adm-card">
      <Table<AsteriskForwardingRule>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: 'DID',
            width: 220,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{row.did.did}</Typography.Text>
                <Typography.Text type="secondary">{row.did.description || '-'}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '전환 방식',
            dataIndex: 'forwardType',
            width: 110,
            render: (value: string) => (
              <Tag color={value === 'QUEUE' ? 'blue' : 'green'}>
                {value === 'QUEUE' ? '큐' : '내선'}
              </Tag>
            ),
          },
          {
            title: '전환 대상',
            dataIndex: 'targetValue',
            width: 180,
          },
          {
            title: '설명',
            dataIndex: 'description',
            render: (value?: string | null) => value || '-',
          },
          {
            title: '상태',
            dataIndex: 'enabled',
            width: 90,
            render: (value: boolean) => (
              <Tag color={value ? 'green' : 'default'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '액션',
            width: 180,
            render: (_: unknown, row) => (
              <Space>
                {forwardingPermission?.canUpdate !== false ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    수정
                  </Button>
                ) : null}
                {forwardingPermission?.canDelete !== false ? (
                  <Popconfirm title="규칙을 삭제하시겠습니까?" onConfirm={() => void remove(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <div style={{ marginTop: 16, padding: '12px 14px', borderTop: '1px solid var(--line-1)' }}>
        <Space>
          <SwapOutlined style={{ color: 'var(--fg-3)' }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            현재 1차 범위는 DID 기준 무조건 전환만 지원합니다. 시간대/조건부 전환은 후속 범위입니다.
          </Typography.Text>
        </Space>
      </div>
      </section>

      {forwardingPermission?.canCreate !== false ? (
        <ForwardingRuleModal
          open={createOpen}
          didOptions={didOptions}
          extensionOptions={extensionOptions}
          queueOptions={queueOptions}
          onClose={() => setCreateOpen(false)}
          onSave={save}
        />
      ) : null}
      {forwardingPermission?.canUpdate !== false ? (
        <ForwardingRuleModal
          open={!!editing}
          rule={editing}
          didOptions={didOptions}
          extensionOptions={extensionOptions}
          queueOptions={queueOptions}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </>
  );
}
