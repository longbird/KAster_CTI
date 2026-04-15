import { Alert, Button, Card, Form, Input, Select, Space } from 'antd';
import { useEffect } from 'react';
import { useCtiStore } from '../store/useCtiStore';

// cti-operational-frontend 의 AcwPanel (After Call Work) 개념 포팅.
// 통화가 AFTER_CALL_WORK 또는 ENDED 상태일 때 결과 코드 + 메모를 저장한다.
// ActionPanel 과 메모 중복이 있지만 ACW 는 "후처리" 맥락이 강조된 별도 UI.
const RESULT_CODES = [
  { value: 'SOLD', label: '판매 완료' },
  { value: 'FOLLOW_UP', label: '후속 상담 예약' },
  { value: 'NO_INTEREST', label: '관심 없음' },
  { value: 'WRONG_NUMBER', label: '잘못된 번호' },
  { value: 'COMPLAINT', label: '불만 접수' },
  { value: 'OTHER', label: '기타' },
];

interface AcwFormValues {
  resultCode: string;
  memoText: string;
}

export function AcwPanel() {
  const selectedCallId = useCtiStore((s) => s.selectedCallId);
  const activeCalls = useCtiStore((s) => s.activeCalls);
  const saveMemo = useCtiStore((s) => s.saveMemo);
  const selectedCall = activeCalls.find((c) => c.callId === selectedCallId);
  const [form] = Form.useForm<AcwFormValues>();

  // 콜이 바뀌면 폼 초기화.
  useEffect(() => {
    form.resetFields();
  }, [selectedCallId, form]);

  const isAcwPhase =
    selectedCall?.sessionStatus === 'AFTER_CALL_WORK' ||
    selectedCall?.sessionStatus === 'ENDED';

  const onFinish = async (values: AcwFormValues) => {
    await saveMemo(values.memoText, values.resultCode);
    form.resetFields();
  };

  return (
    <Card size="small" title="후처리 (ACW)" bodyStyle={{ padding: 12 }}>
      {!selectedCall && <Alert type="info" showIcon message="선택된 통화가 없습니다." />}
      {selectedCall && !isAcwPhase && (
        <Alert
          type="warning"
          showIcon
          message="통화가 아직 진행 중입니다. 종료 후 ACW 입력이 가능합니다."
        />
      )}
      {selectedCall && isAcwPhase && (
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="결과 코드"
            name="resultCode"
            rules={[{ required: true, message: '결과 코드를 선택하세요' }]}
          >
            <Select options={RESULT_CODES} placeholder="상담 결과를 선택" />
          </Form.Item>
          <Form.Item
            label="상담 메모"
            name="memoText"
            rules={[{ required: true, message: '메모를 입력하세요' }]}
          >
            <Input.TextArea rows={3} placeholder="후처리 메모" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              저장
            </Button>
            <Button onClick={() => form.resetFields()}>지우기</Button>
          </Space>
        </Form>
      )}
    </Card>
  );
}
