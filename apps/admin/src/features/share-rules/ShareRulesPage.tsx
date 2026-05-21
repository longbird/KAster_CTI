import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons';
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
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import { ShareRuleEditDrawer } from './ShareRuleEditDrawer';

interface ShareRuleRow {
  shareRuleId: string;
  ruleCode: string;
  ruleName: string;
  description: string | null;
  isActive: boolean;
  _count?: { agents: number; agentGroups: number; branches: number };
}

interface FormValues {
  ruleCode: string;
  ruleName: string;
  description?: string;
  isActive: boolean;
}

export function ShareRulesPage() {
  const [rows, setRows] = useState<ShareRuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShareRuleRow | null>(null);
  const [form] = Form.useForm<FormValues>();

  const [drawerRuleId, setDrawerRuleId] = useState<string | null>(null);

  const permission = usePermissionStore((s) => s.permissionsByMenu['settings/share-rules']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/settings/share-rules');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
      message.error('공유규칙 목록을 불러오지 못했습니다.');
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
      const payload = {
        ...values,
        description: values.description || null,
      };
      if (editing) {
        await apiClient.post(`/admin/settings/share-rules/${editing.shareRuleId}`, payload);
        message.success('공유규칙을 수정했습니다.');
      } else {
        await apiClient.post('/admin/settings/share-rules', payload);
        message.success('공유규칙을 등록했습니다.');
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

  const remove = async (shareRuleId: string) => {
    try {
      await apiClient.delete(`/admin/settings/share-rules/${shareRuleId}`);
      message.success('공유규칙을 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  return (
    <>
      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            공유규칙 (호 분배 매트릭스)
          </Typography.Title>
          {canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldsValue({
                  ruleCode: '',
                  ruleName: '',
                  description: '',
                  isActive: true,
                });
                setOpen(true);
              }}
            >
              공유규칙 등록
            </Button>
          ) : null}
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          룰별로 상담원·그룹 우선순위와 지사 적용 범위를 정의합니다. 매트릭스를 저장하면 연결된 지사의 PBX 큐 멤버가 동기화됩니다.
        </Typography.Paragraph>

        <Table<ShareRuleRow>
          rowKey="shareRuleId"
          dataSource={rows}
          loading={loading}
          size="small"
          columns={[
            { title: '코드', dataIndex: 'ruleCode', width: 140 },
            { title: '이름', dataIndex: 'ruleName' },
            {
              title: '설명',
              dataIndex: 'description',
              render: (v: string | null) => v ?? '',
            },
            {
              title: '상담원',
              width: 90,
              render: (_: unknown, r: ShareRuleRow) => r._count?.agents ?? 0,
            },
            {
              title: '그룹',
              width: 80,
              render: (_: unknown, r: ShareRuleRow) => r._count?.agentGroups ?? 0,
            },
            {
              title: '지사',
              width: 80,
              render: (_: unknown, r: ShareRuleRow) => r._count?.branches ?? 0,
            },
            {
              title: '사용',
              dataIndex: 'isActive',
              width: 70,
              render: (v: boolean) => (v ? <Tag color="green">사용</Tag> : <Tag>중지</Tag>),
            },
            {
              title: '관리',
              width: 200,
              fixed: 'right',
              render: (_: unknown, row: ShareRuleRow) => (
                <Space>
                  <Button
                    size="small"
                    icon={<SettingOutlined />}
                    onClick={() => setDrawerRuleId(row.shareRuleId)}
                  >
                    매트릭스
                  </Button>
                  {canUpdate ? (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(row);
                        form.setFieldsValue({
                          ruleCode: row.ruleCode,
                          ruleName: row.ruleName,
                          description: row.description ?? '',
                          isActive: row.isActive,
                        });
                        setOpen(true);
                      }}
                    />
                  ) : null}
                  {canDelete ? (
                    <Popconfirm
                      title="삭제하시겠습니까? 매트릭스도 함께 삭제됩니다."
                      onConfirm={() => remove(row.shareRuleId)}
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

      <Modal
        open={open}
        title={editing ? '공유규칙 수정' : '공유규칙 등록'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={submit}
        confirmLoading={submitting}
        okText="저장"
        cancelText="취소"
        destroyOnClose
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ isActive: true }}
        >
          <Form.Item
            label="코드"
            name="ruleCode"
            rules={[
              { required: true, message: '코드를 입력하세요.' },
              {
                pattern: /^[A-Za-z0-9_\-]{1,32}$/,
                message: '영숫자/하이픈/언더스코어 1~32자',
              },
            ]}
          >
            <Input placeholder="예: VIP_HIGH_PRIORITY" />
          </Form.Item>
          <Form.Item
            label="이름"
            name="ruleName"
            rules={[{ required: true, message: '이름을 입력하세요.' }, { max: 128 }]}
          >
            <Input placeholder="공유규칙 이름" />
          </Form.Item>
          <Form.Item label="설명" name="description">
            <Input.TextArea rows={3} placeholder="용도 / 비고" />
          </Form.Item>
          <Form.Item label="사용 여부" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <ShareRuleEditDrawer
        shareRuleId={drawerRuleId}
        onClose={() => {
          setDrawerRuleId(null);
          void load();
        }}
      />
    </>
  );
}
