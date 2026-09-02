import { Button, Card, Modal, Space, Tabs, Tooltip, Typography, message } from 'antd';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArsHttpEndpointsTab } from '../features/ars-http-endpoints/components/ArsHttpEndpointsTab';
import { AgentSipTab } from '../features/asterisk-config/components/AgentSipTab';
import { ConfigPreviewDrawer } from '../features/asterisk-config/components/ConfigPreviewDrawer';
import { applyConfig } from '../features/asterisk-config/api/asteriskConfigApi';
import {
  describeDiffSummary,
  resolveApplyGate,
  type ConfigDiffResponse,
} from '../features/asterisk-config/apply/applyGate';
import { DidsTab } from '../features/asterisk-config/components/DidsTab';
import { IvrMenusTab } from '../features/asterisk-config/components/IvrMenusTab';
import { SpeedDialsTab } from '../features/asterisk-config/components/SpeedDialsTab';
import { FeatureCodesTab } from '../features/asterisk-config/components/FeatureCodesTab';
import { TrunksTab } from '../features/asterisk-config/components/TrunksTab';
import { FeatureHelpButton } from '../shared/help';
import { usePermissionStore } from '../store/usePermissionStore';

export function AsteriskConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [diff, setDiff] = useState<ConfigDiffResponse | null>(null);
  // 드로어를 열어 변경 내역을 실제로 받아 본 뒤에만 적용이 열린다 (설계 D6).
  const [reviewed, setReviewed] = useState(false);
  const [applying, setApplying] = useState(false);
  const permission = usePermissionStore((s) => s.permissionsByMenu.asterisk);
  // 외부 통신을 여는 기능이라 플로우 빌더와 자격이 따로다. 자격이 없으면 탭 자체를 만들지 않는다.
  const httpLookupEnabled = usePermissionStore((s) => s.featureEntitlements['ars-http-lookup'] === true);
  const canView = permission?.canView ?? true;
  const canOperate = permission?.canOperate ?? false;

  const gate = resolveApplyGate({ reviewed, diff: diff?.diff ?? null, validation: diff?.validation ?? null, canOperate });

  const handleDiffLoaded = useCallback((loaded: ConfigDiffResponse | null) => {
    setDiff(loaded);
    setReviewed(loaded !== null);
  }, []);

  const handleApply = () => {
    Modal.confirm({
      title: 'PBX 설정을 적용할까요?',
      content: `운영 중인 설정이 즉시 덮어써지고 reload 됩니다. ${describeDiffSummary(diff?.diff ?? null)}`,
      okText: '적용',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: async () => {
        setApplying(true);
        try {
          await applyConfig();
          message.success('PBX 설정을 적용했습니다.');
          // 적용하고 나면 방금 본 변경 내역은 이미 반영된 것이다. 다시 확인하게 만든다.
          setReviewed(false);
          setDiff(null);
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? '적용하지 못했습니다.');
        } finally {
          setApplying(false);
        }
      },
    });
  };
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
            {canView ? (
              <Button onClick={() => setPreviewOpen(true)}>변경 내역 · .conf 미리보기</Button>
            ) : null}
            <Tooltip title={gate.reason ?? ''}>
              <Button type="primary" danger disabled={!gate.canApply} loading={applying} onClick={handleApply}>
                적용
              </Button>
            </Tooltip>
            {diff && (
              <Typography.Text type="secondary">{describeDiffSummary(diff.diff)}</Typography.Text>
            )}
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
            { key: 'feature-codes', label: '기능코드', children: <FeatureCodesTab /> },
            ...(httpLookupEnabled
              ? [{ key: 'http-endpoints', label: '외부 조회', children: <ArsHttpEndpointsTab /> }]
              : []),
          ]}
        />
      </Card>
      <ConfigPreviewDrawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onDiffLoaded={handleDiffLoaded}
      />
    </div>
  );
}
