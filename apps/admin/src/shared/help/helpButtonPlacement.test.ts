import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const placements = [
  ['src/features/system-settings/SystemSettingsPage.tsx', 'system.timeSync'],
  ['src/features/system-settings/SystemSettingsPage.tsx', 'pbx.trunkDisplayNumber'],
  ['src/features/branch-settings/BranchSettingsPage.tsx', 'branch.inboundPolicy'],
  ['src/features/forwarding-settings/ForwardingSettingsPage.tsx', 'forwarding.condition'],
  ['src/features/queue-settings/QueueSettingsPage.tsx', 'queue.externalInboundMode'],
  ['src/features/agent-settings/AgentSettingsPage.tsx', 'agent.extensionDisplayName'],
  ['src/features/agent-settings/AgentSettingsPage.tsx', 'agent.extensionLock'],
  ['src/pages/AsteriskConfigPage.tsx', 'pbx.did'],
  ['src/features/integrations/IntegrationsPage.tsx', 'integration.automation'],
  ['src/features/outbound-rules/OutboundRulesPage.tsx', 'outbound.callerIdRule'],
  ['src/features/holiday-settings/HolidaySettingsPage.tsx', 'ops.holidayRules'],
  ['src/features/blocklist/BlocklistPage.tsx', 'optout.blocklist080'],
  ['src/features/branch-settings/BranchAgentCidAuthDrawer.tsx', 'branch.callerIdMatrix'],
] as const;

describe('P0 setting screen help button placement', () => {
  it.each(placements)('%s includes help key %s', (filePath, featureKey) => {
    const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
    expect(source).toContain('FeatureHelpButton');
    expect(source).toContain(`featureKey="${featureKey}"`);
  });
});
