import { DeleteOutlined, EditOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import { formatPhoneNumber } from '../../shared/lib/format';
import {
  createForwardingRule,
  deleteForwardingRule,
  getForwardingRules,
  updateForwardingRule,
} from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskDid, AsteriskForwardingRule } from '../asterisk-config/types/asterisk-config';
import { ForwardingRuleModal, type ForwardingRuleFormValue } from './ForwardingRuleModal';
import { ResponsiveTable } from '../../components/ResponsiveTable';

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

const WEEKDAY_LABELS: Record<string, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

const FORWARD_TYPE_LABELS: Record<AsteriskForwardingRule['forwardType'], string> = {
  EXTERNAL_NUMBER: '외부번호',
  EXTENSION: '내선',
  QUEUE: '호 분배룰',
};

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
      label: did.description ? `${formatPhoneNumber(did.did)} (${did.description})` : formatPhoneNumber(did.did),
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
  const extensionLabelMap = useMemo(
    () => Object.fromEntries(extensionOptions.map((item) => [item.value, item.label])),
    [extensionOptions],
  );

  const queueOptions = useMemo(
    () => queues.map((queue) => ({
      value: queue.queueName,
      label: queue.queueDisplayName ?? queue.queueName,
    })),
    [queues],
  );
  const queueLabelMap = useMemo(
    () => Object.fromEntries(queueOptions.map((item) => [item.value, item.label])),
    [queueOptions],
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
    const conditionType: 'ALWAYS' | 'TIME_RANGE' =
      values.schedules.some((item) => item.conditionType === 'TIME_RANGE') ? 'TIME_RANGE' : 'ALWAYS';
    const payload = {
      ...values,
      conditionType,
      forwardTriggerMode: values.forwardTriggerMode,
      queueWaitSeconds: values.forwardTriggerMode === 'AFTER_QUEUE_WAIT' ? values.queueWaitSeconds : null,
      stickyCallbackWindowMinutes: values.stickyCallbackWindowMinutes,
      timeStart: values.schedules[0]?.conditionType === 'TIME_RANGE' ? values.schedules[0].timeStart : null,
      timeEnd: values.schedules[0]?.conditionType === 'TIME_RANGE' ? values.schedules[0].timeEnd : null,
      daysOfWeek: values.schedules[0]?.conditionType === 'TIME_RANGE' ? values.schedules[0].daysOfWeek : [],
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
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Space align="center">
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
              착신전환 설정
            </Typography.Title>
            <FeatureHelpButton featureKey="forwarding.condition" featureName="착신전환 조건" />
          </Space>
          <Typography.Text type="secondary">
            DID별 우선 라우팅 규칙입니다. 활성 규칙이 있으면 기존 DID의 IVR/큐 설정보다 먼저 적용됩니다.
          </Typography.Text>
        </div>
        {forwardingPermission?.canCreate !== false ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            규칙 등록
          </Button>
        ) : null}
      </Space>

      <ResponsiveTable<AsteriskForwardingRule>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1450 }}
        columns={[
          {
            title: 'DID',
            width: 220,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{formatPhoneNumber(row.did.did)}</Typography.Text>
                <Typography.Text type="secondary">{row.did.description || '-'}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '전환 방식',
            dataIndex: 'forwardType',
            width: 120,
            render: (value: string) => (
              <Tag color={value === 'QUEUE' ? 'processing' : value === 'EXTENSION' ? 'success' : 'warning'}>
                {FORWARD_TYPE_LABELS[value as AsteriskForwardingRule['forwardType']]}
              </Tag>
            ),
          },
          {
            title: '전환 대상',
            width: 220,
            render: (_: unknown, row) => {
              const label =
                row.forwardType === 'QUEUE'
                  ? queueLabelMap[row.targetValue] ?? row.targetValue
                  : row.forwardType === 'EXTENSION'
                    ? extensionLabelMap[row.targetValue] ?? row.targetValue
                    : formatPhoneNumber(row.targetValue);
              return <Typography.Text>{label}</Typography.Text>;
            },
          },
          {
            title: '착신 조건',
            width: 220,
            render: (_: unknown, row) => {
              if (row.forwardTriggerMode === 'AFTER_QUEUE_WAIT') {
                return (
                  <Space direction="vertical" size={0}>
                    <Typography.Text>대기시간 초과</Typography.Text>
                    <Typography.Text type="secondary">{row.queueWaitSeconds ?? '-'}초 후 전환</Typography.Text>
                  </Space>
                );
              }
              if (row.forwardTriggerMode === 'SMART_NO_READY') {
                return <Tag color="default">상담원 없음</Tag>;
              }
              return <Tag color="success">즉시</Tag>;
            },
          },
          {
            title: '적용 조건',
            width: 260,
            render: (_: unknown, row) => {
              const schedules = row.schedules?.filter((item) => item.conditionType === 'TIME_RANGE') ?? [];
              if (schedules.length > 0) {
                return (
                  <Space direction="vertical" size={0}>
                    {schedules.map((schedule, index) => (
                      <Typography.Text key={`${row.id}-schedule-${index}`}>
                        시간 조건 {schedule.daysOfWeek.map((day) => WEEKDAY_LABELS[day] ?? day).join(', ')} {schedule.timeStart}-{schedule.timeEnd}
                      </Typography.Text>
                    ))}
                  </Space>
                );
              }
              return <Tag color="success">항상 적용</Tag>;
            },
          },
          {
            title: '설명',
            render: (_: unknown, row) => {
              const notes = [];
              if (row.description) notes.push(row.description);
              if (row.stickyCallbackWindowMinutes) {
                notes.push(`동일 고객 ${row.stickyCallbackWindowMinutes}분 내 재착신 즉시 연결`);
              }
              return notes.length > 0 ? notes.join(' / ') : '-';
            },
          },
          {
            title: '상태',
            dataIndex: 'enabled',
            width: 90,
            render: (value: boolean) => (
              <Tag color={value ? 'success' : 'default'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '관리',
            width: 120,
            fixed: 'right',
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

      <div style={{ marginTop: 16 }}>
        <Space>
          <SwapOutlined />
          <Typography.Text type="secondary">
            조건형 규칙은 지정된 요일·시간대에만 우선 적용되고, 그 외 시간에는 DID 기본 IVR/큐 설정으로 복귀합니다.
          </Typography.Text>
        </Space>
      </div>

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
    </Card>
  );
}
