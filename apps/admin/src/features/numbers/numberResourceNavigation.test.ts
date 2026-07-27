import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('number resource navigation targets', () => {
  it('NumbersPage renders targetRoute as a navigation button', () => {
    const text = source('src/features/numbers/NumbersPage.tsx');
    expect(text).toContain('useNavigate');
    expect(text).toContain('navigate(value)');
    expect(text).toContain('설정 열기');
  });

  it('target screens consume resourceId or feature query parameters', () => {
    expect(source('src/features/agent-settings/AgentSettingsPage.tsx')).toContain("searchParams.get('resourceId')");
    expect(source('src/features/queue-settings/QueueSettingsPage.tsx')).toContain("searchParams.get('resourceId')");
    expect(source('src/pages/AsteriskConfigPage.tsx')).toContain("searchParams.get('tab')");
    expect(source('src/features/asterisk-config/components/DidsTab.tsx')).toContain('resourceId');
    expect(source('src/features/live-calls/LiveCallsPage.tsx')).toContain("searchParams.get('feature')");
  });
});
