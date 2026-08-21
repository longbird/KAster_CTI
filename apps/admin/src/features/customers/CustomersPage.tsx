import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
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
import type { CustomerListParams } from './api/customersApi';
import { formatCustomerListDate, formatCustomerPhoneDisplay } from './customerDisplay';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface Props {
  initialGrade?: 'NORMAL' | 'VIP' | 'BLACK';
  title?: string;
}

const GRADE_COLOR: Record<string, string> = {
  NORMAL: 'default',
  VIP: 'gold',
  BLACK: 'red',
};

const headerLabel = (label: string) => <span className="customers-page__table-header">{label}</span>;

export type CustomerDateFilterType = 'registered' | 'lastCalled';

interface BuildCustomerListParamsInput {
  keyword: string;
  grade?: 'NORMAL' | 'VIP' | 'BLACK';
  dateFilterType: CustomerDateFilterType;
  dateRange: readonly [Dayjs, Dayjs] | null;
}

export function buildCustomerListParams({
  keyword,
  grade,
  dateFilterType,
  dateRange,
}: BuildCustomerListParamsInput): CustomerListParams {
  const from = dateRange?.[0]?.startOf('day').toISOString();
  const to = dateRange?.[1]?.endOf('day').toISOString();

  return {
    keyword: keyword || undefined,
    grade,
    registeredFrom: dateFilterType === 'registered' ? from : undefined,
    registeredTo: dateFilterType === 'registered' ? to : undefined,
    lastCalledFrom: dateFilterType === 'lastCalled' ? from : undefined,
    lastCalledTo: dateFilterType === 'lastCalled' ? to : undefined,
  };
}

export function CustomersPage({ initialGrade, title = '고객 목록' }: Props) {
  const permission = usePermissionStore((state) => state.permissionsByMenu.customers);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [grade, setGrade] = useState<'NORMAL' | 'VIP' | 'BLACK' | undefined>(initialGrade);
  const [dateFilterType, setDateFilterType] = useState<CustomerDateFilterType>('registered');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listCustomers(
        buildCustomerListParams({
          keyword,
          grade,
          dateFilterType,
          dateRange,
        }),
      );
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
        formatCustomerPhoneDisplay(row.primaryPhoneNumber),
        row.customerName ?? '-',
        row.grade,
        (row.extraPhoneNumbers ?? []).map((phone) => formatCustomerPhoneDisplay(phone)).join(', '),
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
    <Card className="admin-workbench">
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

      <div className="admin-workbench__filters">
        <Space wrap size={8} className="customers-page__filters">
          <Select
            allowClear
            value={grade}
            onChange={(value) => setGrade(value)}
            style={{ width: 108 }}
            options={[
              { value: 'NORMAL', label: '일반' },
              { value: 'VIP', label: 'VIP' },
              { value: 'BLACK', label: 'BLACK' },
            ]}
          />
          <Select
            value={dateFilterType}
            onChange={(value) => setDateFilterType(value)}
            className="customers-page__date-filter"
            style={{ width: 120 }}
            options={[
              { value: 'registered', label: '등록일' },
              { value: 'lastCalled', label: '최종통화일' },
            ]}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(value) => setDateRange((value as [Dayjs, Dayjs]) ?? null)}
            className="customers-page__date-range"
            style={{ width: 250 }}
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="전화번호 또는 성명 검색"
            style={{ width: 220 }}
          />
          <Button onClick={() => void load()}>조회</Button>
        </Space>
      </div>

      <div className="admin-workbench__table">
        <ResponsiveTable<CustomerRow>
          rowKey="customerId"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 1140 }}
          columns={[
          {
            title: headerLabel('대표전화번호'),
            dataIndex: 'primaryPhoneNumber',
            width: 170,
            render: (value: string | null | undefined, row) => (
              <Button
                type="link"
                style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}
                onClick={() => setDetailCustomerId(row.customerId)}
              >
                {formatCustomerPhoneDisplay(value)}
              </Button>
            ),
          },
          {
            title: headerLabel('성명'),
            dataIndex: 'customerName',
            width: 160,
            render: (value: string | null | undefined, row) => (
              <Button
                type="link"
                style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}
                onClick={() => setDetailCustomerId(row.customerId)}
              >
                {value ?? '-'}
              </Button>
            ),
          },
          {
            title: headerLabel('등급'),
            dataIndex: 'grade',
            width: 100,
            render: (value: string) => <Tag color={GRADE_COLOR[value] ?? 'default'}>{value}</Tag>,
          },
          { title: headerLabel('등록일'), dataIndex: 'createdAt', width: 130, render: (value: string) => formatCustomerListDate(value) },
          { title: headerLabel('최종통화일'), dataIndex: 'lastCalledAt', width: 130, render: (value?: string | null) => formatCustomerListDate(value) },
          { title: headerLabel('기본메모'), dataIndex: 'memo', width: 350, ellipsis: true, render: (value?: string | null) => value || '-' },
          {
            title: headerLabel('관리'),
            width: 120,
            fixed: 'right',
            render: (_: unknown, row) => (
              <Space>
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
      </div>

      <CustomerFormModal
        open={createOpen || !!editing}
        customer={editing}
        defaultGrade={initialGrade ?? 'NORMAL'}
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSave={saveCustomer}
      />
      <CustomerDetailDrawer
        open={!!detailCustomerId}
        customerId={detailCustomerId}
        onClose={() => setDetailCustomerId(null)}
        canUpdate={permission?.canUpdate !== false}
        onSaved={load}
      />
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
