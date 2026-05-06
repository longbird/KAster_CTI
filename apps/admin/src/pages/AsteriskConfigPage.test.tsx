import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AsteriskConfigPage } from './AsteriskConfigPage';

vi.mock('../features/asterisk-config/components/AgentSipTab', () => ({
  AgentSipTab: () => <div>agent sip</div>,
}));

vi.mock('../features/asterisk-config/components/ConfigPreviewDrawer', () => ({
  ConfigPreviewDrawer: () => null,
}));

vi.mock('../features/asterisk-config/components/DidsTab', () => ({
  DidsTab: () => <div>dids</div>,
}));

vi.mock('../features/asterisk-config/components/IvrMenusTab', () => ({
  IvrMenusTab: () => <div>ivr</div>,
}));

vi.mock('../features/asterisk-config/components/TrunksTab', () => ({
  TrunksTab: () => <div>trunks</div>,
}));

vi.mock('../store/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: unknown) => unknown) =>
    selector({
      permissionsByMenu: {
        asterisk: { canView: true },
      },
    }),
}));

describe('AsteriskConfigPage layout', () => {
  it('uses the settings portal frame for PBX configuration changes', () => {
    const html = renderToStaticMarkup(<AsteriskConfigPage />);

    expect(html).toContain('settings-portal');
    expect(html).toContain('settings-portal__summary');
    expect(html).toContain('PBX 연동 설정');
    expect(html).toContain('미리보기');
    expect(html).toContain('검증');
  });
});
