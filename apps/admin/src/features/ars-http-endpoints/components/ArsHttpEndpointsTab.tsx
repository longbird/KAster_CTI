import { Alert, Button, Input, Modal, Popconfirm, Space, Table, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { ResponsiveTable } from '../../../components/ResponsiveTable';
import { usePermissionStore } from '../../../store/usePermissionStore';
import {
  createArsHttpEndpoint,
  deleteArsHttpEndpoint,
  listArsHttpEndpoints,
  testArsHttpEndpoint,
  updateArsHttpEndpoint,
  type ArsHttpEndpoint,
  type ArsHttpEndpointInput,
} from '../api/arsHttpEndpointsApi';
import { describeOutcome, type OutcomeSummary } from '../types/requestMapping';
import { ArsHttpEndpointForm } from './ArsHttpEndpointForm';

/**
 * ARS 도중 부를 외부 API 를 등록한다.
 *
 * 플로우 노드는 여기 등록된 것만 고를 수 있다 — 노드에 주소를 직접 적게 하면 PBX 망에서
 * 아무 데나 부를 수 있고, 그래프는 복사되므로 자격증명이 거기 있으면 안 된다.
 */
export function ArsHttpEndpointsTab() {
  const [rows, setRows] = useState<ArsHttpEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ArsHttpEndpoint | null>(null);
  const [testing, setTesting] = useState<ArsHttpEndpoint | null>(null);
  const [testCollected, setTestCollected] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeSummary | null>(null);

  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listArsHttpEndpoints());
    } catch {
      notification.error({ message: '엔드포인트를 불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (input: ArsHttpEndpointInput) => {
    setSaving(true);
    try {
      if (editing) await updateArsHttpEndpoint(editing.endpointId, input);
      else await createArsHttpEndpoint(input);
      notification.success({ message: '저장되었습니다' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (error: any) {
      // 서버가 무엇이 잘못됐는지 말해준다(주소·매핑·인증). 그대로 보여준다.
      notification.error({
        message: '저장 실패',
        description: error?.response?.data?.error?.message ?? error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (endpointId: string) => {
    try {
      await deleteArsHttpEndpoint(endpointId);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const runTest = async () => {
    if (!testing) return;
    setTestBusy(true);
    setOutcome(null);
    try {
      setOutcome(describeOutcome(await testArsHttpEndpoint(testing.endpointId, { collected: testCollected })));
    } catch (error: any) {
      setOutcome({
        tone: 'error',
        title: '테스트 호출을 보내지 못했습니다',
        detail: error?.response?.data?.error?.message ?? error?.message ?? '',
      });
    } finally {
      setTestBusy(false);
    }
  };

  const columns = [
    {
      title: '이름',
      render: (_: unknown, row: ArsHttpEndpoint) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.url}</Typography.Text>
        </Space>
      ),
    },
    { title: '방식', dataIndex: 'method', width: 80 },
    {
      title: '결과 위치',
      width: 200,
      render: (_: unknown, row: ArsHttpEndpoint) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code>{row.resultPath}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.matchMode === 'EXISTS' ? '값이 있으면' : `${row.matchMode} ${row.matchValue ?? ''}`}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '인증',
      width: 110,
      render: (_: unknown, row: ArsHttpEndpoint) =>
        row.authType === 'NONE'
          ? <Tag>없음</Tag>
          : <Tag color={row.hasSecret ? 'green' : 'red'}>{row.hasSecret ? row.authType : '값 없음'}</Tag>,
    },
    { title: '대기', width: 80, render: (_: unknown, row: ArsHttpEndpoint) => `${row.timeoutMs}ms` },
    {
      title: '상태',
      width: 80,
      render: (_: unknown, row: ArsHttpEndpoint) =>
        row.isActive ? <Tag color="blue">사용</Tag> : <Tag>중지</Tag>,
    },
    {
      title: '관리',
      width: 190,
      fixed: 'right' as const,
      render: (_: unknown, row: ArsHttpEndpoint) => (
        <Space>
          <Button size="small" onClick={() => { setTesting(row); setOutcome(null); setTestCollected(''); }}>
            테스트 호출
          </Button>
          {canUpdate ? (
            <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button>
          ) : null}
          {canDelete ? (
            <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.endpointId)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="ARS 플로우가 통화 중에 부를 외부 API 입니다"
        description="플로우에서는 여기 등록된 것만 고를 수 있습니다. 등록 전에 테스트 호출로 응답 모양을 먼저 맞추세요."
      />

      {canCreate ? (
        <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
          엔드포인트 등록
        </Button>
      ) : null}

      <ResponsiveTable>
        <Table
          rowKey="endpointId"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
        />
      </ResponsiveTable>

      <ArsHttpEndpointForm
        open={formOpen}
        editing={editing}
        saving={saving}
        onCancel={() => { setFormOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      <Modal
        open={Boolean(testing)}
        title={`테스트 호출 — ${testing?.name ?? ''}`}
        onCancel={() => setTesting(null)}
        onOk={runTest}
        confirmLoading={testBusy}
        okText="호출"
        cancelText="닫기"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            통화 경로와 같은 경로를 탑니다 — 차단기·대기 시간·값 검사까지 그대로 겪습니다.
          </Typography.Text>
          <Input
            addonBefore="입력받은 번호"
            value={testCollected}
            onChange={(event) => setTestCollected(event.target.value)}
            placeholder="고객이 눌렀다고 가정할 숫자"
          />
          {outcome ? (
            <Alert type={outcome.tone} showIcon message={outcome.title} description={outcome.detail} />
          ) : null}
        </Space>
      </Modal>
    </Space>
  );
}
