import { Button, Card, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

interface Notice {
  id: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  pinned: boolean;
}

const STORAGE_KEY = 'kaster.admin.notices';

function loadNotices(): Notice[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Notice[];
  } catch {
    return [];
  }
}

function saveNotices(items: Notice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function AnnouncementsPage() {
  const [rows, setRows] = useState<Notice[]>(loadNotices);
  const [open, setOpen] = useState(false);
  const [form]          = Form.useForm();

  useEffect(() => { saveNotices(rows); }, [rows]);

  const add = async () => {
    const values = await form.validateFields();
    const notice: Notice = {
      id: crypto.randomUUID(),
      title:     values.title as string,
      body:      values.body as string,
      author:    (values.author as string | undefined) ?? '관리자',
      createdAt: new Date().toISOString(),
      pinned:    false,
    };
    setRows((prev) => [notice, ...prev]);
    form.resetFields();
    setOpen(false);
  };

  const remove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>공지사항</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          공지 등록
        </Button>
      </Space>

      <Table<Notice>
        rowKey="id"
        dataSource={rows}
        size="small"
        expandable={{
          expandedRowRender: (r) => (
            <Typography.Paragraph style={{ margin: 0 }}>{r.body}</Typography.Paragraph>
          ),
        }}
        columns={[
          {
            title: '제목',
            dataIndex: 'title',
            render: (v: string, r: Notice) => (
              <Space>
                {r.pinned && <Tag color="red">고정</Tag>}
                <span>{v}</span>
              </Space>
            ),
          },
          { title: '작성자', dataIndex: 'author', width: 100 },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 140,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '',
            width: 60,
            render: (_: unknown, r: Notice) => (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(r.id)}
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
      >
        <Form form={form} layout="vertical">
          <Form.Item label="제목" name="title" rules={[{ required: true, message: '제목을 입력하세요' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="내용" name="body" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
          <Form.Item label="작성자" name="author">
            <Input maxLength={50} placeholder="관리자" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
