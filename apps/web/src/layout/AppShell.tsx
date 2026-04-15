import { useUiStore } from '../store/useUiStore';
import { FullShell } from './FullShell';
import { MiniShell } from './MiniShell';

// conv 12·13: 동일 백엔드 + 프론트 두 모드. 런타임에 mode store 가 결정한다.
// URL ?mode=mini 또는 localStorage 영속.
export function AppShell() {
  const mode = useUiStore((s) => s.mode);
  return mode === 'mini' ? <MiniShell /> : <FullShell />;
}
