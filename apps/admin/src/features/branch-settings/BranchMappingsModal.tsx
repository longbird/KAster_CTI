import { Form, Modal, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import type { BranchRow } from './BranchEditModal';

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  role: string;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

interface MappingResponse {
  branch: { branchId: string; branchCode: string; branchName: string } | null;
  assignedAgentIds: string[];
  assignedQueueIds: string[];
  assignedDidIds: string[];
  availableAgents: AgentOption[];
  availableQueues: QueueOption[];
  availableDids: Array<{ id: string; did: string; description?: string | null }>;
}

interface Props {
  open: boolean;
  branch: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BranchMappingsModal({ open, branch, onClose, onSaved }: Props) {
  const [form] = Form.useForm<{ agentIds: string[]; queueIds: string[]; didIds: string[] }>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MappingResponse | null>(null);

  useEffect(() => {
    if (!open || !branch) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/admin/settings/branches/${branch.branchId}/mappings`);
        const next = (res.data?.data ?? null) as MappingResponse | null;
        setData(next);
        form.setFieldsValue({
          agentIds: next?.assignedAgentIds ?? [],
          queueIds: next?.assignedQueueIds ?? [],
          didIds: next?.assignedDidIds ?? [],
        });
      } catch {
        setData(null);
        message.error('지사 매핑 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, branch?.branchId]);

  return (
    <Modal
      title={branch ? `지사 매핑 설정: ${branch.branchName}` : '지사 매핑 설정'}
      open={open}
      onCancel={onClose}
      onOk={async () => {
        if (!branch) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
          await apiClient.post(`/admin/settings/branches/${branch.branchId}/mappings`, values);
          message.success('지사 매핑을 저장했습니다.');
          onSaved();
          onClose();
        } catch {
          message.error('지사 매핑 저장에 실패했습니다.');
        } finally {
          setSaving(false);
        }
      }}
      confirmLoading={saving}
      destroyOnClose
      width={720}
    >
      {branch && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Typography.Text type="secondary">
            지사별 소속 상담원과 큐를 지정합니다. 현재 단계에서는 지사 단위 분류용 매핑만 저장합니다.
          </Typography.Text>
          <Form form={form} layout="vertical" disabled={loading}>
            <Form.Item label="소속 상담원" name="agentIds">
              <Select
                mode="multiple"
                allowClear
                placeholder="상담원을 선택하세요"
                options={(data?.availableAgents ?? []).map((agent) => ({
                  value: agent.agentId,
                  label: `${agent.agentName} (${agent.extension}, ${agent.role})`,
                }))}
              />
            </Form.Item>
            <Form.Item label="소속 큐" name="queueIds">
              <Select
                mode="multiple"
                allowClear
                placeholder="큐를 선택하세요"
                options={(data?.availableQueues ?? []).map((queue) => ({
                  value: queue.queueId,
                  label: queue.queueDisplayName || queue.queueName,
                }))}
              />
            </Form.Item>
            <Form.Item label="소속 DID" name="didIds">
              <Select
                mode="multiple"
                allowClear
                placeholder="DID를 선택하세요"
                options={(data?.availableDids ?? []).map((did) => ({
                  value: did.id,
                  label: did.description ? `${did.did} (${did.description})` : did.did,
                }))}
              />
            </Form.Item>
          </Form>
        </Space>
      )}
    </Modal>
  );
}
