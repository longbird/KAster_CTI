import {
  AudioMutedOutlined,
  PauseOutlined,
  PhoneOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useEffect, useMemo } from 'react';
import type { ActiveCall, SessionStatus } from '../types/cti';
import { SESSION_META, TONE_CLASS } from './statusMeta';

interface ControlPanelProps {
  call?: ActiveCall;
  onSaveMemo: (memo: string, resultCode: string) => Promise<void>;
  onTransfer: (target: string) => Promise<void>;
  onHangup: () => Promise<void>;
}

// "진행 중"(통화) phase 에서 쓸 결과 코드. 가볍게.
const QUICK_RESULT_CODES = [
  { value: 'ORDER_COMPLETE', label: '주문 완료' },
  { value: 'CALLBACK', label: '콜백 예정' },
  { value: 'TRANSFER', label: '상담 전환' },
  { value: 'CLAIM', label: '민원 접수' },
];

// ACW phase 에서 쓸 좀 더 풍부한 결과 코드.
const ACW_RESULT_CODES = [
  { value: 'SOLD', label: '판매 완료' },
  { value: 'ORDER_COMPLETE', label: '주문 완료' },
  { value: 'FOLLOW_UP', label: '후속 상담 예약' },
  { value: 'NO_INTEREST', label: '관심 없음' },
  { value: 'WRONG_NUMBER', label: '잘못된 번호' },
  { value: 'COMPLAINT', label: '불만 접수' },
  { value: 'OTHER', label: '기타' },
];

type Phase = 'IDLE' | 'INCOMING' | 'LIVE' | 'ACW';

function derivePhase(status: SessionStatus | undefined): Phase {
  if (!status) return 'IDLE';
  switch (status) {
    case 'NEW':
    case 'IVR':
    case 'QUEUED':
      return 'IDLE';
    case 'RINGING_AGENT':
      return 'INCOMING';
    case 'TALKING':
    case 'HOLD':
    case 'TRANSFERRING':
      return 'LIVE';
    case 'AFTER_CALL_WORK':
    case 'ENDED':
      return 'ACW';
    default:
      return 'IDLE';
  }
}

export function ControlPanel({ call, onSaveMemo, onTransfer, onHangup }: ControlPanelProps) {
  const phase = useMemo(() => derivePhase(call?.sessionStatus), [call?.sessionStatus]);
  const meta = call ? SESSION_META[call.sessionStatus] : null;

  const [form] = Form.useForm<{
    memo: string;
    resultCode: string;
    transferTarget: string;
  }>();

  // 선택된 콜이 바뀌면 form 값을 해당 콜 기준으로 초기화.
  useEffect(() => {
    form.setFieldsValue({
      memo: call?.memo ?? '',
      resultCode: call?.resultCode ?? (phase === 'ACW' ? 'SOLD' : 'ORDER_COMPLETE'),
      transferTarget: '1002',
    });
  }, [call?.callId, phase, form]);

  // ---- Idle ------------------------------------------------------------
  if (phase === 'IDLE') {
    return (
      <Card
        title={<span className="text-base font-semibold">콜 제어</span>}
        className="rounded-2xl border border-slate-200/70 bg-white shadow-sm"
        bodyStyle={{ padding: 24 }}
      >
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <PhoneOutlined style={{ fontSize: 22 }} />
          </div>
          <Typography.Text strong className="text-slate-700">
            새 통화 대기 중
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            콜이 배정되면 여기에 제어 버튼이 표시됩니다.
          </Typography.Text>
        </div>
      </Card>
    );
  }

  // ---- Incoming (RINGING_AGENT) ---------------------------------------
  if (phase === 'INCOMING') {
    return (
      <Card
        title={
          <Space>
            <span className="text-base font-semibold">수신 중</span>
            {meta && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium text-slate-700 ${
                  TONE_CLASS[meta.tone]
                }`}
              >
                {meta.label}
              </span>
            )}
          </Space>
        }
        className="rounded-2xl border border-sky-200 bg-sky-50/30 shadow-sm"
        bodyStyle={{ padding: 20 }}
      >
        <Space direction="vertical" size={12} className="w-full">
          <Alert
            type="info"
            showIcon
            message="벨이 울리는 중입니다. SIP Phone 에서 수신하면 통화가 시작됩니다."
          />
          <Button
            danger
            block
            size="large"
            icon={<AudioMutedOutlined />}
            onClick={async () => {
              await onHangup();
              message.info('거절 요청 전송');
            }}
          >
            거절
          </Button>
        </Space>
      </Card>
    );
  }

  // ---- Live (TALKING / HOLD / TRANSFERRING) ---------------------------
  if (phase === 'LIVE') {
    return (
      <Card
        title={
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">콜 제어</span>
            {meta && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium text-slate-700 ${
                  TONE_CLASS[meta.tone]
                }`}
              >
                {meta.label}
              </span>
            )}
          </div>
        }
        className="rounded-2xl border border-blue-200 bg-white shadow-sm"
        bodyStyle={{ padding: 20 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            await onSaveMemo(values.memo, values.resultCode);
            message.success('메모 저장 완료');
          }}
        >
          {/* Primary control row — 3 버튼 */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Button
              size="large"
              icon={<PauseOutlined />}
              onClick={() => message.info('보류 기능은 AMI 연동 후 활성화')}
            >
              보류
            </Button>
            <Form.Item name="transferTarget" noStyle>
              {/* placeholder — 아래 transfer 버튼이 이 input 값을 읽음 */}
              <input type="hidden" />
            </Form.Item>
            <Button
              size="large"
              icon={<SwapOutlined />}
              onClick={async () => {
                const target = form.getFieldValue('transferTarget');
                if (!target) {
                  message.warning('전환 대상 내선을 먼저 입력하세요');
                  return;
                }
                await onTransfer(target);
                message.success(`전환 요청: ${target}`);
              }}
            >
              전환
            </Button>
            <Button
              danger
              size="large"
              type="primary"
              icon={<AudioMutedOutlined />}
              onClick={async () => {
                await onHangup();
                message.success('통화 종료 요청');
              }}
            >
              종료
            </Button>
          </div>

          {/* 전환 대상 입력 */}
          <Form.Item
            label={<span className="text-xs font-medium text-slate-600">전환 대상 내선</span>}
            name="transferTarget"
            className="!mb-3"
          >
            <Input placeholder="예: 1002" size="middle" />
          </Form.Item>

          {/* 실시간 메모 (가벼운 입력) */}
          <Form.Item
            label={<span className="text-xs font-medium text-slate-600">통화 메모</span>}
            name="memo"
            className="!mb-3"
          >
            <Input.TextArea rows={3} placeholder="통화 중 메모를 적어두세요" />
          </Form.Item>

          <Form.Item label={<span className="text-xs font-medium text-slate-600">결과 코드</span>} name="resultCode" className="!mb-4">
            <Select options={QUICK_RESULT_CODES} />
          </Form.Item>

          <Button type="primary" htmlType="submit" icon={<SendOutlined />} block>
            메모 저장
          </Button>
        </Form>
      </Card>
    );
  }

  // ---- ACW / Ended ----------------------------------------------------
  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">후처리 (ACW)</span>
          {meta && (
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium text-slate-700 ${
                TONE_CLASS[meta.tone]
              }`}
            >
              {meta.label}
            </span>
          )}
        </div>
      }
      className="rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm"
      bodyStyle={{ padding: 20 }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onSaveMemo(values.memo, values.resultCode);
          message.success('후처리 저장 완료');
        }}
      >
        <Alert
          type="success"
          showIcon
          className="!mb-4"
          message="통화가 종료되었습니다. 결과 코드와 메모를 입력하세요."
        />
        <Form.Item
          label={<span className="text-xs font-medium text-slate-600">결과 코드</span>}
          name="resultCode"
          rules={[{ required: true, message: '결과 코드를 선택하세요' }]}
          className="!mb-3"
        >
          <Select options={ACW_RESULT_CODES} placeholder="상담 결과 선택" size="large" />
        </Form.Item>
        <Form.Item
          label={<span className="text-xs font-medium text-slate-600">상담 메모</span>}
          name="memo"
          rules={[{ required: true, message: '메모를 입력하세요' }]}
          className="!mb-4"
        >
          <Input.TextArea rows={5} placeholder="상담 내용을 요약해 작성하세요" />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} block size="large">
          후처리 저장
        </Button>
      </Form>
    </Card>
  );
}
