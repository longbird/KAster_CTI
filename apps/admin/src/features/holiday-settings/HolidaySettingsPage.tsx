import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Skeleton, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { FeatureHelpButton } from '../../shared/help';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  HOLIDAY_RULE_TYPE_LABELS,
  getHolidayDateLabel,
  getHolidayScopeLabel,
  type HolidayBranchOption,
  type HolidayRulePayload,
  type HolidayRuleRow,
  type HolidayRuleType,
} from './holidayRules';
import {
  createHolidayRule,
  deleteHolidayRule,
  listHolidayRules,
  updateHolidayRule,
} from './holidayRulesApi';

type FormValues = {
  branchId?: string | null;
  ruleName: string;
  ruleType: HolidayRuleType;
  holidayDate?: string | null;
  monthDay?: string | null;
  isActive: boolean;
};

const BRANCH_FILTER_ALL = '__all__';
const GLOBAL_SCOPE = '__global__';

function normalizePayload(values: FormValues): HolidayRulePayload {
  const branchId = values.branchId === GLOBAL_SCOPE ? null : values.branchId ?? null;
  const ruleName = values.ruleName.trim();

  if (values.ruleType === 'ANNUAL') {
    return {
      branchId,
      ruleName,
      ruleType: values.ruleType,
      holidayDate: null,
      monthDay: values.monthDay?.trim() || null,
      isActive: values.isActive,
    };
  }

  return {
    branchId,
    ruleName,
    ruleType: values.ruleType,
    holidayDate: values.holidayDate?.trim() || null,
    monthDay: null,
    isActive: values.isActive,
  };
}

export function HolidaySettingsPage() {
  const [rows, setRows] = useState<HolidayRuleRow[] | null>(null);
  const [branches, setBranches] = useState<HolidayBranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HolidayRuleRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const permission = usePermissionStore((state) => state.permissionsByMenu['settings/holidays']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const branchOptions = useMemo(
    () => branches.map((branch) => ({ value: branch.branchId, label: branch.branchName })),
    [branches],
  );

  const load = async (branchId = selectedBranchId) => {
    try {
      const [ruleRows, branchRes] = await Promise.all([
        listHolidayRules(branchId),
        apiClient.get('/admin/settings/branches'),
      ]);
      setRows(ruleRows);
      setBranches((branchRes.data?.data ?? []).filter((branch: HolidayBranchOption) => branch.isActive !== false));
    } catch {
      setRows([]);
      message.error('공휴일 설정을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    form.setFieldsValue({
      branchId: GLOBAL_SCOPE,
      ruleName: '',
      ruleType: 'DATE',
      holidayDate: '',
      monthDay: '',
      isActive: true,
    });
    setCreateOpen(true);
  };

  const openEdit = (row: HolidayRuleRow) => {
    form.setFieldsValue({
      branchId: row.branchId ?? GLOBAL_SCOPE,
      ruleName: row.ruleName,
      ruleType: row.ruleType,
      holidayDate: row.holidayDate ?? '',
      monthDay: row.monthDay ?? '',
      isActive: row.isActive,
    });
    setEditing(row);
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = normalizePayload(values);
    setSaving(true);
    try {
      if (editing) {
        await updateHolidayRule(editing.holidayRuleId, payload);
        message.success('공휴일 규칙을 수정했습니다.');
      } else {
        await createHolidayRule(payload);
        message.success('공휴일 규칙을 등록했습니다.');
      }
      closeModal();
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (holidayRuleId: string) => {
    try {
      await deleteHolidayRule(holidayRuleId);
      message.success('공휴일 규칙을 삭제했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '삭제에 실패했습니다.');
    }
  };

  const modalOpen = createOpen || !!editing;
  const watchedRuleType = Form.useWatch('ruleType', form);

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} align="start" wrap>
        <div>
          <Space align="center">
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
              공휴일 설정
            </Typography.Title>
            <FeatureHelpButton featureKey="ops.holidayRules" featureName="공휴일 규칙" />
          </Space>
          <Typography.Text type="secondary">
            지사별 휴무일과 임시 영업일을 관리합니다.
          </Typography.Text>
        </div>
        <Space wrap>
          <Select
            style={{ width: 220 }}
            value={selectedBranchId ?? BRANCH_FILTER_ALL}
            onChange={(value) => {
              const branchId = value === BRANCH_FILTER_ALL ? null : value;
              setSelectedBranchId(branchId);
              void load(branchId);
            }}
            options={[
              { value: BRANCH_FILTER_ALL, label: '전체 지사 기준' },
              ...branchOptions,
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            새로고침
          </Button>
          {canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              규칙 등록
            </Button>
          ) : null}
        </Space>
      </Space>

      {!rows ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Table<HolidayRuleRow>
          rowKey="holidayRuleId"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 980 }}
          columns={[
            {
              title: '적용 범위',
              width: 160,
              render: (_: unknown, row) => getHolidayScopeLabel(row, branches),
            },
            {
              title: '규칙명',
              dataIndex: 'ruleName',
              width: 220,
            },
            {
              title: '유형',
              dataIndex: 'ruleType',
              width: 140,
              render: (value: HolidayRuleType) => (
                <Tag color={value === 'WORKDAY_OVERRIDE' ? 'green' : 'blue'}>
                  {HOLIDAY_RULE_TYPE_LABELS[value]}
                </Tag>
              ),
            },
            {
              title: '날짜',
              width: 180,
              render: (_: unknown, row) => getHolidayDateLabel(row),
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
              width: 180,
              render: (value?: string) => (value ? value.slice(0, 10) : '-'),
            },
            {
              title: '관리',
              width: 130,
              fixed: 'right',
              render: (_: unknown, row) => (
                <Space>
                  {canUpdate ? (
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                      수정
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Popconfirm title="공휴일 규칙을 삭제하시겠습니까?" onConfirm={() => void remove(row.holidayRuleId)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={editing ? '공휴일 규칙 수정' : '공휴일 규칙 등록'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void save()}
        okText="저장"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form<FormValues> form={form} layout="vertical" initialValues={{ ruleType: 'DATE', isActive: true }}>
          <Form.Item name="branchId" label="적용 범위">
            <Select
              options={[
                { value: GLOBAL_SCOPE, label: '전체 지사' },
                ...branchOptions,
              ]}
            />
          </Form.Item>
          <Form.Item name="ruleName" label="규칙명" rules={[{ required: true, message: '규칙명을 입력하세요.' }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="ruleType" label="유형" rules={[{ required: true, message: '유형을 선택하세요.' }]}>
            <Select
              options={[
                { value: 'DATE', label: HOLIDAY_RULE_TYPE_LABELS.DATE },
                { value: 'ANNUAL', label: HOLIDAY_RULE_TYPE_LABELS.ANNUAL },
                { value: 'WORKDAY_OVERRIDE', label: HOLIDAY_RULE_TYPE_LABELS.WORKDAY_OVERRIDE },
              ]}
            />
          </Form.Item>
          {watchedRuleType === 'ANNUAL' ? (
            <Form.Item
              name="monthDay"
              label="반복일"
              rules={[
                { required: true, message: '반복일을 입력하세요.' },
                { pattern: /^\d{2}-\d{2}$/, message: 'MM-DD 형식으로 입력하세요.' },
              ]}
            >
              <Input placeholder="05-05" maxLength={5} />
            </Form.Item>
          ) : (
            <Form.Item
              name="holidayDate"
              label={watchedRuleType === 'WORKDAY_OVERRIDE' ? '임시 영업일' : '휴무일'}
              rules={[
                { required: true, message: '날짜를 입력하세요.' },
                { pattern: /^\d{4}-\d{2}-\d{2}$/, message: 'YYYY-MM-DD 형식으로 입력하세요.' },
              ]}
            >
              <Input placeholder="2026-05-05" maxLength={10} />
            </Form.Item>
          )}
          <Form.Item name="isActive" label="상태" valuePropName="checked">
            <Switch checkedChildren="활성" unCheckedChildren="비활성" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
