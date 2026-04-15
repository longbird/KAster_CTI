import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import type { ActiveCall } from '../types/cti';

interface ActionPanelProps {
  call?: ActiveCall;
  onSaveMemo: (memo: string, resultCode: string) => Promise<void>;
  onTransfer: (target: string) => Promise<void>;
  onHangup: () => Promise<void>;
}

const resultCodeOptions = [
  { value: 'ORDER_COMPLETE', label: '주문 완료' },
  { value: 'CALLBACK', label: '콜백 예정' },
  { value: 'TRANSFER', label: '상담 전환' },
  { value: 'CLAIM', label: '민원 접수' },
];

export function ActionPanel({ call, onSaveMemo, onTransfer, onHangup }: ActionPanelProps) {
  const [form] = Form.useForm<{ memo: string; resultCode: string; transferTarget: string }>();

  useEffect(() => {
    form.setFieldsValue({
      memo: call?.memo ?? '',
      resultCode: call?.resultCode ?? 'ORDER_COMPLETE',
      transferTarget: '1002',
    });
  }, [call, form]);

  return (
    <Card title="메모 / 후처리 / 제어" className="shadow-panel">
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onSaveMemo(values.memo, values.resultCode);
          message.success('메모 저장 완료');
        }}
      >
        <Form.Item label="상담 메모" name="memo">
          <Input.TextArea rows={6} placeholder="상담 내용을 입력하세요." />
        </Form.Item>
        <Form.Item label="결과 코드" name="resultCode">
          <Select options={resultCodeOptions} />
        </Form.Item>
        <Form.Item label="전환 대상 내선" name="transferTarget">
          <Input placeholder="예: 1002" />
        </Form.Item>

        <Space direction="vertical" className="w-full">
          <Button type="primary" htmlType="submit" block>
            메모 저장
          </Button>
          <Button
            block
            onClick={async () => {
              const target = form.getFieldValue('transferTarget');
              await onTransfer(target);
              message.success('전환 요청 완료');
            }}
            disabled={!call}
          >
            호 전환
          </Button>
          <Button
            danger
            block
            onClick={async () => {
              await onHangup();
              message.success('통화 종료 요청 완료');
            }}
            disabled={!call}
          >
            통화 종료
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" className="!mt-4 !mb-0">
          실제 연동 시 REST API와 WebSocket 이벤트를 mockApi.ts, mockSocket.ts 대신 백엔드 엔드포인트로 교체하면 됩니다.
        </Typography.Paragraph>
      </Form>
    </Card>
  );
}
