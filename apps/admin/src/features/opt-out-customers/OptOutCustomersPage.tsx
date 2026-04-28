import { DownloadOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Segmented, Skeleton, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../../store/usePermissionStore';
import { useBranchOptions } from '../../shared/branches/useBranchOptions';
import { downloadCsv } from '../../shared/lib/csv';
import { formatPhoneNumber } from '../../shared/lib/format';
import { getBlocklistEntries, updateBlocklistEntry } from '../asterisk-config/api/asteriskConfigApi';
import type { AsteriskBlocklistEntry } from '../asterisk-config/types/asterisk-config';
import {
  OPT_OUT_CUSTOMERS_MENU_LABEL,
  buildOptOutCustomerCsvRows,
  getOptOutBranchLabel,
  getOptOutDisplayNumber,
  getOptOutRequesterNumber,
  getOptOutSourceLabel,
  isOptOutCustomerEntry,
  toOptOutDeactivatePayload,
} from './optOutCustomers';

type StatusFilter = 'ACTIVE' | 'ALL' | 'INACTIVE';

const CSV_HEADERS = ['상태', '수신거부 번호', '요청 번호', '지사', '080 인입번호', '등록 경로', '등록일', '수정일'];

export function OptOutCustomersPage() {
  const blocklistPermission = usePermissionStore((state) => state.permissionsByMenu.blocklist);
  const [rows, setRows] = useState<AsteriskBlocklistEntry[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const { options: branchOptions } = useBranchOptions();

  const load = async () => {
    try {
      const blocklistRows = await getBlocklistEntries();
      setRows(blocklistRows.filter(isOptOutCustomerEntry));
    } catch (error: any) {
      setRows([]);
      message.error(error?.response?.data?.error?.message ?? '수신거부 고객 내역을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const branchById = useMemo(() => new Map(branchOptions.map((branch) => [branch.branchId, branch])), [branchOptions]);
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (statusFilter === 'ACTIVE') return rows.filter((row) => row.isActive);
    if (statusFilter === 'INACTIVE') return rows.filter((row) => !row.isActive);
    return rows;
  }, [rows, statusFilter]);

  const deactivate = async (row: AsteriskBlocklistEntry) => {
    try {
      await updateBlocklistEntry(row.id, toOptOutDeactivatePayload(row));
      message.success('수신거부가 해제되었습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '수신거부 해제에 실패했습니다.');
    }
  };

  const exportRows = () => {
    downloadCsv(
      `opt-out-customers-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      CSV_HEADERS,
      buildOptOutCustomerCsvRows(filteredRows, branchOptions),
    );
  };

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
        <Typography.Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          {OPT_OUT_CUSTOMERS_MENU_LABEL}
        </Typography.Title>
        <Space wrap>
          <Segmented
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              { label: '활성', value: 'ACTIVE' },
              { label: '전체', value: 'ALL' },
              { label: '해제', value: 'INACTIVE' },
            ]}
          />
          {blocklistPermission?.canExport !== false ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows}>
              내보내기
            </Button>
          ) : null}
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            새로고침
          </Button>
        </Space>
      </div>

      <Table<AsteriskBlocklistEntry>
        rowKey="id"
        dataSource={filteredRows}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1180 }}
        columns={[
          {
            title: '상태',
            dataIndex: 'isActive',
            width: 90,
            render: (value: boolean) => <Tag color={value ? 'red' : 'default'}>{value ? '활성' : '해제'}</Tag>,
          },
          {
            title: '수신거부 번호',
            dataIndex: 'phoneNumber',
            width: 170,
            render: (_: unknown, row) => <Typography.Text code>{getOptOutDisplayNumber(row)}</Typography.Text>,
          },
          {
            title: '요청 번호',
            dataIndex: 'requesterPhoneNumber',
            width: 170,
            render: (_: unknown, row) => <Typography.Text>{getOptOutRequesterNumber(row)}</Typography.Text>,
          },
          {
            title: '지사',
            dataIndex: 'branchId',
            width: 190,
            render: (value?: string | null) => getOptOutBranchLabel(branchById, value),
          },
          {
            title: '080 인입번호',
            dataIndex: 'entryDid',
            width: 160,
            render: (value?: string | null) => (value ? formatPhoneNumber(value) : '-'),
          },
          {
            title: '등록 경로',
            dataIndex: 'sourceType',
            width: 190,
            render: (value?: string | null) => getOptOutSourceLabel(value),
          },
          {
            title: '등록일',
            dataIndex: 'createdAt',
            width: 170,
            render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
          },
          {
            title: '관리',
            width: 110,
            fixed: 'right',
            render: (_: unknown, row) =>
              row.isActive && blocklistPermission?.canUpdate !== false ? (
                <Popconfirm title="이 고객의 수신거부를 해제할까요?" onConfirm={() => void deactivate(row)}>
                  <Button size="small" danger icon={<StopOutlined />}>
                    해제
                  </Button>
                </Popconfirm>
              ) : (
                '-'
              ),
          },
        ]}
      />
    </Card>
  );
}
