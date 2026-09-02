import { Alert, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';

export interface PlatformAdminFormValues {
  loginId: string;
  displayName: string;
  password: string;
}

interface Props {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: PlatformAdminFormValues) => void;
}

export function PlatformAdminCreateModal({ open, saving, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<PlatformAdminFormValues>();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  return (
    <Modal
      open={open}
      title="플랫폼 관리자 등록"
      okText="등록"
      cancelText="취소"
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="이 계정은 모든 테넌트의 기능 자격을 바꿀 수 있습니다."
        description="테넌트 업무 데이터는 볼 수 없지만, 자격 조작 권한은 전 테넌트에 걸칩니다. 꼭 필요한 사람에게만 만들어 주세요."
      />

      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="loginId"
          label="로그인 ID"
          rules={[
            { required: true, message: '로그인 ID를 입력하세요' },
            { pattern: /^[A-Za-z0-9._-]+$/, message: '영문·숫자·. _ - 만 쓸 수 있습니다' },
          ]}
        >
          <Input placeholder="platform.ops" maxLength={64} autoComplete="off" />
        </Form.Item>

        <Form.Item name="displayName" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
          <Input placeholder="운영팀 홍길동" maxLength={128} />
        </Form.Item>

        <Form.Item
          name="password"
          label="초기 비밀번호"
          extra="본인이 로그인한 뒤 직접 바꾸도록 안내하세요."
          rules={[
            { required: true, message: '초기 비밀번호를 입력하세요' },
            { min: 8, message: '8자 이상으로 정하세요' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
