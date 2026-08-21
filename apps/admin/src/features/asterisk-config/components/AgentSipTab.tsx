import { Button, Card, Input, Space, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { getAgentSip, syncAgentSip, updateAgentSipPassword } from '../api/asteriskConfigApi';
import type { AgentSipRow } from '../types/asterisk-config';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

const headerStyle = { whiteSpace: 'nowrap' as const };

function renderRegistrationStatus(row: AgentSipRow) {
  const status = row.registrationStatus ?? 'UNREGISTERED';
  if (/Avail|Reachable/i.test(status)) return <Tag color="green">등록됨</Tag>;
  if (/NonQual|NonQualified/i.test(status)) return <Tag color="green">등록됨(품질측정안함)</Tag>;
  if (/Lagged|Unreach|Unavailable|Unknown/i.test(status)) return <Tag color="orange">{status}</Tag>;
  return <Tag>{status === 'UNREGISTERED' ? '미등록' : status}</Tag>;
}

export function AgentSipTab() {
  const [rows, setRows] = useState<AgentSipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canUpdate = permission?.canUpdate ?? true;
  const canOperate = permission?.canOperate ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAgentSip();
      setRows(data);
      setPasswords(Object.fromEntries(data.map(r => [r.agentId, r.sipPassword ?? ''])));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handlePasswordSave = async (agentId: string) => {
    try {
      await updateAgentSipPassword(agentId, passwords[agentId]);
      notification.success({ message: '비밀번호가 저장되었습니다' });
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAgentSip();
      notification.success({ message: 'PJSIP 동기화 완료 (AMI reload 전송됨)' });
    } catch {
      notification.error({ message: '동기화 실패' });
    } finally { setSyncing(false); }
  };

  const columns = [
    { title: <span style={headerStyle}>내선번호</span>, dataIndex: 'extension', width: 90 },
    { title: <span style={headerStyle}>상담원명</span>, dataIndex: 'agentName', width: 110 },
    {
      title: <span style={headerStyle}>SIP 비밀번호</span>,
      width: 320,
      render: (_: unknown, row: AgentSipRow) => (
        <Space>
          <Input.Password
            value={passwords[row.agentId] ?? ''}
            onChange={e => setPasswords(prev => ({ ...prev, [row.agentId]: e.target.value }))}
            style={{ width: 180 }}
            disabled={!canUpdate}
          />
          {canUpdate ? <Button size="small" onClick={() => handlePasswordSave(row.agentId)}>저장</Button> : null}
          {row.usesSiteDefault && <Tag color="blue">사이트 기본값 사용</Tag>}
        </Space>
      ),
    },
    {
      title: <span style={headerStyle}>적용 비밀번호</span>,
      width: 90,
      render: (_: unknown, row: AgentSipRow) => (
        row.effectiveSipPassword ? <Typography.Text type="secondary">설정됨</Typography.Text> : <Tag>미설정</Tag>
      ),
    },
    {
      title: <span style={headerStyle}>등록상태</span>,
      width: 180,
      render: (_: unknown, row: AgentSipRow) => renderRegistrationStatus(row),
    },
    {
      title: <span style={headerStyle}>연락처</span>,
      width: 340,
      render: (_: unknown, row: AgentSipRow) => row.contactUri ? (
        <Typography.Text
          copyable={{ text: row.contactUri }}
          style={{ fontSize: 12, wordBreak: 'break-all' }}
        >
          {row.contactUri}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary">-</Typography.Text>
      ),
    },
    {
      title: <span style={headerStyle}>RTT</span>,
      width: 80,
      render: (_: unknown, row: AgentSipRow) => (
        row.roundtripUsec ? <Typography.Text type="secondary">{Math.round(row.roundtripUsec / 1000)} ms</Typography.Text> : '-'
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              에이전트 내선
            </Typography.Title>
            <Typography.Text type="secondary">
              상담원 전화기 또는 소프트폰이 등록하는 PJSIP 내선의 비밀번호와 등록 상태를 관리합니다.
            </Typography.Text>
          </div>
          <Space wrap>
            <Typography.Text type="secondary">
              개별 SIP 비밀번호가 비어 있으면 사이트 기본 SIP 비밀번호를 사용합니다.
            </Typography.Text>
            {canOperate ? <Button type="primary" loading={syncing} onClick={handleSync}>PJSIP 동기화</Button> : null}
          </Space>
        </Space>
      </Card>
      <Card title="내선 등록 상태">
        <ResponsiveTable
          rowKey="agentId"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 1180 }}
        />
      </Card>
    </Space>
  );
}
