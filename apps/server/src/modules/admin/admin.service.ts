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
import { QueuesService } from '../queues/queues.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAmiLogsQueryDto } from './dto/list-ami-logs-query.dto';
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
  completionPromptId: string | null;
  dtmfMenu?: BranchBlocklist080DtmfMenu;
  smartFlow?: BranchBlocklist080SmartFlow;
  smsTemplateId: string | null;
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
  recording: {
    enabled: true,
  },
  blocklist080: {
    enabled: false,
    mode: 'IMMEDIATE_OPT_OUT',
    basePromptId: null,
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
    completionPromptId: normalizeOptionalString(source.completionPromptId),
    dtmfMenu: normalizeBlocklist080DtmfMenu(source.dtmfMenu),
    smartFlow: normalizeBlocklist080SmartFlow(source.smartFlow),
    smsTemplateId: normalizeOptionalString(source.smsTemplateId),
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
  const ars = source.ars && typeof source.ars === 'object' ? source.ars as Record<string, unknown> : {};
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
      enabled: typeof ars.enabled === 'boolean' ? ars.enabled : DEFAULT_BRANCH_SETTINGS_PROFILE.ars.enabled,
      ids: normalizeStringArray(ars.ids),
    },
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

  const blocklist080 = profile.blocklist080;
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

  return [...ids];
}

function buildBranchSettingsSummary(profile: BranchSettingsProfile, counts: { queueCount: number; didCount: number }) {
  return [
    { key: 'routing', enabled: profile.routing.enabled && counts.queueCount > 0, label: '호 분배룰' },
    { key: 'forwarding', enabled: profile.forwarding.enabled && profile.forwarding.ids.length > 0, label: '착신전환' },
    { key: 'prompts', enabled: profile.prompts.enabled && profile.prompts.ids.length > 0, label: '멘트' },
    { key: 'ars', enabled: profile.ars.enabled && profile.ars.ids.length > 0, label: 'ARS' },
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

    const [total, rows] = await Promise.all([
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

    return {
      success: true,
      data: {
        rows,
        page,
        pageSize,
        total,
      },
      error: null,
    };
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
      },
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
    const row = await this.prisma.branches.create({
      data: {
        tenantId,
        branchCode: dto.branchCode,
        branchName: dto.branchName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return { success: true, data: row, error: null };
  }

  async updateBranch(tenantId: string, branchId: string, dto: UpdateBranchDto) {
    const row = await this.prisma.branches.updateMany({
      where: { tenantId, branchId },
      data: {
        ...(dto.branchCode !== undefined ? { branchCode: dto.branchCode } : {}),
        ...(dto.branchName !== undefined ? { branchName: dto.branchName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      },
    });
    return { success: true, data: { updated: row.count > 0, branchId }, error: null };
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
      },
    });

    if (!currentMappings) {
      throw new BadRequestException('지사 정보를 찾을 수 없습니다.');
    }

    const effectiveQueueIds = dto.queueIds ?? currentMappings.queueMappings.map((item) => item.queueId);
    const effectiveDidIds = dto.didIds ?? currentMappings.didMappings.map((item) => item.didId);
    const settingsProfile = dto.settingsProfile
      ? normalizeBranchSettingsProfile(dto.settingsProfile, {
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
}
