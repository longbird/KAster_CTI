import { Button, Card, Space, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgentSipTab } from '../features/asterisk-config/components/AgentSipTab';
import { ConfigPreviewDrawer } from '../features/asterisk-config/components/ConfigPreviewDrawer';
import { DidsTab } from '../features/asterisk-config/components/DidsTab';
import { IvrMenusTab } from '../features/asterisk-config/components/IvrMenusTab';
import { SpeedDialsTab } from '../features/asterisk-config/components/SpeedDialsTab';
import { TrunksTab } from '../features/asterisk-config/components/TrunksTab';
import { FeatureHelpButton } from '../shared/help';
import { usePermissionStore } from '../store/usePermissionStore';

export function AsteriskConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewOpen, setPreviewOpen] = useState(false);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canView = permission?.canView ?? true;
  const activeTab = searchParams.get('tab') || 'trunks';
  const resourceId = searchParams.get('resourceId');

  const handleTabChange = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    next.delete('resourceId');
    setSearchParams(next, { replace: true });
  };

  const clearResourceId = () => {
    if (!searchParams.has('resourceId')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('resourceId');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="settings-portal">
      <Card className="settings-portal__head">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Space align="center">
              <Typography.Title level={4} style={{ margin: 0, marginBottom: 4 }}>
                PBX 연동 설정
              </Typography.Title>
              <FeatureHelpButton featureKey="pbx.did" featureName="DID 설정" />
            </Space>
            <div className="settings-portal__state-line">
              <span>검증 필요</span>
              <span>운영 반영 전</span>
              <span>설정 범위: 트렁크 / DID / IVR / 내선</span>
            </div>
          </div>
          <Space wrap>
            {canView ? <Button onClick={() => setPreviewOpen(true)}>.conf 미리보기</Button> : null}
            <Button disabled>검증</Button>
            <Button disabled>적용</Button>
          </Space>
        </Space>
        <div className="settings-portal__summary">
          <div><span>Trunk</span><strong>관리</strong></div>
          <div><span>DID</span><strong>인입</strong></div>
          <div><span>IVR</span><strong>라우팅</strong></div>
          <div><span>Agent</span><strong>내선</strong></div>
          <div><span>Preview</span><strong>.conf</strong></div>
        </div>
      </Card>

      <Card className="settings-portal__body">
        <Tabs
          type="card"
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            { key: 'trunks', label: '트렁크', children: <TrunksTab /> },
            { key: 'dids', label: 'DID', children: <DidsTab resourceId={resourceId} onResourceHandled={clearResourceId} /> },
            { key: 'ivr', label: 'IVR 메뉴', children: <IvrMenusTab /> },
            { key: 'agents', label: '에이전트 내선', children: <AgentSipTab /> },
            { key: 'speed-dials', label: '단축 발신', children: <SpeedDialsTab /> },
          ]}
        />
      </Card>
      <ConfigPreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}
