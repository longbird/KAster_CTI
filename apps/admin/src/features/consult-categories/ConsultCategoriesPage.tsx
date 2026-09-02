import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Popconfirm, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResponsiveTable } from '../../components/ResponsiveTable';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  createConsultCategory,
  deleteConsultCategory,
  listConsultCategories,
  updateConsultCategory,
} from './api/consultCategoriesApi';
import { ConsultCategoryModal, type ConsultCategoryFormValues } from './ConsultCategoryModal';
import type { ConsultCategoryRow, ConsultCategoryTreeRow } from './types/consultCategory';
import { buildCategoryTree, CATEGORY_LEVEL_LABELS } from './types/consultCategory';

const LEVEL_COLORS: Record<number, string> = { 1: 'processing', 2: 'processing', 3: 'default' };

export function ConsultCategoriesPage() {
  const permission = usePermissionStore((state) => state.permissionsByMenu['settings/consult-categories']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const [rows, setRows] = useState<ConsultCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ConsultCategoryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listConsultCategories());
    } catch (error) {
      console.error(error);
      message.error('상담분류를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildCategoryTree(rows), [rows]);

  const handleSubmit = async (values: ConsultCategoryFormValues) => {
    setSaving(true);
    try {
      if (editTarget) {
        await updateConsultCategory(editTarget.categoryId, {
          name: values.name,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        });
        message.success('상담분류를 수정했습니다.');
      } else {
        await createConsultCategory({
          code: values.code.toUpperCase(),
          name: values.name,
          parentCategoryId: values.parentCategoryId,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        });
        message.success('상담분류를 등록했습니다.');
      }
      setModalOpen(false);
      setEditTarget(null);
      await load();
    } catch (error: any) {
      console.error(error);
      message.error(error?.response?.data?.error?.message ?? '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ConsultCategoryRow) => {
    try {
      await deleteConsultCategory(row.categoryId);
      message.success('상담분류를 삭제했습니다.');
      await load();
    } catch (error: any) {
      console.error(error);
      message.error(error?.response?.data?.error?.message ?? '삭제하지 못했습니다.');
    }
  };

  const columns = [
    {
      title: '분류명',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: ConsultCategoryTreeRow) => (
        <Space size={8}>
          <Tag color={LEVEL_COLORS[row.level] ?? 'default'}>
            {CATEGORY_LEVEL_LABELS[row.level] ?? `L${row.level}`}
          </Tag>
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '코드',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Typography.Text code>{code}</Typography.Text>,
    },
    { title: '정렬', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
    {
      title: '상태',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) =>
        isActive ? <Tag color="success">활성</Tag> : <Tag>비활성</Tag>,
    },
    {
      title: '관리',
      key: 'actions',
      width: 160,
      render: (_: unknown, row: ConsultCategoryTreeRow) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!canUpdate}
            onClick={() => {
              setEditTarget(row);
              setModalOpen(true);
            }}
          >
            수정
          </Button>
          <Popconfirm
            title="이 분류를 삭제할까요?"
            description="하위 분류가 남아 있으면 삭제되지 않습니다."
            okText="삭제"
            cancelText="취소"
            disabled={!canDelete}
            onConfirm={() => handleDelete(row)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!canDelete}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="상담분류 관리"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={() => {
              setEditTarget(null);
              setModalOpen(true);
            }}
          >
            분류 등록
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="대분류 - 중분류 - 소분류 3단계까지 만들 수 있습니다."
        description="여기 등록한 분류를 기준으로 통화 AI 분석이 상담 유형을 배정하고, 통계에서 유형별 건수를 집계합니다."
      />

      <ResponsiveTable>
        <ResponsiveTable<ConsultCategoryTreeRow>
          rowKey="categoryId"
          columns={columns}
          dataSource={tree}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </ResponsiveTable>

      <ConsultCategoryModal
        open={modalOpen}
        saving={saving}
        target={editTarget}
        categories={rows}
        onCancel={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
