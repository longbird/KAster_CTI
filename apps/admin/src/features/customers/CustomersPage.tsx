import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { downloadCsv } from '../../shared/lib/csv';
import { usePermissionStore } from '../../store/usePermissionStore';
import { createCustomer, deleteCustomer, importCustomers, listCustomers, updateCustomer } from './api/customersApi';
import { CustomerDetailDrawer } from './CustomerDetailDrawer';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerImportModal } from './CustomerImportModal';
import type { CustomerFormInput, CustomerRow } from './types/customer';

interface Props {
  initialGrade?: 'NORMAL' | 'VIP' | 'BLACK';
  title?: string;
}

const GRADE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  VIP: 'gold',
  BLACK: 'red',
};

export function CustomersPage({ initialGrade, title = '고객 목록' }: Props) {
  const permission = usePermissionStore((state) => state.permissionsByMenu.customers);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [grade, setGrade] = useState<'NORMAL' | 'VIP' | 'BLACK' | undefined>(initialGrade);
  const [registeredRange, setRegisteredRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [lastCalledRange, setLastCalledRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listCustomers({
        keyword: keyword || undefined,
        grade,
        registeredFrom: registeredRange?.[0]?.startOf('day').toISOString(),
        registeredTo: registeredRange?.[1]?.endOf('day').toISOString(),
        lastCalledFrom: lastCalledRange?.[0]?.startOf('day').toISOString(),
        lastCalledTo: lastCalledRange?.[1]?.endOf('day').toISOString(),
      });
      setRows(data);
    } catch {
      setRows([]);
      message.error('고객 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [grade]);

  const exportRows = () => {
    downloadCsv(
      `customers-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      ['대표전화번호', '성명', '등급', '추가전화번호', '등록일', '최종통화일', '기본메모'],
      rows.map((row) => [
        row.primaryPhoneNumber ?? '-',
        row.customerName ?? '-',
        row.grade,
        (row.extraPhoneNumbers ?? []).join(', '),
        dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        row.lastCalledAt ? dayjs(row.lastCalledAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        row.memo ?? '',
      ]),
    );
  };

  const saveCustomer = async (values: CustomerFormInput) => {
    try {
      if (editing) {
        await updateCustomer(editing.customerId, values);
        message.success('고객 정보를 수정했습니다.');
      } else {
        await createCustomer(values);
        message.success('고객을 등록했습니다.');
      }
      setEditing(null);
      setCreateOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
      throw error;
    }
  };

  const removeCustomer = async (customerId: string) => {
    try {
      await deleteCustomer(customerId);
      message.success('고객을 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  const gradeSummary = useMemo(() => {
    if (initialGrade === 'BLACK') return 'BLACK 등급 고객만 조회합니다.';
    return '대표 전화번호 1개 필수, 추가 전화번호는 선택 등록입니다.';
  }, [initialGrade]);

  return (
    <Card>
      <div className="customers-page__header">
        <div className="customers-page__heading">
          <Typography.Title level={4} className="customers-page__title">
            {title}
          </Typography.Title>
          <Typography.Text type="secondary" className="customers-page__summary">
            {gradeSummary}
          </Typography.Text>
        </div>
        <Space wrap className="customers-page__toolbar">
          {permission?.canCreate !== false ? (
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              파일 가져오기
            </Button>
          ) : null}
          {permission?.canExport !== false ? (
            <Button icon={<DownloadOutlined />} onClick={exportRows}>
              내보내기
            </Button>
          ) : null}
          {permission?.canCreate !== false ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              고객 등록
            </Button>
          ) : null}
        </Space>
      </div>

      <Space wrap className="customers-page__filters">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="전화번호 또는 성명 검색"
          style={{ width: 240 }}
        />
        <Select
          allowClear
          value={grade}
          onChange={(value) => setGrade(value)}
          style={{ width: 140 }}
          options={[
            { value: 'NORMAL', label: '일반' },
            { value: 'VIP', label: 'VIP' },
            { value: 'BLACK', label: 'BLACK' },
          ]}
        />
        <DatePicker.RangePicker value={registeredRange} onChange={(value) => setRegisteredRange((value as [Dayjs, Dayjs]) ?? null)} />
        <DatePicker.RangePicker value={lastCalledRange} onChange={(value) => setLastCalledRange((value as [Dayjs, Dayjs]) ?? null)} />
        <Button onClick={() => void load()}>조회</Button>
      </Space>

      <Table<CustomerRow>
        rowKey="customerId"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '대표전화번호', dataIndex: 'primaryPhoneNumber', width: 150, render: (value?: string | null) => value ?? '-' },
          { title: '성명', dataIndex: 'customerName', width: 140, render: (value?: string | null) => value ?? '-' },
          {
            title: '등급',
            dataIndex: 'grade',
            width: 100,
            render: (value: string) => <Tag color={GRADE_COLOR[value] ?? 'default'}>{value}</Tag>,
          },
          {
            title: '추가전화번호',
            render: (_: unknown, row) => (row.extraPhoneNumbers ?? []).join(', ') || '-',
          },
          { title: '등록일', dataIndex: 'createdAt', width: 160, render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
          { title: '최종통화일', dataIndex: 'lastCalledAt', width: 160, render: (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
          { title: '기본메모', dataIndex: 'memo', ellipsis: true, render: (value?: string | null) => value || '-' },
          {
            title: '액션',
            width: 200,
            render: (_: unknown, row) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailCustomerId(row.customerId)}>
                  상세
                </Button>
                {permission?.canUpdate !== false ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(row)}>
                    수정
                  </Button>
                ) : null}
                {permission?.canDelete !== false ? (
                  <Popconfirm title="고객을 삭제하시겠습니까?" onConfirm={() => void removeCustomer(row.customerId)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <CustomerFormModal
        open={createOpen || !!editing}
        customer={editing}
        defaultGrade={initialGrade ?? 'NORMAL'}
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSave={saveCustomer}
      />
      <CustomerDetailDrawer open={!!detailCustomerId} customerId={detailCustomerId} onClose={() => setDetailCustomerId(null)} />
      <CustomerImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (rows) => {
          const result = await importCustomers(rows);
          message.info(`성공 ${result.summary.successCount} / 건너뜀 ${result.summary.skippedCount} / 실패 ${result.summary.failedCount}`);
          setImportOpen(false);
          await load();
        }}
      />
    </Card>
  );
}
