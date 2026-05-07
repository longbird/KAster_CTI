import { DeleteOutlined, EditOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  createPrompt,
  deletePrompt,
  getPrompts,
  updatePrompt,
} from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskPrompt } from '../asterisk-config/types/asterisk-config';
import { PromptModal, type PromptFormValue } from './PromptModal';

export function PromptSettingsPage() {
  const promptPermission = usePermissionStore((state) => state.permissionsByMenu['settings/prompts']);
  const [rows, setRows] = useState<AsteriskPrompt[] | null>(null);
  const [editing, setEditing] = useState<AsteriskPrompt | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    try {
      setRows(await getPrompts());
    } catch {
      setRows([]);
      message.error('멘트 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (values: PromptFormValue) => {
    try {
      if (editing) {
        await updatePrompt(editing.id, values);
        message.success('멘트를 수정했습니다.');
      } else {
        await createPrompt(values);
        message.success('멘트를 등록했습니다.');
      }
      setEditing(null);
      setCreateOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
      throw error;
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePrompt(id);
      message.success('멘트를 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            멘트 관리
          </Typography.Title>
          <Typography.Text type="secondary">
            PBX Playback에서 사용하는 멘트 정보와 음성 파일을 관리합니다.
          </Typography.Text>
        </div>
        {promptPermission?.canCreate !== false ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            멘트 등록
          </Button>
        ) : null}
      </Space>

      <Table<AsteriskPrompt>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: 1210 }}
        columns={[
          {
            title: '프롬프트',
            width: 260,
            render: (_: unknown, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{row.displayName}</Typography.Text>
                <Typography.Text code>{row.promptKey}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '파일명',
            dataIndex: 'fileName',
            width: 220,
          },
          {
            title: '카테고리',
            dataIndex: 'category',
            width: 100,
            render: (value: string) => <Tag>{value}</Tag>,
          },
          {
            title: '설명',
            dataIndex: 'description',
            width: 420,
            render: (value?: string | null) => value || '-',
          },
          {
            title: '상태',
            dataIndex: 'isActive',
            width: 90,
            render: (value: boolean) => (
              <Tag color={value ? 'green' : 'default'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '관리',
            width: 120,
            fixed: 'right',
            render: (_: unknown, row) => (
              <Space>
                {promptPermission?.canUpdate !== false ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    수정
                  </Button>
                ) : null}
                {promptPermission?.canDelete !== false ? (
                  <Popconfirm title="멘트를 삭제하시겠습니까?" onConfirm={() => void remove(row.id)}>
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
          <SoundOutlined />
          <Typography.Text type="secondary">
            활성 멘트만 IVR 메뉴에서 선택할 수 있습니다.
          </Typography.Text>
        </Space>
      </div>

      {promptPermission?.canCreate !== false ? (
        <PromptModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSave={save}
        />
      ) : null}
      {promptPermission?.canUpdate !== false ? (
        <PromptModal
          open={!!editing}
          prompt={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </Card>
  );
}
