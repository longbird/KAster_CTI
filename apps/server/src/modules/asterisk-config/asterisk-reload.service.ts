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
import { normalizeRecordingChannelMode } from './renderers/recording-mode';
import { renderQueuesConf } from './renderers/queues.renderer';
import { renderRtp } from './renderers/rtp.renderer';
import {
  diffRenderedConfFiles,
  RENDERED_CONF_FILE_NAMES,
  RenderedConfFiles,
  validateRenderedConfFiles,
} from './asterisk-config-validation';

const PROMPT_MOH_INCLUDE_FILENAME = 'musiconhold_kaster_prompts.conf';
const DEFAULT_MOH_DIR = '/var/lib/asterisk/moh';
const DEFAULT_MOH_FILE_NAME = 'kaster-default-hold.wav';
const OPT_OUT_HOOK_SCRIPT_PATH = '/var/lib/asterisk/sounds/custom/kaster-opt-out-hook.sh';
const OPT_OUT_GUARDED_DIGIT_AGI_PATH = '/var/lib/asterisk/sounds/custom/kaster-guarded-digit.agi';
const SMART_ARS_HOOK_SCRIPT_PATH = '/var/lib/asterisk/sounds/custom/kaster-smart-ars-hook.sh';
const RELOAD_COMMANDS = [
  'module load res_http_websocket.so',
  'module load res_pjsip_transport_websocket.so',
  'http reload',
  'module reload res_pjsip',
  'module reload res_rtp_asterisk.so',
  'moh reload',
  'dialplan reload',
  'queue reload all',
];

type Blocklist080Mode = 'IMMEDIATE_OPT_OUT' | 'DTMF_MENU' | 'SMART_OPT_OUT';
type Blocklist080DtmfActionType = 'QUEUE_ROUTE' | 'REGISTER_OPT_OUT' | 'UNREGISTER_OPT_OUT' | 'SEND_SMS';
type Blocklist080SmartActionType = 'REGISTER_OPT_OUT' | 'REENTER_NUMBER' | 'SEND_SMS' | 'HANGUP';
type SmartArsActionType = 'QUEUE_ROUTE' | 'TRANSFER' | 'SEND_SMS' | 'OPT_OUT' | 'PLAY_PROMPT';

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
  basePromptInputDelaySeconds?: number | null;
  completionPromptId?: string | null;
  smsTemplateId?: string | null;
  dtmfMenu?: Blocklist080DtmfMenu | null;
  smartFlow?: Blocklist080SmartFlow | null;
}

interface SmartArsActionProfile {
  digit?: string;
  actionType?: SmartArsActionType | string;
  queueId?: string | null;
  transferNumber?: string | null;
  smsTemplateId?: string | null;
  promptId?: string | null;
}

interface SmartArsProfile {
  enabled?: boolean;
  guidePromptId?: string | null;
  invalidPromptId?: string | null;
  failPromptId?: string | null;
  timeoutSeconds?: number;
  maxRetries?: number;
  actions?: SmartArsActionProfile[];
}

const BLOCKLIST080_MODES: Blocklist080Mode[] = ['IMMEDIATE_OPT_OUT', 'DTMF_MENU', 'SMART_OPT_OUT'];
const SMART_ARS_ACTION_TYPES: SmartArsActionType[] = ['QUEUE_ROUTE', 'TRANSFER', 'SEND_SMS', 'OPT_OUT', 'PLAY_PROMPT'];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function parseCommaSeparatedList(value?: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
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

function extractSmartArsProfile(settingsProfile: unknown): SmartArsProfile | null {
  if (!settingsProfile || typeof settingsProfile !== 'object' || Array.isArray(settingsProfile)) {
    return null;
  }

  const source = settingsProfile as Record<string, unknown>;
  const smartArs = source.smartArs && typeof source.smartArs === 'object' && !Array.isArray(source.smartArs)
    ? source.smartArs as SmartArsProfile
    : null;

  if (!smartArs?.enabled || !Array.isArray(smartArs.actions) || smartArs.actions.length === 0) {
    return null;
  }

  return smartArs;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
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
      basePromptInputDelaySeconds: normalizeNonNegativeInteger(profile.basePromptInputDelaySeconds, 0),
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

function resolveDidSmartArs(
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

    const profile = extractSmartArsProfile(mapping.branch.settingsProfile);
    if (!profile) {
      continue;
    }

    const actions = profile.actions
      ?.filter((action) => typeof action?.digit === 'string' && typeof action?.actionType === 'string')
      .map((action) => {
        const actionType = action.actionType?.trim() as SmartArsActionType;
        if (!SMART_ARS_ACTION_TYPES.includes(actionType)) {
          return null;
        }

        return {
          digit: action.digit!.trim(),
          actionType,
          queueName: action.queueId ? queueNameById.get(action.queueId) ?? null : null,
          transferNumber: action.transferNumber?.replace(/\D/g, '') || null,
          smsTemplateId: action.smsTemplateId?.trim() || null,
          promptKey: mapPromptKey(action.promptId, promptKeyById),
        };
      })
      .filter((action): action is {
        digit: string;
        actionType: SmartArsActionType;
        queueName: string | null;
        transferNumber: string | null;
        smsTemplateId: string | null;
        promptKey: string | null;
      } => action !== null)
      .filter((action) => {
        if (action.actionType === 'QUEUE_ROUTE') return Boolean(action.queueName);
        if (action.actionType === 'TRANSFER') return Boolean(action.transferNumber);
        if (action.actionType === 'SEND_SMS') return Boolean(action.smsTemplateId);
        if (action.actionType === 'PLAY_PROMPT') return Boolean(action.promptKey);
        return true;
      }) ?? [];

    if (actions.length === 0) {
      continue;
    }

    return {
      enabled: true,
      tenantId: '',
      branchId: mapping.branchId ?? null,
      guidePromptKey: mapPromptKey(profile.guidePromptId, promptKeyById),
      invalidPromptKey: mapPromptKey(profile.invalidPromptId, promptKeyById),
      failPromptKey: mapPromptKey(profile.failPromptId, promptKeyById),
      timeoutSeconds: normalizePositiveInteger(profile.timeoutSeconds, 5),
      maxRetries: normalizeNonNegativeInteger(profile.maxRetries, 2),
      actions,
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

function resolveDidPrimaryBranchId(
  branchMappings: Array<{
    branchId?: string;
    branch?: { isActive: boolean } | null;
  }>,
): string | null {
  return branchMappings.find((mapping) => mapping.branch?.isActive)?.branchId ?? null;
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
    `directory=${DEFAULT_MOH_DIR}`,
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

function buildSmartArsHookScript(port: number, configuredSecret: string | null): string {
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
    'SMS_TEMPLATE_ID="${6:-}"',
    'API_BASE_URL="${KASTER_SMART_ARS_API_BASE_URL:-http://127.0.0.1:' + port + '/api/v1/asterisk-config/internal/smart-ars}"',
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
    'SMS_TEMPLATE_ID="$(normalize_optional "$SMS_TEMPLATE_ID")"',
    '',
    'if [ -z "$ACTION" ] || [ -z "$TENANT_ID" ] || [ -z "$REQUESTER_PHONE" ]; then',
    "  echo 'missing required smart ARS hook arguments' >&2",
    '  exit 64',
    'fi',
    '',
    'if [ -z "$INTERNAL_SECRET" ]; then',
    "  echo 'KASTER_INTERNAL_SECRET is not configured for smart ARS hook' >&2",
    '  exit 65',
    'fi',
    '',
    'build_payload() {',
    '  printf \'{"tenantId":"%s","branchId":"%s","entryDid":"%s","requesterPhoneNumber":"%s","smsTemplateId":"%s"}\' "$TENANT_ID" "$BRANCH_ID" "$ENTRY_DID" "$REQUESTER_PHONE" "$SMS_TEMPLATE_ID"',
    '}',
    '',
    'post_payload() {',
    '  endpoint="$1"',
    '  curl -fsS --connect-timeout 3 --max-time 10 -X POST "$API_BASE_URL/$endpoint" \\',
    "    -H 'Content-Type: application/json' \\",
    '    -H "x-kaster-internal-secret: $INTERNAL_SECRET" \\',
    '    --data "$(build_payload)" >/dev/null',
    '}',
    '',
    'case "$ACTION" in',
    '  sms)',
    '    post_payload "sms"',
    '    ;;',
    '  opt-out)',
    '    post_payload "opt-out"',
    '    ;;',
    '  *)',
    "    echo 'unknown smart ARS hook action' >&2",
    '    exit 64',
    '    ;;',
    'esac',
    '',
  ].join('\n');
}

function buildDefaultMohWav(): Buffer {
  const sampleRate = 8000;
  const seconds = 4;
  const sampleCount = sampleRate * seconds;
  const pcm = Buffer.alloc(sampleCount * 2);
  const notes = [392, 494, 587, 494];

  for (let index = 0; index < sampleCount; index += 1) {
    const noteIndex = Math.floor(index / sampleRate) % notes.length;
    const frequency = notes[noteIndex];
    const time = index / sampleRate;
    const envelope = (index % sampleRate) < sampleRate * 0.65 ? 0.045 : 0;
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * time) * 32767 * envelope);
    pcm.writeInt16LE(sample, index * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function buildOptOutGuardedDigitAgiScript(): string {
  return [
    '#!/usr/bin/env python3',
    'import re',
    'import sys',
    '',
    'def read_env():',
    '    env = {}',
    '    for line in sys.stdin:',
    '        line = line.rstrip("\\n")',
    '        if line == "":',
    '            break',
    '        key, _, value = line.partition(":")',
    '        env[key.strip()] = value.strip()',
    '    return env',
    '',
    'def agi_escape(value):',
    '    return str(value).replace("\\\\", "\\\\\\\\").replace(\'"\', \'\\\\"\')',
    '',
    'def command(cmd):',
    '    sys.stdout.write(cmd + "\\n")',
    '    sys.stdout.flush()',
    '    return sys.stdin.readline().strip()',
    '',
    'def parse_result(line):',
    '    match = re.search(r"result=(-?\\d+)", line or "")',
    '    return int(match.group(1)) if match else 0',
    '',
    'def get_var(name):',
    '    line = command(f"GET VARIABLE {name}")',
    '    match = re.search(r"result=1 \\((.*)\\)", line or "")',
    '    return match.group(1) if match else ""',
    '',
    'def set_var(name, value):',
    '    command(f\'SET VARIABLE {name} "{agi_escape(value)}"\')',
    '',
    'env = read_env()',
    'prompt = env.get("agi_arg_1", "-") or "-"',
    'try:',
    '    guard_ms = max(0, int(float(env.get("agi_arg_2", "0") or "0") * 1000))',
    'except ValueError:',
    '    guard_ms = 0',
    'try:',
    '    timeout_ms = max(0, int(float(env.get("agi_arg_3", "0") or "0") * 1000))',
    'except ValueError:',
    '    timeout_ms = 0',
    'digits = env.get("agi_arg_4", "0123456789") or "0123456789"',
    '',
    'set_var("OPT_OUT_DTMF_SELECTION", "")',
    '',
    'offset = 0',
    'if prompt != "-" and prompt:',
    '    while True:',
    '        line = command(f\'CONTROL STREAM FILE "{agi_escape(prompt)}" "{agi_escape(digits)}" 3000 "" "" "" {offset}\')',
    '        result = parse_result(line)',
    '        c_offset_raw = get_var("CPLAYBACKOFFSET")',
    '        try:',
    '            c_offset = int(c_offset_raw)',
    '        except ValueError:',
    '            c_offset = -1',
    '',
    '        if result <= 0:',
    '            break',
    '',
    '        digit = chr(result)',
    '        if guard_ms == 0 or c_offset < 0 or c_offset >= guard_ms:',
    '            set_var("OPT_OUT_DTMF_SELECTION", digit)',
    '            sys.exit(0)',
    '',
    '        offset = max(c_offset, offset)',
    '',
    'if timeout_ms > 0:',
    '    result = parse_result(command(f"WAIT FOR DIGIT {timeout_ms}"))',
    '    if result > 0:',
    '        digit = chr(result)',
    '        if digit in digits:',
    '            set_var("OPT_OUT_DTMF_SELECTION", digit)',
    '',
    'sys.exit(0)',
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

  private getPjsipNatConfig() {
    const externalMediaAddress = this.config.get<string>('ASTERISK_EXTERNAL_MEDIA_ADDRESS')?.trim() || null;
    const externalSignalingAddress = this.config.get<string>('ASTERISK_EXTERNAL_SIGNALING_ADDRESS')?.trim()
      || externalMediaAddress;
    const localNets = parseCommaSeparatedList(this.config.get<string>('ASTERISK_LOCAL_NETS'));
    return { externalMediaAddress, externalSignalingAddress, localNets };
  }

  private renderRtpConf() {
    const rtpStart = Number(this.config.get<string>('ASTERISK_RTP_START', '10000')) || 10000;
    const rtpEnd = Number(this.config.get<string>('ASTERISK_RTP_END', '20000')) || 20000;
    const stunAddress = this.config.get<string>('ASTERISK_RTP_STUN_ADDRESS')?.trim() || null;
    return renderRtp({ rtpStart, rtpEnd, stunAddress });
  }

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
    for (const command of RELOAD_COMMANDS) {
      this.ami.sendAction({ Action: 'Command', Command: command });
    }
    this.logger.log(`Asterisk reload triggered for tenant ${tenantId}`);
  }

  async dryRunConfFiles(tenantId: string) {
    const preview = await this.previewConfFiles(tenantId);
    const rendered: RenderedConfFiles = {
      pjsip: preview.pjsip,
      rtp: preview.rtp,
      extensionsInbound: preview.extensionsInbound,
      extensionsQueue: preview.extensionsQueue,
      extensionsAgent: preview.extensionsAgent,
      queues: preview.queues,
    };
    const confDir = this.config.get<string>('ASTERISK_CONF_DIR', '/etc/asterisk');
    const currentFiles: Partial<Record<string, string>> = {};

    if (path.isAbsolute(confDir) && fs.existsSync(confDir)) {
      for (const item of RENDERED_CONF_FILE_NAMES) {
        const filePath = path.join(confDir, item.fileName);
        if (fs.existsSync(filePath)) {
          currentFiles[item.fileName] = fs.readFileSync(filePath, 'utf8');
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      files: preview,
      validation: validateRenderedConfFiles(rendered),
      diff: diffRenderedConfFiles(rendered, currentFiles),
      reloadCommands: [...RELOAD_COMMANDS],
    };
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
      trunkGroups,
      speedDials,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      queueOverflowRules,
      holidayRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      recordingChannelMode,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);
    const outboundCallerIdRules = await this.fetchOutboundCallerIdRules(tenantId);

    const pjsipContent = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort, ...this.getPjsipNatConfig() });
    const rtpContent = this.renderRtpConf();
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids,
      ivrMenus,
      forwardingRules,
      queueOverflowRules,
      holidayRules,
      blocklistEntries,
      recordingChannelMode,
    });
    const promptMohClasses = this.buildPromptMohClasses(dids, soundsDir);
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      recordingChannelMode,
      trunks,
      trunkGroups,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
          extensionLockMode: (agent as any).extensionLockMode ?? 'UNLOCKED',
          outboundDialPermissions: profile.outboundDialPermissions,
          branchIds: ((agent as any).branchMappings ?? []).map((mapping: { branchId: string }) => mapping.branchId),
        };
      }),
      outboundCallerIdRules,
      speedDials,
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
            if ((m.agent as any).extensionLockMode === 'FULL_LOCKED') return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
          extension: m.agent.extension,
            agentName: (m.agent as any).extensionDisplayName || m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );
    const musiconholdContent = renderMusiconholdConf(promptMohClasses.map((item) => ({
      className: item.className,
      directory: item.directory,
    })));

    this.ensureDefaultMohAsset();
    this.syncPromptMohAssets(promptMohClasses, soundsDir);

    fs.writeFileSync(path.join(confDir, 'pjsip.conf'), pjsipContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'rtp.conf'), rtpContent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_inbound.conf'), extensionsInbound, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_queue.conf'), extensionsQueue, 'utf8');
    fs.writeFileSync(path.join(confDir, 'extensions_agent.conf'), extensionsAgent, 'utf8');
    fs.writeFileSync(path.join(confDir, 'queues.conf'), queuesContent, 'utf8');
    fs.writeFileSync(path.join(confDir, PROMPT_MOH_INCLUDE_FILENAME), musiconholdContent, 'utf8');
    this.ensurePromptMohInclude(confDir);
    this.writeOptOutHookScript(httpPort, internalSecret);
    this.writeOptOutGuardedDigitAgiScript();
    this.writeSmartArsHookScript(httpPort, internalSecret);
    return true;
  }

  async previewConfFiles(tenantId: string): Promise<RenderedConfFiles> {
    const {
      trunks,
      trunkGroups,
      speedDials,
      agents,
      pjsipAgents,
      dids,
      ivrMenus,
      forwardingRules,
      queueOverflowRules,
      holidayRules,
      blocklistEntries,
      sipRegisterPort,
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      recordingChannelMode,
    } = await this.fetchTenantData(tenantId);
    const rawQueues = await this.fetchQueueData(tenantId);
    const outboundCallerIdRules = await this.fetchOutboundCallerIdRules(tenantId);

    const pjsip = renderPjsip({ trunks, agents: pjsipAgents, sipRegisterPort, ...this.getPjsipNatConfig() });
    const rtp = this.renderRtpConf();
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids,
      ivrMenus,
      forwardingRules,
      queueOverflowRules,
      holidayRules,
      blocklistEntries,
      recordingChannelMode,
    });
    const promptMohClasses = this.buildPromptMohClasses(dids, this.config.get<string>('ASTERISK_SOUNDS_DIR', '/var/lib/asterisk/sounds/custom'));
    const extensionsAgent = renderAgentDialplan({
      allowDirectSipDial,
      allowedOutboundCallerIds,
      defaultOutboundCallerId,
      recordingChannelMode,
      trunks,
      trunkGroups,
      agents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          outboundEnabled: profile.inoutType !== 'INBOUND_ONLY',
          callerIdPrivacy: profile.numberMasking === 'USE' ? 'prohib' : 'allowed_not_screened',
          liveRecordingEnabled: profile.liveRecording === 'USE',
          extensionLockMode: (agent as any).extensionLockMode ?? 'UNLOCKED',
          outboundDialPermissions: profile.outboundDialPermissions,
          branchIds: ((agent as any).branchMappings ?? []).map((mapping: { branchId: string }) => mapping.branchId),
        };
      }),
      outboundCallerIdRules,
      speedDials,
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
            if ((m.agent as any).extensionLockMode === 'FULL_LOCKED') return false;
            const profile = normalizeAgentRuntimeProfile(m.agent.settingsProfile);
            return profile.inoutType !== 'OUTBOUND_ONLY';
          })
          .map((m) => ({
            extension: m.agent.extension,
            agentName: (m.agent as any).extensionDisplayName || m.agent.agentName,
            penalty: m.penalty,
            memberOrder: m.memberOrder,
          })),
      })),
    );
    const musiconhold = renderMusiconholdConf(promptMohClasses.map((item) => ({
      className: item.className,
      directory: item.directory,
    })));

    const maskedPjsip = pjsip
      .replace(/^(password=).+$/gm, '$1***')
      .replace(/^(md5_cred=).+$/gm, '$1***');

    return { pjsip: maskedPjsip, rtp, extensionsInbound, extensionsQueue, extensionsAgent, queues: `${queues}\n\n${musiconhold}` };
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

  private writeOptOutGuardedDigitAgiScript() {
    fs.mkdirSync(path.dirname(OPT_OUT_GUARDED_DIGIT_AGI_PATH), { recursive: true });
    fs.writeFileSync(
      OPT_OUT_GUARDED_DIGIT_AGI_PATH,
      buildOptOutGuardedDigitAgiScript(),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.chmodSync(OPT_OUT_GUARDED_DIGIT_AGI_PATH, 0o755);
  }

  private writeSmartArsHookScript(httpPort: number, internalSecret: string | null) {
    fs.mkdirSync(path.dirname(SMART_ARS_HOOK_SCRIPT_PATH), { recursive: true });
    fs.writeFileSync(
      SMART_ARS_HOOK_SCRIPT_PATH,
      buildSmartArsHookScript(httpPort, internalSecret),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.chmodSync(SMART_ARS_HOOK_SCRIPT_PATH, 0o755);
  }

  private ensureDefaultMohAsset() {
    fs.mkdirSync(DEFAULT_MOH_DIR, { recursive: true });
    const targetPath = path.join(DEFAULT_MOH_DIR, DEFAULT_MOH_FILE_NAME);
    fs.writeFileSync(targetPath, buildDefaultMohWav());
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
    const [trunks, trunkGroups, speedDials, agents, didRows, ivrMenus, forwardingRules, queueOverflowRules, blocklistEntries, holidayRules, prompts, queues, settings] = await Promise.all([
      this.prisma.asteriskTrunk.findMany({ where: { tenantId } }),
      (this.prisma as any).asteriskTrunkGroup?.findMany
        ? (this.prisma as any).asteriskTrunkGroup.findMany({
          where: { tenantId, enabled: true },
          include: {
            members: {
              where: { enabled: true },
              include: { trunk: true },
              orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })
        : Promise.resolve([]),
      (this.prisma as any).asteriskSpeedDial?.findMany
        ? (this.prisma as any).asteriskSpeedDial.findMany({
          where: { tenantId, enabled: true },
          orderBy: [{ code: 'asc' }],
        })
        : Promise.resolve([]),
      this.prisma.agents.findMany({
        where: { tenantId, isActive: true },
        include: {
          branchMappings: {
            select: { branchId: true },
          },
        },
      }),
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
      (this.prisma as any).queueOverflowRules?.findMany
        ? (this.prisma as any).queueOverflowRules.findMany({
          where: { tenantId, enabled: true },
          include: {
            queue: {
              select: { queueName: true, isActive: true },
            },
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        })
        : Promise.resolve([]),
      this.prisma.asteriskBlocklistEntry.findMany({ where: { tenantId, isActive: true } }),
      (this.prisma as any).tenantHolidayRules?.findMany
        ? (this.prisma as any).tenantHolidayRules.findMany({ where: { tenantId, isActive: true } })
        : Promise.resolve([]),
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
          recordingChannelMode: true,
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
          recordingChannelMode?: string | null;
        }
      | null;
    const defaultSipPassword = settings?.defaultSipPassword ?? null;
    const promptKeyById = new Map(prompts.map((prompt) => [prompt.id, prompt.promptKey]));
    const queueNameById = new Map(queues.map((queue) => [queue.queueId, queue.queueName]));
    const dids = didRows.map(({ branchMappings, ...did }) => ({
      ...did,
      branchId: resolveDidPrimaryBranchId(branchMappings),
      branchPromptKeys: resolveDidPromptKeys(branchMappings, promptKeyById),
      branchPromptQueueDelaySeconds: resolveDidPromptQueueDelaySeconds(branchMappings),
      branchPromptWaitForCompletion: resolveDidPromptWaitForCompletion(branchMappings),
      branchOptOut080: (() => {
        const optOut = resolveDidBranchOptOut(branchMappings, promptKeyById, queueNameById);
        return optOut ? { ...optOut, tenantId } : null;
      })(),
      branchSmartArs: (() => {
        const smartArs = resolveDidSmartArs(branchMappings, promptKeyById, queueNameById);
        return smartArs ? { ...smartArs, tenantId } : null;
      })(),
    }));

    return {
      trunks,
      trunkGroups,
      speedDials,
      sipRegisterPort: typedSettings?.sipRegisterPort ?? 36070,
      recordingChannelMode: normalizeRecordingChannelMode(typedSettings?.recordingChannelMode),
      allowDirectSipDial: typedSettings?.allowDirectSipDial ?? false,
      allowedOutboundCallerIds: parseAllowedCallerIds(typedSettings?.allowedOutboundCallerIds),
      defaultOutboundCallerId: typedSettings?.defaultOutboundCallerId ?? null,
      agents,
      pjsipAgents: agents.map((agent) => {
        const profile = normalizeAgentRuntimeProfile(agent.settingsProfile);
        return {
          extension: agent.extension,
          agentName: agent.agentName,
          extensionDisplayName: (agent as any).extensionDisplayName ?? null,
          sipPassword: agent.sipPassword || defaultSipPassword,
          phoneDirectAllowedIps: profile.outboundDialPermissions.phoneDirectAllowedIps,
          context: `agent-phone-${agent.extension}`,
          callerIdPrivacy: (
            profile.numberMasking === 'USE'
              ? 'prohib'
              : 'allowed_not_screened'
          ) as 'prohib' | 'allowed_not_screened',
          pickupGroup: buildPickupGroupName(agent.defaultQueueId),
          pickupType: profile.pickupType,
        };
      }),
      dids,
      ivrMenus,
      forwardingRules,
      queueOverflowRules: (queueOverflowRules as Array<{
        queueOverflowRuleId: string;
        queue?: { queueName: string; isActive: boolean } | null;
        triggerMode: string;
        waitSeconds: number | null;
        targetType: string;
        targetValue: string;
        resultCode: string | null;
        enabled: boolean;
        priority: number | null;
      }>)
        .filter((rule) => rule.queue?.isActive)
        .map((rule) => ({
          id: rule.queueOverflowRuleId,
          queueName: rule.queue?.queueName ?? '',
          triggerMode: rule.triggerMode,
          waitSeconds: rule.waitSeconds,
          targetType: rule.targetType,
          targetValue: rule.targetValue,
          resultCode: rule.resultCode,
          enabled: rule.enabled,
          priority: rule.priority,
        })),
      holidayRules,
      blocklistEntries,
    };
  }

  /**
   * 아웃바운드 발신번호 룰 — PR1-3B 에서 dialplan 에 주입.
   * REGEX 룰은 dialplan 으로 옮길 수 없어 NoOp 로깅만 되며, 그 외 타입은
   * native exten 으로 [outbound-cid-rules] 컨텍스트에 등록된다.
   *
   * branchId 가 있는 룰은 해당 지사에 매핑된 상담원별 CID sub-context 에만
   * 반영한다. 전역 룰은 모든 상담원 context 에 포함된다.
   */
  private async fetchOutboundCallerIdRules(tenantId: string) {
    const rows = await (this.prisma as any).outboundCallerIdRules.findMany({
      where: { tenantId, enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: {
        branchId: true,
        matchType: true,
        sourceNumberPattern: true,
        callerIdNumber: true,
        displayName: true,
        priority: true,
        enabled: true,
      },
    });
    return rows as Array<{
      matchType: 'EXACT' | 'PREFIX' | 'REGEX' | 'DIALPLAN_PATTERN';
      branchId: string | null;
      sourceNumberPattern: string;
      callerIdNumber: string;
      displayName: string | null;
      priority: number;
      enabled: boolean;
    }>;
  }

  private async fetchQueueData(tenantId: string) {
    return this.prisma.queues.findMany({
      where: { tenantId, isActive: true },
      include: {
        members: {
          where: { isActive: true },
          include: {
            agent: {
              select: {
                extension: true,
                agentName: true,
                extensionDisplayName: true,
                extensionLockMode: true,
                isActive: true,
                settingsProfile: true,
              },
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
