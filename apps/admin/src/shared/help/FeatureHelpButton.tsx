import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useState } from 'react';
import { FeatureHelpPanel } from './FeatureHelpPanel';
import { resolveFeatureHelp } from './featureHelp';

export interface FeatureHelpButtonProps {
  featureKey: string;
  featureName: string;
}

export function FeatureHelpButton({ featureKey, featureName }: FeatureHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const resolution = resolveFeatureHelp(featureKey);
  const tooltip =
    resolution.status === 'ready' && resolution.entry
      ? resolution.entry.summary
      : '도움말 준비 중';

  return (
    <>
      <Tooltip title={tooltip}>
        <Button
          type="text"
          size="small"
          icon={<QuestionCircleOutlined />}
          aria-label={`도움말 보기: ${featureName}`}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <FeatureHelpPanel
        featureKey={featureKey}
        featureName={featureName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
