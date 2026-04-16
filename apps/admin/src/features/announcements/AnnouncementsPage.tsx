import { DeleteOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';

interface Notice {
  announcementId: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  pinned: boolean;
}

export function AnnouncementsPage() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ title: string; body: string; authorName?: string; pinned?: boolean }>();

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

  const add = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await apiClient.post('/admin/announcements', values);
      message.success('공지사항을 등록했습니다.');
      form.resetFields();
      setOpen(false);
      await load();
    } catch {
      message.error('공지사항 등록에 실패했습니다.');
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          공지 등록
        </Button>
      </Space>

      <Table<Notice>
        rowKey="announcementId"
        dataSource={rows}
        loading={loading}
        size="small"
        expandable={{
          expandedRowRender: (row) => (
            <Typography.Paragraph style={{ margin: 0 }}>{row.body}</Typography.Paragraph>
          ),
        }}
        columns={[
          {
            title: '제목',
            dataIndex: 'title',
            render: (value: string, row: Notice) => (
              <Space>
                {row.pinned && (
                  <Tag color="red" icon={<PushpinOutlined />}>
                    고정
                  </Tag>
                )}
                <span>{value}</span>
              </Space>
            ),
          },
          { title: '작성자', dataIndex: 'authorName', width: 100 },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 160,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '',
            width: 60,
            render: (_: unknown, row: Notice) => (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => void remove(row.announcementId)}
              />
            ),
          },
        ]}
      />

      <Modal
        title="공지 등록"
        open={open}
        onOk={() => void add()}
        onCancel={() => setOpen(false)}
        okText="등록"
        cancelText="취소"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ pinned: false }}>
          <Form.Item label="제목" name="title" rules={[{ required: true, message: '제목을 입력하세요' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="내용" name="body" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Form.Item label="작성자" name="authorName">
            <Input maxLength={50} placeholder="관리자" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
