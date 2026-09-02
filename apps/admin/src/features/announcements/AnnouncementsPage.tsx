import { DeleteOutlined, EditOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, Modal, Select, Space, Switch, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface Notice {
  announcementId: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  category?: 'NOTICE' | 'UPDATE';
  targetApp?: 'ADMIN' | 'AGENT' | 'ALL';
  showOnLogin?: boolean;
  severity?: 'INFO' | 'IMPORTANT' | 'CRITICAL';
  releaseTag?: string | null;
  effectiveFrom?: string | null;
  expiresAt?: string | null;
  pinned: boolean;
}

interface NoticeFormValue {
  title: string;
  body: string;
  authorName?: string;
  pinned?: boolean;
  category?: 'NOTICE' | 'UPDATE';
  targetApp?: 'ADMIN' | 'AGENT' | 'ALL';
  showOnLogin?: boolean;
  severity?: 'INFO' | 'IMPORTANT' | 'CRITICAL';
  releaseTag?: string;
  effectiveFrom?: dayjs.Dayjs | null;
  expiresAt?: dayjs.Dayjs | null;
}

function toPayload(values: NoticeFormValue) {
  return {
    ...values,
    effectiveFrom: values.effectiveFrom ? values.effectiveFrom.toISOString() : null,
    expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
  };
}

export function AnnouncementsPage() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form] = Form.useForm<NoticeFormValue>();
  const permission = usePermissionStore((s) => s.permissionsByMenu['announcements']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/announcements');
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
      message.error('공지사항을 불러오지 못했습니다.');
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
      const payload = toPayload(values);
      if (editing) {
        await apiClient.post(`/admin/announcements/${editing.announcementId}`, payload);
        message.success('공지사항을 수정했습니다.');
      } else {
        await apiClient.post('/admin/announcements', payload);
        message.success('공지사항을 등록했습니다.');
      }
      form.resetFields();
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '공지사항 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (announcementId: string) => {
    try {
      await apiClient.delete(`/admin/announcements/${announcementId}`);
      message.success('공지사항을 삭제했습니다.');
      await load();
    } catch {
      message.error('공지사항 삭제에 실패했습니다.');
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          공지사항
        </Typography.Title>
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({
                pinned: false,
                category: 'NOTICE',
                targetApp: 'ALL',
                showOnLogin: false,
                severity: 'INFO',
              });
              setOpen(true);
            }}
          >
            공지 등록
          </Button>
        ) : null}
      </Space>

      <ResponsiveTable<Notice>
        rowKey="announcementId"
        dataSource={rows}
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ x: 1400 }}
        expandable={{
          expandedRowRender: (row) => (
            <Typography.Paragraph style={{ margin: 0 }}>{row.body}</Typography.Paragraph>
          ),
        }}
        columns={[
          {
            title: '제목',
            dataIndex: 'title',
            width: 360,
            render: (value: string, row: Notice) => (
              <Space style={{ maxWidth: '100%' }}>
                {row.pinned && (
                  <Tag color="error" icon={<PushpinOutlined />}>
                    고정
                  </Tag>
                )}
                <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '유형',
            dataIndex: 'category',
            width: 130,
            render: (value: Notice['category'], row: Notice) => (
              <Space size={4}>
                <Tag color={value === 'UPDATE' ? 'processing' : 'default'}>
                  {value === 'UPDATE' ? '업데이트' : '공지'}
                </Tag>
                {row.showOnLogin ? <Tag color="success">로그인</Tag> : null}
              </Space>
            ),
          },
          {
            title: '대상',
            dataIndex: 'targetApp',
            width: 90,
            render: (value: Notice['targetApp']) => {
              const label = value === 'ADMIN' ? '관리자' : value === 'AGENT' ? '상담원' : '전체';
              return <Tag>{label}</Tag>;
            },
          },
          {
            title: '중요도',
            dataIndex: 'severity',
            width: 100,
            render: (value: Notice['severity']) => {
              const color = value === 'CRITICAL' ? 'error' : value === 'IMPORTANT' ? 'warning' : 'default';
              const label = value === 'CRITICAL' ? '긴급' : value === 'IMPORTANT' ? '중요' : '일반';
              return <Tag color={color}>{label}</Tag>;
            },
          },
          {
            title: '내용',
            dataIndex: 'body',
            width: 300,
            render: (value: string) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: value }}>
                {value}
              </Typography.Text>
            ),
          },
          { title: '작성자', dataIndex: 'authorName', width: 120 },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 170,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '관리',
            width: 88,
            fixed: 'right',
            render: (_: unknown, row: Notice) => (
              <Space>
                {canUpdate ? (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue({
                        title: row.title,
                        body: row.body,
                        authorName: row.authorName,
                        pinned: row.pinned,
                        category: row.category ?? 'NOTICE',
                        targetApp: row.targetApp ?? 'ALL',
                        showOnLogin: row.showOnLogin ?? false,
                        severity: row.severity ?? 'INFO',
                        releaseTag: row.releaseTag ?? undefined,
                        effectiveFrom: row.effectiveFrom ? dayjs(row.effectiveFrom) : null,
                        expiresAt: row.expiresAt ? dayjs(row.expiresAt) : null,
                      });
                      setOpen(true);
                    }}
                  />
                ) : null}
                {canDelete ? (
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => void remove(row.announcementId)}
                  />
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '공지 수정' : '공지 등록'}
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
        <Form
          form={form}
          layout="vertical"
          initialValues={{ pinned: false, category: 'NOTICE', targetApp: 'ALL', showOnLogin: false, severity: 'INFO' }}
        >
          <Form.Item label="제목" name="title" rules={[{ required: true, message: '제목을 입력하세요' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="내용" name="body" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Form.Item label="작성자" name="authorName">
            <Input maxLength={50} placeholder="관리자" />
          </Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item label="유형" name="category" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: 'NOTICE', label: '공지' },
                  { value: 'UPDATE', label: '업데이트' },
                ]}
              />
            </Form.Item>
            <Form.Item label="대상" name="targetApp" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: 'ALL', label: '전체' },
                  { value: 'ADMIN', label: '관리자' },
                  { value: 'AGENT', label: '상담원' },
                ]}
              />
            </Form.Item>
            <Form.Item label="중요도" name="severity" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: 'INFO', label: '일반' },
                  { value: 'IMPORTANT', label: '중요' },
                  { value: 'CRITICAL', label: '긴급' },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="릴리스 태그" name="releaseTag">
            <Input maxLength={64} placeholder="2026.08.03" />
          </Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item label="노출 시작" name="effectiveFrom" style={{ flex: 1 }}>
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="노출 종료" name="expiresAt" style={{ flex: 1 }}>
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item label="상단 고정" name="pinned" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="로그인 표시" name="showOnLogin" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
