import { Button, Card, Space, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { AgentSipTab } from '../features/asterisk-config/components/AgentSipTab';
import { ConfigPreviewDrawer } from '../features/asterisk-config/components/ConfigPreviewDrawer';
import { DidsTab } from '../features/asterisk-config/components/DidsTab';
import { IvrMenusTab } from '../features/asterisk-config/components/IvrMenusTab';
import { TrunksTab } from '../features/asterisk-config/components/TrunksTab';
import { usePermissionStore } from '../store/usePermissionStore';

export function AsteriskConfigPage() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  const canView = permission?.canView ?? true;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              PBX 연동 설정
            </Typography.Title>
            <Typography.Text type="secondary">
              통신사 SIP 트렁크, DID 인입, IVR 라우팅, 상담원 내선(PJSIP) 연동 정보를 관리합니다.
            </Typography.Text>
          </div>
          {canView ? <Button onClick={() => setPreviewOpen(true)}>.conf 미리보기</Button> : null}
        </Space>
      </Card>

      <Card>
        <Tabs
          type="card"
          items={[
            { key: 'trunks', label: '트렁크', children: <TrunksTab /> },
            { key: 'dids', label: 'DID', children: <DidsTab /> },
            { key: 'ivr', label: 'IVR 메뉴', children: <IvrMenusTab /> },
            { key: 'agents', label: '에이전트 내선', children: <AgentSipTab /> },
          ]}
        />
      </Card>
      <ConfigPreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </Space>
  );
}
