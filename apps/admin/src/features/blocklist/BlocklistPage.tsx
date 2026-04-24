import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { downloadCsv } from '../../shared/lib/csv';
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
      ['전화번호', '요청자 전화번호', '소스 유형', 'DID', '지사', '매칭', '사유', '상태', '등록일'],
      rows.map((row) => {
        const branch = row.branchId ? branchById.get(row.branchId) : undefined;
        const branchLabel = branch
          ? `${branch.branchName} (${branch.branchCode})`
          : row.branchId ?? '-';
        return [
          row.normalizedPhoneNumber ?? row.phoneNumber,
          row.normalizedRequesterPhone ?? row.requesterPhoneNumber ?? '-',
          row.sourceType ?? '-',
          row.entryDid ?? '-',
          branchLabel,
          row.matchType === 'PREFIX' ? '접두어' : '정확히 일치',
          row.description ?? '',
          row.isActive ? '활성' : '비활성',
          row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        ];
      }),
    );
  };

  const branchById = useMemo(() => new Map(branchOptions.map((branch) => [branch.branchId, branch])), [branchOptions]);

  if (!rows) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="start">
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            {BLOCKLIST_COPY.pageTitle}
          </Typography.Title>
          <Typography.Text type="secondary">
            {BLOCKLIST_COPY.pageDescription}
          </Typography.Text>
        </div>
        <Space wrap>
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
      </Space>

      <Table<AsteriskBlocklistEntry>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1560 }}
        columns={[
          {
            title: '대상 전화',
            dataIndex: 'phoneNumber',
            width: 180,
            render: (_: unknown, row) => (
              <Typography.Text code>
                {row.normalizedPhoneNumber ?? row.phoneNumber}
              </Typography.Text>
            ),
          },
          {
            title: '요청자 전화',
            width: 180,
            render: (_: unknown, row) => (
              <Typography.Text code>
                {row.normalizedRequesterPhone ?? row.requesterPhoneNumber ?? '-'}
              </Typography.Text>
            ),
          },
          {
            title: '소스 유형',
            dataIndex: 'sourceType',
            width: 150,
            render: (value?: string | null) => value ? <Tag color={value.startsWith('OPT_OUT_') ? 'green' : 'blue'}>{value}</Tag> : '-',
          },
          {
            title: 'Entry DID',
            dataIndex: 'entryDid',
            width: 160,
            render: (value?: string | null) => value ? <Typography.Text code>{value}</Typography.Text> : '-',
          },
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
            title: '매칭',
            dataIndex: 'matchType',
            width: 120,
            render: (value: 'EXACT' | 'PREFIX') => (
              <Tag color={value === 'PREFIX' ? 'orange' : 'red'}>
                {value === 'PREFIX' ? '접두어' : '정확히 일치'}
              </Tag>
            ),
          },
          {
            title: '사유',
            dataIndex: 'description',
            render: (value?: string | null) => value || '-',
          },
          {
            title: '활성 상태',
            dataIndex: 'isActive',
            width: 100,
            render: (value: boolean) => (
              <Tag color={value ? 'red' : 'default'}>{value ? '활성' : '비활성'}</Tag>
            ),
          },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 160,
            render: (value?: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
          },
          {
            title: '액션',
            width: 180,
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
        <Space>
          <StopOutlined />
          <Typography.Text type="secondary">
            접두어 규칙은 동일 패턴으로 시작하는 ANI를 함께 차단합니다. 차단 이력 집계는 아직 후속 범위입니다.
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
