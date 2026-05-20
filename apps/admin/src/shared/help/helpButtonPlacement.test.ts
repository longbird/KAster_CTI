import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const placements = [
  ['src/features/system-settings/SystemSettingsPage.tsx', 'system.timeSync'],
  ['src/features/branch-settings/BranchSettingsPage.tsx', 'branch.inboundPolicy'],
  ['src/features/forwarding-settings/ForwardingSettingsPage.tsx', 'forwarding.condition'],
  ['src/features/queue-settings/QueueSettingsPage.tsx', 'queue.externalInboundMode'],
  ['src/features/agent-settings/AgentSettingsPage.tsx', 'agent.extensionDisplayName'],
  ['src/pages/AsteriskConfigPage.tsx', 'pbx.did'],
] as const;

describe('P0 setting screen help button placement', () => {
  it.each(placements)('%s includes help key %s', (filePath, featureKey) => {
    const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
    expect(source).toContain('FeatureHelpButton');
    expect(source).toContain(`featureKey="${featureKey}"`);
  });
});
