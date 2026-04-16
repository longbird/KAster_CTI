import { Form, Input, Modal, Switch } from 'antd';
import { apiClient } from '../../shared/lib/apiClient';

export interface BranchRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  agentCount?: number;
  queueCount?: number;
  didCount?: number;
}

interface Props {
  open: boolean;
  branch?: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BranchEditModal({ open, branch, onClose, onSaved }: Props) {
  const [form] = Form.useForm();

  return (
    <Modal
      title={branch ? '지사 수정' : '지사 등록'}
      open={open}
      destroyOnClose
      onCancel={onClose}
      onOk={async () => {
        const values = await form.validateFields();
        if (branch?.branchId) {
          await apiClient.post(`/admin/settings/branches/${branch.branchId}`, values);
        } else {
          await apiClient.post('/admin/settings/branches', values);
        }
        onSaved();
        onClose();
      }}
      afterOpenChange={(nextOpen) => {
        if (nextOpen && branch) {
          form.setFieldsValue({
            branchCode: branch.branchCode,
            branchName: branch.branchName,
            description: branch.description ?? '',
            isActive: branch.isActive,
          });
        } else if (nextOpen) {
          form.setFieldsValue({
            branchCode: '',
            branchName: '',
            description: '',
            isActive: true,
          });
        } else if (!nextOpen) {
          form.resetFields();
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ isActive: true }}>
        <Form.Item label="지사 코드" name="branchCode" rules={[{ required: true, message: '지사 코드를 입력하세요' }]}>
          <Input maxLength={32} />
        </Form.Item>
        <Form.Item label="지사명" name="branchName" rules={[{ required: true, message: '지사명을 입력하세요' }]}>
          <Input maxLength={128} />
        </Form.Item>
        <Form.Item label="설명" name="description">
          <Input.TextArea rows={3} maxLength={1000} />
        </Form.Item>
        <Form.Item label="활성 여부" name="isActive" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
