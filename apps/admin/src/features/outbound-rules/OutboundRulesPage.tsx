import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';

type MatchType = 'EXACT' | 'PREFIX' | 'REGEX' | 'DIALPLAN_PATTERN';

interface BranchRef {
  branchId: string;
  branchCode: string;
  branchName: string;
}

interface OutboundRuleRow {
  outboundCallerIdRuleId: string;
  branchId: string | null;
  branch: BranchRef | null;
  matchType: MatchType;
  sourceNumberPattern: string;
  callerIdNumber: string;
  displayName: string | null;
  memo: string | null;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BranchOption {
  branchId: string;
  branchCode: string;
  branchName: string;
  isActive?: boolean;
}

interface FormValues {
  branchId?: string | null;
  matchType: MatchType;
  sourceNumberPattern: string;
  callerIdNumber: string;
  displayName?: string;
  memo?: string;
  priority: number;
  enabled: boolean;
}

const MATCH_TYPE_OPTIONS: { value: MatchType; label: string; help: string }[] = [
  { value: 'EXACT', label: 'EXACT (정확 일치)', help: '숫자/+ 만 1~20자. 입력 번호와 동일해야 매칭.' },
  { value: 'PREFIX', label: 'PREFIX (접두사)', help: '숫자/+ 만 1~20자. startsWith 매칭.' },
  { value: 'REGEX', label: 'REGEX (정규식)', help: '서버 측 매칭 전용. dialplan 으로는 보내지 않음. 최대 200자.' },
  {
    value: 'DIALPLAN_PATTERN',
    label: 'DIALPLAN_PATTERN (PBX 패턴)',
    help: '_NXX, _010. 등 PBX 패턴. dialplan 에 그대로 들어감.',
  },
];

const MATCH_TYPE_PATTERNS: Record<MatchType, RegExp> = {
  EXACT: /^[0-9+]{1,20}$/,
  PREFIX: /^[0-9+]{1,20}$/,
  REGEX: /^.{1,200}$/s,
  DIALPLAN_PATTERN: /^_[0-9NXZ.\[\]\-]{1,32}$/,
};

const CALLER_ID_PATTERN = /^[0-9+]{1,20}$/;

export function OutboundRulesPage() {
  const [rows, setRows] = useState<OutboundRuleRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OutboundRuleRow | null>(null);
  const [form] = Form.useForm<FormValues>();
  const matchType = Form.useWatch('matchType', form);

  const [testOpen, setTestOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const permission = usePermissionStore((s) => s.permissionsByMenu['settings/outbound-rules']);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const [rulesRes, branchesRes] = await Promise.all([
        apiClient.get('/admin/settings/outbound-rules'),
        apiClient.get('/admin/settings/branches').catch(() => ({ data: { data: [] } })),
      ]);
      setRows(rulesRes.data?.data ?? []);
      setBranches(
        (branchesRes.data?.data ?? []).filter((b: BranchOption) => b.isActive !== false),
      );
    } catch {
      setRows([]);
      message.error('아웃바운드 룰을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        branchId: values.branchId || null,
        displayName: values.displayName || null,
        memo: values.memo || null,
      };
      if (editing) {
        await apiClient.post(
          `/admin/settings/outbound-rules/${editing.outboundCallerIdRuleId}`,
          payload,
        );
        message.success('룰을 수정했습니다.');
      } else {
        await apiClient.post('/admin/settings/outbound-rules', payload);
        message.success('룰을 등록했습니다.');
      }
      form.resetFields();
      setOpen(false);
      setEditing(null);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (ruleId: string) => {
    try {
      await apiClient.delete(`/admin/settings/outbound-rules/${ruleId}`);
      message.success('룰을 삭제했습니다.');
      await load();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await apiClient.post('/admin/settings/outbound-rules/test', {
        inputNumber: testInput.trim(),
      });
      setTestResult(res.data?.data ?? null);
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '테스트 실패');
      setTestResult(null);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          아웃바운드 발신번호 룰
        </Typography.Title>
        <Space>
          <Button icon={<ExperimentOutlined />} onClick={() => setTestOpen(true)}>
            룰 테스트
          </Button>
          {canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldsValue({
                  matchType: 'PREFIX',
                  priority: 100,
                  enabled: true,
                });
                setOpen(true);
              }}
            >
              룰 등록
            </Button>
          ) : null}
        </Space>
      </Space>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        입력 번호 → 발신 ID 변환 규칙을 우선순위 순으로 평가합니다.
        저장 시 PBX dialplan(<code>[outbound-cid-rules]</code>)에 자동 반영됩니다.
        지사가 지정된 룰은 해당 지사에 소속된 상담원별 발신번호 규칙에 반영되며,
        <code>REGEX</code> 룰은 dialplan 으로 옮길 수 없어 NoOp 주석으로만 남습니다.
      </Typography.Paragraph>

      <Table<OutboundRuleRow>
        rowKey="outboundCallerIdRuleId"
        dataSource={rows}
        loading={loading}
        size="small"
        scroll={{ x: 1180 }}
        columns={[
          {
            title: '우선순위',
            dataIndex: 'priority',
            width: 90,
            sorter: (a, b) => a.priority - b.priority,
            render: (v: number) => <Typography.Text>{v}</Typography.Text>,
          },
          {
            title: '지사',
            dataIndex: 'branch',
            width: 160,
            render: (b: BranchRef | null) =>
              b ? (
                <Tag color="blue">{b.branchName}</Tag>
              ) : (
                <Tag>전역</Tag>
              ),
          },
          {
            title: '매칭 방식',
            dataIndex: 'matchType',
            width: 130,
            render: (v: MatchType) => <Tag>{v}</Tag>,
          },
          { title: '입력 패턴', dataIndex: 'sourceNumberPattern', width: 180 },
          { title: '발신 ID', dataIndex: 'callerIdNumber', width: 150 },
          {
            title: '표시명',
            dataIndex: 'displayName',
            render: (v: string | null) => v ?? '',
          },
          {
            title: '사용',
            dataIndex: 'enabled',
            width: 70,
            render: (v: boolean) =>
              v ? <Tag color="green">사용</Tag> : <Tag>중지</Tag>,
          },
          {
            title: '관리',
            width: 110,
            fixed: 'right',
            render: (_: unknown, row: OutboundRuleRow) => (
              <Space>
                {canUpdate ? (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue({
                        branchId: row.branchId ?? null,
                        matchType: row.matchType,
                        sourceNumberPattern: row.sourceNumberPattern,
                        callerIdNumber: row.callerIdNumber,
                        displayName: row.displayName ?? '',
                        memo: row.memo ?? '',
                        priority: row.priority,
                        enabled: row.enabled,
                      });
                      setOpen(true);
                    }}
                  />
                ) : null}
                {canDelete ? (
                  <Popconfirm
                    title="룰을 삭제하시겠습니까?"
                    onConfirm={() => void remove(row.outboundCallerIdRuleId)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '룰 수정' : '룰 등록'}
        open={open}
        onOk={() => void submit()}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        okText={editing ? '저장' : '등록'}
        cancelText="취소"
        confirmLoading={submitting}
        width={620}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ matchType: 'PREFIX', priority: 100, enabled: true }}
        >
          <Form.Item label="지사 (전역 룰은 비워두세요)" name="branchId">
            <Select
              allowClear
              placeholder="전역"
              options={branches.map((b) => ({
                value: b.branchId,
                label: `${b.branchName} (${b.branchCode})`,
              }))}
            />
          </Form.Item>
          <Form.Item label="매칭 방식" name="matchType" rules={[{ required: true }]}>
            <Select
              options={MATCH_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="입력 패턴 (sourceNumberPattern)"
            name="sourceNumberPattern"
            tooltip={
              MATCH_TYPE_OPTIONS.find((o) => o.value === matchType)?.help ?? ''
            }
            rules={[
              { required: true, message: '입력 패턴을 입력하세요' },
              {
                validator: async (_, value) => {
                  if (!value) return;
                  const t = (matchType ?? 'PREFIX') as MatchType;
                  if (!MATCH_TYPE_PATTERNS[t].test(value)) {
                    throw new Error(`matchType=${t} 규칙에 맞지 않습니다`);
                  }
                  if (t === 'REGEX') {
                    try {
                      // eslint-disable-next-line no-new
                      new RegExp(value, 'u');
                    } catch (e: any) {
                      throw new Error(`정규식 컴파일 실패: ${e?.message}`);
                    }
                  }
                },
              },
            ]}
          >
            <Input placeholder={matchType === 'DIALPLAN_PATTERN' ? '_NXX' : '010'} />
          </Form.Item>
          <Form.Item
            label="발신 ID (callerIdNumber)"
            name="callerIdNumber"
            rules={[
              { required: true, message: '발신 ID를 입력하세요' },
              {
                pattern: CALLER_ID_PATTERN,
                message: '숫자/+ 만 1~20자',
              },
            ]}
          >
            <Input placeholder="0212345678" />
          </Form.Item>
          <Form.Item
            label="표시명"
            name="displayName"
            rules={[{ max: 40 }]}
            tooltip="한글/영숫자/공백/.- 만 허용 (최대 40자). dialplan caller name 에 사용될 수 있습니다."
          >
            <Input placeholder="대표 발신번호" />
          </Form.Item>
          <Form.Item label="메모" name="memo">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item
              label="우선순위 (낮을수록 먼저)"
              name="priority"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={9999} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="사용" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="룰 매칭 테스트"
        open={testOpen}
        onCancel={() => {
          setTestOpen(false);
          setTestInput('');
          setTestResult(null);
        }}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="입력 번호 (예: 01012345678)"
              maxLength={32}
            />
            <Button
              type="primary"
              loading={testing}
              onClick={() => void runTest()}
              disabled={!testInput.trim()}
            >
              테스트
            </Button>
          </Space.Compact>
          {testResult ? (
            <div style={{ marginTop: 12 }}>
              {testResult.winner ? (
                <Tag color="green">
                  매칭됨 → callerIdNumber: <strong>{testResult.winner.callerIdNumber}</strong>
                  {testResult.winner.displayName ? ` (${testResult.winner.displayName})` : null}
                  · matchType={testResult.winner.matchType} · priority={testResult.winner.priority}
                </Tag>
              ) : (
                <Tag color="orange">매칭되는 룰이 없습니다 → fallback (defaultOutboundCallerId) 사용</Tag>
              )}
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                후보 평가: {testResult.candidates?.length ?? 0}건
              </Typography.Paragraph>
            </div>
          ) : null}
        </Space>
      </Modal>
    </Card>
  );
}
