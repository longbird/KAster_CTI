import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { downloadCsv } from '../../shared/lib/csv';
import { FeatureHelpButton } from '../../shared/help';
import { formatPhoneNumber } from '../../shared/lib/format';
import { useBranchOptions } from '../../shared/branches/useBranchOptions';
import {
  createBlocklistEntry,
  deleteBlocklistEntry,
  getBlocklistEntries,
  importBlocklistEntries,
  updateBlocklistEntry,
} from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';
import { BLOCKLIST_COPY } from './blocklistCopy';
import { BlocklistEntryModal, type BlocklistEntryFormValue } from './BlocklistEntryModal';
import { BlocklistImportModal, type ImportBlocklistEntryRow } from './BlocklistImportModal';
import { ResponsiveTable } from '../../components/ResponsiveTable';

export function summarizeBlocklistRows(rows: AsteriskBlocklistEntry[]) {
  return rows.reduce(
    (acc, row) => ({
      total: acc.total + 1,
      active: acc.active + (row.isActive ? 1 : 0),
      inactive: acc.inactive + (row.isActive ? 0 : 1),
      prefix: acc.prefix + (row.matchType === 'PREFIX' ? 1 : 0),
      branchScoped: acc.branchScoped + (row.branchId ? 1 : 0),
      automated: acc.automated + (row.sourceType ? 1 : 0),
    }),
    { total: 0, active: 0, inactive: 0, prefix: 0, branchScoped: 0, automated: 0 },
  );
}

export function BlocklistPage() {
  const blocklistPermission = usePermissionStore((state) => state.permissionsByMenu['blocklist']);
  const [rows, setRows] = useState<AsteriskBlocklistEntry[] | null>(null);
  const [editing, setEditing] = useState<AsteriskBlocklistEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { options: branchOptions } = useBranchOptions();

  const load = async () => {
    try {
      setRows(await getBlocklistEntries());
    } catch {
      setRows([]);
      message.error(BLOCKLIST_COPY.loadError);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (values: BlocklistEntryFormValue) => {
    try {
      if (editing) {
        await updateBlocklistEntry(editing.id, values);
        message.success(BLOCKLIST_COPY.editSuccess);
      } else {
        await createBlocklistEntry(values);
        message.success(BLOCKLIST_COPY.createSuccess);
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
      await deleteBlocklistEntry(id);
      message.success(BLOCKLIST_COPY.deleteSuccess);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  const importRows = async (importRows: ImportBlocklistEntryRow[]) => {
    try {
      const result = await importBlocklistEntries(importRows);
      const { successCount, skippedCount, failedCount } = result.summary;
      message.success(`등록 ${successCount}건, 중복 ${skippedCount}건, 실패 ${failedCount}건`);
      setImportOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '가져오기에 실패했습니다.');
      throw error;
    }
  };

  const exportRows = () => {
    if (!rows) {
      return;
    }

    const branchById = new Map(branchOptions.map((branch) => [branch.branchId, branch]));
    downloadCsv(
      `blocklist-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['지사', '대상번호', '사유', '상태', '등록일'],
      rows.map((row) => {
        const branch = row.branchId ? branchById.get(row.branchId) : undefined;
        const branchLabel = branch
          ? `${branch.branchName} (${branch.branchCode})`
          : row.branchId ?? '-';
        return [
          branchLabel,
          formatPhoneNumber(row.normalizedPhoneNumber ?? row.phoneNumber),
          row.description ?? '',
          row.isActive ? '활성' : '비활성',
          row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        ];
      }),
    );
  };

  const branchById = useMemo(() => new Map(branchOptions.map((branch) => [branch.branchId, branch])), [branchOptions]);
  const summary = useMemo(() => summarizeBlocklistRows(rows ?? []), [rows]);

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          marginBottom: 16,
          width: '100%',
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }}>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0, whiteSpace: 'nowrap' }}>
            {BLOCKLIST_COPY.pageTitle}
          </Typography.Title>
          <FeatureHelpButton featureKey="optout.blocklist080" featureName="080 수신거부" />
        </div>
        <Space wrap={false} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {blocklistPermission?.canExport !== false ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows}>
              내보내기
            </Button>
          ) : null}
          {blocklistPermission?.canCreate !== false ? (
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              가져오기
            </Button>
          ) : null}
          {blocklistPermission?.canCreate !== false ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {BLOCKLIST_COPY.createButton}
            </Button>
          ) : null}
        </Space>
      </div>

      <ResponsiveTable<AsteriskBlocklistEntry>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1200 }}
        columns={[
          {
            title: '지사',
            dataIndex: 'branchId',
            width: 200,
            render: (value?: string | null) => {
              if (!value) return '-';
              const branch = branchById.get(value);
              return branch ? `${branch.branchName} (${branch.branchCode})` : value;
            },
          },
          {
            title: '대상번호',
            dataIndex: 'phoneNumber',
            width: 170,
            render: (_: unknown, row) => (
              <Typography.Text code>
                {formatPhoneNumber(row.normalizedPhoneNumber ?? row.phoneNumber)}
              </Typography.Text>
            ),
          },
          {
            title: '사유',
            dataIndex: 'description',
            width: 420,
            ellipsis: true,
            render: (value?: string | null) => (
              <Typography.Text ellipsis={{ tooltip: value || undefined }} style={{ maxWidth: 240 }}>
                {value || '-'}
              </Typography.Text>
            ),
          },
          {
            title: '활성 상태',
            dataIndex: 'isActive',
            width: 100,
            render: (value: boolean) => (
              <Tag color={value ? 'error' : 'default'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 170,
            render: (value?: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
          },
          {
            title: '관리',
            width: 120,
            fixed: 'right',
            render: (_: unknown, row) => (
              <Space>
                {blocklistPermission?.canUpdate !== false ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    수정
                  </Button>
                ) : null}
                {blocklistPermission?.canDelete !== false ? (
                  <Popconfirm title={BLOCKLIST_COPY.deleteConfirm} onConfirm={() => void remove(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <Space wrap>
          <StopOutlined />
          <Tag>전체 {summary.total}</Tag>
          <Tag color="error">활성 {summary.active}</Tag>
          <Tag>비활성 {summary.inactive}</Tag>
          <Tag color="processing">접두어 {summary.prefix}</Tag>
          <Tag color="default">지사 {summary.branchScoped}</Tag>
          <Tag color="success">자동등록 {summary.automated}</Tag>
          <Typography.Text type="secondary">
            접두어 규칙은 동일 패턴으로 시작하는 ANI를 함께 차단합니다.
          </Typography.Text>
        </Space>
      </div>

      {blocklistPermission?.canCreate !== false ? (
        <BlocklistEntryModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSave={save}
        />
      ) : null}
      {blocklistPermission?.canCreate !== false ? (
        <BlocklistImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={importRows}
        />
      ) : null}
      {blocklistPermission?.canUpdate !== false ? (
        <BlocklistEntryModal
          open={!!editing}
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </Card>
  );
}
