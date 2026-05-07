import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MENU_KEYS,
  ROLE_CODES,
  defaultPermissionFlags,
  mergePermissionFlags,
  PermissionFlags,
} from '../../common/menu-permission.service';
import { parseAllowedCallerIds, serializeAllowedCallerIds } from '../../common/outbound-caller-id.util';
import { PrismaService } from '../../common/prisma.service';
import { AsteriskReloadService } from '../asterisk-config/asterisk-reload.service';
import { HealthSummaryService } from '../health/health-summary.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { QueuesService } from '../queues/queues.service';
import { CreateAgentGroupDto } from './dto/create-agent-group.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAgentBranchCallerIdsDto } from './dto/update-agent-branch-caller-ids.dto';
import { UpdateAgentGroupDto } from './dto/update-agent-group.dto';
import { ListAmiLogsQueryDto } from './dto/list-ami-logs-query.dto';
import { ListIvrFailuresQueryDto } from './dto/list-ivr-failures-query.dto';
import { ListRecordingDownloadAuditsQueryDto } from './dto/list-recording-download-audits-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateAgentPermissionsDto } from './dto/update-agent-permissions.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchMappingsDto } from './dto/update-branch-mappings.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

interface PersistedPermissionRow {
  menuKey: string;
  canAccess?: boolean | null;
  canView?: boolean | null;
  canCreate?: boolean | null;
  canUpdate?: boolean | null;
  canDelete?: boolean | null;
  canOperate?: boolean | null;
  canExport?: boolean | null;
}

interface BranchSettingsSectionSelection {
  enabled: boolean;
  ids?: string[];
  queueJoinDelaySeconds?: number;
  waitForPlaybackCompletionBeforeQueue?: boolean;
}

interface BranchRoutingRule {
  queueId: string;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  timeStart: string | null;
  timeEnd: string | null;
  daysOfWeek: string[];
}

type Blocklist080Mode = 'IMMEDIATE_OPT_OUT' | 'DTMF_MENU' | 'SMART_OPT_OUT';
type Blocklist080DtmfActionType = 'QUEUE_ROUTE' | 'REGISTER_OPT_OUT' | 'UNREGISTER_OPT_OUT' | 'SEND_SMS';
type Blocklist080SmartActionType = 'REGISTER_OPT_OUT' | 'REENTER_NUMBER' | 'SEND_SMS' | 'HANGUP';
type SmartArsActionType = 'QUEUE_ROUTE' | 'TRANSFER' | 'SEND_SMS' | 'OPT_OUT' | 'PLAY_PROMPT';

interface BranchBlocklist080Mapping {
  digit: string;
  actionType: Blocklist080DtmfActionType | Blocklist080SmartActionType | string;
  queueId: string | null;
  smsTemplateId: string | null;
}

interface BranchBlocklist080DtmfMenu {
  timeoutSeconds: number;
  maxRetries: number;
  invalidPromptId: string | null;
  timeoutPromptId: string | null;
  mappings: BranchBlocklist080Mapping[];
}

interface BranchBlocklist080SmartFlow {
  inputPromptId: string | null;
  reentryPromptId: string | null;
  sameNumberPromptId: string | null;
  confirmPrefixPromptId: string | null;
  confirmSuffixPromptId: string | null;
  confirmMenuPromptId: string | null;
  failurePromptId: string | null;
  finalPromptId: string | null;
  inputTimeoutSeconds: number;
  maxRetries: number;
  confirmationMappings: BranchBlocklist080Mapping[];
}

interface BranchBlocklist080Profile {
  enabled: boolean;
  mode: Blocklist080Mode;
  basePromptId: string | null;
  basePromptInputDelaySeconds: number;
  completionPromptId: string | null;
  dtmfMenu?: BranchBlocklist080DtmfMenu;
  smartFlow?: BranchBlocklist080SmartFlow;
  smsTemplateId: string | null;
}

interface BranchSmartArsAction {
  digit: string;
  actionType: SmartArsActionType | string;
  queueId: string | null;
  transferNumber: string | null;
  smsTemplateId: string | null;
  promptId: string | null;
}

interface BranchSmartArsProfile {
  enabled: boolean;
  guidePromptId: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  failPromptId: string | null;
  invalidPromptId: string | null;
  actions: BranchSmartArsAction[];
}

interface BranchSettingsProfile {
  routing: {
    enabled: boolean;
    representativeDidId: string | null;
    rules: BranchRoutingRule[];
  };
  forwarding: BranchSettingsSectionSelection;
  prompts: BranchSettingsSectionSelection;
  ars: BranchSettingsSectionSelection;
  smartArs: BranchSmartArsProfile;
  recording: {
    enabled: boolean;
  };
  blocklist080: BranchBlocklist080Profile;
  cid: {
    enabled: boolean;
    defaultOutboundCallerId: string | null;
  };
  smdr: {
    enabled: boolean;
  };
}

const DEFAULT_BRANCH_SETTINGS_PROFILE: BranchSettingsProfile = {
  routing: {
    enabled: true,
    representativeDidId: null,
    rules: [],
  },
  forwarding: {
    enabled: false,
    ids: [],
  },
  prompts: {
    enabled: false,
    ids: [],
    queueJoinDelaySeconds: 0,
    waitForPlaybackCompletionBeforeQueue: false,
  },
  ars: {
    enabled: false,
    ids: [],
  },
  smartArs: {
    enabled: false,
    guidePromptId: null,
    timeoutSeconds: 5,
    maxRetries: 2,
    failPromptId: null,
    invalidPromptId: null,
    actions: [],
  },
  recording: {
    enabled: true,
  },
  blocklist080: {
    enabled: false,
    mode: 'IMMEDIATE_OPT_OUT',
    basePromptId: null,
    basePromptInputDelaySeconds: 0,
    completionPromptId: null,
    smsTemplateId: null,
  },
  cid: {
    enabled: false,
    defaultOutboundCallerId: null,
  },
  smdr: {
    enabled: false,
  },
};

const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const TIME_TEXT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const BLOCKLIST080_MODES: Blocklist080Mode[] = ['IMMEDIATE_OPT_OUT', 'DTMF_MENU', 'SMART_OPT_OUT'];
const BLOCKLIST080_DTMF_ACTION_TYPES: Blocklist080DtmfActionType[] = [
  'QUEUE_ROUTE',
  'REGISTER_OPT_OUT',
  'UNREGISTER_OPT_OUT',
  'SEND_SMS',
];
const BLOCKLIST080_SMART_ACTION_TYPES: Blocklist080SmartActionType[] = [
  'REGISTER_OPT_OUT',
  'REENTER_NUMBER',
  'SEND_SMS',
  'HANGUP',
];
const BLOCKLIST080_DIGIT_PATTERN = /^[0-9]$/;
const SMART_ARS_ACTION_TYPES: SmartArsActionType[] = ['QUEUE_ROUTE', 'TRANSFER', 'SEND_SMS', 'OPT_OUT', 'PLAY_PROMPT'];
const SMS_DEFERRED_MESSAGE = 'SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.';
const SMART_ARS_DIGIT_PATTERN = /^[0-9*#]$/;
const BLOCKLIST080_SMART_FLOW_END_DIGIT_OVERRIDE_PATTERNS = [
  'enddigit',
  'inputenddigit',
  'terminationdigit',
  'terminatordigit',
  'finaldigit',
];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizePhoneDigits(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  return digits || null;
}

function isBlocklist080SmartFlowEndDigitOverrideKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return BLOCKLIST080_SMART_FLOW_END_DIGIT_OVERRIDE_PATTERNS.some((pattern) => normalizedKey.includes(pattern));
}

function normalizeBlocklist080Mode(value: unknown): Blocklist080Mode {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_BRANCH_SETTINGS_PROFILE.blocklist080.mode;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('080 수신거부 모드가 올바르지 않습니다.');
  }

  const normalized = value.trim();
  if (BLOCKLIST080_MODES.includes(normalized as Blocklist080Mode)) {
    return normalized as Blocklist080Mode;
  }

  throw new BadRequestException('080 수신거부 모드가 올바르지 않습니다.');
}

function normalizeBlocklist080Mappings(value: unknown): BranchBlocklist080Mapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      digit: typeof item.digit === 'string' ? item.digit.trim() : '',
      actionType: typeof item.actionType === 'string' ? item.actionType.trim() : '',
      queueId: normalizeOptionalString(item.queueId),
      smsTemplateId: normalizeOptionalString(item.smsTemplateId),
    }));
}

function normalizeBlocklist080DtmfMenu(value: unknown): BranchBlocklist080DtmfMenu | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  return {
    timeoutSeconds:
      typeof source.timeoutSeconds === 'number' && Number.isFinite(source.timeoutSeconds)
        ? Math.max(0, Math.trunc(source.timeoutSeconds))
        : 0,
    maxRetries:
      typeof source.maxRetries === 'number' && Number.isFinite(source.maxRetries)
        ? Math.max(0, Math.trunc(source.maxRetries))
        : 0,
    invalidPromptId: normalizeOptionalString(source.invalidPromptId),
    timeoutPromptId: normalizeOptionalString(source.timeoutPromptId),
    mappings: normalizeBlocklist080Mappings(source.mappings),
  };
}

function normalizeBlocklist080SmartFlow(value: unknown): BranchBlocklist080SmartFlow | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const overrideKey = Object.keys(source).find((key) => isBlocklist080SmartFlowEndDigitOverrideKey(key));

  if (overrideKey) {
    throw new BadRequestException('스마트 수신거부의 종료 숫자는 #로 고정되어 있습니다.');
  }

  return {
    inputPromptId: normalizeOptionalString(source.inputPromptId),
    reentryPromptId: normalizeOptionalString(source.reentryPromptId),
    sameNumberPromptId: normalizeOptionalString(source.sameNumberPromptId),
    confirmPrefixPromptId: normalizeOptionalString(source.confirmPrefixPromptId),
    confirmSuffixPromptId: normalizeOptionalString(source.confirmSuffixPromptId),
    confirmMenuPromptId: normalizeOptionalString(source.confirmMenuPromptId),
    failurePromptId: normalizeOptionalString(source.failurePromptId),
    finalPromptId: normalizeOptionalString(source.finalPromptId),
    inputTimeoutSeconds:
      typeof source.inputTimeoutSeconds === 'number' && Number.isFinite(source.inputTimeoutSeconds)
        ? Math.max(0, Math.trunc(source.inputTimeoutSeconds))
        : 0,
    maxRetries:
      typeof source.maxRetries === 'number' && Number.isFinite(source.maxRetries)
        ? Math.max(0, Math.trunc(source.maxRetries))
        : 0,
    confirmationMappings: normalizeBlocklist080Mappings(source.confirmationMappings),
  };
}

function normalizeBlocklist080Profile(value: unknown): BranchBlocklist080Profile {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.blocklist080.enabled,
    mode: normalizeBlocklist080Mode(source.mode),
    basePromptId: normalizeOptionalString(source.basePromptId),
    basePromptInputDelaySeconds: clampInteger(
      source.basePromptInputDelaySeconds,
      DEFAULT_BRANCH_SETTINGS_PROFILE.blocklist080.basePromptInputDelaySeconds,
      0,
      60,
    ),
    completionPromptId: normalizeOptionalString(source.completionPromptId),
    dtmfMenu: normalizeBlocklist080DtmfMenu(source.dtmfMenu),
    smartFlow: normalizeBlocklist080SmartFlow(source.smartFlow),
    smsTemplateId: normalizeOptionalString(source.smsTemplateId),
  };
}

function normalizeSmartArsActions(value: unknown): BranchSmartArsAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const actionType = typeof item.actionType === 'string' ? item.actionType.trim() : '';

      return {
        digit: typeof item.digit === 'string' ? item.digit.trim() : '',
        actionType,
        queueId: actionType === 'QUEUE_ROUTE' ? normalizeOptionalString(item.queueId) : null,
        transferNumber: actionType === 'TRANSFER' ? normalizePhoneDigits(item.transferNumber) : null,
        smsTemplateId: actionType === 'SEND_SMS' ? normalizeOptionalString(item.smsTemplateId) : null,
        promptId: actionType === 'PLAY_PROMPT' ? normalizeOptionalString(item.promptId) : null,
      };
    });
}

function normalizeSmartArsProfile(value: unknown): BranchSmartArsProfile {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.smartArs.enabled,
    guidePromptId: normalizeOptionalString(source.guidePromptId),
    timeoutSeconds: clampInteger(source.timeoutSeconds, DEFAULT_BRANCH_SETTINGS_PROFILE.smartArs.timeoutSeconds, 1, 15),
    maxRetries: clampInteger(source.maxRetries, DEFAULT_BRANCH_SETTINGS_PROFILE.smartArs.maxRetries, 0, 10),
    failPromptId: normalizeOptionalString(source.failPromptId),
    invalidPromptId: normalizeOptionalString(source.invalidPromptId),
    actions: normalizeSmartArsActions(source.actions),
  };
}

function normalizeWeekdays(value: unknown): string[] {
  const normalized = normalizeStringArray(value).map((item) => item.toLowerCase());
  return WEEKDAY_ORDER.filter((day) => normalized.includes(day));
}

function normalizeRoutingRules(
  value: unknown,
  queueIds: string[],
): BranchRoutingRule[] {
  if (!Array.isArray(value)) {
    if (queueIds.length === 1) {
      return [
        {
          queueId: queueIds[0],
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: [],
        },
      ];
    }
    return [];
  }

  const allowedQueueIds = new Set(queueIds);
  const deduped = new Map<string, BranchRoutingRule>();

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const source = item as Record<string, unknown>;
    const queueId = typeof source.queueId === 'string' ? source.queueId.trim() : '';
    if (!queueId || !allowedQueueIds.has(queueId)) continue;

    const conditionType = source.conditionType === 'TIME_RANGE' ? 'TIME_RANGE' : 'ALWAYS';
    const timeStart =
      conditionType === 'TIME_RANGE' && typeof source.timeStart === 'string' && TIME_TEXT_PATTERN.test(source.timeStart.trim())
        ? source.timeStart.trim()
        : null;
    const timeEnd =
      conditionType === 'TIME_RANGE' && typeof source.timeEnd === 'string' && TIME_TEXT_PATTERN.test(source.timeEnd.trim())
        ? source.timeEnd.trim()
        : null;
    const daysOfWeek = conditionType === 'TIME_RANGE' ? normalizeWeekdays(source.daysOfWeek) : [];

    deduped.set(queueId, {
      queueId,
      conditionType,
      timeStart,
      timeEnd,
      daysOfWeek,
    });
  }

  const normalized = queueIds
    .map((queueId) => deduped.get(queueId))
    .filter((item): item is BranchRoutingRule => item !== undefined);

  if (normalized.length === 0 && queueIds.length === 1) {
    return [
      {
        queueId: queueIds[0],
        conditionType: 'ALWAYS',
        timeStart: null,
        timeEnd: null,
        daysOfWeek: [],
      },
    ];
  }

  return normalized;
}

function normalizeBranchSettingsProfile(
  value: unknown,
  options?: { queueIds?: string[]; didIds?: string[] },
): BranchSettingsProfile {
  const queueIds = options?.queueIds ?? [];
  const didIds = options?.didIds ?? [];
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const routing = source.routing && typeof source.routing === 'object' ? source.routing as Record<string, unknown> : {};
  const forwarding = source.forwarding && typeof source.forwarding === 'object' ? source.forwarding as Record<string, unknown> : {};
  const prompts = source.prompts && typeof source.prompts === 'object' ? source.prompts as Record<string, unknown> : {};
  const recording = source.recording && typeof source.recording === 'object' ? source.recording as Record<string, unknown> : {};
  const cid = source.cid && typeof source.cid === 'object' ? source.cid as Record<string, unknown> : {};
  const smdr = source.smdr && typeof source.smdr === 'object' ? source.smdr as Record<string, unknown> : {};

  return {
    routing: {
      enabled: typeof routing.enabled === 'boolean' ? routing.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.routing.enabled,
      representativeDidId:
        typeof routing.representativeDidId === 'string' && didIds.includes(routing.representativeDidId)
          ? routing.representativeDidId
          : (didIds.length === 1 ? didIds[0] : null),
      rules: normalizeRoutingRules(routing.rules, queueIds),
    },
    forwarding: {
      enabled:
        typeof forwarding.enabled === 'boolean' ? forwarding.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.forwarding.enabled,
      ids: normalizeStringArray(forwarding.ids),
    },
    prompts: {
      enabled: typeof prompts.enabled === 'boolean' ? prompts.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.prompts.enabled,
      ids: normalizeStringArray(prompts.ids),
      queueJoinDelaySeconds:
        typeof prompts.queueJoinDelaySeconds === 'number' && Number.isFinite(prompts.queueJoinDelaySeconds)
          ? Math.max(0, Math.min(300, Math.trunc(prompts.queueJoinDelaySeconds)))
          : (DEFAULT_BRANCH_SETTINGS_PROFILE.prompts.queueJoinDelaySeconds ?? 0),
      waitForPlaybackCompletionBeforeQueue:
        typeof prompts.waitForPlaybackCompletionBeforeQueue === 'boolean'
          ? prompts.waitForPlaybackCompletionBeforeQueue
          : (DEFAULT_BRANCH_SETTINGS_PROFILE.prompts.waitForPlaybackCompletionBeforeQueue ?? false),
    },
    ars: {
      enabled: false,
      ids: [],
    },
    smartArs: normalizeSmartArsProfile(source.smartArs),
    recording: {
      enabled:
        typeof recording.enabled === 'boolean' ? recording.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.recording.enabled,
    },
    blocklist080: normalizeBlocklist080Profile(source.blocklist080),
    cid: {
      enabled: typeof cid.enabled === 'boolean' ? cid.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.cid.enabled,
      defaultOutboundCallerId:
        typeof cid.defaultOutboundCallerId === 'string' && cid.defaultOutboundCallerId.trim()
          ? parseAllowedCallerIds(cid.defaultOutboundCallerId)[0] ?? null
          : null,
    },
    smdr: {
      enabled: typeof smdr.enabled === 'boolean' ? smdr.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.smdr.enabled,
    },
  };
}

function validateBranchSettingsProfile(
  profile: BranchSettingsProfile,
  options: { queueIds: string[]; didIds: string[] },
) {
  const { queueIds, didIds } = options;
  const representativeDidId = profile.routing.representativeDidId;

  if (didIds.length > 0 && !representativeDidId) {
    throw new BadRequestException('지사 대표번호는 반드시 1개 선택해야 합니다.');
  }

  if (representativeDidId && !didIds.includes(representativeDidId)) {
    throw new BadRequestException('대표번호는 지사에 연결된 DID 중에서 선택해야 합니다.');
  }

  const ruleQueueIds = profile.routing.rules.map((rule) => rule.queueId);
  const unknownQueueId = ruleQueueIds.find((queueId) => !queueIds.includes(queueId));
  if (unknownQueueId) {
    throw new BadRequestException('지사 호 분배룰 조건에 선택되지 않은 큐가 포함되어 있습니다.');
  }

  const alwaysCount = profile.routing.rules.filter((rule) => rule.conditionType === 'ALWAYS').length;
  if (alwaysCount > 1) {
    throw new BadRequestException('상시 적용 호 분배룰은 1개만 설정할 수 있습니다.');
  }

  if (queueIds.length > 1 && profile.routing.rules.length !== queueIds.length) {
    throw new BadRequestException('호 분배룰을 여러 개 선택한 경우 각 룰의 작동 조건을 모두 설정해야 합니다.');
  }

  for (const rule of profile.routing.rules) {
    if (rule.conditionType === 'ALWAYS') continue;

    if (!rule.timeStart || !rule.timeEnd || rule.daysOfWeek.length === 0) {
      throw new BadRequestException('조건형 호 분배룰에는 요일과 시작/종료 시간을 모두 설정해야 합니다.');
    }

    if (!TIME_TEXT_PATTERN.test(rule.timeStart) || !TIME_TEXT_PATTERN.test(rule.timeEnd)) {
      throw new BadRequestException('호 분배룰 시간은 HH:mm 형식이어야 합니다.');
    }

    if (rule.timeStart >= rule.timeEnd) {
      throw new BadRequestException('호 분배룰 종료 시간은 시작 시간보다 늦어야 합니다.');
    }
  }

  const queueJoinDelaySeconds = profile.prompts.queueJoinDelaySeconds ?? 0;
  if (!Number.isInteger(queueJoinDelaySeconds) || queueJoinDelaySeconds < 0 || queueJoinDelaySeconds > 300) {
    throw new BadRequestException('큐 인입 지연 시간은 0초 이상 300초 이하 정수여야 합니다.');
  }

  const smartArs = profile.smartArs;
  if (smartArs.enabled && profile.blocklist080.enabled) {
    throw new BadRequestException('스마트 ARS와 080 수신거부는 같은 지사에서 동시에 사용할 수 없습니다.');
  }

  if (smartArs.enabled) {
    if (!smartArs.guidePromptId) {
      throw new BadRequestException('스마트 ARS 안내 멘트를 선택해야 합니다.');
    }

    if (smartArs.actions.length === 0) {
      throw new BadRequestException('스마트 ARS 동작은 최소 1개 이상 설정해야 합니다.');
    }

    const digits = new Set<string>();
    for (const action of smartArs.actions) {
      if (!SMART_ARS_DIGIT_PATTERN.test(action.digit)) {
        throw new BadRequestException('스마트 ARS DTMF 키는 0-9, *, #만 사용할 수 있습니다.');
      }

      if (digits.has(action.digit)) {
        throw new BadRequestException('스마트 ARS DTMF 키는 중복될 수 없습니다.');
      }
      digits.add(action.digit);

      if (!SMART_ARS_ACTION_TYPES.includes(action.actionType as SmartArsActionType)) {
        throw new BadRequestException('스마트 ARS 동작은 허용된 값만 사용할 수 있습니다.');
      }

      if (action.actionType === 'QUEUE_ROUTE') {
        if (!action.queueId) {
          throw new BadRequestException('스마트 ARS 상담원 연결에는 호 분배룰이 필요합니다.');
        }

        if (!queueIds.includes(action.queueId)) {
          throw new BadRequestException('스마트 ARS 상담원 연결은 지사에 연결된 호 분배룰만 사용할 수 있습니다.');
        }
      }

      if (action.actionType === 'TRANSFER' && !action.transferNumber) {
        throw new BadRequestException('스마트 ARS 착신전환에는 전화번호가 필요합니다.');
      }

      if (action.actionType === 'SEND_SMS' && !action.smsTemplateId) {
        throw new BadRequestException('스마트 ARS SMS 발송에는 문자 템플릿이 필요합니다.');
      }

      if (action.actionType === 'SEND_SMS') {
        throw new BadRequestException(SMS_DEFERRED_MESSAGE);
      }

      if (action.actionType === 'PLAY_PROMPT' && !action.promptId) {
        throw new BadRequestException('스마트 ARS 멘트 재생에는 재생할 멘트가 필요합니다.');
      }
    }
  }

  const blocklist080 = profile.blocklist080;
  if (!Number.isInteger(blocklist080.basePromptInputDelaySeconds) || blocklist080.basePromptInputDelaySeconds < 0 || blocklist080.basePromptInputDelaySeconds > 60) {
    throw new BadRequestException('080 수신거부 시작 멘트 입력 지연 시간은 0초 이상 60초 이하 정수여야 합니다.');
  }

  if (blocklist080.mode === 'DTMF_MENU') {
    if (!blocklist080.dtmfMenu) {
      throw new BadRequestException('080 수신거부 DTMF 메뉴 설정이 필요합니다.');
    }

    for (const mapping of blocklist080.dtmfMenu.mappings) {
      if (!BLOCKLIST080_DIGIT_PATTERN.test(mapping.digit)) {
        throw new BadRequestException('DTMF 메뉴 매핑의 숫자는 0-9만 사용할 수 있습니다.');
      }

      if (!BLOCKLIST080_DTMF_ACTION_TYPES.includes(mapping.actionType as Blocklist080DtmfActionType)) {
        throw new BadRequestException('DTMF 메뉴 매핑의 동작은 허용된 값만 사용할 수 있습니다.');
      }

      if (mapping.actionType === 'SEND_SMS') {
        throw new BadRequestException(SMS_DEFERRED_MESSAGE);
      }

      if (mapping.actionType === 'QUEUE_ROUTE') {
        if (!mapping.queueId) {
          throw new BadRequestException('큐 분기 동작에는 queueId가 필요합니다.');
        }

        if (!queueIds.includes(mapping.queueId)) {
          throw new BadRequestException('큐 분기 동작의 queueId는 지사에 연결된 큐여야 합니다.');
        }
      }
    }
  }

  if (blocklist080.mode === 'SMART_OPT_OUT') {
    if (!blocklist080.smartFlow) {
      throw new BadRequestException('080 수신거부 스마트 플로우 설정이 필요합니다.');
    }

    for (const mapping of blocklist080.smartFlow.confirmationMappings) {
      if (!BLOCKLIST080_DIGIT_PATTERN.test(mapping.digit)) {
        throw new BadRequestException('스마트 수신거부 확인 매핑의 숫자는 0-9만 사용할 수 있습니다.');
      }

      if (!BLOCKLIST080_SMART_ACTION_TYPES.includes(mapping.actionType as Blocklist080SmartActionType)) {
        throw new BadRequestException('스마트 수신거부 확인 매핑의 동작은 허용된 값만 사용할 수 있습니다.');
      }

      if (mapping.actionType === 'SEND_SMS') {
        throw new BadRequestException(SMS_DEFERRED_MESSAGE);
      }
    }
  }
}

function collectReferencedOptOutSmsTemplateIds(profile: BranchSettingsProfile): string[] {
  const ids = new Set<string>();
  const addId = (value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim()) {
      ids.add(value.trim());
    }
  };

  addId(profile.blocklist080.smsTemplateId);

  for (const mapping of profile.blocklist080.dtmfMenu?.mappings ?? []) {
    addId(mapping.smsTemplateId);
  }

  for (const mapping of profile.blocklist080.smartFlow?.confirmationMappings ?? []) {
    addId(mapping.smsTemplateId);
  }

  for (const action of profile.smartArs.actions) {
    if (action.actionType === 'SEND_SMS') {
      addId(action.smsTemplateId);
    }
  }

  return [...ids];
}

function buildBranchSettingsSummary(profile: BranchSettingsProfile, counts: { queueCount: number; didCount: number }) {
  return [
    { key: 'routing', enabled: profile.routing.enabled && counts.queueCount > 0, label: '호 분배룰' },
    { key: 'forwarding', enabled: profile.forwarding.enabled && profile.forwarding.ids.length > 0, label: '착신전환' },
    { key: 'prompts', enabled: profile.prompts.enabled && profile.prompts.ids.length > 0, label: '멘트' },
    { key: 'smartArs', enabled: profile.smartArs.enabled && profile.smartArs.actions.length > 0, label: '스마트 ARS' },
    { key: 'recording', enabled: profile.recording.enabled, label: '녹취' },
    { key: 'blocklist080', enabled: profile.blocklist080.enabled, label: '080 수신거부' },
    { key: 'cid', enabled: profile.cid.enabled && !!profile.cid.defaultOutboundCallerId, label: 'CID' },
    { key: 'smdr', enabled: profile.smdr.enabled, label: 'SMDR' },
  ];
}

// 슈퍼바이저/admin 전용 실시간 대시보드.
// 큐 요약 + 활성 콜 수 + 오늘 집계 + 에이전트 상태 분포 + 시간대별 트래픽 + 팀 현황 + 알람
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queuesService: QueuesService,
    private readonly asteriskReloadService: AsteriskReloadService,
    private readonly healthSummary: HealthSummaryService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private buildPermissionMatrix(
    roleRows: PersistedPermissionRow[],
    agentRowsByAgentId?: Map<string, PersistedPermissionRow[]>,
    roleOverride?: string,
  ) {
    const roleMap = new Map(
      roleRows.map((row) => [`${row.menuKey}`, row]),
    );

    const buildForRole = (roleCode: string, agentId?: string) => {
      const agentOverrides = agentId ? agentRowsByAgentId?.get(agentId) ?? [] : [];
      const agentMap = new Map(agentOverrides.map((row) => [row.menuKey, row]));

      return MENU_KEYS.map((menuKey) => {
        const defaults = defaultPermissionFlags(roleCode, menuKey);
        const rolePermission = mergePermissionFlags(defaults, roleMap.get(menuKey));

        return {
          menuKey,
          ...mergePermissionFlags(rolePermission, agentMap.get(menuKey)),
        };
      });
    };

    if (roleOverride) {
      return buildForRole(roleOverride);
    }

    return ROLE_CODES.map((roleCode) => ({
      roleCode,
      permissions: buildForRole(roleCode),
    }));
  }

  private async listPermissionAgents(tenantId: string) {
    const rows = await this.prisma.agents.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { agentName: 'asc' }],
      select: {
        agentId: true,
        agentName: true,
        loginId: true,
        extension: true,
        role: true,
        isActive: true,
      },
    });

    return rows;
  }

  private async getBranchScope(tenantId: string, branchId?: string) {
    if (!branchId) return null;

    const [agentMappings, queueMappings] = await Promise.all([
      this.prisma.branchAgents.findMany({
        where: { tenantId, branchId },
        select: { agentId: true },
      }),
      this.prisma.branchQueues.findMany({
        where: { tenantId, branchId },
        select: { queueId: true },
      }),
    ]);

    return {
      agentIds: agentMappings.map((item) => item.agentId),
      queueIds: queueMappings.map((item) => item.queueId),
    };
  }

  private buildBranchCallFilter(scope: { agentIds: string[]; queueIds: string[] } | null): Prisma.callSessionsWhereInput | undefined {
    if (!scope) return undefined;
    return {
      OR: [
        { primaryAgentId: { in: scope.agentIds } },
        { queueId: { in: scope.queueIds } },
      ],
    };
  }

  async getDashboard(tenantId: string, branchId?: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const branchScope = await this.getBranchScope(tenantId, branchId);
    const branchFilter = this.buildBranchCallFilter(branchScope);

    const [queuesSummary, activeCalls, todayCounts, openStatuses, hourlyRaw, queueAgents] =
      await Promise.all([
        this.queuesService.getSummary(tenantId, branchScope?.queueIds),

        this.prisma.callSessions.count({
          where: { tenantId, sessionStatus: { notIn: ['ENDED'] }, ...(branchFilter ?? {}) },
        }),

        Promise.all([
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, ...(branchFilter ?? {}) },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, answeredAt: { not: null }, ...(branchFilter ?? {}) },
          }),
          this.prisma.callSessions.count({
            where: { tenantId, startedAt: { gte: startOfDay }, abandonFlag: true, ...(branchFilter ?? {}) },
          }),
        ]),

        // 현재 오픈된 상담원 상태 (에이전트 상태 분포)
        this.prisma.agentStatusHistory.findMany({
          where: {
            tenantId,
            endedAt: null,
            ...(branchScope ? { agentId: { in: branchScope.agentIds } } : {}),
          },
          select: { agentId: true, statusCode: true },
        }),

        this.prisma.callSessions.findMany({
          where: {
            tenantId,
            startedAt: { gte: startOfDay },
            ...(branchFilter ?? {}),
          },
          select: {
            startedAt: true,
            answeredAt: true,
            abandonFlag: true,
          },
        }),

        // 큐별 에이전트 현황 (팀 통계 도출용)
        this.prisma.queueAgentMembers.findMany({
          where: {
            tenantId,
            ...(branchScope ? { queueId: { in: branchScope.queueIds } } : {}),
          },
          select: {
            queueId: true,
            queue: { select: { queueDisplayName: true, queueName: true } },
          },
        }),
      ]);

    const [todayTotal, todayAnswered, todayAbandoned] = todayCounts;

    // ── 에이전트 상태 분포 ──────────────────────────────────────────────────
    const statusDistribution = openStatuses.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.statusCode] = (acc[row.statusCode] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // 현재 열린 상태를 agentId 기준으로 빠르게 조회 (팀 통계에 재활용)
    const agentStatusMap = new Map<string, string>();
    for (const s of openStatuses) agentStatusMap.set(s.agentId, s.statusCode);

    // ── 팀 통계 (큐 = 팀으로 간주) ─────────────────────────────────────────
    // 큐별 멤버 agentId 를 구하려면 agentId 도 select 해야 함.
    // 쿼리를 분리해 agentId 포함 재조회.
    const queueMembersWithAgent = await this.prisma.queueAgentMembers.findMany({
      where: {
        tenantId,
        ...(branchScope ? { queueId: { in: branchScope.queueIds } } : {}),
      },
      select: {
        queueId: true,
        agentId: true,
        queue: { select: { queueDisplayName: true, queueName: true } },
      },
    });

    type TeamRow = {
      teamName: string;
      available: number;
      ringing: number;
      talking: number;
      acw: number;
      break: number;
    };
    const teamMap = new Map<string, TeamRow>();
    for (const m of queueMembersWithAgent) {
      if (!teamMap.has(m.queueId)) {
        teamMap.set(m.queueId, {
          teamName: m.queue.queueDisplayName ?? m.queue.queueName,
          available: 0,
          ringing: 0,
          talking: 0,
          acw: 0,
          break: 0,
        });
      }
      const team = teamMap.get(m.queueId)!;
      const status = agentStatusMap.get(m.agentId) ?? '';
      if (status === 'AVAILABLE') team.available++;
      else if (status === 'RINGING_AGENT') team.ringing++;
      else if (status === 'TALKING') team.talking++;
      else if (status === 'AFTER_CALL_WORK') team.acw++;
      else if (status === 'BREAK') team.break++;
    }
    const teams = [...teamMap.values()];

    // ── 시간대별 트래픽 ────────────────────────────────────────────────────
    const trafficBuckets = hourlyRaw.reduce<Record<number, { inbound: number; answered: number; abandoned: number }>>(
      (acc, row) => {
        const hour = row.startedAt.getHours();
        if (!acc[hour]) acc[hour] = { inbound: 0, answered: 0, abandoned: 0 };
        acc[hour].inbound += 1;
        if (row.answeredAt) acc[hour].answered += 1;
        if (row.abandonFlag) acc[hour].abandoned += 1;
        return acc;
      },
      {},
    );

    const traffic = Array.from({ length: 24 }, (_, h) => {
      const row = trafficBuckets[h];
      return {
        hour: `${String(h).padStart(2, '0')}시`,
        inbound: row ? row.inbound : 0,
        answered: row ? row.answered : 0,
        abandoned: row ? row.abandoned : 0,
      };
    // 현재 시간대까지만 포함 (이후 시간대는 0이므로 제거)
    }).filter((_, h) => h <= new Date().getHours());

    // ── 알람 (규칙 기반) ───────────────────────────────────────────────────
    type Alert = { id: string; level: 'info' | 'warning' | 'error'; message: string; time: string };
    const alerts: Alert[] = [];
    const queues = queuesSummary.data?.queues ?? [];
    const SLA_SEC = 60;
    const SLA_ABANDON_PCT = 20;

    for (const q of queues) {
      const displayName = q.queueDisplayName ?? q.queueName;
      const total = (q.recentAnswered ?? 0) + (q.recentAbandoned ?? 0);
      const abandonPct = total > 0 ? Math.round(((q.recentAbandoned ?? 0) / total) * 100) : 0;

      if (q.available === 0 && (q.waiting > 0 || q.ringing > 0)) {
        alerts.push({
          id: `no-agent-${q.queueId}`,
          level: 'error',
          message: `[${displayName}] 가용 상담원이 없습니다 (대기 ${q.waiting}건)`,
          time: '방금 전',
        });
      } else if (q.longestWaitSeconds > SLA_SEC) {
        alerts.push({
          id: `sla-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 최장 대기시간 ${q.longestWaitSeconds}초가 SLA(${SLA_SEC}초)를 초과했습니다`,
          time: '방금 전',
        });
      }

      if (abandonPct > SLA_ABANDON_PCT) {
        alerts.push({
          id: `abandon-${q.queueId}`,
          level: 'warning',
          message: `[${displayName}] 포기율 ${abandonPct}%가 기준(${SLA_ABANDON_PCT}%)을 초과했습니다`,
          time: '방금 전',
        });
      }
    }

    return {
      success: true,
      data: {
        queues,
        activeCalls,
        today: {
          total: todayTotal,
          answered: todayAnswered,
          abandoned: todayAbandoned,
        },
        agentStatusDistribution: statusDistribution,
        teams,
        traffic,
        alerts,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    };
  }

  async listAmiLogs(tenantId: string, q: ListAmiLogsQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    const branchScope = await this.getBranchScope(tenantId, (q as ListAmiLogsQueryDto & { branchId?: string }).branchId);
    let linkedidsForBranch: string[] | null = null;

    if (branchScope) {
      const rows = await this.prisma.callSessions.findMany({
        where: {
          tenantId,
          startedAt: { gte: from, lte: to },
          ...(this.buildBranchCallFilter(branchScope) ?? {}),
        },
        select: { linkedid: true },
      });
      linkedidsForBranch = rows.map((row) => row.linkedid);
    }

    const phoneFilter = q.phone?.trim();
    const callWhere: Prisma.callSessionsWhereInput = {
      tenantId,
      startedAt: { gte: from, lte: to },
      ...(this.buildBranchCallFilter(branchScope) ?? {}),
      ...(q.linkedid ? { linkedid: { contains: q.linkedid, mode: 'insensitive' as const } } : {}),
      ...(phoneFilter
        ? {
            OR: [
              { ani: { contains: phoneFilter, mode: 'insensitive' as const } },
              { dnis: { contains: phoneFilter, mode: 'insensitive' as const } },
              { didNumber: { contains: phoneFilter, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const where: Prisma.rawAmiEventsWhereInput = {
      tenantId,
      eventTime: { gte: from, lte: to },
      ...(q.eventName ? { eventName: { contains: q.eventName, mode: 'insensitive' as const } } : {}),
      ...(linkedidsForBranch || q.linkedid
        ? {
            AND: [
              ...(linkedidsForBranch ? [{ linkedid: { in: linkedidsForBranch } }] : []),
              ...(q.linkedid ? [{ linkedid: { contains: q.linkedid, mode: 'insensitive' as const } }] : []),
            ],
          }
        : {}),
    };

    const [callTotal, calls, total, rows] = await Promise.all([
      this.prisma.callSessions.count({ where: callWhere }),
      this.prisma.callSessions.findMany({
        where: callWhere,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          primaryAgent: { select: { agentName: true, extension: true } },
          customer: { select: { customerName: true } },
          queueEvents: true,
          callLegs: true,
          callTransfers: true,
          callRecordings: true,
          callMemos: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.rawAmiEvents.count({ where }),
      this.prisma.rawAmiEvents.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          eventId: true,
          eventName: true,
          eventTime: true,
          linkedid: true,
          uniqueid: true,
          payload: true,
        },
      }),
    ]);
    const callLinkedids = [...new Set(calls.map((call: any) => call.linkedid).filter(Boolean))];
    const smartArsEvents = callLinkedids.length > 0
      ? await this.prisma.rawAmiEvents.findMany({
          where: {
            tenantId,
            linkedid: { in: callLinkedids },
            eventName: 'UserEvent',
          },
          orderBy: { eventTime: 'asc' },
          take: 1000,
          select: {
            eventId: true,
            eventName: true,
            eventTime: true,
            linkedid: true,
            uniqueid: true,
            payload: true,
          },
        })
      : [];
    const smartArsEventsByLinkedid = new Map<string, any[]>();
    for (const event of smartArsEvents) {
      if (!event.linkedid || !this.isSmartArsUserEvent(event)) continue;
      smartArsEventsByLinkedid.set(event.linkedid, [
        ...(smartArsEventsByLinkedid.get(event.linkedid) ?? []),
        event,
      ]);
    }

    return {
      success: true,
      data: {
        calls: calls.map((call) => this.buildCallLogSummary(call, smartArsEventsByLinkedid.get(call.linkedid) ?? [])),
        callTotal,
        rows,
        page,
        pageSize,
        total,
      },
      error: null,
    };
  }

  async listIvrFailures(tenantId: string, q: ListIvrFailuresQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    const branchScope = await this.getBranchScope(tenantId, q.branchId);
    let linkedidsForBranch: string[] | null = null;

    if (branchScope) {
      const rows = await this.prisma.callSessions.findMany({
        where: {
          tenantId,
          startedAt: { gte: from, lte: to },
          ...(this.buildBranchCallFilter(branchScope) ?? {}),
        },
        select: { linkedid: true },
      });
      linkedidsForBranch = rows.map((row) => row.linkedid);
    }

    const where: Prisma.rawAmiEventsWhereInput = {
      tenantId,
      eventName: 'UserEvent',
      eventTime: { gte: from, lte: to },
      ...(linkedidsForBranch ? { linkedid: { in: linkedidsForBranch } } : {}),
    };

    const events = await this.prisma.rawAmiEvents.findMany({
      where,
      orderBy: { eventTime: 'desc' },
      take: 1000,
      select: {
        eventId: true,
        eventName: true,
        eventTime: true,
        linkedid: true,
        uniqueid: true,
        payload: true,
      },
    });

    const linkedids = [...new Set(events.map((event) => event.linkedid).filter((value): value is string => Boolean(value)))];
    const sessions = linkedids.length > 0
      ? await this.prisma.callSessions.findMany({
          where: { tenantId, linkedid: { in: linkedids } },
          select: {
            callId: true,
            linkedid: true,
            sessionStatus: true,
            queueName: true,
            primaryAgent: { select: { agentName: true } },
          },
        })
      : [];
    const sessionByLinkedid = new Map(sessions.map((session) => [session.linkedid, session]));

    const rows = events
      .filter((event) => this.isSmartArsUserEvent(event))
      .map((event) => this.buildIvrFailureRow(event, sessionByLinkedid.get(event.linkedid ?? '')))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => !q.entryDid || row.entryDid === q.entryDid)
      .filter((row) => !q.reason || row.failureReason === q.reason);

    const start = (page - 1) * pageSize;
    return {
      success: true,
      data: {
        rows: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
      },
      error: null,
    };
  }

  async listRecordingDownloadAudits(tenantId: string, q: ListRecordingDownloadAuditsQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    const branchScope = await this.getBranchScope(tenantId, q.branchId);
    let linkedidsForBranch: string[] | null = null;

    if (branchScope) {
      const rows = await this.prisma.callSessions.findMany({
        where: {
          tenantId,
          startedAt: { gte: from, lte: to },
          ...(this.buildBranchCallFilter(branchScope) ?? {}),
        },
        select: { linkedid: true },
      });
      linkedidsForBranch = rows.map((row) => row.linkedid);
    }

    const where: any = {
      tenantId,
      action: 'DOWNLOAD',
      createdAt: { gte: from, lte: to },
      ...(q.agentId ? { agentId: q.agentId } : {}),
      ...(q.linkedid ? { linkedid: { contains: q.linkedid, mode: 'insensitive' } } : {}),
    };

    if (linkedidsForBranch) {
      where.AND = [
        ...(where.AND ?? []),
        { linkedid: { in: linkedidsForBranch } },
      ];
    }

    const [total, auditRows] = await Promise.all([
      (this.prisma as any).callRecordingAccessAuditLogs.count({ where }),
      (this.prisma as any).callRecordingAccessAuditLogs.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          auditLogId: true,
          recordingId: true,
          callId: true,
          linkedid: true,
          agentId: true,
          userRole: true,
          action: true,
          clientIp: true,
          userAgent: true,
          success: true,
          createdAt: true,
        },
      }),
    ]) as [number, any[]];

    const callIds = [...new Set(auditRows.map((row: any) => row.callId).filter((value: unknown): value is string => typeof value === 'string'))];
    const agentIds = [...new Set(auditRows.map((row: any) => row.agentId).filter((value: unknown): value is string => typeof value === 'string'))];
    const [sessions, agents] = await Promise.all([
      callIds.length
        ? this.prisma.callSessions.findMany({
            where: { tenantId, callId: { in: callIds } },
            select: {
              callId: true,
              linkedid: true,
              ani: true,
              dnis: true,
              didNumber: true,
              queueName: true,
            },
          })
        : [],
      agentIds.length
        ? this.prisma.agents.findMany({
            where: { tenantId, agentId: { in: agentIds } },
            select: { agentId: true, agentName: true, extension: true },
          })
        : [],
    ]);
    const sessionByCallId = new Map(sessions.map((session) => [session.callId, session] as const));
    const agentById = new Map(agents.map((agent) => [agent.agentId, agent] as const));

    return {
      success: true,
      data: {
        rows: auditRows.map((row: any) => {
          const session = sessionByCallId.get(row.callId ?? '');
          const agent = agentById.get(row.agentId ?? '');
          return {
            auditLogId: row.auditLogId,
            recordingId: row.recordingId,
            callId: row.callId,
            linkedid: row.linkedid,
            agentId: row.agentId,
            agentName: agent?.agentName ?? null,
            agentExtension: agent?.extension ?? null,
            userRole: row.userRole,
            action: row.action,
            success: row.success,
            createdAt: row.createdAt,
            userAgent: row.userAgent,
            callerMasked: this.maskPhoneNumber(session?.ani),
            dnisMasked: this.maskPhoneNumber(session?.didNumber ?? session?.dnis),
            clientIpMasked: this.maskClientIp(row.clientIp),
            queueName: session?.queueName ?? null,
          };
        }),
        total,
        page,
        pageSize,
      },
      error: null,
    };
  }

  async getOperationalMonitoring(tenantId: string) {
    const health = await this.healthSummary.getHealth(tenantId);
    const recoverySince = new Date(Date.now() - 60 * 60 * 1000);
    const [pendingOutbox, oldestOutbox, recoveredLastHour] = await Promise.all([
      this.prisma.eventOutbox.count({
        where: { tenantId, publishedAt: null },
      }),
      this.prisma.eventOutbox.findFirst({
        where: { tenantId, publishedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.callSessions.count({
        where: {
          tenantId,
          resultCode: 'RECOVERY_TIMEOUT',
          endedAt: { gte: recoverySince },
        },
      }),
    ]);

    const websocketClients = this.realtimeGateway.getClientCount();
    const outboxStatus = pendingOutbox >= 100 ? 'critical' : pendingOutbox >= 10 ? 'warning' : 'ok';
    const recoveryStatus = recoveredLastHour >= 10 ? 'critical' : recoveredLastHour > 0 ? 'warning' : 'ok';
    const websocketStatus = websocketClients >= 0 ? 'ok' : 'warning';
    const alerts: Array<{ key: string; severity: 'critical' | 'warning'; message: string }> = [];

    if (health.checks.db === 'down') {
      alerts.push({ key: 'db-down', severity: 'critical', message: 'DB 연결 실패' });
    }
    if (health.checks.redis === 'down') {
      alerts.push({ key: 'redis-down', severity: 'critical', message: 'Redis 연결 실패' });
    }
    if (health.checks.ami === 'disconnected') {
      alerts.push({ key: 'ami-disconnected', severity: 'critical', message: 'AMI 연결 끊김' });
    }
    if (outboxStatus !== 'ok') {
      alerts.push({ key: 'outbox-backlog', severity: outboxStatus, message: `eventOutbox 미발행 ${pendingOutbox}건` });
    }
    if (recoveryStatus !== 'ok') {
      alerts.push({ key: 'recovery-timeout', severity: recoveryStatus, message: `최근 1시간 복구 종료 ${recoveredLastHour}건` });
    }
    if (health.call.stuck > 0) {
      alerts.push({ key: 'stuck-calls', severity: 'warning', message: `10분 이상 상태 변경 없는 콜 ${health.call.stuck}건` });
    }

    const status = alerts.some((alert) => alert.severity === 'critical')
      ? 'critical'
      : alerts.length > 0 || health.status === 'degraded'
      ? 'warning'
      : 'ok';

    return {
      success: true,
      data: {
        status,
        timestamp: health.timestamp,
        instanceId: health.instanceId,
        leader: health.leader,
        checks: health.checks,
        call: health.call,
        agent: health.agent,
        queue: health.queue,
        outbox: {
          pending: pendingOutbox,
          oldestCreatedAt: oldestOutbox?.createdAt ?? null,
          status: outboxStatus,
          thresholds: { warning: 10, critical: 100 },
        },
        recovery: {
          lastHour: recoveredLastHour,
          status: recoveryStatus,
          thresholds: { warning: 1, critical: 10 },
        },
        websocket: {
          clients: websocketClients,
          status: websocketStatus,
        },
        alerts,
      },
      error: null,
    };
  }

  private buildCallLogSummary(call: any, smartArsEvents: any[] = []) {
    const callerNumber = call.ani ?? null;
    const inboundNumber = call.didNumber ?? call.dnis ?? null;
    const queueName = call.queueName ?? null;
    const agentName = call.primaryAgent?.agentName ?? null;
    const customerName = call.customer?.customerName ?? null;
    const ended = call.endedAt ? '종료' : this.getSessionStatusLabel(call.sessionStatus);
    const flowParts = [this.formatPhoneNumber(callerNumber), this.formatPhoneNumber(inboundNumber), queueName, agentName, ended]
      .filter((item): item is string => Boolean(item));

    return {
      callId: call.callId,
      linkedid: call.linkedid,
      callerNumber,
      inboundNumber,
      ani: call.ani,
      dnis: call.dnis,
      didNumber: call.didNumber,
      queueName,
      customerName,
      agentName,
      agentExtension: call.primaryAgent?.extension ?? null,
      sessionStatus: call.sessionStatus,
      direction: call.direction,
      resultCode: call.resultCode,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      waitSeconds: call.waitSeconds ?? 0,
      talkSeconds: call.talkSeconds ?? 0,
      abandonFlag: call.abandonFlag ?? false,
      recordingFlag: call.recordingFlag ?? false,
      flowSummary: flowParts.join(' -> '),
      timeline: this.buildCallLogTimeline(call, smartArsEvents),
    };
  }

  private buildCallLogTimeline(call: any, smartArsEvents: any[] = []) {
    const items: Array<{ type: string; time: Date; label: string; detail?: string | null }> = [];
    const add = (type: string, time: Date | null | undefined, label: string, detail?: string | null) => {
      if (!time) return;
      items.push({ type, time, label, detail: detail ?? null });
    };

    add(
      'CALL_STARTED',
      call.startedAt,
      '호 시작',
      [this.formatPhoneNumber(call.ani), this.formatPhoneNumber(call.didNumber ?? call.dnis)].filter(Boolean).join(' -> '),
    );
    add('QUEUE_ENTERED', call.queuedAt, '큐 진입', call.queueName);
    add('AGENT_RINGING', call.ringingAt, '상담원 호출', call.primaryAgent?.agentName ?? null);
    add('CALL_ANSWERED', call.answeredAt, '상담 연결', call.primaryAgent?.agentName ?? null);

    for (const event of call.queueEvents ?? []) {
      add(
        `QUEUE_${event.eventType ?? 'EVENT'}`,
        event.eventTime,
        this.getQueueEventLabel(event.eventType),
        [event.queueName, event.agentId].filter(Boolean).join(' · ') || null,
      );
    }

    for (const leg of call.callLegs ?? []) {
      const legLabel = this.getLegTypeLabel(leg.legType);
      add(`LEG_${leg.legType ?? 'CHANNEL'}_STARTED`, leg.startedAt, `${legLabel} 시작`, leg.channel ?? null);
      add(`LEG_${leg.legType ?? 'CHANNEL'}_ANSWERED`, leg.answeredAt, `${legLabel} 응답`, leg.channel ?? null);
      add(`LEG_${leg.legType ?? 'CHANNEL'}_ENDED`, leg.endedAt, `${legLabel} 종료`, leg.channel ?? null);
    }

    for (const transfer of call.callTransfers ?? []) {
      const target = transfer.targetExtension ?? transfer.targetNumber ?? transfer.toExtension ?? null;
      add('TRANSFER_REQUESTED', transfer.requestedAt, '전환 요청', target);
      add('TRANSFER_COMPLETED', transfer.completedAt, `전환 ${this.getTransferResultLabel(transfer.transferResult)}`, target);
    }

    for (const recording of call.callRecordings ?? []) {
      add('RECORDING_STARTED', recording.recordingStartedAt, '녹취 시작', recording.fileName ?? recording.recordingId ?? null);
    }

    for (const memo of call.callMemos ?? []) {
      add('MEMO_SAVED', memo.createdAt, '상담 메모', memo.resultCode ? this.getCallResultLabel(memo.resultCode) : memo.memoText ?? null);
    }

    for (const event of smartArsEvents) {
      const raw = this.getAmiRawPayload(event);
      const stage = String(raw.Stage ?? '').toLowerCase();
      const digit = raw.Digit ? String(raw.Digit) : null;
      const action = raw.Action ? String(raw.Action) : null;
      const target = raw.Target ? String(raw.Target) : null;
      const prompt = raw.Prompt ? String(raw.Prompt) : null;
      const result = raw.Result ? String(raw.Result) : null;

      if (stage === 'prompt') {
        add('SMART_ARS_PROMPT', event.eventTime, '스마트 ARS 멘트 재생', prompt ? this.formatPromptName(prompt) : null);
      } else if (stage === 'selection') {
        add('SMART_ARS_SELECTION', event.eventTime, '스마트 ARS 사용자 선택', [
          digit ? `입력 ${digit}` : null,
          action ? this.getSmartArsActionLabel(action) : null,
          result ? this.getSmartArsResultLabel(result) : null,
        ].filter(Boolean).join(' · '));
      } else if (stage === 'action') {
        add('SMART_ARS_ACTION', event.eventTime, '스마트 ARS 액션 실행', [
          action ? this.getSmartArsActionLabel(action) : null,
          target ? `대상 ${target}` : null,
          result ? this.getSmartArsResultLabel(result) : null,
        ].filter(Boolean).join(' · '));
      } else if (stage === 'result') {
        add('SMART_ARS_RESULT', event.eventTime, '스마트 ARS 액션 결과', [
          action ? this.getSmartArsActionLabel(action) : null,
          result ? this.getSmartArsResultLabel(result) : null,
        ].filter(Boolean).join(' · '));
      }
    }

    add('CALL_ENDED', call.endedAt, '호 종료', call.resultCode ? this.getCallResultLabel(call.resultCode) : null);

    return items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  private getAmiRawPayload(event: any): Record<string, unknown> {
    const payload = event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {};
    return payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw)
      ? payload.raw as Record<string, unknown>
      : payload;
  }

  private isSmartArsUserEvent(event: any) {
    const raw = this.getAmiRawPayload(event);
    return raw.UserEvent === 'KasterSmartArs';
  }

  private buildIvrFailureRow(event: any, session?: any | null) {
    const raw = this.getAmiRawPayload(event);
    const failureReason = this.getIvrFailureReason(raw);
    if (!failureReason) return null;

    return {
      eventId: event.eventId,
      eventTime: event.eventTime,
      linkedid: event.linkedid,
      uniqueid: event.uniqueid,
      caller: raw.Caller ? String(raw.Caller) : null,
      entryDid: raw.EntryDid ? String(raw.EntryDid) : null,
      branchId: raw.BranchId ? String(raw.BranchId) : null,
      stage: raw.Stage ? String(raw.Stage) : null,
      action: raw.Action ? String(raw.Action) : null,
      digit: raw.Digit ? String(raw.Digit) : null,
      result: raw.Result ? String(raw.Result) : null,
      target: raw.Target ? String(raw.Target) : null,
      failureReason,
      callId: session?.callId ?? null,
      sessionStatus: session?.sessionStatus ?? null,
      queueName: session?.queueName ?? null,
      primaryAgentName: session?.primaryAgent?.agentName ?? null,
    };
  }

  private getIvrFailureReason(raw: Record<string, unknown>) {
    const stage = String(raw.Stage ?? '').toLowerCase();
    const result = String(raw.Result ?? '').toLowerCase();
    const action = String(raw.Action ?? '').toUpperCase();

    if (stage === 'selection' && result === 'timeout') return 'INPUT_TIMEOUT';
    if (stage === 'selection' && result === 'invalid') return 'INVALID_INPUT';
    if (stage === 'result' && action === 'SEND_SMS' && !['success', 'started'].includes(result)) return 'SMS_FAILURE';
    if (stage === 'result' && action === 'OPT_OUT' && !['success', 'started'].includes(result)) return 'OPT_OUT_FAILURE';
    if (stage === 'result' && result === 'failure') return 'FLOW_FAILURE';
    return null;
  }

  private getQueueEventLabel(eventType?: string | null) {
    switch (eventType) {
      case 'ENTERQUEUE':
      case 'QueueCallerJoin': return '대기열 진입';
      case 'CONNECT':
      case 'AgentConnect': return '상담 연결';
      case 'COMPLETECALLER': return '고객 종료';
      case 'COMPLETEAGENT': return '상담원 종료';
      case 'ABANDON':
      case 'QueueCallerAbandon': return '고객 대기 포기';
      case 'RINGNOANSWER': return '상담원 미응답';
      case 'EXITWITHTIMEOUT': return '대기 시간 초과';
      case 'EXITWITHKEY': return '키 입력 이탈';
      case 'TRANSFER': return '큐 전환';
      case 'PAUSE': return '상담원 휴식';
      case 'UNPAUSE': return '상담원 휴식 해제';
      default: return eventType ? `큐 이벤트: ${eventType}` : '큐 이벤트';
    }
  }

  private formatPhoneNumber(value?: string | null) {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');

    if (/^15\d{6}$|^16\d{6}$|^18\d{6}$/.test(digits)) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }

    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

    return value;
  }

  private maskPhoneNumber(value?: string | null) {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) return value;

    const last4 = digits.slice(-4);
    if (digits.startsWith('02')) return `02-****-${last4}`;
    if (digits.length >= 10) return `${digits.slice(0, 3)}-****-${last4}`;
    return `****-${last4}`;
  }

  private maskClientIp(value?: string | null) {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
      return `${parts.slice(0, 3).join('.')}.xxx`;
    }
    const ipv6Parts = value.split(':').filter(Boolean);
    if (ipv6Parts.length > 2) return `${ipv6Parts.slice(0, 2).join(':')}:****`;
    return 'masked';
  }

  private getLegTypeLabel(legType?: string | null) {
    switch (legType) {
      case 'caller': return '고객 채널';
      case 'agent': return '상담원 채널';
      case 'queue': return '큐 채널';
      case 'trunk': return '회선 채널';
      case 'consult': return '협의 채널';
      default: return '채널';
    }
  }

  private getTransferResultLabel(result?: string | null) {
    switch (result) {
      case 'REQUESTED': return '요청';
      case 'COMPLETED': return '완료';
      case 'FAILED': return '실패';
      case 'CANCELED':
      case 'CANCELLED': return '취소';
      case 'EXPIRED': return '만료';
      default: return result ?? '완료';
    }
  }

  private getCallResultLabel(result?: string | null) {
    switch (result) {
      case 'NORMAL_CLEARING': return '정상 종료';
      case 'RECOVERY_TIMEOUT': return '장애 복구 종료';
      case 'DONE': return '처리 완료';
      case 'BUSY': return '통화 중';
      case 'NO_ANSWER': return '미응답';
      case 'FAILED':
      case 'FAILURE': return '실패';
      case 'CANCEL':
      case 'CANCELED':
      case 'CANCELLED': return '취소';
      case 'TIMEOUT': return '시간 초과';
      default: return result ?? null;
    }
  }

  private formatPromptName(prompt: string) {
    const name = prompt.split(/[\\/]/).filter(Boolean).pop() ?? prompt;
    switch (name) {
      case 'smart_ars_guide': return '스마트 ARS 안내 멘트';
      case 'smart_ars_invalid': return '스마트 ARS 잘못된 입력 멘트';
      case 'smart_ars_fail': return '스마트 ARS 실패 안내 멘트';
      case 'smart_080_intro': return '080 수신거부 안내 멘트';
      case 'smart_080_done': return '080 수신거부 완료 멘트';
      default: return name;
    }
  }

  private getSmartArsActionLabel(action: string) {
    switch (action) {
      case 'QUEUE_ROUTE': return '상담원 연결';
      case 'TRANSFER': return '착신전환';
      case 'SEND_SMS': return '문자 발송';
      case 'OPT_OUT': return '수신거부 등록';
      case 'PLAY_PROMPT': return '멘트 재생';
      default: return action;
    }
  }

  private getSmartArsResultLabel(result: string) {
    switch (result) {
      case 'started': return '시작';
      case 'selected': return '선택됨';
      case 'routed': return '큐 연결';
      case 'transfer': return '전환';
      case 'played': return '재생 완료';
      case 'SUCCESS': return '성공';
      case 'FAILURE':
      case 'failure': return '실패';
      case 'timeout': return '입력 없음';
      case 'invalid': return '잘못된 입력';
      default: return result;
    }
  }

  private getSessionStatusLabel(status?: string | null) {
    switch (status) {
      case 'NEW': return '인입';
      case 'QUEUED': return '대기';
      case 'RINGING_AGENT': return '호출';
      case 'TALKING': return '통화';
      case 'AFTER_CALL_WORK': return '후처리';
      case 'TRANSFERRING': return '전환';
      case 'ENDED': return '종료';
      default: return status ?? '상태 없음';
    }
  }

  async listAnnouncements(tenantId: string) {
    const rows = await this.prisma.announcements.findMany({
      where: { tenantId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data: rows, error: null };
  }

  async createAnnouncement(
    tenantId: string,
    dto: CreateAnnouncementDto,
    actor?: { agentName?: string },
  ) {
    const row = await this.prisma.announcements.create({
      data: {
        tenantId,
        title: dto.title,
        body: dto.body,
        authorName: dto.authorName || actor?.agentName || '관리자',
        pinned: dto.pinned ?? false,
      },
    });

    return { success: true, data: row, error: null };
  }

  async updateAnnouncement(
    tenantId: string,
    announcementId: string,
    dto: UpdateAnnouncementDto,
    actor?: { agentName?: string },
  ) {
    const row = await this.prisma.announcements.updateMany({
      where: { tenantId, announcementId },
      data: {
        title: dto.title,
        body: dto.body,
        authorName: dto.authorName || actor?.agentName || '관리자',
        pinned: dto.pinned ?? false,
        updatedAt: new Date(),
      },
    });

    return { success: true, data: { updated: row.count > 0, announcementId }, error: null };
  }

  async deleteAnnouncement(tenantId: string, announcementId: string) {
    await this.prisma.announcements.deleteMany({
      where: { announcementId, tenantId },
    });

    return { success: true, data: { deleted: true, announcementId }, error: null };
  }

  async listBranches(tenantId: string) {
    const rows = await this.prisma.branches.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { branchName: 'asc' }],
      include: {
        agentMappings: true,
        queueMappings: true,
        didMappings: true,
        vipPrompt: { select: { id: true, promptKey: true, displayName: true } },
      } as any,
    });

    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        agentCount: row.agentMappings.length,
        queueCount: row.queueMappings.length,
        didCount: row.didMappings.length,
        settingsProfile: normalizeBranchSettingsProfile(row.settingsProfile, {
          queueIds: row.queueMappings.map((item) => item.queueId),
          didIds: row.didMappings.map((item) => item.didId),
        }),
        settingsSummary: buildBranchSettingsSummary(normalizeBranchSettingsProfile(row.settingsProfile, {
          queueIds: row.queueMappings.map((item) => item.queueId),
          didIds: row.didMappings.map((item) => item.didId),
        }), {
          queueCount: row.queueMappings.length,
          didCount: row.didMappings.length,
        }),
      })),
      error: null,
    };
  }

  async createBranch(tenantId: string, dto: CreateBranchDto) {
    if (dto.vipPromptId) {
      await this.assertPromptBelongsToTenant(tenantId, dto.vipPromptId);
    }
    const row = await this.prisma.branches.create({
      data: {
        tenantId,
        branchCode: dto.branchCode,
        branchName: dto.branchName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        ...(dto.vipPromptId !== undefined ? { vipPromptId: dto.vipPromptId ?? null } : {}),
      } as any,
    });
    return { success: true, data: row, error: null };
  }

  async updateBranch(tenantId: string, branchId: string, dto: UpdateBranchDto) {
    if (dto.vipPromptId) {
      await this.assertPromptBelongsToTenant(tenantId, dto.vipPromptId);
    }
    const row = await this.prisma.branches.updateMany({
      where: { tenantId, branchId },
      data: {
        ...(dto.branchCode !== undefined ? { branchCode: dto.branchCode } : {}),
        ...(dto.branchName !== undefined ? { branchName: dto.branchName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.vipPromptId !== undefined ? { vipPromptId: dto.vipPromptId ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      } as any,
    });
    return { success: true, data: { updated: row.count > 0, branchId }, error: null };
  }

  private async assertPromptBelongsToTenant(tenantId: string, promptId: string) {
    const prompt = await (this.prisma as any).asteriskPrompt.findFirst({
      where: { id: promptId, tenantId },
      select: { id: true },
    });
    if (!prompt) {
      throw new BadRequestException('선택한 VIP 멘트(prompt)를 찾을 수 없습니다.');
    }
  }

  async deleteBranch(tenantId: string, branchId: string) {
    await this.prisma.branches.deleteMany({
      where: { tenantId, branchId },
    });
    return { success: true, data: { deleted: true, branchId }, error: null };
  }

  async getBranchMappings(tenantId: string, branchId: string) {
    const branch = await this.prisma.branches.findFirst({
      where: { tenantId, branchId },
      include: {
        agentMappings: {
          select: { agentId: true },
        },
        queueMappings: {
          select: { queueId: true },
        },
        didMappings: {
          select: { didId: true },
        },
      },
    });

    const [agents, queues, dids, prompts, ivrMenus, forwardingRules, systemSettings, availableSmsTemplates] = await Promise.all([
      this.prisma.agents.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ extension: 'asc' }],
        select: {
          agentId: true,
          agentName: true,
          extension: true,
          role: true,
        },
      }),
      this.prisma.queues.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ queueName: 'asc' }],
        select: {
          queueId: true,
          queueName: true,
          queueDisplayName: true,
        },
      }),
      this.prisma.asteriskDid.findMany({
        where: { tenantId, enabled: true },
        orderBy: [{ did: 'asc' }],
        select: {
          id: true,
          did: true,
          description: true,
        },
      }),
      this.prisma.asteriskPrompt.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
        select: {
          id: true,
          displayName: true,
          promptKey: true,
          category: true,
        },
      }),
      this.prisma.asteriskIvrMenu.findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          timeoutSecs: true,
        },
      }),
      this.prisma.asteriskForwardingRules.findMany({
        where: { tenantId, enabled: true },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          forwardType: true,
          targetValue: true,
          conditionType: true,
          did: {
            select: {
              id: true,
              did: true,
              description: true,
            },
          },
        },
      }),
      this.prisma.tenantSystemSettings.findUnique({
        where: { tenantId },
        select: {
          recordingEnabled: true,
          allowedOutboundCallerIds: true,
          defaultOutboundCallerId: true,
        },
      } as any),
      this.prisma.tenantSmsTemplate.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: [{ templateName: 'asc' }],
        select: {
          templateId: true,
          templateName: true,
          category: true,
          isActive: true,
        },
      }),
    ]);

    const assignedQueueIds = branch?.queueMappings.map((item) => item.queueId) ?? [];
    const assignedDidIds = branch?.didMappings.map((item) => item.didId) ?? [];
    const settingsProfile = normalizeBranchSettingsProfile(branch?.settingsProfile, {
      queueIds: assignedQueueIds,
      didIds: assignedDidIds,
    });
    const callerIds = parseAllowedCallerIds(systemSettings?.allowedOutboundCallerIds ?? '');

    return {
      success: true,
      data: {
        branch: branch
          ? {
              branchId: branch.branchId,
              branchCode: branch.branchCode,
              branchName: branch.branchName,
              description: branch.description,
              isActive: branch.isActive,
              vipPromptId: (branch as any).vipPromptId ?? null,
            }
          : null,
        assignedAgentIds: branch?.agentMappings.map((item) => item.agentId) ?? [],
        assignedQueueIds,
        assignedDidIds,
        settingsProfile,
        availableAgents: agents,
        availableQueues: queues,
        availableDids: dids,
        availablePrompts: prompts,
        availableIvrMenus: ivrMenus,
        availableForwardingRules: forwardingRules.map((rule) => ({
          id: rule.id,
          forwardType: rule.forwardType,
          targetValue: rule.targetValue,
          conditionType: rule.conditionType,
          did: rule.did,
        })),
        availableSmsTemplates,
        availableCallerIds: callerIds,
        defaultSystemRecordingEnabled: systemSettings?.recordingEnabled ?? true,
        defaultSystemCallerId: systemSettings?.defaultOutboundCallerId ?? null,
      },
      error: null,
    };
  }

  async updateBranchMappings(tenantId: string, branchId: string, dto: UpdateBranchMappingsDto) {
    const currentMappings = await this.prisma.branches.findFirst({
      where: { tenantId, branchId },
      select: {
        branchId: true,
        queueMappings: { select: { queueId: true } },
        didMappings: { select: { didId: true } },
        settingsProfile: true,
      },
    });

    if (!currentMappings) {
      throw new BadRequestException('지사 정보를 찾을 수 없습니다.');
    }

    const effectiveQueueIds = dto.queueIds ?? currentMappings.queueMappings.map((item) => item.queueId);
    const effectiveDidIds = dto.didIds ?? currentMappings.didMappings.map((item) => item.didId);
    const currentSettingsProfile =
      currentMappings.settingsProfile &&
      typeof currentMappings.settingsProfile === 'object' &&
      !Array.isArray(currentMappings.settingsProfile)
        ? currentMappings.settingsProfile as Record<string, unknown>
        : {};
    const nextSettingsProfile = dto.settingsProfile
      ? {
          ...currentSettingsProfile,
          ...dto.settingsProfile,
        }
      : undefined;
    const settingsProfile = nextSettingsProfile
      ? normalizeBranchSettingsProfile(nextSettingsProfile, {
          queueIds: effectiveQueueIds,
          didIds: effectiveDidIds,
        })
      : undefined;

    if (settingsProfile) {
      validateBranchSettingsProfile(settingsProfile, {
        queueIds: effectiveQueueIds,
        didIds: effectiveDidIds,
      });
      await this.assertValidOptOutSmsTemplates(tenantId, settingsProfile);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.agentIds) {
        await tx.branchAgents.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.agentIds.length > 0) {
          await tx.branchAgents.createMany({
            data: dto.agentIds.map((agentId) => ({
              tenantId,
              branchId,
              agentId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (dto.queueIds) {
        await tx.branchQueues.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.queueIds.length > 0) {
          await tx.branchQueues.createMany({
            data: dto.queueIds.map((queueId) => ({
              tenantId,
              branchId,
              queueId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (dto.didIds) {
        await tx.branchDids.deleteMany({
          where: { tenantId, branchId },
        });
        if (dto.didIds.length > 0) {
          await tx.branchDids.createMany({
            data: dto.didIds.map((didId) => ({
              tenantId,
              branchId,
              didId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (settingsProfile) {
        await tx.branches.updateMany({
          where: { tenantId, branchId },
          data: {
            settingsProfile: settingsProfile as unknown as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        });
      }
    });

    await this.asteriskReloadService.executeReload(tenantId);

    return this.getBranchMappings(tenantId, branchId);
  }

  async listRolePermissions(tenantId: string) {
    const [rows, agents] = await Promise.all([
      this.prisma.rolePermissions.findMany({
        where: { tenantId },
        orderBy: [{ roleCode: 'asc' }, { menuKey: 'asc' }],
      } as any) as Promise<Array<PersistedPermissionRow & { roleCode: string }>>,
      this.listPermissionAgents(tenantId),
    ]);

    const matrix = ROLE_CODES.map((roleCode) => ({
      roleCode,
      permissions: this.buildPermissionMatrix(
        rows.filter((row) => row.roleCode === roleCode),
        undefined,
        roleCode,
      ),
    }));

    return {
      success: true,
      data: {
        roles: ROLE_CODES,
        menuKeys: MENU_KEYS,
        matrix,
        agents,
      },
      error: null,
    };
  }

  async getCurrentPermissionProfile(tenantId: string, agentId: string, roleCode: string) {
    const roleRows = await this.prisma.rolePermissions.findMany({
      where: { tenantId, roleCode },
      orderBy: [{ menuKey: 'asc' }],
    } as any) as PersistedPermissionRow[];

    const agentMenuPermissions = (this.prisma as any).agentMenuPermissions;
    const agentRows = agentMenuPermissions?.findMany
      ? await agentMenuPermissions.findMany({
          where: { tenantId, agentId },
          orderBy: [{ menuKey: 'asc' }],
        })
      : [];

    const permissions = this.buildPermissionMatrix(
      roleRows,
      new Map([[agentId, agentRows as PersistedPermissionRow[]]]),
      roleCode,
    );

    return {
      success: true,
      data: {
        agentId,
        roleCode,
        menuKeys: MENU_KEYS,
        permissions,
      },
      error: null,
    };
  }

  async getAgentPermissionProfile(tenantId: string, agentId: string) {
    const [agent, roleRows, agentRows] = await Promise.all([
      this.prisma.agents.findFirst({
        where: { tenantId, agentId },
        select: {
          agentId: true,
          agentName: true,
          loginId: true,
          extension: true,
          role: true,
          isActive: true,
        },
      }),
      this.prisma.rolePermissions.findMany({
        where: { tenantId },
        orderBy: [{ roleCode: 'asc' }, { menuKey: 'asc' }],
      } as any) as Promise<Array<PersistedPermissionRow & { roleCode: string }>>,
      ((this.prisma as any).agentMenuPermissions?.findMany
        ? (this.prisma as any).agentMenuPermissions.findMany({
            where: { tenantId, agentId },
            orderBy: [{ menuKey: 'asc' }],
          })
        : Promise.resolve([])) as Promise<PersistedPermissionRow[]>,
    ]);

    if (!agent) {
      throw new BadRequestException('상담원 정보를 찾을 수 없습니다.');
    }

    const permissions = this.buildPermissionMatrix(
      roleRows.filter((row) => row.roleCode === agent.role),
      new Map([[agentId, agentRows]]),
      agent.role,
    );

    return {
      success: true,
      data: {
        agent,
        roles: ROLE_CODES,
        menuKeys: MENU_KEYS,
        permissions,
      },
      error: null,
    };
  }

  async updateRolePermissions(tenantId: string, dto: UpdateRolePermissionsDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.rolePermissions.upsert({
          where: {
            tenantId_roleCode_menuKey: {
              tenantId,
              roleCode: item.roleCode,
              menuKey: item.menuKey,
            },
          },
          create: {
            tenantId,
            roleCode: item.roleCode,
            menuKey: item.menuKey,
            canAccess: item.canView,
            canView: item.canView,
            canCreate: item.canCreate,
            canUpdate: item.canUpdate,
            canDelete: item.canDelete,
            canOperate: item.canOperate,
            canExport: item.canExport,
          } as any,
          update: {
            canAccess: item.canView,
            canView: item.canView,
            canCreate: item.canCreate,
            canUpdate: item.canUpdate,
            canDelete: item.canDelete,
            canOperate: item.canOperate,
            canExport: item.canExport,
            updatedAt: new Date(),
          } as any,
        }),
      ),
    );

    return this.listRolePermissions(tenantId);
  }

  async updateAgentPermissions(tenantId: string, agentId: string, dto: UpdateAgentPermissionsDto) {
    const agent = await this.prisma.agents.findFirst({
      where: { tenantId, agentId },
      select: { agentId: true, role: true },
    });

    if (!agent) {
      throw new BadRequestException('상담원 정보를 찾을 수 없습니다.');
    }

    const baseRoleCode = dto.baseRoleCode ?? agent.role;
    if (!ROLE_CODES.includes(baseRoleCode as typeof ROLE_CODES[number])) {
      throw new BadRequestException('유효하지 않은 기본 권한입니다.');
    }

    const roleRows = await this.prisma.rolePermissions.findMany({
      where: { tenantId, roleCode: baseRoleCode },
      orderBy: [{ menuKey: 'asc' }],
    } as any) as PersistedPermissionRow[];
    const roleRowMap = new Map(roleRows.map((row) => [row.menuKey, row]));

    const agentMenuPermissions = (this.prisma as any).agentMenuPermissions;

    await this.prisma.$transaction(async (tx) => {
      await tx.agents.update({
        where: { agentId },
        data: {
          role: baseRoleCode,
          updatedAt: new Date(),
        },
      });

      if (!agentMenuPermissions?.deleteMany || !agentMenuPermissions?.createMany) {
        return;
      }

      await (tx as any).agentMenuPermissions.deleteMany({
        where: { tenantId, agentId },
      });

      type AgentOverrideRow = {
        tenantId: string;
        agentId: string;
        menuKey: string;
        canAccess: boolean;
        canView: boolean;
        canCreate: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        canOperate: boolean;
        canExport: boolean;
      };

      const overrideRows: AgentOverrideRow[] = dto.items
        .map((item) => {
          const base = mergePermissionFlags(
            defaultPermissionFlags(baseRoleCode, item.menuKey),
            roleRowMap.get(item.menuKey),
          );

          const differs =
            item.canView !== base.canView ||
            item.canCreate !== base.canCreate ||
            item.canUpdate !== base.canUpdate ||
            item.canDelete !== base.canDelete ||
            item.canOperate !== base.canOperate ||
            item.canExport !== base.canExport;

          if (!differs) {
            return null;
          }

          return {
            tenantId,
            agentId,
            menuKey: item.menuKey,
            canAccess: item.canView,
            canView: item.canView,
            canCreate: item.canCreate,
            canUpdate: item.canUpdate,
            canDelete: item.canDelete,
            canOperate: item.canOperate,
            canExport: item.canExport,
          };
        })
        .filter((item): item is AgentOverrideRow => item !== null);

      if (overrideRows.length > 0) {
        await (tx as any).agentMenuPermissions.createMany({
          data: overrideRows,
          skipDuplicates: true,
        });
      }
    });

    return this.getAgentPermissionProfile(tenantId, agentId);
  }

  async getSystemSettings(tenantId: string) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });

    const row = await this.prisma.tenantSystemSettings.findUnique({
      where: { tenantId },
    } as any) as
      | {
          recordingEnabled: boolean;
          defaultMaxWaitSeconds: number;
          allowDirectSipDial?: boolean | null;
          defaultSipPassword?: string | null;
          allowedOutboundCallerIds?: string | null;
          defaultOutboundCallerId?: string | null;
          sipRegisterPort?: number | null;
          timezone: string;
          dateFormat: string;
        }
      | null;

    const defaults = {
      tenantId,
      recordingEnabled: true,
      defaultMaxWaitSeconds: 45,
      allowDirectSipDial: false,
      defaultSipPassword: '',
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
      sipRegisterPort: 36070,
      timezone: tenant?.timezone ?? 'Asia/Seoul',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
    };

    return {
      success: true,
      data: row
        ? {
          ...row,
          defaultSipPassword: row.defaultSipPassword ?? '',
          allowedOutboundCallerIds: row.allowedOutboundCallerIds ?? '',
          defaultOutboundCallerId: row.defaultOutboundCallerId ?? '',
        }
        : defaults,
      error: null,
    };
  }

  async updateSystemSettings(tenantId: string, dto: UpdateSystemSettingsDto) {
    const allowedOutboundCallerIds = parseAllowedCallerIds(dto.allowedOutboundCallerIds);
    const defaultOutboundCallerId = dto.defaultOutboundCallerId?.trim()
      ? parseAllowedCallerIds(dto.defaultOutboundCallerId)[0]
      : null;

    if (defaultOutboundCallerId && !allowedOutboundCallerIds.includes(defaultOutboundCallerId)) {
      throw new BadRequestException('기본 발신번호는 허용된 발신번호 목록에 포함되어야 합니다.');
    }

    if (dto.allowDirectSipDial && !defaultOutboundCallerId) {
      throw new BadRequestException('직접 발신을 허용하려면 기본 발신번호를 지정해야 합니다.');
    }

    const row = await this.prisma.tenantSystemSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        recordingEnabled: dto.recordingEnabled,
        defaultMaxWaitSeconds: dto.defaultMaxWaitSeconds,
        allowDirectSipDial: dto.allowDirectSipDial,
        defaultSipPassword: dto.defaultSipPassword?.trim() || null,
        allowedOutboundCallerIds: serializeAllowedCallerIds(allowedOutboundCallerIds),
        defaultOutboundCallerId,
        sipRegisterPort: dto.sipRegisterPort,
        timezone: dto.timezone,
        dateFormat: dto.dateFormat,
      } as any,
      update: {
        recordingEnabled: dto.recordingEnabled,
        defaultMaxWaitSeconds: dto.defaultMaxWaitSeconds,
        allowDirectSipDial: dto.allowDirectSipDial,
        defaultSipPassword: dto.defaultSipPassword?.trim() || null,
        allowedOutboundCallerIds: serializeAllowedCallerIds(allowedOutboundCallerIds),
        defaultOutboundCallerId,
        sipRegisterPort: dto.sipRegisterPort,
        timezone: dto.timezone,
        dateFormat: dto.dateFormat,
        updatedAt: new Date(),
      } as any,
    } as any);

    await this.prisma.tenants.update({
      where: { tenantId },
      data: { timezone: dto.timezone, updatedAt: new Date() },
    });

    await this.asteriskReloadService.executeReload(tenantId);

    return { success: true, data: row, error: null };
  }

  private async assertValidOptOutSmsTemplates(tenantId: string, profile: BranchSettingsProfile) {
    const templateIds = collectReferencedOptOutSmsTemplateIds(profile);
    if (templateIds.length === 0) {
      return;
    }

    const rows = await this.prisma.tenantSmsTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        templateId: { in: templateIds },
      },
      select: { templateId: true },
    });
    const foundIds = new Set(rows.map((row) => row.templateId));

    if (templateIds.some((templateId) => !foundIds.has(templateId))) {
      throw new BadRequestException('선택한 SMS 템플릿을 찾을 수 없습니다.');
    }
  }

  // ===========================================================================
  // Agent groups (BlueSky StaffGroup 등가)
  // ===========================================================================

  async listAgentGroups(tenantId: string) {
    const rows = await (this.prisma as any).agentGroups.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { groupName: 'asc' }],
    });

    const memberCounts = await this.prisma.agents.groupBy({
      by: ['agentGroupId'],
      where: { tenantId, agentGroupId: { not: null }, isActive: true },
      _count: { agentId: true },
    });
    const countByGroup = new Map<string, number>(
      memberCounts
        .filter((row) => row.agentGroupId)
        .map((row) => [row.agentGroupId as string, row._count.agentId]),
    );

    return {
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        memberCount: countByGroup.get(row.agentGroupId) ?? 0,
      })),
      error: null,
    };
  }

  async createAgentGroup(
    tenantId: string,
    dto: CreateAgentGroupDto,
    actor?: { agentId?: string },
  ) {
    const existing = await (this.prisma as any).agentGroups.findUnique({
      where: { tenantId_groupCode: { tenantId, groupCode: dto.groupCode } },
    });
    if (existing) {
      throw new BadRequestException('이미 존재하는 그룹 코드입니다.');
    }

    const row = await (this.prisma as any).agentGroups.create({
      data: {
        tenantId,
        groupCode: dto.groupCode,
        groupName: dto.groupName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        updatedById: actor?.agentId ?? null,
      },
    });

    return { success: true, data: row, error: null };
  }

  async updateAgentGroup(
    tenantId: string,
    agentGroupId: string,
    dto: UpdateAgentGroupDto,
    actor?: { agentId?: string },
  ) {
    if (dto.groupCode) {
      const conflict = await (this.prisma as any).agentGroups.findFirst({
        where: {
          tenantId,
          groupCode: dto.groupCode,
          NOT: { agentGroupId },
        },
      });
      if (conflict) {
        throw new BadRequestException('이미 존재하는 그룹 코드입니다.');
      }
    }

    const row = await (this.prisma as any).agentGroups.update({
      where: { agentGroupId },
      data: {
        groupCode: dto.groupCode,
        groupName: dto.groupName,
        description: dto.description,
        isActive: dto.isActive,
        updatedAt: new Date(),
        updatedById: actor?.agentId ?? null,
      },
    });

    return { success: true, data: row, error: null };
  }

  async deleteAgentGroup(tenantId: string, agentGroupId: string) {
    const target = await (this.prisma as any).agentGroups.findFirst({
      where: { tenantId, agentGroupId },
    });
    if (!target) {
      return { success: true, data: { deleted: false, agentGroupId }, error: null };
    }

    // 그룹 삭제 시 소속 상담원의 agentGroupId 는 SET NULL (FK ON DELETE SET NULL)
    await (this.prisma as any).agentGroups.delete({
      where: { agentGroupId },
    });

    return { success: true, data: { deleted: true, agentGroupId }, error: null };
  }

  // ===========================================================================
  // Agent-branch CID 발신권한 매트릭스 (BlueSky JisaPossibleAuth 등가)
  // ===========================================================================

  /** 지사 단위 매트릭스 조회 — 행=상담원, 컬럼=callerIdNumber */
  async listBranchAgentCallerIds(tenantId: string, branchId: string) {
    const branch = await this.prisma.branches.findFirst({
      where: { tenantId, branchId },
      select: { branchId: true, branchCode: true, branchName: true },
    });
    if (!branch) {
      throw new BadRequestException('지사를 찾을 수 없습니다.');
    }

    const rows = await (this.prisma as any).agentBranchCallerIds.findMany({
      where: { tenantId, branchId },
      orderBy: [{ sortOrder: 'asc' }, { callerIdNumber: 'asc' }],
    });

    const agents = await this.prisma.agents.findMany({
      where: { tenantId, isActive: true },
      orderBy: { extension: 'asc' },
      select: {
        agentId: true,
        agentCode: true,
        agentName: true,
        extension: true,
      },
    });

    return {
      success: true,
      data: { branch, agents, entries: rows },
      error: null,
    };
  }

  /** 지사 단위 bulk upsert — 매트릭스 한 번에 저장 */
  async updateBranchAgentCallerIds(
    tenantId: string,
    branchId: string,
    dto: UpdateAgentBranchCallerIdsDto,
  ) {
    const branch = await this.prisma.branches.findFirst({
      where: { tenantId, branchId },
      select: { branchId: true },
    });
    if (!branch) {
      throw new BadRequestException('지사를 찾을 수 없습니다.');
    }

    const agentIds = Array.from(new Set(dto.entries.map((e) => e.agentId)));
    if (agentIds.length > 0) {
      const validAgents = await this.prisma.agents.findMany({
        where: { tenantId, agentId: { in: agentIds } },
        select: { agentId: true },
      });
      if (validAgents.length !== agentIds.length) {
        throw new BadRequestException('알 수 없는 상담원이 포함되어 있습니다.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).agentBranchCallerIds.deleteMany({
        where: { tenantId, branchId },
      });
      if (dto.entries.length === 0) return;
      await (tx as any).agentBranchCallerIds.createMany({
        data: dto.entries.map((e) => ({
          tenantId,
          branchId,
          agentId: e.agentId,
          callerIdNumber: e.callerIdNumber,
          displayName: e.displayName ?? null,
          allowedInbound: e.allowedInbound ?? true,
          allowedOutbound: e.allowedOutbound ?? true,
          allowedTransfer: e.allowedTransfer ?? true,
          sortOrder: e.sortOrder ?? 0,
        })),
      });
    });

    return { success: true, data: { branchId, count: dto.entries.length }, error: null };
  }

  /** 상담원 시점 — 관리자 조회 (전 지사 합본) */
  async listAgentCallerIdPermissions(tenantId: string, agentId: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { tenantId, agentId },
      select: {
        agentId: true,
        agentCode: true,
        agentName: true,
        extension: true,
      },
    });
    if (!agent) {
      throw new BadRequestException('상담원을 찾을 수 없습니다.');
    }

    const rows = await (this.prisma as any).agentBranchCallerIds.findMany({
      where: { tenantId, agentId },
      include: {
        branch: { select: { branchId: true, branchCode: true, branchName: true } },
      },
      orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }],
    });

    return {
      success: true,
      data: { agent, entries: rows },
      error: null,
    };
  }

}
