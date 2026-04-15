import { Segmented } from 'antd';
import { useUiStore, type WorkspaceMode } from '../store/useUiStore';

export function ModeSwitch() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  return (
    <Segmented
      size="small"
      value={mode}
      onChange={(v) => setMode(v as WorkspaceMode)}
      options={[
        { label: 'Mini', value: 'mini' },
        { label: 'Full', value: 'full' },
      ]}
    />
  );
}
