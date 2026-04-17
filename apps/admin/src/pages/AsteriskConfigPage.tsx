import { Button, Space, Tabs, Typography } from 'antd';
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
    <>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>PBX 회선 설정</Typography.Title>
        {canView ? <Button onClick={() => setPreviewOpen(true)}>.conf 미리보기</Button> : null}
      </Space>
      <Tabs
        items={[
          { key: 'trunks', label: '트렁크', children: <TrunksTab /> },
          { key: 'dids', label: 'DID', children: <DidsTab /> },
          { key: 'ivr', label: 'IVR 메뉴', children: <IvrMenusTab /> },
          { key: 'agents', label: '에이전트 내선', children: <AgentSipTab /> },
        ]}
      />
      <ConfigPreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}
