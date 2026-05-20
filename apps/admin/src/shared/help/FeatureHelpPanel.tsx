import { Drawer } from 'antd';
import { FeatureHelpPanelBody } from './FeatureHelpPanelBody';
import { resolveFeatureHelp } from './featureHelp';

export interface FeatureHelpPanelProps {
  featureKey: string;
  featureName: string;
  open: boolean;
  onClose: () => void;
}

export function FeatureHelpPanel({ featureKey, featureName, open, onClose }: FeatureHelpPanelProps) {
  const resolution = resolveFeatureHelp(featureKey);
  return (
    <Drawer title={`도움말 · ${featureName}`} open={open} onClose={onClose} width={420}>
      <FeatureHelpPanelBody resolution={resolution} />
    </Drawer>
  );
}
