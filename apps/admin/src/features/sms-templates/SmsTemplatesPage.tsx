import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  createSmsTemplate,
  deleteSmsTemplate,
  listSmsTemplates,
  updateSmsTemplate,
} from './api/smsTemplatesApi';
import { SmsTemplateModal } from './SmsTemplateModal';
import type {
  ListSmsTemplatesParams,
  SmsTemplateCategory,
  SmsTemplateInput,
  SmsTemplateRow,
} from './types/smsTemplate';
import {
  SMS_TEMPLATE_CATEGORY_LABELS,
  SMS_TEMPLATE_CATEGORY_OPTIONS,
} from './types/smsTemplate';

const ACTIVE_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체 상태' },
  { value: 'true', label: '활성만' },
  { value: 'false', label: '비활성만' },
] as const;

function buildPreviewText(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine) {
    return '-';
  }

  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}...` : firstLine;
}

export function SmsTemplatesPage() {
  const permission = usePermissionStore((state) => state.permissionsByMenu['settings/sms-templates']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const [rows, setRows] = useState<SmsTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [filters, setFilters] = useState<{
    keyword?: string;
    category?: SmsTemplateCategory;
    isActive?: 'true' | 'false';
  }>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SmsTemplateRow | null>(null);

  const load = useCallback(async (nextFilters: ListSmsTemplatesParams) => {
    setLoading(true);
    try {
      const data = await listSmsTemplates(nextFilters);
      setRows(data);
    } catch (error: any) {
      setRows([]);
      message.error(error?.response?.data?.error?.message ?? '문자 템플릿 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = (next: Partial<typeof filters> = {}) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
  };

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const handleSave = async (values: SmsTemplateInput) => {
    try {
      if (editing) {
        await updateSmsTemplate(editing.templateId, values);
        message.success('문자 템플릿을 수정했습니다.');
      } else {
        await createSmsTemplate(values);
        message.success('문자 템플릿을 등록했습니다.');
      }
      setEditing(null);
      setCreateOpen(false);
      await load(filters);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '문자 템플릿 저장에 실패했습니다.');
      throw error;
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      await deleteSmsTemplate(templateId);
      message.success('문자 템플릿을 삭제했습니다.');
      await load(filters);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '문자 템플릿 삭제에 실패했습니다.');
    }
  };

  const categoryFilterValue = filters.category ?? 'ALL';
  const activeFilterValue = filters.isActive ?? 'ALL';

  const columns = useMemo(
    () => [
      {
        title: '템플릿 이름',
        dataIndex: 'templateName',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: '카테고리',
        dataIndex: 'category',
        width: 140,
        render: (value: SmsTemplateCategory) => <Tag>{SMS_TEMPLATE_CATEGORY_LABELS[value]}</Tag>,
      },
      {
        title: '내용 미리보기',
        dataIndex: 'content',
        render: (value: string) => (
          <Typography.Text type="secondary">{buildPreviewText(value)}</Typography.Text>
        ),
      },
      {
        title: '상태',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'default'}>{value ? '활성' : '비활성'}</Tag>
        ),
      },
      {
        title: '수정일',
        dataIndex: 'updatedAt',
        width: 160,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: '관리',
        width: 140,
        fixed: 'right' as const,
        render: (_: unknown, row: SmsTemplateRow) => (
          <Space>
            {canUpdate ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                수정
              </Button>
            ) : null}
            {canDelete ? (
              <Popconfirm
                title="문자 템플릿을 삭제하시겠습니까?"
                description="삭제 후에는 복구할 수 없습니다."
                okText="삭제"
                cancelText="취소"
                onConfirm={() => void handleDelete(row.templateId)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canDelete, canUpdate],
  );

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="start">
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            문자 템플릿 관리
          </Typography.Title>
          <Typography.Text type="secondary">
            080 수신거부, 일반 안내, 예약·알림 템플릿을 독립적으로 관리합니다. 편집기에서 토큰 도움말과
            샘플 치환 미리보기, SMS/LMS 예상 길이를 함께 확인할 수 있습니다.
          </Typography.Text>
        </div>
        {canCreate ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            템플릿 등록
          </Button>
        ) : null}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="템플릿 이름 또는 내용 검색"
          style={{ width: 280 }}
          value={keywordInput}
          onChange={(event) => {
            const nextValue = event.target.value;
            setKeywordInput(nextValue);
            if (!nextValue) {
              applyFilters({ keyword: undefined });
            }
          }}
          onSearch={(value) => applyFilters({ keyword: value.trim() || undefined })}
        />
        <Select
          value={categoryFilterValue}
          style={{ width: 160 }}
          options={[{ value: 'ALL', label: '전체 카테고리' }, ...SMS_TEMPLATE_CATEGORY_OPTIONS]}
          onChange={(value: SmsTemplateCategory | 'ALL') =>
            applyFilters({ category: value === 'ALL' ? undefined : value })
          }
        />
        <Select
          value={activeFilterValue}
          style={{ width: 140 }}
          options={ACTIVE_FILTER_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(value: 'ALL' | 'true' | 'false') =>
            applyFilters({ isActive: value === 'ALL' ? undefined : value })
          }
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeywordInput('');
            setFilters({});
          }}
        >
          필터 초기화
        </Button>
      </Space>

      <Table<SmsTemplateRow>
        rowKey="templateId"
        dataSource={rows}
        loading={loading}
        columns={columns}
        tableLayout="fixed"
        scroll={{ x: 900 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      {canCreate ? (
        <SmsTemplateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSave={handleSave}
        />
      ) : null}
      {canUpdate ? (
        <SmsTemplateModal
          open={!!editing}
          template={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}
    </Card>
  );
}
