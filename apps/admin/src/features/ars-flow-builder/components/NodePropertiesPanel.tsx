import { Button, Divider, Empty, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { useEffect } from 'react';
import {
  DIGIT_TARGET_SOURCES,
  EDGE_CONDITION_LABELS,
  NODE_TYPE_LABELS,
  TARGET_SOURCE_LABELS,
  type FlowEdgeCondition,
  type FlowNodeRow,
} from '../types/flowGraph';

interface Props {
  node: FlowNodeRow | null;
  isEntry: boolean;
  outgoing: Array<{ edgeId: string; condition: FlowEdgeCondition; digit: string | null; toLabel: string }>;
  onChange: (next: FlowNodeRow) => void;
  onSetEntry: () => void;
  onDelete: () => void;
  onEdgeDigitChange: (edgeId: string, digit: string) => void;
  onEdgeDelete: (edgeId: string) => void;
}

const TARGET_SOURCE_OPTIONS = DIGIT_TARGET_SOURCES.map((value) => ({
  value,
  label: TARGET_SOURCE_LABELS[value],
}));

const WEEKDAYS = [
  { value: 'mon', label: '월' }, { value: 'tue', label: '화' }, { value: 'wed', label: '수' },
  { value: 'thu', label: '목' }, { value: 'fri', label: '금' }, { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
];

/**
 * 고른 노드의 속성을 고친다.
 *
 * 여기서 만드는 값은 서버 `node-config.parser` 가 다시 검증한다. 화면은 형태를 맞춰줄 뿐
 * 최종 판정을 하지 않는다 — 두 곳에서 판정하면 규칙이 갈라진다.
 */
export function NodePropertiesPanel({
  node, isEntry, outgoing, onChange, onSetEntry, onDelete, onEdgeDigitChange, onEdgeDelete,
}: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!node) return;
    form.setFieldsValue({ label: node.label, ...node.config });
  }, [node, form]);

  if (!node) {
    return <Empty description="노드를 고르면 여기서 설정합니다." style={{ marginTop: 48 }} />;
  }

  const update = (patch: Record<string, unknown>) => {
    const { label, ...config } = { label: node.label, ...node.config, ...patch } as Record<string, unknown>;
    onChange({ ...node, label: String(label ?? node.label), config });
  };

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {NODE_TYPE_LABELS[node.nodeType]}
        </Typography.Text>
        <Space>
          <Button size="small" type={isEntry ? 'primary' : 'default'} disabled={isEntry} onClick={onSetEntry}>
            {isEntry ? '진입 노드' : '진입 노드로'}
          </Button>
          <Button size="small" danger onClick={onDelete}>노드 삭제</Button>
        </Space>
      </Space>

      <Form form={form} layout="vertical" size="small" onValuesChange={(changed) => update(changed)}>
        <Form.Item name="label" label="이름">
          <Input maxLength={128} />
        </Form.Item>

        {node.nodeType === 'PLAY' && (
          <Form.Item name="promptKeys" label="재생할 안내" extra="등록된 멘트 키. 순서대로 재생합니다.">
            <Select mode="tags" tokenSeparators={[',']} placeholder="custom/welcome" />
          </Form.Item>
        )}

        {node.nodeType === 'MENU' && (
          <>
            <Form.Item name="promptKey" label="안내 멘트">
              <Input allowClear placeholder="custom/main_menu" />
            </Form.Item>
            <Form.Item name="timeoutSeconds" label="입력 대기(초)">
              <InputNumber min={1} max={60} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxRetries" label="재시도 횟수">
              <InputNumber min={0} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}

        {node.nodeType === 'QUEUE' && (
          <Form.Item name="queueName" label="호 분배룰" extra="등록된 큐 이름과 정확히 같아야 합니다.">
            <Input placeholder="sales" />
          </Form.Item>
        )}

        {node.nodeType === 'TRANSFER' && (
          <Form.Item name="transferNumber" label="전환 번호">
            <Input placeholder="025551234" />
          </Form.Item>
        )}

        {node.nodeType === 'SMS' && (
          <>
            <Form.Item name="smsTemplateId" label="문자 템플릿 ID">
              <Input placeholder="템플릿 UUID" />
            </Form.Item>
            <Form.Item
              name="targetSource"
              label="받는 번호"
              extra="입력받은 번호를 쓰려면 앞쪽에 '번호 입력받기' 노드가 있어야 합니다."
            >
              <Select options={TARGET_SOURCE_OPTIONS} />
            </Form.Item>
          </>
        )}

        {node.nodeType === 'OPT_OUT' && (
          <>
            <Form.Item name="action" label="처리">
              <Select
                options={[
                  { value: 'REGISTER', label: '수신거부 등록' },
                  { value: 'UNREGISTER', label: '수신거부 해제' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="targetSource"
              label="대상 번호"
              extra="입력받은 번호를 쓰려면 앞쪽에 '번호 입력받기' 노드가 있어야 합니다."
            >
              <Select options={TARGET_SOURCE_OPTIONS} />
            </Form.Item>
          </>
        )}

        {node.nodeType === 'CONDITION' && (
          <>
            <Form.Item name="conditionType" label="조건">
              <Select
                options={[
                  { value: 'TIME_RANGE', label: '시간 범위' },
                  { value: 'HOLIDAY', label: '공휴일' },
                ]}
              />
            </Form.Item>
            {node.config.conditionType !== 'HOLIDAY' && (
              <>
                <Form.Item name="timeStart" label="시작 (HH:MM)">
                  <Input placeholder="09:00" />
                </Form.Item>
                <Form.Item name="timeEnd" label="끝 (HH:MM)">
                  <Input placeholder="18:00" />
                </Form.Item>
                <Form.Item name="daysOfWeek" label="요일">
                  <Select mode="multiple" options={WEEKDAYS} />
                </Form.Item>
              </>
            )}
          </>
        )}

        {node.nodeType === 'COLLECT_DIGITS' && (
          <>
            <Form.Item name="promptKey" label="안내 멘트">
              <Input allowClear placeholder="custom/enter_number" />
            </Form.Item>
            <Space size={8}>
              <Form.Item name="minDigits" label="최소 자릿수">
                <InputNumber min={1} max={32} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="maxDigits" label="최대 자릿수">
                <InputNumber min={1} max={32} style={{ width: '100%' }} />
              </Form.Item>
            </Space>
            <Form.Item name="timeoutSeconds" label="입력 대기(초)">
              <InputNumber min={1} max={60} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxRetries" label="재시도 횟수" extra="다 쓰면 '시간초과' 연결로 나갑니다.">
              <InputNumber min={0} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}

        {node.nodeType === 'HANGUP' && (
          <Form.Item name="promptKey" label="종료 안내 (선택)">
            <Input allowClear placeholder="custom/goodbye" />
          </Form.Item>
        )}
      </Form>

      {outgoing.length > 0 && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>나가는 연결</Typography.Text>
          <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 6 }}>
            {outgoing.map((edge) => (
              <Space key={edge.edgeId} size={6} style={{ width: '100%' }}>
                <Typography.Text style={{ fontSize: 12, minWidth: 68 }}>
                  {EDGE_CONDITION_LABELS[edge.condition]}
                </Typography.Text>
                {edge.condition === 'DIGIT' && (
                  <Input
                    size="small"
                    style={{ width: 52 }}
                    maxLength={2}
                    value={edge.digit ?? ''}
                    onChange={(event) => onEdgeDigitChange(edge.edgeId, event.target.value)}
                  />
                )}
                <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, flex: 1 }}>
                  → {edge.toLabel}
                </Typography.Text>
                <Button size="small" type="text" danger onClick={() => onEdgeDelete(edge.edgeId)}>삭제</Button>
              </Space>
            ))}
          </Space>
        </>
      )}
    </div>
  );
}
