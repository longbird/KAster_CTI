import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { FeatureHelpButton } from '../../shared/help';
import { apiClient } from '../../shared/lib/apiClient';
import { ResponsiveTable } from '../../components/ResponsiveTable';

interface AgentRow {
  agentId: string;
  agentCode: string;
  agentName: string;
  extension: string;
}

interface CallerIdEntry {
  agentBranchCallerIdId?: string;
  agentId: string;
  callerIdNumber: string;
  displayName?: string | null;
  allowedInbound: boolean;
  allowedOutbound: boolean;
  allowedTransfer: boolean;
  sortOrder: number;
}

interface BranchInfo {
  branchId: string;
  branchCode: string;
  branchName: string;
}

interface Props {
  open: boolean;
  branchId: string | null;
  branchName?: string;
  onClose: () => void;
}

interface CallerIdGroup {
  callerIdNumber: string;
  displayName: string | null;
  sortOrder: number;
}

interface MatrixCell {
  inbound: boolean;
  outbound: boolean;
  transfer: boolean;
}

const ENTRY_PATTERN = /^[0-9+\-]{1,32}$/;

export function BranchAgentCidAuthDrawer({ open, branchId, branchName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branch, setBranch] = useState<BranchInfo | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [callerIds, setCallerIds] = useState<CallerIdGroup[]>([]);
  // matrix[agentId][callerIdNumber] => MatrixCell
  const [matrix, setMatrix] = useState<Record<string, Record<string, MatrixCell>>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newCallerId, setNewCallerId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  const load = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/admin/settings/branches/${branchId}/agent-caller-ids`);
      const data = res.data?.data ?? {};
      setBranch(data.branch ?? null);
      setAgents(data.agents ?? []);
      const entries: CallerIdEntry[] = data.entries ?? [];

      // CID 그룹 추출
      const cidMap = new Map<string, CallerIdGroup>();
      for (const e of entries) {
        if (!cidMap.has(e.callerIdNumber)) {
          cidMap.set(e.callerIdNumber, {
            callerIdNumber: e.callerIdNumber,
            displayName: e.displayName ?? null,
            sortOrder: e.sortOrder,
          });
        }
      }
      const cids = Array.from(cidMap.values()).sort((a, b) =>
        a.sortOrder - b.sortOrder || a.callerIdNumber.localeCompare(b.callerIdNumber),
      );
      setCallerIds(cids);

      const m: Record<string, Record<string, MatrixCell>> = {};
      for (const e of entries) {
        if (!m[e.agentId]) m[e.agentId] = {};
        m[e.agentId][e.callerIdNumber] = {
          inbound: e.allowedInbound,
          outbound: e.allowedOutbound,
          transfer: e.allowedTransfer,
        };
      }
      setMatrix(m);
    } catch {
      message.error('CID 권한 매트릭스를 불러오지 못했습니다.');
      setBranch(null);
      setAgents([]);
      setCallerIds([]);
      setMatrix({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && branchId) {
      void load();
    } else {
      setBranch(null);
      setAgents([]);
      setCallerIds([]);
      setMatrix({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId]);

  const toggle = (agentId: string, cid: string, key: keyof MatrixCell) => {
    setMatrix((prev) => {
      const next = { ...prev };
      const row = { ...(next[agentId] ?? {}) };
      const cell: MatrixCell = row[cid] ?? { inbound: false, outbound: false, transfer: false };
      row[cid] = { ...cell, [key]: !cell[key] };
      next[agentId] = row;
      return next;
    });
  };

  const addCallerId = () => {
    const trimmed = newCallerId.trim();
    if (!ENTRY_PATTERN.test(trimmed)) {
      message.error('숫자/+/- 만 허용합니다 (1~32자)');
      return;
    }
    if (callerIds.some((c) => c.callerIdNumber === trimmed)) {
      message.warning('이미 존재하는 발신번호입니다.');
      return;
    }
    setCallerIds((prev) => [
      ...prev,
      {
        callerIdNumber: trimmed,
        displayName: newDisplayName.trim() || null,
        sortOrder: prev.length,
      },
    ]);
    setNewCallerId('');
    setNewDisplayName('');
    setAddModalOpen(false);
  };

  const removeCallerId = (cid: string) => {
    setCallerIds((prev) => prev.filter((c) => c.callerIdNumber !== cid));
    setMatrix((prev) => {
      const next: typeof prev = {};
      for (const [agentId, row] of Object.entries(prev)) {
        const { [cid]: _omit, ...rest } = row;
        next[agentId] = rest;
      }
      return next;
    });
  };

  const save = async () => {
    if (!branchId) return;
    const entries: CallerIdEntry[] = [];
    for (const cid of callerIds) {
      for (const agent of agents) {
        const cell = matrix[agent.agentId]?.[cid.callerIdNumber];
        if (!cell) continue;
        // 모든 권한이 false 인 경우는 row 자체를 보내지 않음 (없는 것과 동일)
        if (!cell.inbound && !cell.outbound && !cell.transfer) continue;
        entries.push({
          agentId: agent.agentId,
          callerIdNumber: cid.callerIdNumber,
          displayName: cid.displayName ?? null,
          allowedInbound: cell.inbound,
          allowedOutbound: cell.outbound,
          allowedTransfer: cell.transfer,
          sortOrder: cid.sortOrder,
        });
      }
    }
    setSaving(true);
    try {
      await apiClient.post(
        `/admin/settings/branches/${branchId}/agent-caller-ids`,
        { entries },
      );
      message.success('CID 권한 매트릭스를 저장했습니다.');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => {
    const base: any[] = [
      {
        title: '상담원',
        key: 'agent',
        fixed: 'left' as const,
        width: 200,
        render: (_: unknown, agent: AgentRow) => (
          <div>
            <Typography.Text strong>{agent.agentName}</Typography.Text>
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {agent.agentCode} · 내선 {agent.extension}
            </div>
          </div>
        ),
      },
    ];
    for (const cid of callerIds) {
      base.push({
        title: (
          <Space direction="vertical" size={0} style={{ minWidth: 200 }}>
            <Space>
              <Typography.Text strong>{cid.callerIdNumber}</Typography.Text>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeCallerId(cid.callerIdNumber)}
              />
            </Space>
            {cid.displayName ? (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {cid.displayName}
              </Typography.Text>
            ) : null}
          </Space>
        ),
        key: cid.callerIdNumber,
        width: 220,
        render: (_: unknown, agent: AgentRow) => {
          const cell = matrix[agent.agentId]?.[cid.callerIdNumber] ?? {
            inbound: false,
            outbound: false,
            transfer: false,
          };
          return (
            <Space direction="vertical" size={2}>
              <Checkbox
                checked={cell.inbound}
                onChange={() => toggle(agent.agentId, cid.callerIdNumber, 'inbound')}
              >
                인바운드
              </Checkbox>
              <Checkbox
                checked={cell.outbound}
                onChange={() => toggle(agent.agentId, cid.callerIdNumber, 'outbound')}
              >
                아웃바운드
              </Checkbox>
              <Checkbox
                checked={cell.transfer}
                onChange={() => toggle(agent.agentId, cid.callerIdNumber, 'transfer')}
              >
                전환
              </Checkbox>
            </Space>
          );
        },
      });
    }
    return base;
  }, [agents, callerIds, matrix]);

  return (
    <Drawer
      title={
        <Space>
          <Typography.Text strong>발신권한 매트릭스</Typography.Text>
          <FeatureHelpButton featureKey="branch.callerIdMatrix" featureName="발신권한 매트릭스" />
          {branch ? (
            <Tag color="processing">
              {branch.branchName} ({branch.branchCode})
            </Tag>
          ) : branchName ? (
            <Tag>{branchName}</Tag>
          ) : null}
        </Space>
      }
      open={open}
      onClose={onClose}
      width={1200}
      destroyOnClose
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            발신번호 추가
          </Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            저장
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="이 매트릭스는 지사별로 상담원이 어떤 발신번호로 인/아웃/전환을 할 수 있는지 정의합니다."
        description="모든 권한이 비어있는 행은 저장 시 제거됩니다. 저장된 지사별 발신번호 권한은 PBX 설정 리로드 시 발신번호 규칙에 반영됩니다."
      />
      {callerIds.length === 0 ? (
        <Empty description="등록된 발신번호가 없습니다. 우측 상단 [발신번호 추가]로 시작하세요." />
      ) : (
        <ResponsiveTable<AgentRow>
          rowKey="agentId"
          dataSource={agents}
          loading={loading}
          columns={columns}
          size="small"
          pagination={false}
          scroll={{ x: 200 + 220 * callerIds.length }}
        />
      )}

      <Modal
        title="발신번호 추가"
        open={addModalOpen}
        onOk={addCallerId}
        onCancel={() => {
          setAddModalOpen(false);
          setNewCallerId('');
          setNewDisplayName('');
        }}
        okText="추가"
        cancelText="취소"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            value={newCallerId}
            onChange={(e) => setNewCallerId(e.target.value)}
            placeholder="예: 02-1234-5678"
            maxLength={32}
          />
          <Input
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="표시명 (선택)"
            maxLength={64}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            숫자/+/- 만 허용합니다.
          </Typography.Text>
        </Space>
      </Modal>
    </Drawer>
  );
}
