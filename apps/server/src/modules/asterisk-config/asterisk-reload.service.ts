import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { parseAllowedCallerIds } from '../../common/outbound-caller-id.util';
import { PrismaService } from '../../common/prisma.service';
import { AmiConnectionService } from '../ami/ami-connection.service';
import { buildPickupGroupName, normalizeAgentRuntimeProfile } from './renderers/agent-settings';
import { renderAgentDialplan } from './renderers/agent-dialplan.renderer';
import { renderDialplan } from './renderers/dialplan.renderer';
import { renderMusiconholdConf } from './renderers/musiconhold.renderer';
import { renderPjsip } from './renderers/pjsip.renderer';
import { renderQueuesConf } from './renderers/queues.renderer';

const PROMPT_MOH_INCLUDE_FILENAME = 'musiconhold_kaster_prompts.conf';
const OPT_OUT_HOOK_SCRIPT_PATH = '/var/lib/asterisk/bin/kaster-opt-out-hook.sh';

type Blocklist080Mode = 'IMMEDIATE_OPT_OUT' | 'DTMF_MENU' | 'SMART_OPT_OUT';
type Blocklist080DtmfActionType = 'QUEUE_ROUTE' | 'REGISTER_OPT_OUT' | 'UNREGISTER_OPT_OUT' | 'SEND_SMS';
type Blocklist080SmartActionType = 'REGISTER_OPT_OUT' | 'REENTER_NUMBER' | 'SEND_SMS' | 'HANGUP';

interface Blocklist080Mapping {
  digit: string;
  actionType: Blocklist080DtmfActionType | Blocklist080SmartActionType | string;
  queueId?: string | null;
  smsTemplateId?: string | null;
}

interface Blocklist080DtmfMenu {
  timeoutSeconds?: number;
  maxRetries?: number;
  invalidPromptId?: string | null;
  timeoutPromptId?: string | null;
  mappings?: Blocklist080Mapping[];
}

interface Blocklist080SmartFlow {
  inputPromptId?: string | null;
  reentryPromptId?: string | null;
  sameNumberPromptId?: string | null;
  confirmPrefixPromptId?: string | null;
  confirmSuffixPromptId?: string | null;
  confirmMenuPromptId?: string | null;
  failurePromptId?: string | null;
  finalPromptId?: string | null;
  inputTimeoutSeconds?: number;
  maxRetries?: number;
  confirmationMappings?: Blocklist080Mapping[];
}

interface Blocklist080Profile {
  enabled?: boolean;
  mode?: Blocklist080Mode | string | null;
  basePromptId?: string | null;
  completionPromptId?: string | null;
  smsTemplateId?: string | null;
  dtmfMenu?: Blocklist080DtmfMenu | null;
  smartFlow?: Blocklist080SmartFlow | null;
}

const BLOCKLIST080_MODES: Blocklist080Mode[] = ['IMMEDIATE_OPT_OUT', 'DTMF_MENU', 'SMART_OPT_OUT'];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function extractBranchPromptIds(settingsProfile: unknown): string[] {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return [];
  }

  const source = settingsProfile as Record<string, unknown>;
  const prompts = source.prompts && typeof source.prompts === 'object' && !Array.isArray(source.prompts)
    ? source.prompts as Record<string, unknown>
    : null;

  if (!prompts || prompts.enabled !== true) {
    return [];
  }

  return normalizeStringArray(prompts.ids);
}

function extractBranchPromptQueueDelaySeconds(settingsProfile: unknown): number {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return 0;
  }

  const source = settingsProfile as Record<string, unknown>;
  const prompts = source.prompts && typeof source.prompts === 'object' && !Array.isArray(source.prompts)
    ? source.prompts as Record<string, unknown>
    : null;

  if (!prompts || prompts.enabled !== true) {
    return 0;
  }

  if (typeof prompts.queueJoinDelaySeconds !== 'number' || !Number.isFinite(prompts.queueJoinDelaySeconds)) {
    return 0;
  }

  return Math.max(0, Math.min(300, Math.trunc(prompts.queueJoinDelaySeconds)));
}

function extractBranchPromptWaitForCompletion(settingsProfile: unknown): boolean {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return false;
  }

  const source = settingsProfile as Record<string, unknown>;
  const prompts = source.prompts && typeof source.prompts === 'object' && !Array.isArray(source.prompts)
    ? source.prompts as Record<string, unknown>
    : null;

  if (!prompts || prompts.enabled !== true) {
    return false;
  }

  return prompts.waitForPlaybackCompletionBeforeQueue === true;
}

function extractBlocklist080Profile(settingsProfile: unknown): Blocklist080Profile | null {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return null;
  }

  const source = settingsProfile as Record<string, unknown>;
  const blocklist080 = source.blocklist080 && typeof source.blocklist080 === 'object' && !Array.isArray(source.blocklist080)
    ? source.blocklist080 as Blocklist080Profile
    : null;

  if (!blocklist080?.enabled) {
    return null;
  }

  return blocklist080;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function mapPromptKey(promptId: string | null | undefined, promptKeyById: Map<string, string>): string | null {
  if (!promptId?.trim()) {
    return null;
  }

  return promptKeyById.get(promptId.trim()) ?? null;
}

function normalizeBlocklist080Mappings(
  mappings: Blocklist080Mapping[] | undefined,
  queueNameById: Map<string, string>,
): Array<{
  digit: string;
  actionType: Blocklist080DtmfActionType | Blocklist080SmartActionType;
  queueName: string | null;
  smsTemplateId: string | null;
}> {
  if (!Array.isArray(mappings)) {
    return [];
  }

  return mappings
    .filter((mapping) => typeof mapping?.digit === 'string' && typeof mapping?.actionType === 'string')
    .map((mapping) => ({
      digit: mapping.digit.trim(),
      actionType: mapping.actionType.trim() as Blocklist080DtmfActionType | Blocklist080SmartActionType,
      queueName: mapping.queueId ? queueNameById.get(mapping.queueId) ?? null : null,
      smsTemplateId: mapping.smsTemplateId?.trim() || null,
    }))
    .filter((mapping) => Boolean(mapping.digit && mapping.actionType));
}

function resolveDidBranchOptOut(
  branchMappings: Array<{
    branchId?: string;
    branch?: { isActive: boolean; settingsProfile: unknown } | null;
  }>,
  promptKeyById: Map<string, string>,
  queueNameById: Map<string, string>,
) {
  for (const mapping of branchMappings) {
    if (!mapping.branch?.isActive) {
      continue;
    }

    const profile = extractBlocklist080Profile(mapping.branch.settingsProfile);
    if (!profile) {
      continue;
    }

    const normalizedMode = typeof profile.mode === 'string' && profile.mode.trim()
      ? profile.mode.trim()
      : 'IMMEDIATE_OPT_OUT';
    const mode: Blocklist080Mode = BLOCKLIST080_MODES.includes(normalizedMode as Blocklist080Mode)
      ? normalizedMode as Blocklist080Mode
      : 'IMMEDIATE_OPT_OUT';

    return {
      enabled: true,
      tenantId: '',
      branchId: mapping.branchId ?? null,
      mode,
      basePromptKey: mapPromptKey(profile.basePromptId, promptKeyById),
      completionPromptKey: mapPromptKey(profile.completionPromptId, promptKeyById),
      smsTemplateId: profile.smsTemplateId?.trim() || null,
      dtmfMenu: profile.dtmfMenu
        ? {
          timeoutSeconds: normalizePositiveInteger(profile.dtmfMenu.timeoutSeconds, 5),
          maxRetries: Math.max(0, Math.trunc(profile.dtmfMenu.maxRetries ?? 0)),
          invalidPromptKey: mapPromptKey(profile.dtmfMenu.invalidPromptId, promptKeyById),
          timeoutPromptKey: mapPromptKey(profile.dtmfMenu.timeoutPromptId, promptKeyById),
          mappings: normalizeBlocklist080Mappings(profile.dtmfMenu.mappings, queueNameById),
        }
        : null,
      smartFlow: profile.smartFlow
        ? {
          inputPromptKey: mapPromptKey(profile.smartFlow.inputPromptId, promptKeyById),
          reentryPromptKey: mapPromptKey(profile.smartFlow.reentryPromptId, promptKeyById),
          sameNumberPromptKey: mapPromptKey(profile.smartFlow.sameNumberPromptId, promptKeyById),
          confirmPrefixPromptKey: mapPromptKey(profile.smartFlow.confirmPrefixPromptId, promptKeyById),
          confirmSuffixPromptKey: mapPromptKey(profile.smartFlow.confirmSuffixPromptId, promptKeyById),
          confirmMenuPromptKey: mapPromptKey(profile.smartFlow.confirmMenuPromptId, promptKeyById),
          failurePromptKey: mapPromptKey(profile.smartFlow.failurePromptId, promptKeyById),
          finalPromptKey: mapPromptKey(profile.smartFlow.finalPromptId, promptKeyById),
          inputTimeoutSeconds: normalizePositiveInteger(profile.smartFlow.inputTimeoutSeconds, 5),
          maxRetries: Math.max(0, Math.trunc(profile.smartFlow.maxRetries ?? 0)),
          confirmationMappings: normalizeBlocklist080Mappings(profile.smartFlow.confirmationMappings, queueNameById),
        }
        : null,
    };
  }

  return null;
}

function resolveDidPromptKeys(
  branchMappings: Array<{
    branch?: { isActive: boolean; settingsProfile: unknown } | null;
  }>,
  promptKeyById: Map<string, string>,
): string[] {
  for (const mapping of branchMappings) {
    if (!mapping.branch?.isActive) {
      continue;
    }

    const promptKeys = extractBranchPromptIds(mapping.branch.settingsProfile)
      .map((promptId) => promptKeyById.get(promptId))
      .filter((promptKey): promptKey is string => Boolean(promptKey));

    if (promptKeys.length > 0) {
      return [...new Set(promptKeys)];
    }
  }

  return [];
}

function resolveDidPromptQueueDelaySeconds(
  branchMappings: Array<{
    branch?: { isActive: boolean; settingsProfile: unknown } | null;
  }>,
): number {
  for (const mapping of branchMappings) {
    if (!mapping.branch?.isActive) {
      continue;
    }

    return extractBranchPromptQueueDelaySeconds(mapping.branch.settingsProfile);
  }

  return 0;
}

function resolveDidPromptWaitForCompletion(
  branchMappings: Array<{
    branch?: { isActive: boolean; settingsProfile: unknown } | null;
  }>,
): boolean {
  for (const mapping of branchMappings) {
    if (!mapping.branch?.isActive) {
      continue;
    }

    return extractBranchPromptWaitForCompletion(mapping.branch.settingsProfile);
  }

  return false;
}

function buildPromptMohClassName(promptKey: string): string {
  const normalized = promptKey
    .replace(/^custom\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `branch-prompt-${normalized || 'default'}`;
}

function buildDefaultMusiconholdBaseContent(includeLine: string): string {
  return [
    '; Managed by KAster CTI - base MOH file',
    '[default]',
    'mode=files',
    'directory=/var/lib/asterisk/moh',
    'random=no',
    '',
    includeLine,
    '',
  ].join('\n');
}

function buildOptOutHookScript(port: number, configuredSecret: string | null): string {
  const defaultSecret = (configuredSecret ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return [
    '#!/bin/sh',
    'set -eu',
    '',
    'ACTION="${1:-}"',
    'TENANT_ID="${2:-}"',
    'BRANCH_ID="${3:-}"',
    'ENTRY_DID="${4:-}"',
    'REQUESTER_PHONE="${5:-}"',
    'TARGET_PHONE="${6:-}"',
    'SOURCE_TYPE="${7:-}"',
    'SMS_TEMPLATE_ID="${8:-}"',
    'API_BASE_URL="${KASTER_OPT_OUT_API_BASE_URL:-http://127.0.0.1:' + port + '/api/v1/asterisk-config/internal/opt-out}"',
    'INTERNAL_SECRET="${KASTER_INTERNAL_SECRET:-' + defaultSecret + '}"',
    '',
    'normalize_optional() {',
    '  if [ "${1:-}" = "-" ]; then',
    "    printf ''",
    '  else',
    '    printf %s "${1:-}"',
    '  fi',
    '}',
    '',
    'BRANCH_ID="$(normalize_optional "$BRANCH_ID")"',
    'ENTRY_DID="$(normalize_optional "$ENTRY_DID")"',
    'TARGET_PHONE="$(normalize_optional "$TARGET_PHONE")"',
    'SMS_TEMPLATE_ID="$(normalize_optional "$SMS_TEMPLATE_ID")"',
    '',
    'if [ -z "$ACTION" ] || [ -z "$TENANT_ID" ] || [ -z "$REQUESTER_PHONE" ] || [ -z "$SOURCE_TYPE" ]; then',
    "  echo 'missing required opt-out hook arguments' >&2",
    '  exit 64',
    'fi',
    '',
    'if [ -z "$INTERNAL_SECRET" ]; then',
    "  echo 'KASTER_INTERNAL_SECRET is not configured for opt-out hook' >&2",
    '  exit 65',
    'fi',
    '',
    'build_action_payload() {',
    '  printf \'{"tenantId":"%s","branchId":"%s","entryDid":"%s","requesterPhoneNumber":"%s","sourceType":"%s","smsTemplateId":"%s"}\' "$TENANT_ID" "$BRANCH_ID" "$ENTRY_DID" "$REQUESTER_PHONE" "$SOURCE_TYPE" "$SMS_TEMPLATE_ID"',
    '}',
    '',
    'build_smart_payload() {',
    '  printf \'{"tenantId":"%s","branchId":"%s","entryDid":"%s","requesterPhoneNumber":"%s","targetPhoneNumber":"%s","sourceType":"%s","smsTemplateId":"%s"}\' "$TENANT_ID" "$BRANCH_ID" "$ENTRY_DID" "$REQUESTER_PHONE" "$TARGET_PHONE" "$SOURCE_TYPE" "$SMS_TEMPLATE_ID"',
    '}',
    '',
    'post_payload() {',
    '  endpoint="$1"',
    '  payload="$2"',
    '  curl -fsS --connect-timeout 3 --max-time 10 -X POST "$API_BASE_URL/$endpoint" \\',
    "    -H 'Content-Type: application/json' \\",
    '    -H "x-kaster-internal-secret: $INTERNAL_SECRET" \\',
    '    --data "$payload" >/dev/null',
    '}',
    '',
    'case "$ACTION" in',
    '  register)',
    '    if [ -n "$TARGET_PHONE" ] && [ "$TARGET_PHONE" != "$REQUESTER_PHONE" ]; then',
    '      post_payload "smart/register" "$(build_smart_payload)"',
    '    else',
    '      post_payload "register" "$(build_action_payload)"',
    '    fi',
    '    ;;',
    '  unregister)',
    '    if [ -n "$TARGET_PHONE" ] && [ "$TARGET_PHONE" != "$REQUESTER_PHONE" ]; then',
    '      post_payload "smart/unregister" "$(build_smart_payload)"',
    '    else',
    '      post_payload "unregister" "$(build_action_payload)"',
    '    fi',
    '    ;;',
    '  sms)',
    '    printf \'opt-out sms delivery is not implemented: tenant=%s requester=%s template=%s\\n\' "$TENANT_ID" "$REQUESTER_PHONE" "$SMS_TEMPLATE_ID" >&2',
    '    exit 69',
    '    ;;',
    '  *)',
    "    echo 'unknown opt-out hook action' >&2",
    '    exit 64',
    '    ;;',
    'esac',
    '',
  ].join('\n');
}

@Injectable()
export class AsteriskReloadService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AsteriskReloadService.name);
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly bootstrapDelayMs = 15000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ami: AmiConnectionService,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => {
      void this.syncAllTenantsOnStartup().catch((error) => {
        this.logger.error(
          `Initial Asterisk config sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, this.bootstrapDelayMs);
  }

  onModuleDestroy() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  scheduleReload(tenantId: string): void {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(tenantId);
      void this.executeReload(tenantId).catch((error) => {
        this.logger.error(
          `Asterisk reload failed for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 5000);
    this.debounceTimers.set(tenantId, timer);
  }

  async executeReload(tenantId: string): Promise<void> {
    const existing = this.debounceTimers.get(tenantId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(tenantId);
    }
    const reloadable = await this.writeConfFiles(tenantId);
    if (!reloadable) {
      this.logger.warn(`Skipping AMI reload because Asterisk conf directory is not available for tenant ${tenantId}`);
      return;
    }
    if (!this.ami.isConnected()) {
      this.logger.warn(`AMI is not connected yet. Re-scheduling Asterisk reload for tenant ${tenantId}`);
      this.scheduleReload(tenantId);
      return;
    }
    this.logger.debug(`Sending AMI reload commands for tenant ${tenantId}`);
    this.ami.sendAction({ Action: 'Command', Command: 'module load res_http_websocket.so' });
    this.ami.sendAction({ Action: 'Command', Command: 'module load res_pjsip_transport_websocket.so' });
    this.ami.sendAction({ Action: 'Command', Command: 'http reload' });
    this.ami.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' });
    this.ami.sendAction({ Action: 'Command', Command: 'moh reload' });
    this.ami.sendAction({ Action: 'Command', Command: 'dialplan reload' });
    this.ami.sendAction({ Action: 'Command', Command: 'queue reload all' });
    this.logger.log(`Asterisk reload triggered for tenant ${tenantId}`);
  }

  async writeConfFiles(tenantId: string): Promise<boolean> {
    const confDir = this.config.get<string>('ASTERISK_CONF_DIR', '/etc/asterisk');
    const soundsDir = this.config.get<string>('ASTERISK_SOUNDS_DIR', '/var/lib/asterisk/sounds/custom');
    const internalSecret = this.config.get<string>('KASTER_INTERNAL_SECRET')?.trim() || null;
    const httpPort = Number(this.config.get<string>('PORT', '3000')) || 3000;

    if (!path.isAbsolute(confDir)) {
      throw new Error(`ASTERISK_CONF_DIR must be an absolute path, got: "${confDir}"`);
    }
    if (!path.isAbsolute(soundsDir)) {
      throw new Error(`ASTERISK_SOUNDS_DIR must be an absolute path, got: "${soundsDir}"`);
    }

    if (!fs.existsSync(confDir)) {
      this.logger.warn(
        `Asterisk conf directory "${confDir}" does not exist. Skipping config file generation for tenant ${tenantId}`,
      );
      return false;
    }

    const {
      trunks,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);

    const pjsipContent = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus, forwardingRules, blocklistEntries });
    const promptMohClasses = this.buildPromptMohClasses(dids, soundsDir);
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      trunks,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
        };
      }),
    });
    const queuesContent = renderQueuesConf(
      rawQueues.map((q) => ({
        queueName: q.queueName,
        strategy: q.strategy,
        ringTimeoutSeconds: q.ringTimeoutSeconds,
        retrySeconds: q.retrySeconds,
        wrapupSeconds: q.wrapupSeconds,
        maxWaitSeconds: q.maxWaitSeconds,
        autopause: q.autopause,
        members: q.members
          .filter((m) => {
            if (!m.agent.isActive) return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
            extension: m.agent.extension,
            agentName: m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );
    const musiconholdContent = renderMusiconholdConf(promptMohClasses.map((item) => ({
      className: item.className,
      directory: item.directory,
    })));

    this.syncPromptMohAssets(promptMohClasses, soundsDir);

    fs.writeFileSync(path.join(confDir, 'pjsip.conf'), pjsipContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_inbound.conf'), extensionsInbound, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_queue.conf'), extensionsQueue, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_agent.conf'), extensionsAgent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'queues.conf'), queuesContent, 'utf8');
    fs.writeFileSync(path.join(confDir, PROMPT_MOH_INCLUDE_FILENAME), musiconholdContent, 'utf8');
    this.ensurePromptMohInclude(confDir);
    this.writeOptOutHookScript(httpPort, internalSecret);
    return true;
  }

  async previewConfFiles(tenantId: string): Promise<{
    pjsip: string;
    extensionsInbound: string;
    extensionsQueue: string;
    extensionsAgent: string;
    queues: string;
  }> {
    const {
      trunks,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);

    const pjsip = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort });
    const { extensionsInbound, extensionsQueue } = renderDialplan({ dids, ivrMenus, forwardingRules, blocklistEntries });
    const promptMohClasses = this.buildPromptMohClasses(dids, this.config.get<string>('ASTERISK_SOUNDS_DIR', '/var/lib/asterisk/sounds/custom'));
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      trunks,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
        };
      }),
    });
    const queues = renderQueuesConf(
      rawQueues.map((q) => ({
        queueName: q.queueName,
        strategy: q.strategy,
        ringTimeoutSeconds: q.ringTimeoutSeconds,
        retrySeconds: q.retrySeconds,
        wrapupSeconds: q.wrapupSeconds,
        maxWaitSeconds: q.maxWaitSeconds,
        autopause: q.autopause,
        members: q.members
          .filter((m) => {
            if (!m.agent.isActive) return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
            extension: m.agent.extension,
            agentName: m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );
    const musiconhold = renderMusiconholdConf(promptMohClasses.map((item) => ({
      className: item.className,
      directory: item.directory,
    })));

    const maskedPjsip = pjsip.replace(/^(password=).+$/gm, '$1***');

    return { pjsip: maskedPjsip, extensionsInbound, extensionsQueue, extensionsAgent, queues: `${queues}\n\n${musiconhold}` };
  }

  private buildPromptMohClasses(
    dids: Array<{
      branchPromptKeys?: string[] | null;
      branchPromptWaitForCompletion?: boolean | null;
    }>,
    soundsDir: string,
  ) {
    const seen = new Set<string>();
    const baseDir = path.join(soundsDir, '__moh');
    const classes: Array<{ className: string; directory: string; promptBaseName: string }> = [];

    for (const did of dids) {
      if (did.branchPromptWaitForCompletion) {
        continue;
      }

      const promptKey = did.branchPromptKeys?.[0]?.trim();
      if (!promptKey?.startsWith('custom/')) {
        continue;
      }

      const promptBaseName = promptKey.slice('custom/'.length);
      const className = buildPromptMohClassName(promptKey);
      if (seen.has(className)) {
        continue;
      }

      seen.add(className);
      classes.push({
        className,
        directory: path.join(baseDir, className),
        promptBaseName,
      });
    }

    return classes;
  }

  private writeOptOutHookScript(httpPort: number, internalSecret: string | null) {
    fs.mkdirSync(path.dirname(OPT_OUT_HOOK_SCRIPT_PATH), { recursive: true });
    fs.writeFileSync(
      OPT_OUT_HOOK_SCRIPT_PATH,
      buildOptOutHookScript(httpPort, internalSecret),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.chmodSync(OPT_OUT_HOOK_SCRIPT_PATH, 0o755);
  }

  private syncPromptMohAssets(
    classes: Array<{ className: string; directory: string; promptBaseName: string }>,
    soundsDir: string,
  ) {
    const managedBaseDir = path.join(soundsDir, '__moh');
    fs.mkdirSync(managedBaseDir, { recursive: true });

    for (const item of classes) {
      fs.mkdirSync(item.directory, { recursive: true });

      for (const existing of fs.readdirSync(item.directory)) {
        fs.rmSync(path.join(item.directory, existing), { force: true });
      }

      const candidates = fs.readdirSync(soundsDir)
        .filter((fileName) => fileName.startsWith(`${item.promptBaseName}.`))
        .map((fileName) => path.join(soundsDir, fileName));

      for (const sourcePath of candidates) {
        fs.copyFileSync(sourcePath, path.join(item.directory, path.basename(sourcePath)));
      }

      // Add a short silence tail so prompt-loop MOH does not restart with no gap.
      fs.writeFileSync(path.join(item.directory, 'zz_gap.alaw'), Buffer.alloc(8000, 0xd5));
      fs.writeFileSync(path.join(item.directory, 'zz_gap.ulaw'), Buffer.alloc(8000, 0xff));
    }
  }

  private ensurePromptMohInclude(confDir: string) {
    const mainPath = path.join(confDir, 'musiconhold.conf');
    const includeLine = `#include ${PROMPT_MOH_INCLUDE_FILENAME}`;

    if (!fs.existsSync(mainPath)) {
      fs.writeFileSync(mainPath, buildDefaultMusiconholdBaseContent(includeLine), 'utf8');
      return;
    }

    const content = this.stripManagedPromptMohClasses(fs.readFileSync(mainPath, 'utf8'));
    const includePattern = new RegExp(`^#include\\s+${PROMPT_MOH_INCLUDE_FILENAME.replace('.', '\\.')}$`, 'm');
    if (includePattern.test(content)) {
      if (content !== fs.readFileSync(mainPath, 'utf8')) {
        fs.writeFileSync(mainPath, content, 'utf8');
      }
      return;
    }

    const suffix = content.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(mainPath, `${content}${suffix}\n${includeLine}\n`, 'utf8');
  }

  private stripManagedPromptMohClasses(content: string) {
    const lines = content.split(/\r?\n/);
    const cleaned: string[] = [];
    let skippingManagedSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (/^\[branch-prompt-[^\]]+\]$/i.test(trimmed)) {
        skippingManagedSection = true;
        continue;
      }

      if (skippingManagedSection) {
        if (/^\[.+\]$/.test(trimmed) || /^#include\s+/.test(trimmed)) {
          skippingManagedSection = false;
        } else {
          continue;
        }
      }

      if (trimmed === '; Auto-generated by KAster CTI - do not edit manually') {
        continue;
      }

      cleaned.push(line);
    }

    const normalized = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    return normalized.trim()
      ? `${normalized}\n`
      : buildDefaultMusiconholdBaseContent(`#include ${PROMPT_MOH_INCLUDE_FILENAME}`);
  }

  private async fetchTenantData(tenantId: string) {
    const [trunks, agents, didRows, ivrMenus, forwardingRules, blocklistEntries, prompts, queues, settings] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      this.prisma.agents.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskDid.findMany({
        where: { tenantId },
        include: {
          branchMappings: {
            orderBy: { createdAt: 'asc' },
            include: {
              branch: {
                select: {
                  isActive: true,
                  settingsProfile: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        include: { entries: true },
      }),
      this.prisma.asteriskForwardingRules.findMany({ where: { tenantId, enabled: true } }),
      this.prisma.asteriskBlocklistEntry.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.asteriskPrompt.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, promptKey: true },
      }),
      this.prisma.queues.findMany({
        where: { tenantId },
        select: { queueId: true, queueName: true },
      }),
      this.prisma.tenantSystemSettings.findUnique({
        where: { tenantId },
        select: {
          allowDirectSipDial: true,
          defaultSipPassword: true,
          allowedOutboundCallerIds: true,
          defaultOutboundCallerId: true,
          sipRegisterPort: true,
        },
      } as any),
    ]);
    const typedSettings = settings as
      | {
          allowDirectSipDial?: boolean | null;
          defaultSipPassword?: string | null;
          allowedOutboundCallerIds?: string | null;
          defaultOutboundCallerId?: string | null;
          sipRegisterPort?: number | null;
        }
      | null;
    const defaultSipPassword = settings?.defaultSipPassword ?? null;
    const promptKeyById = new Map(prompts.map((prompt) => [prompt.id, prompt.promptKey]));
    const queueNameById = new Map(queues.map((queue) => [queue.queueId, queue.queueName]));
    const dids = didRows.map(({ branchMappings, ...did }) => ({
      ...did,
      branchPromptKeys: resolveDidPromptKeys(branchMappings, promptKeyById),
      branchPromptQueueDelaySeconds: resolveDidPromptQueueDelaySeconds(branchMappings),
      branchPromptWaitForCompletion: resolveDidPromptWaitForCompletion(branchMappings),
      branchOptOut080: (() => {
        const optOut = resolveDidBranchOptOut(branchMappings, promptKeyById, queueNameById);
        return optOut ? { ...optOut, tenantId } : null;
      })(),
    }));

    return {
      trunks,
      sipRegisterPort: typedSettings?.sipRegisterPort ?? 36070,
      allowDirectSipDial: typedSettings?.allowDirectSipDial ?? false,
      allowedOutboundCallerIds: parseAllowedCallerIds(typedSettings?.allowedOutboundCallerIds),
      defaultOutboundCallerId: typedSettings?.defaultOutboundCallerId ?? null,
      agents,
      pjsipAgents: agents.map((agent) => ({
        extension: agent.extension,
        agentName: agent.agentName,
        sipPassword: agent.sipPassword || defaultSipPassword,
        context: `agent-phone-${agent.extension}`,
        callerIdPrivacy: (
          normalizeAgentRuntimeProfile(agent.settingsProfile).numberMasking === 'USE'
            ? 'prohib'
            : 'allowed_not_screened'
        ) as 'prohib' | 'allowed_not_screened',
        pickupGroup: buildPickupGroupName(agent.defaultQueueId),
        pickupType: normalizeAgentRuntimeProfile(agent.settingsProfile).pickupType,
      })),
      dids,
      ivrMenus,
      forwardingRules,
      blocklistEntries,
    };
  }

  private async fetchQueueData(tenantId: string) {
    return this.prisma.queues.findMany({
      where: { tenantId, isActive: true },
      include: {
        members: {
          where: { isActive: true },
          include: {
            agent: {
              select: { extension: true, agentName: true, isActive: true, settingsProfile: true },
            },
          },
        },
      },
      orderBy: { queueName: 'asc' },
    });
  }

  private async syncAllTenantsOnStartup(): Promise<void> {
    const tenantIds = await this.prisma.tenants.findMany({
      select: { tenantId: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const tenant of tenantIds) {
      this.logger.log(`Boot sync: scheduling Asterisk config refresh for tenant ${tenant.tenantId}`);
      this.scheduleReload(tenant.tenantId);
    }
  }
}
