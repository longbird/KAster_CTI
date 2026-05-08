import { Alert, Checkbox, Modal, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import type { AgentRow } from './AgentEditModal';

interface AgentOption {
  agentId: string;
  agentName: string;
  agentCode: string;
  extension: string;
}

interface Props {
  target: AgentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

type CoreScope =
  | 'queueMembership'
  | 'branchCidAuth'
  | 'menuPermissions'
  | 'agentSettingsProfile';

type OptionScope = 'outboundCallerIdOverride';

type Scope = CoreScope | OptionScope;

const CORE_SCOPES: { value: CoreScope; label: string; help: string }[] = [
  {
    value: 'queueMembership',
    label: '큐 멤버십 (penalty/순서)',
    help: 'queueAgentMembers — target 의 기존 큐 멤버십을 모두 삭제하고 source 와 동일하게 다시 등록.',
  },
  {
    value: 'branchCidAuth',
    label: '지사 CID 발신권한 매트릭스',
    help: 'agentBranchCallerIds — 지사별 인/아웃/전환 boolean 행렬 복제.',
  },
  {
    value: 'menuPermissions',
    label: '관리자 메뉴 개별 권한',
    help: 'agentMenuPermissions — 역할 기본 권한 위에 덮어씌운 개별 권한.',
  },
  {
    value: 'agentSettingsProfile',
    label: '상담원 운영 프로필',
    help: 'agents.settingsProfile JSON — inout/마스킹/녹취 등 운영 옵션 묶음.',
  },
];

const OPTION_SCOPES: { value: OptionScope; label: string; help: string }[] = [
  {
    value: 'outboundCallerIdOverride',
    label: '아웃바운드 발신번호 상담원 단위 예외 (현재 자리표시)',
    help: '아웃바운드 룰은 본질적으로 전역/지사 단위입니다. 상담원 단위 예외는 향후 도입 시 활성화됩니다.',
  },
];

export function AgentPermissionCopyModal({ target, onClose, onSaved }: Props) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [sourceAgentId, setSourceAgentId] = useState<string | undefined>(undefined);
  const [scopes, setScopes] = useState<Scope[]>([
    'queueMembership',
    'branchCidAuth',
    'menuPermissions',
    'agentSettingsProfile',
  ]);
  const [submitting, setSubmitting] = useState(false);
  const open = !!target;

  useEffect(() => {
    if (!open) {
      setSourceAgentId(undefined);
      setScopes(['queueMembership', 'branchCidAuth', 'menuPermissions', 'agentSettingsProfile']);
      return;
    }
    void apiClient
      .get('/agents')
      .then((res) => {
        const list: AgentOption[] = (res.data?.data ?? []).filter(
          (a: any) => a.agentId !== target?.agentId && a.isActive !== false,
        );
        setAgents(list);
      })
      .catch(() => setAgents([]));
  }, [open, target?.agentId]);

  const submit = async () => {
    if (!target || !sourceAgentId) {
      message.warning('소스 상담원을 선택하세요.');
      return;
    }
    if (scopes.length === 0) {
      message.warning('복사할 항목을 한 가지 이상 선택하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post(
        `/agents/${target.agentId}/copy-permissions`,
        { sourceAgentId, scopes },
      );
      const summary = res.data?.data?.summary ?? {};
      const total = Object.values(summary).reduce(
        (acc: number, v: any) => acc + (typeof v === 'number' ? v : 0),
        0,
      );
      message.success(`권한 복사 완료 (총 ${total}건 적용)`);
      onSaved();
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '권한 복사 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`권한 복사 — ${target?.agentName ?? ''} 으로`}
      open={open}
      onOk={() => void submit()}
      onCancel={onClose}
      okText="복사 적용"
      cancelText="취소"
      confirmLoading={submitting}
      width={600}
      okButtonProps={{ danger: true }}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          type="warning"
          showIcon
          message="이 작업은 되돌릴 수 없습니다."
          description={`타겟 상담원(${target?.agentName ?? ''})의 선택된 영역 항목이 모두 삭제된 후 소스 상담원의 항목으로 덮어쓰여집니다.`}
        />

        <div>
          <Typography.Text strong>소스 상담원</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 6 }}
            placeholder="복사해 올 권한의 출처 상담원 선택"
            value={sourceAgentId}
            onChange={setSourceAgentId}
            showSearch
            optionFilterProp="label"
            options={agents.map((a) => ({
              value: a.agentId,
              label: `${a.agentName} (${a.agentCode}, 내선 ${a.extension})`,
            }))}
          />
        </div>

        <div>
          <Typography.Text strong>상담원 단위 권한 (기본)</Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {CORE_SCOPES.map((s) => (
              <Checkbox
                key={s.value}
                checked={scopes.includes(s.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setScopes((prev) => Array.from(new Set([...prev, s.value])));
                  } else {
                    setScopes((prev) => prev.filter((x) => x !== s.value));
                  }
                }}
              >
                <Typography.Text>{s.label}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {s.help}
                </Typography.Text>
              </Checkbox>
            ))}
          </div>
        </div>

        <div>
          <Typography.Text strong type="warning">
            운영 설정(전역) 영향 — 주의
          </Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {OPTION_SCOPES.map((s) => (
              <Checkbox
                key={s.value}
                checked={scopes.includes(s.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setScopes((prev) => Array.from(new Set([...prev, s.value])));
                  } else {
                    setScopes((prev) => prev.filter((x) => x !== s.value));
                  }
                }}
              >
                <Typography.Text>{s.label}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {s.help}
                </Typography.Text>
              </Checkbox>
            ))}
          </div>
        </div>
      </Space>
    </Modal>
  );
}
