import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import { getDistributionRuleLabels, type AgentGroupDistributionRule } from './agentGroupDistributionRules';

interface AgentGroupRow {
  agentGroupId: string;
  groupCode: string;
  groupName: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  distributionRuleCount?: number;
  distributionRules?: AgentGroupDistributionRule[];
  createdAt: string;
  updatedAt: string;
}

interface FormValues {
  groupCode: string;
  groupName: string;
  description?: string;
  isActive?: boolean;
}

export function AgentGroupsPage() {
  const [rows, setRows] = useState<AgentGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentGroupRow | null>(null);
  const [form] = Form.useForm<FormValues>();
  const permission = usePermissionStore((s) => s.permissionsByMenu['settings/agent-groups']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/settings/agent-groups');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
      message.error('상담원 그룹을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.post(`/admin/settings/agent-groups/${editing.agentGroupId}`, values);
        message.success('상담원 그룹을 수정했습니다.');
      } else {
        await apiClient.post('/admin/settings/agent-groups', values);
        message.success('상담원 그룹을 등록했습니다.');
      }
      form.resetFields();
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (agentGroupId: string) => {
    try {
      await apiClient.delete(`/admin/settings/agent-groups/${agentGroupId}`);
      message.success('상담원 그룹을 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          상담원 그룹
        </Typography.Title>
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({ isActive: true });
              setOpen(true);
            }}
          >
            그룹 등록
          </Button>
        ) : null}
      </Space>

      <Table<AgentGroupRow>
        rowKey="agentGroupId"
        dataSource={rows}
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ x: 980 }}
        columns={[
          { title: '그룹 코드', dataIndex: 'groupCode', width: 180 },
          { title: '그룹명', dataIndex: 'groupName', width: 220 },
          {
            title: '설명',
            dataIndex: 'description',
            render: (v: string | null) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: v ?? '' }}>
                {v ?? ''}
              </Typography.Text>
            ),
          },
          {
            title: '소속 인원',
            dataIndex: 'memberCount',
            width: 100,
            align: 'right',
            render: (v: number) => `${v}명`,
          },
          {
            title: '연결 호 분배룰',
            dataIndex: 'distributionRules',
            width: 220,
            render: (_: unknown, row) => {
              const labels = getDistributionRuleLabels(row.distributionRules);
              if (labels.length === 0) return <Tag>없음</Tag>;
              return (
                <Space size={[4, 4]} wrap>
                  {labels.slice(0, 3).map((label) => (
                    <Tag key={label} color="blue">
                      {label}
                    </Tag>
                  ))}
                  {labels.length > 3 ? <Tag>{`+${labels.length - 3}`}</Tag> : null}
                </Space>
              );
            },
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            width: 80,
            render: (v: boolean) =>
              v ? <Tag color="green">사용</Tag> : <Tag color="default">미사용</Tag>,
          },
          {
            title: '수정일',
            dataIndex: 'updatedAt',
            width: 160,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '관리',
            width: 110,
            fixed: 'right',
            render: (_: unknown, row: AgentGroupRow) => (
              <Space>
                {canUpdate ? (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue({
                        groupCode: row.groupCode,
                        groupName: row.groupName,
                        description: row.description ?? undefined,
                        isActive: row.isActive,
                      });
                      setOpen(true);
                    }}
                  />
                ) : null}
                {canDelete ? (
                  <Popconfirm
                    title="그룹 삭제"
                    description={
                      row.memberCount > 0
                        ? `소속 상담원 ${row.memberCount}명의 그룹 지정이 해제됩니다.`
                        : '되돌릴 수 없습니다.'
                    }
                    okText="삭제"
                    cancelText="취소"
                    onConfirm={() => void remove(row.agentGroupId)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '그룹 수정' : '그룹 등록'}
        open={open}
        onOk={() => void submit()}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        okText={editing ? '저장' : '등록'}
        cancelText="취소"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ isActive: true }}>
          <Form.Item
            label="그룹 코드"
            name="groupCode"
            rules={[
              { required: true, message: '그룹 코드를 입력하세요' },
              { pattern: /^[A-Za-z0-9_\-]+$/, message: '영문/숫자/_/- 만 허용합니다' },
              { max: 32 },
            ]}
            tooltip="시스템 내부 식별자. 영문 대문자 권장."
          >
            <Input placeholder="예: TEAM_A" disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item
            label="그룹명"
            name="groupName"
            rules={[
              { required: true, message: '그룹명을 입력하세요' },
              { max: 128 },
            ]}
          >
            <Input placeholder="예: 영업 1팀" />
          </Form.Item>
          <Form.Item label="설명" name="description">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item label="사용 여부" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
