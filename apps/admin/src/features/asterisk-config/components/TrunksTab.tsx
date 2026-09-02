import { Button, Card, Popconfirm, Space, Tag, Typography, notification } from 'antd';
import { useEffect, useState } from 'react';
import { createTrunk, createTrunkGroup, createTrunksBulk, deleteTrunk, deleteTrunkGroup, getTrunkGroups, getTrunks, updateTrunk, updateTrunkGroup } from '../api/asteriskConfigApi';
import type { AsteriskBulkTrunkInput, AsteriskTrunk, AsteriskTrunkGroup, AsteriskTrunkGroupInput, AsteriskTrunkInput } from '../types/asterisk-config';
import { BulkTrunkModal } from './BulkTrunkModal';
import { TrunkGroupForm } from './TrunkGroupForm';
import { TrunkForm } from './TrunkForm';
import { usePermissionStore } from '../../../store/usePermissionStore';
import { FeatureHelpButton } from '../../../shared/help/FeatureHelpButton';
import { ResponsiveTable } from '../../../components/ResponsiveTable';

export function TrunksTab() {
  const [rows, setRows] = useState<AsteriskTrunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editing, setEditing] = useState<AsteriskTrunk | null>(null);
  const [groups, setGroups] = useState<AsteriskTrunkGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<AsteriskTrunkGroup | null>(null);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canCreate = permission?.canCreate ?? true;
  const canUpdate = permission?.canUpdate ?? true;
  const canDelete = permission?.canDelete ?? true;

  const load = async () => {
    setLoading(true);
    try {
      const [nextRows, nextGroups] = await Promise.all([getTrunks(), getTrunkGroups()]);
      setRows(nextRows);
      setGroups(nextGroups);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: AsteriskTrunkInput) => {
    try {
      if (editing) await updateTrunk(editing.id, values);
      else await createTrunk(values);
      notification.success({ message: 'PBX 설정이 적용되었습니다 (AMI reload 전송됨)' });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleBulkSave = async (values: AsteriskBulkTrunkInput) => {
    try {
      const created = await createTrunksBulk(values);
      notification.success({ message: `${created.length}개 회선을 등록했습니다.` });
      setBulkOpen(false);
      await load();
    } catch {
      notification.error({ message: '일괄 등록 실패' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrunk(id);
      notification.success({ message: '삭제되었습니다' });
      await load();
    } catch {
      notification.error({ message: '삭제 실패' });
    }
  };

  const handleGroupSave = async (values: AsteriskTrunkGroupInput) => {
    try {
      if (editingGroup) await updateTrunkGroup(editingGroup.id, values);
      else await createTrunkGroup(values);
      notification.success({ message: '국선 그룹이 저장되었습니다.' });
      setGroupFormOpen(false);
      setEditingGroup(null);
      await load();
    } catch {
      notification.error({ message: '국선 그룹 저장 실패' });
    }
  };

  const handleGroupDelete = async (id: string) => {
    try {
      await deleteTrunkGroup(id);
      notification.success({ message: '국선 그룹이 삭제되었습니다.' });
      await load();
    } catch {
      notification.error({ message: '국선 그룹 삭제 실패' });
    }
  };

  const columns = [
    { title: '표시명', dataIndex: 'name' },
    { title: 'Host', dataIndex: 'host' },
    { title: '포트', dataIndex: 'port', width: 80 },
    {
      title: '표시번호',
      dataIndex: 'computedDisplayNumber',
      width: 120,
      render: (value: string | null, row: AsteriskTrunk) => (
        value ? <Tag color={row.displayNumber ? 'processing' : 'default'}>{value}</Tag> : <Tag>미지정</Tag>
      ),
    },
    {
      title: '인증',
      dataIndex: 'username',
      render: (value: string) => (value ? value : <Tag>무인증</Tag>),
    },
    { title: '코덱', dataIndex: 'codecs' },
    {
      title: '상태', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리', width: 120, fixed: 'right' as const,
      render: (_: unknown, row: AsteriskTrunk) => (
        <Space>
          {canUpdate ? <Button size="small" onClick={() => { setEditing(row); setFormOpen(true); }}>수정</Button> : null}
          {canDelete ? (
            <Popconfirm title="삭제할까요?" onConfirm={() => handleDelete(row.id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const groupColumns = [
    { title: '그룹명', dataIndex: 'name' },
    {
      title: '기본',
      dataIndex: 'isDefault',
      width: 90,
      render: (value: boolean) => (value ? <Tag color="processing">기본</Tag> : <Tag>일반</Tag>),
    },
    {
      title: '회선',
      dataIndex: 'members',
      render: (members: AsteriskTrunkGroup['members']) => (
        <Space wrap size={[4, 4]}>
          {members
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((member) => (
              <Tag key={member.id} color={member.enabled && member.trunk.enabled ? 'success' : 'default'}>
                {member.priority} · {member.trunk.name}
              </Tag>
            ))}
        </Space>
      ),
    },
    {
      title: '상태',
      dataIndex: 'enabled',
      width: 80,
      render: (value: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '관리',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, row: AsteriskTrunkGroup) => (
        <Space>
          {canUpdate ? <Button size="small" onClick={() => { setEditingGroup(row); setGroupFormOpen(true); }}>수정</Button> : null}
          {canDelete ? (
            <Popconfirm title="삭제할까요?" onConfirm={() => handleGroupDelete(row.id)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              트렁크
            </Typography.Title>
            <Typography.Text type="secondary">
              통신사 SIP 트렁크 또는 타 PBX와의 연동 접속 정보를 등록하고 관리합니다.
            </Typography.Text>
          </div>
          <Space wrap>
            {canCreate ? <Button type="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>트렁크 추가</Button> : null}
            {canCreate ? <Button onClick={() => setBulkOpen(true)}>일괄 등록</Button> : null}
          </Space>
        </Space>
      </Card>
      <Card title="트렁크 목록">
        <ResponsiveTable
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 980 }}
        />
      </Card>
      <Card
        title={(
          <Space>
            <span>국선 그룹</span>
            <FeatureHelpButton featureKey="pbx.trunkGroup" featureName="국선 그룹" />
          </Space>
        )}
        extra={canCreate ? <Button onClick={() => { setEditingGroup(null); setGroupFormOpen(true); }}>국선 그룹 추가</Button> : null}
      >
        <Typography.Paragraph type="secondary">
          여러 회선을 하나의 발신 풀로 묶습니다. 기본 그룹이 있으면 발신 시 우선순위 순서로 회선을 사용합니다.
        </Typography.Paragraph>
        <ResponsiveTable
          rowKey="id"
          dataSource={groups}
          columns={groupColumns}
          loading={loading}
          pagination={false}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 900 }}
        />
      </Card>
      <TrunkForm open={formOpen} initial={editing} onOk={handleSave} onCancel={() => { setFormOpen(false); setEditing(null); }} />
      <BulkTrunkModal open={bulkOpen} onOk={handleBulkSave} onCancel={() => setBulkOpen(false)} />
      <TrunkGroupForm
        open={groupFormOpen}
        trunks={rows}
        initial={editingGroup}
        onOk={handleGroupSave}
        onCancel={() => { setGroupFormOpen(false); setEditingGroup(null); }}
      />
    </Space>
  );
}
