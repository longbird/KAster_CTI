import {
  ApartmentOutlined,
  AudioOutlined,
  DeleteOutlined,
  IdcardOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ShareAltOutlined,
  SoundOutlined,
  StopOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../shared/lib/apiClient';
import { formatPhoneNumber } from '../../shared/lib/format';
import {
  getForwardingRules,
  getIvrMenus,
  getPrompts,
} from '../asterisk-config/api/asteriskConfigApi';
import { CID_PROGRAM_OPTIONS, buildSmdrPayload, hydrateSmdrFormFields, type CidProgramSetting, type SmdrProfile } from './smdrSettings';

export interface BranchRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  description?: string | null;
  isActive: boolean;
  vipPromptId?: string | null;
  vipPrompt?: { id: string; promptKey: string; displayName: string } | null;
  defaultShareRuleId?: string | null;
  createdAt: string;
  agentCount?: number;
  queueCount?: number;
  didCount?: number;
  settingsProfile?: {
    routing?: { enabled: boolean };
    forwarding?: { enabled: boolean; ids?: string[] };
    prompts?: { enabled: boolean; ids?: string[]; queueJoinDelaySeconds?: number; waitForPlaybackCompletionBeforeQueue?: boolean };
    ars?: { enabled: boolean; ids?: string[] };
    recording?: { enabled: boolean };
    blocklist080?: Blocklist080ProfileFormValue;
    cid?: { enabled: boolean; defaultOutboundCallerId?: string | null };
    smdr?: SmdrProfile;
  } | null;
  settingsSummary?: Array<{
    key: string;
    label: string;
    enabled: boolean;
  }>;
}

interface QueueOption {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

interface DidOption {
  id: string;
  did: string;
  description?: string | null;
}

interface PromptOption {
  id: string;
  displayName: string;
  promptKey: string;
  category: string;
}

interface SmsTemplateOption {
  templateId: string;
  templateName: string;
  category: 'OPT_OUT_080' | 'GENERAL_NOTICE' | 'RESERVATION_ALERT';
  isActive: boolean;
}

interface PromptSelectWithPreviewProps {
  value?: string;
  onChange?: (value?: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}

type Blocklist080Mode = 'IMMEDIATE_OPT_OUT' | 'DTMF_MENU' | 'SMART_OPT_OUT';
type Blocklist080DtmfActionType = 'QUEUE_ROUTE' | 'REGISTER_OPT_OUT' | 'UNREGISTER_OPT_OUT' | 'SEND_SMS';
type Blocklist080SmartActionType = 'REGISTER_OPT_OUT' | 'REENTER_NUMBER' | 'SEND_SMS' | 'HANGUP';
type SmartArsActionType = 'QUEUE_ROUTE' | 'TRANSFER' | 'SEND_SMS' | 'OPT_OUT' | 'PLAY_PROMPT';

interface Blocklist080MappingFormValue {
  digit?: string;
  actionType?: Blocklist080DtmfActionType | Blocklist080SmartActionType;
  queueId?: string;
  smsTemplateId?: string;
}

interface Blocklist080DtmfMenuFormValue {
  timeoutSeconds?: number;
  maxRetries?: number;
  invalidPromptId?: string;
  timeoutPromptId?: string;
  mappings?: Blocklist080MappingFormValue[];
}

interface Blocklist080SmartFlowFormValue {
  inputPromptId?: string;
  reentryPromptId?: string;
  sameNumberPromptId?: string;
  confirmPrefixPromptId?: string;
  confirmSuffixPromptId?: string;
  confirmMenuPromptId?: string;
  failurePromptId?: string;
  finalPromptId?: string;
  inputTimeoutSeconds?: number;
  maxRetries?: number;
  confirmationMappings?: Blocklist080MappingFormValue[];
}

interface Blocklist080ProfileFormValue {
  enabled: boolean;
  mode?: Blocklist080Mode;
  basePromptId?: string;
  basePromptInputDelaySeconds?: number;
  completionPromptId?: string;
  smsTemplateId?: string;
  dtmfMenu?: Blocklist080DtmfMenuFormValue;
  smartFlow?: Blocklist080SmartFlowFormValue;
}

interface SmartArsActionFormValue {
  digit?: string;
  actionType?: SmartArsActionType;
  queueId?: string;
  transferNumber?: string;
  smsTemplateId?: string;
  promptId?: string;
}

interface SmartArsProfileFormValue {
  enabled: boolean;
  guidePromptId?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
  failPromptId?: string;
  invalidPromptId?: string;
  actions?: SmartArsActionFormValue[];
}

interface IvrMenuOption {
  id: string;
  name: string;
  timeoutSecs: number;
}

interface ForwardingRuleOption {
  id: string;
  forwardType: 'EXTENSION' | 'QUEUE' | 'EXTERNAL_NUMBER';
  targetValue: string;
  conditionType: 'ALWAYS' | 'TIME_RANGE';
  did: {
    id: string;
    did: string;
    description?: string | null;
  };
}

interface BranchSettingsProfile {
  routing?: {
    enabled: boolean;
    representativeDidId?: string | null;
    rules?: RoutingRuleFormValue[];
  };
  forwarding?: { enabled: boolean; ids?: string[] };
  prompts?: { enabled: boolean; ids?: string[]; queueJoinDelaySeconds?: number; waitForPlaybackCompletionBeforeQueue?: boolean };
  ars?: { enabled: boolean; ids?: string[] };
  smartArs?: SmartArsProfileFormValue;
  recording?: { enabled: boolean };
  blocklist080?: Blocklist080ProfileFormValue;
  cid?: { enabled: boolean; defaultOutboundCallerId?: string | null };
  smdr?: SmdrProfile;
}

interface MappingResponse {
  branch: {
    branchId: string;
    branchCode: string;
    branchName: string;
    description?: string | null;
    isActive: boolean;
    vipPromptId?: string | null;
    defaultShareRuleId?: string | null;
  } | null;
  assignedQueueIds: string[];
  assignedDidIds: string[];
  settingsProfile?: BranchSettingsProfile;
  availableQueues: QueueOption[];
  availableDids: DidOption[];
  availablePrompts: PromptOption[];
  availableIvrMenus: IvrMenuOption[];
  availableForwardingRules: ForwardingRuleOption[];
  availableSmsTemplates: SmsTemplateOption[];
  availableCallerIds: string[];
  defaultSystemRecordingEnabled: boolean;
  defaultSystemCallerId: string | null;
}

interface BranchConfigFormValue {
  branchCode: string;
  branchName: string;
  description?: string;
  isActive: boolean;
  vipPromptId?: string;
  defaultShareRuleId?: string;
  queueIds: string[];
  didIds: string[];
  representativeDidId?: string;
  routingEnabled: boolean;
  routingRules: RoutingRuleFormValue[];
  forwardingEnabled: boolean;
  forwardingRuleIds: string[];
  promptsEnabled: boolean;
  defaultPromptId?: string;
  promptQueueJoinDelaySeconds: number;
  waitForPromptCompletionBeforeQueue: boolean;
  smartArsEnabled: boolean;
  smartArsGuidePromptId?: string;
  smartArsTimeoutSeconds: number;
  smartArsMaxRetries: number;
  smartArsFailPromptId?: string;
  smartArsInvalidPromptId?: string;
  smartArsActions: SmartArsActionFormValue[];
  recordingEnabled: boolean;
  blocklist080Enabled: boolean;
  blocklist080Mode: Blocklist080Mode;
  blocklist080BasePromptId?: string;
  blocklist080BasePromptInputDelaySeconds: number;
  blocklist080CompletionPromptId?: string;
  blocklist080SmsTemplateId?: string;
  blocklist080DtmfTimeoutSeconds: number;
  blocklist080DtmfMaxRetries: number;
  blocklist080DtmfInvalidPromptId?: string;
  blocklist080DtmfTimeoutPromptId?: string;
  blocklist080DtmfMappings: Blocklist080MappingFormValue[];
  blocklist080SmartInputPromptId?: string;
  blocklist080SmartReentryPromptId?: string;
  blocklist080SmartSameNumberPromptId?: string;
  blocklist080SmartConfirmPrefixPromptId?: string;
  blocklist080SmartConfirmSuffixPromptId?: string;
  blocklist080SmartConfirmMenuPromptId?: string;
  blocklist080SmartFailurePromptId?: string;
  blocklist080SmartFinalPromptId?: string;
  blocklist080SmartInputTimeoutSeconds: number;
  blocklist080SmartMaxRetries: number;
  blocklist080SmartConfirmationMappings: Blocklist080MappingFormValue[];
  cidEnabled: boolean;
  defaultOutboundCallerId?: string;
  smdrEnabled: boolean;
  smdrPrograms: CidProgramSetting[];
}

interface Props {
  open: boolean;
  branch?: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}

type RoutingConditionType = 'ALWAYS' | 'TIME_RANGE';
type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface RoutingRuleFormValue {
  queueId: string;
  conditionType: RoutingConditionType;
  timeStart?: string;
  timeEnd?: string;
  daysOfWeek: WeekdayCode[];
}

const FORWARD_TYPE_LABEL: Record<string, string> = {
  EXTENSION: '내선',
  QUEUE: '호 분배룰',
  EXTERNAL_NUMBER: '외부 번호',
};

const WEEKDAY_OPTIONS: Array<{ value: WeekdayCode; label: string }> = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
];

const TIME_TEXT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIGIT_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  value: String(index),
  label: `${index}번`,
}));
const SMART_ARS_DIGIT_OPTIONS = [
  ...DIGIT_OPTIONS,
  { value: '*', label: '* 키' },
  { value: '#', label: '# 키' },
];
const BLOCKLIST080_MODE_OPTIONS: Array<{ value: Blocklist080Mode; label: string }> = [
  { value: 'IMMEDIATE_OPT_OUT', label: '즉시 수신거부 등록' },
  { value: 'DTMF_MENU', label: '일반 DTMF 선택형' },
  { value: 'SMART_OPT_OUT', label: '스마트 수신거부' },
];
const BLOCKLIST080_DTMF_ACTION_OPTIONS: Array<{ value: Blocklist080DtmfActionType; label: string }> = [
  { value: 'QUEUE_ROUTE', label: '상담원 연결' },
  { value: 'REGISTER_OPT_OUT', label: '수신거부 등록' },
  { value: 'UNREGISTER_OPT_OUT', label: '수신거부 해제' },
];
const BLOCKLIST080_SMART_ACTION_OPTIONS: Array<{ value: Blocklist080SmartActionType; label: string }> = [
  { value: 'REGISTER_OPT_OUT', label: '수신거부 등록' },
  { value: 'REENTER_NUMBER', label: '재입력' },
  { value: 'HANGUP', label: '통화 종료' },
];
const SMART_ARS_ACTION_OPTIONS: Array<{ value: SmartArsActionType; label: string }> = [
  { value: 'QUEUE_ROUTE', label: '상담원 연결' },
  { value: 'TRANSFER', label: '착신전환' },
  { value: 'OPT_OUT', label: '문자수신거부' },
  { value: 'PLAY_PROMPT', label: '멘트 재생' },
];

function PromptSelectWithPreview({
  value,
  onChange,
  disabled,
  options,
  placeholder,
}: PromptSelectWithPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const stopCurrentAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const handlePreview = async () => {
    if (!value) return;
    try {
      stopCurrentAudio();
      setPlaying(true);
      const res = await apiClient.get(`/asterisk-config/prompts/${value}/stream`, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(res.data);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        message.error('멘트 파일을 재생할 수 없습니다.');
      };
      await audio.play();
    } catch {
      setPlaying(false);
      message.error('멘트 파일을 불러오지 못했습니다.');
    }
  };

  return (
    <div className="branch-edit-modal__prompt-preview-control">
      <Select
        allowClear
        showSearch
        disabled={disabled}
        options={options}
        optionFilterProp="label"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <Tooltip title="선택한 멘트 미리듣기">
        <Button
          icon={<PlayCircleOutlined />}
          disabled={disabled || !value}
          loading={playing}
          onClick={handlePreview}
        />
      </Tooltip>
    </div>
  );
}
const SMS_TEMPLATE_CATEGORY_LABEL: Record<SmsTemplateOption['category'], string> = {
  OPT_OUT_080: '080 수신거부',
  GENERAL_NOTICE: '일반 안내',
  RESERVATION_ALERT: '예약·알림',
};

const SECTIONS = [
  { key: 'basic', label: '기본 정보', icon: <ApartmentOutlined /> },
  { key: 'routing', label: '호 분배룰', icon: <ShareAltOutlined /> },
  { key: 'forwarding', label: '착신전환', icon: <SwapOutlined /> },
  { key: 'prompts', label: '멘트', icon: <SoundOutlined /> },
  { key: 'smartArs', label: '스마트 ARS', icon: <OrderedListOutlined /> },
  { key: 'recording', label: '녹취', icon: <AudioOutlined /> },
  { key: 'blocklist', label: '080 수신거부', icon: <StopOutlined /> },
  { key: 'cid', label: 'CID 연동', icon: <IdcardOutlined /> },
] as const;

function buildDefaultRoutingRule(queueId: string, conditionType: RoutingConditionType = 'ALWAYS'): RoutingRuleFormValue {
  return {
    queueId,
    conditionType,
    timeStart: undefined,
    timeEnd: undefined,
    daysOfWeek: [],
  };
}

function normalizeRoutingRulesForForm(
  queueIds: string[],
  rules?: RoutingRuleFormValue[],
): RoutingRuleFormValue[] {
  const ruleMap = new Map((rules ?? []).map((rule) => [rule.queueId, rule]));

  return queueIds.map((queueId, index) => {
    const existing = ruleMap.get(queueId);
    if (existing) {
      return {
        queueId,
        conditionType: existing.conditionType === 'TIME_RANGE' ? 'TIME_RANGE' : 'ALWAYS',
        timeStart: existing.timeStart ?? undefined,
        timeEnd: existing.timeEnd ?? undefined,
        daysOfWeek: existing.daysOfWeek ?? [],
      };
    }

    return buildDefaultRoutingRule(queueId, index === 0 ? 'ALWAYS' : 'TIME_RANGE');
  });
}

function normalizeOptionalText(value?: string | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeNullableText(value?: string | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createEmptyBlocklist080Mapping(): Blocklist080MappingFormValue {
  return {
    digit: undefined,
    actionType: undefined,
    queueId: undefined,
    smsTemplateId: undefined,
  };
}

function buildEmptyBlocklist080Mappings(): Blocklist080MappingFormValue[] {
  return [];
}

function createEmptySmartArsAction(): SmartArsActionFormValue {
  return {
    digit: undefined,
    actionType: undefined,
    queueId: undefined,
    transferNumber: undefined,
    smsTemplateId: undefined,
    promptId: undefined,
  };
}

function buildEmptySmartArsActions(): SmartArsActionFormValue[] {
  return [];
}

export function buildSmartArsAvailableActionCombinations(options: {
  queueIds: string[];
  promptIds: string[];
}): SmartArsActionFormValue[] {
  const actions: SmartArsActionFormValue[] = [];
  let nextDigit = 0;

  const push = (action: SmartArsActionFormValue) => {
    actions.push({ digit: String(nextDigit), ...action });
    nextDigit += 1;
  };

  const firstQueueId = options.queueIds[0];
  if (firstQueueId) {
    push({ actionType: 'QUEUE_ROUTE', queueId: firstQueueId });
  }

  push({ actionType: 'OPT_OUT' });

  const firstPromptId = options.promptIds[0];
  if (firstPromptId) {
    push({ actionType: 'PLAY_PROMPT', promptId: firstPromptId });
  }

  return actions;
}

function hydrateSmartArsActions(actions?: SmartArsActionFormValue[]): SmartArsActionFormValue[] {
  return (actions ?? []).map((action) => ({
    digit: normalizeOptionalText(action.digit),
    actionType: action.actionType,
    queueId: normalizeOptionalText(action.queueId),
    transferNumber: normalizeOptionalText(action.transferNumber),
    smsTemplateId: normalizeOptionalText(action.smsTemplateId),
    promptId: normalizeOptionalText(action.promptId),
  }));
}

function hydrateConfiguredBlocklist080Mappings(
  mappings?: Blocklist080MappingFormValue[],
): Blocklist080MappingFormValue[] {
  return (mappings ?? []).map((mapping) => ({
    digit: normalizeOptionalText(mapping.digit),
    actionType: mapping.actionType,
    queueId: normalizeOptionalText(mapping.queueId),
    smsTemplateId: normalizeOptionalText(mapping.smsTemplateId),
  }));
}

function buildConfiguredBlocklist080Mappings(
  mappings?: Blocklist080MappingFormValue[],
): Array<{
  digit: string;
  actionType: Blocklist080DtmfActionType | Blocklist080SmartActionType;
  queueId: string | null;
  smsTemplateId: string | null;
}> {
  return (mappings ?? [])
    .filter(
      (
        mapping,
      ): mapping is Blocklist080MappingFormValue & {
        digit: string;
        actionType: Blocklist080DtmfActionType | Blocklist080SmartActionType;
      } => Boolean(mapping.digit && mapping.actionType),
    )
    .map((mapping) => ({
      digit: mapping.digit,
      actionType: mapping.actionType,
      queueId: mapping.actionType === 'QUEUE_ROUTE' ? normalizeNullableText(mapping.queueId) : null,
      smsTemplateId: normalizeNullableText(mapping.smsTemplateId),
    }));
}

function buildBlocklist080Payload(values: BranchConfigFormValue) {
  const dtmfMappings = buildConfiguredBlocklist080Mappings(values.blocklist080DtmfMappings);
  const smartMappings = buildConfiguredBlocklist080Mappings(values.blocklist080SmartConfirmationMappings);

  return {
    enabled: values.blocklist080Enabled,
    mode: values.blocklist080Mode,
    basePromptId: normalizeNullableText(values.blocklist080BasePromptId),
    basePromptInputDelaySeconds: Math.max(0, Math.trunc(values.blocklist080BasePromptInputDelaySeconds ?? 0)),
    completionPromptId: normalizeNullableText(values.blocklist080CompletionPromptId),
    smsTemplateId: normalizeNullableText(values.blocklist080SmsTemplateId),
    dtmfMenu:
      values.blocklist080Mode === 'DTMF_MENU'
        ? {
            timeoutSeconds: Math.max(0, Math.trunc(values.blocklist080DtmfTimeoutSeconds ?? 0)),
            maxRetries: Math.max(0, Math.trunc(values.blocklist080DtmfMaxRetries ?? 0)),
            invalidPromptId: normalizeNullableText(values.blocklist080DtmfInvalidPromptId),
            timeoutPromptId: normalizeNullableText(values.blocklist080DtmfTimeoutPromptId),
            mappings: dtmfMappings,
          }
        : undefined,
    smartFlow:
      values.blocklist080Mode === 'SMART_OPT_OUT'
        ? {
            inputPromptId: normalizeNullableText(values.blocklist080SmartInputPromptId),
            reentryPromptId: normalizeNullableText(values.blocklist080SmartReentryPromptId),
            sameNumberPromptId: normalizeNullableText(values.blocklist080SmartSameNumberPromptId),
            confirmPrefixPromptId: normalizeNullableText(values.blocklist080SmartConfirmPrefixPromptId),
            confirmSuffixPromptId: normalizeNullableText(values.blocklist080SmartConfirmSuffixPromptId),
            confirmMenuPromptId: normalizeNullableText(values.blocklist080SmartConfirmMenuPromptId),
            failurePromptId: normalizeNullableText(values.blocklist080SmartFailurePromptId),
            finalPromptId: normalizeNullableText(values.blocklist080SmartFinalPromptId),
            inputTimeoutSeconds: Math.max(0, Math.trunc(values.blocklist080SmartInputTimeoutSeconds ?? 0)),
            maxRetries: Math.max(0, Math.trunc(values.blocklist080SmartMaxRetries ?? 0)),
            confirmationMappings: smartMappings.map((mapping) => ({
              ...mapping,
              queueId: null,
            })),
          }
        : undefined,
  };
}

function buildSmartArsPayload(values: BranchConfigFormValue): SmartArsProfileFormValue {
  const actions = (values.smartArsActions ?? [])
    .filter(
      (
        action,
      ): action is SmartArsActionFormValue & { digit: string; actionType: SmartArsActionType } =>
        Boolean(action.digit && action.actionType),
    )
    .map((action) => ({
      digit: action.digit,
      actionType: action.actionType,
      queueId: action.actionType === 'QUEUE_ROUTE' ? normalizeOptionalText(action.queueId) : undefined,
      transferNumber: action.actionType === 'TRANSFER' ? normalizeOptionalText(action.transferNumber) : undefined,
      smsTemplateId: action.actionType === 'SEND_SMS' ? normalizeOptionalText(action.smsTemplateId) : undefined,
      promptId: action.actionType === 'PLAY_PROMPT' ? normalizeOptionalText(action.promptId) : undefined,
    }));

  return {
    enabled: values.smartArsEnabled,
    guidePromptId: normalizeOptionalText(values.smartArsGuidePromptId),
    timeoutSeconds: Math.max(1, Math.min(15, Math.trunc(values.smartArsTimeoutSeconds ?? 5))),
    maxRetries: Math.max(0, Math.min(10, Math.trunc(values.smartArsMaxRetries ?? 2))),
    failPromptId: normalizeOptionalText(values.smartArsFailPromptId),
    invalidPromptId: normalizeOptionalText(values.smartArsInvalidPromptId),
    actions,
  };
}

function validateSmartArsValues(values: BranchConfigFormValue, selectedQueueIds: string[]): string | null {
  if (!values.smartArsEnabled) {
    return null;
  }

  if (!normalizeOptionalText(values.smartArsGuidePromptId)) {
    return '스마트 ARS 안내 멘트를 선택하세요.';
  }

  const actions = (values.smartArsActions ?? []).filter((action) => action.digit || action.actionType);
  if (actions.length === 0) {
    return '스마트 ARS 동작을 최소 1개 설정하세요.';
  }

  const digits = new Set<string>();
  for (const action of actions) {
    if (!action.digit || !/^[0-9*#]$/.test(action.digit)) {
      return '스마트 ARS DTMF 키는 0-9, *, #만 사용할 수 있습니다.';
    }
    if (digits.has(action.digit)) {
      return '스마트 ARS DTMF 키가 중복되었습니다.';
    }
    digits.add(action.digit);

    if (!action.actionType) {
      return `${action.digit}번 스마트 ARS 동작을 선택하세요.`;
    }
    if (action.actionType === 'QUEUE_ROUTE') {
      if (!action.queueId) {
        return `${action.digit}번 상담원 연결에는 호 분배룰이 필요합니다.`;
      }
      if (!selectedQueueIds.includes(action.queueId)) {
        return '스마트 ARS 상담원 연결은 현재 지사에 연결된 호 분배룰만 선택할 수 있습니다.';
      }
    }
    if (action.actionType === 'TRANSFER' && !normalizeOptionalText(action.transferNumber)) {
      return `${action.digit}번 착신전환에는 전화번호가 필요합니다.`;
    }
    if (action.actionType === 'SEND_SMS' && !action.smsTemplateId) {
      return `${action.digit}번 SMS 발송에는 문자 템플릿이 필요합니다.`;
    }
    if (action.actionType === 'SEND_SMS') {
      return 'SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.';
    }
    if (action.actionType === 'PLAY_PROMPT' && !action.promptId) {
      return `${action.digit}번 멘트 재생에는 재생할 멘트가 필요합니다.`;
    }
  }

  return null;
}

function validateBlocklist080Values(values: BranchConfigFormValue, selectedQueueIds: string[]): string | null {
  if (!values.blocklist080Enabled) {
    return null;
  }

  if (!normalizeNullableText(values.blocklist080BasePromptId)) {
    return '080 수신거부 시작 멘트를 선택하세요.';
  }

  if (values.blocklist080Mode === 'IMMEDIATE_OPT_OUT' || values.blocklist080Mode === 'DTMF_MENU') {
    if (!normalizeNullableText(values.blocklist080CompletionPromptId)) {
      return '즉시/DTMF 모드에서는 완료 멘트를 선택해야 합니다.';
    }
  }

  if (values.blocklist080Mode === 'DTMF_MENU') {
    const dtmfMappings = buildConfiguredBlocklist080Mappings(values.blocklist080DtmfMappings);
    if (dtmfMappings.length === 0) {
      return 'DTMF 메뉴 모드에서는 최소 1개의 숫자 동작을 설정하세요.';
    }
    if (new Set(dtmfMappings.map((mapping) => mapping.digit)).size !== dtmfMappings.length) {
      return '일반 DTMF 선택형에서는 같은 숫자를 중복해서 사용할 수 없습니다.';
    }
    for (const mapping of dtmfMappings) {
      if (mapping.actionType !== 'QUEUE_ROUTE') {
        if (mapping.actionType === 'SEND_SMS') {
          return 'SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.';
        }
        continue;
      }
      if (!mapping.queueId) {
        return `${mapping.digit}번 큐 연결에는 연결할 호 분배룰이 필요합니다.`;
      }
      if (!selectedQueueIds.includes(mapping.queueId)) {
        return '080 수신거부 큐 연결은 현재 지사에 연결된 호 분배룰만 선택할 수 있습니다.';
      }
    }
  }

  if (values.blocklist080Mode === 'SMART_OPT_OUT') {
    const smartMappings = buildConfiguredBlocklist080Mappings(values.blocklist080SmartConfirmationMappings);
    if (!normalizeNullableText(values.blocklist080SmartInputPromptId)) {
      return '스마트 수신거부 입력 안내 멘트를 선택하세요.';
    }
    if (!normalizeNullableText(values.blocklist080SmartConfirmMenuPromptId)) {
      return '스마트 수신거부 확인 메뉴 멘트를 선택하세요.';
    }
    if (!normalizeNullableText(values.blocklist080SmartFinalPromptId)) {
      return '스마트 수신거부 최종 안내 멘트를 선택하세요.';
    }
    if (smartMappings.length === 0) {
      return '스마트 수신거부 모드에서는 최소 1개의 확인 숫자 동작을 설정하세요.';
    }
    if (new Set(smartMappings.map((mapping) => mapping.digit)).size !== smartMappings.length) {
      return '스마트 수신거부 최종 확인에서는 같은 숫자를 중복해서 사용할 수 없습니다.';
    }
    if (smartMappings.some((mapping) => mapping.actionType === 'SEND_SMS')) {
      return 'SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.';
    }
  }

  return null;
}

function buildCreateDefaults(): BranchConfigFormValue {
  return {
    branchCode: '',
    branchName: '',
    description: '',
    isActive: true,
    queueIds: [],
    didIds: [],
    representativeDidId: undefined,
    routingEnabled: false,
    routingRules: [],
    forwardingEnabled: false,
    forwardingRuleIds: [],
    promptsEnabled: true,
    defaultPromptId: undefined,
    promptQueueJoinDelaySeconds: 0,
    waitForPromptCompletionBeforeQueue: false,
    smartArsEnabled: false,
    smartArsGuidePromptId: undefined,
    smartArsTimeoutSeconds: 5,
    smartArsMaxRetries: 2,
    smartArsFailPromptId: undefined,
    smartArsInvalidPromptId: undefined,
    smartArsActions: buildEmptySmartArsActions(),
    recordingEnabled: true,
    blocklist080Enabled: false,
    blocklist080Mode: 'IMMEDIATE_OPT_OUT',
    blocklist080BasePromptId: undefined,
    blocklist080BasePromptInputDelaySeconds: 0,
    blocklist080CompletionPromptId: undefined,
    blocklist080SmsTemplateId: undefined,
    blocklist080DtmfTimeoutSeconds: 0,
    blocklist080DtmfMaxRetries: 0,
    blocklist080DtmfInvalidPromptId: undefined,
    blocklist080DtmfTimeoutPromptId: undefined,
    blocklist080DtmfMappings: buildEmptyBlocklist080Mappings(),
    blocklist080SmartInputPromptId: undefined,
    blocklist080SmartReentryPromptId: undefined,
    blocklist080SmartSameNumberPromptId: undefined,
    blocklist080SmartConfirmPrefixPromptId: undefined,
    blocklist080SmartConfirmSuffixPromptId: undefined,
    blocklist080SmartConfirmMenuPromptId: undefined,
    blocklist080SmartFailurePromptId: undefined,
    blocklist080SmartFinalPromptId: undefined,
    blocklist080SmartInputTimeoutSeconds: 0,
    blocklist080SmartMaxRetries: 0,
    blocklist080SmartConfirmationMappings: buildEmptyBlocklist080Mappings(),
    cidEnabled: false,
    defaultOutboundCallerId: undefined,
    ...hydrateSmdrFormFields(),
  };
}

function buildInitialValues(branch: BranchRow | null | undefined, mapping: MappingResponse | null): BranchConfigFormValue {
  const defaults = buildCreateDefaults();
  const didIds = mapping?.assignedDidIds ?? [];
  const queueIds = mapping?.assignedQueueIds ?? [];
  const optOut = mapping?.settingsProfile?.blocklist080;
  const smartArs = mapping?.settingsProfile?.smartArs;
  const storedRoutingEnabled = mapping?.settingsProfile?.routing?.enabled;
  const smdr = hydrateSmdrFormFields(mapping?.settingsProfile?.smdr);
  return {
    ...defaults,
    branchCode: mapping?.branch?.branchCode ?? branch?.branchCode ?? '',
    branchName: mapping?.branch?.branchName ?? branch?.branchName ?? '',
    description: mapping?.branch?.description ?? branch?.description ?? '',
    isActive: mapping?.branch?.isActive ?? branch?.isActive ?? true,
    vipPromptId: mapping?.branch?.vipPromptId ?? branch?.vipPromptId ?? undefined,
    defaultShareRuleId:
      mapping?.branch?.defaultShareRuleId ?? branch?.defaultShareRuleId ?? undefined,
    queueIds,
    didIds,
    representativeDidId:
      mapping?.settingsProfile?.routing?.representativeDidId ??
      (didIds.length === 1 ? didIds[0] : undefined),
    routingEnabled: queueIds.length > 0 ? (storedRoutingEnabled ?? true) : false,
    routingRules: normalizeRoutingRulesForForm(queueIds, mapping?.settingsProfile?.routing?.rules),
    forwardingEnabled: mapping?.settingsProfile?.forwarding?.enabled ?? false,
    forwardingRuleIds: mapping?.settingsProfile?.forwarding?.ids ?? [],
    promptsEnabled: mapping?.settingsProfile?.prompts?.enabled ?? true,
    defaultPromptId: mapping?.settingsProfile?.prompts?.ids?.[0] ?? undefined,
    promptQueueJoinDelaySeconds: mapping?.settingsProfile?.prompts?.queueJoinDelaySeconds ?? 0,
    waitForPromptCompletionBeforeQueue:
      mapping?.settingsProfile?.prompts?.waitForPlaybackCompletionBeforeQueue ?? false,
    smartArsEnabled: smartArs?.enabled ?? false,
    smartArsGuidePromptId: normalizeOptionalText(smartArs?.guidePromptId),
    smartArsTimeoutSeconds: smartArs?.timeoutSeconds ?? 5,
    smartArsMaxRetries: smartArs?.maxRetries ?? 2,
    smartArsFailPromptId: normalizeOptionalText(smartArs?.failPromptId),
    smartArsInvalidPromptId: normalizeOptionalText(smartArs?.invalidPromptId),
    smartArsActions: hydrateSmartArsActions(smartArs?.actions),
    recordingEnabled: mapping?.settingsProfile?.recording?.enabled ?? mapping?.defaultSystemRecordingEnabled ?? true,
    blocklist080Enabled: optOut?.enabled ?? false,
    blocklist080Mode: optOut?.mode ?? 'IMMEDIATE_OPT_OUT',
    blocklist080BasePromptId: normalizeOptionalText(optOut?.basePromptId),
    blocklist080BasePromptInputDelaySeconds: optOut?.basePromptInputDelaySeconds ?? 0,
    blocklist080CompletionPromptId: normalizeOptionalText(optOut?.completionPromptId),
    blocklist080SmsTemplateId: normalizeOptionalText(optOut?.smsTemplateId),
    blocklist080DtmfTimeoutSeconds: optOut?.dtmfMenu?.timeoutSeconds ?? 0,
    blocklist080DtmfMaxRetries: optOut?.dtmfMenu?.maxRetries ?? 0,
    blocklist080DtmfInvalidPromptId: normalizeOptionalText(optOut?.dtmfMenu?.invalidPromptId),
    blocklist080DtmfTimeoutPromptId: normalizeOptionalText(optOut?.dtmfMenu?.timeoutPromptId),
    blocklist080DtmfMappings: hydrateConfiguredBlocklist080Mappings(optOut?.dtmfMenu?.mappings),
    blocklist080SmartInputPromptId: normalizeOptionalText(optOut?.smartFlow?.inputPromptId),
    blocklist080SmartReentryPromptId: normalizeOptionalText(optOut?.smartFlow?.reentryPromptId),
    blocklist080SmartSameNumberPromptId: normalizeOptionalText(optOut?.smartFlow?.sameNumberPromptId),
    blocklist080SmartConfirmPrefixPromptId: normalizeOptionalText(optOut?.smartFlow?.confirmPrefixPromptId),
    blocklist080SmartConfirmSuffixPromptId: normalizeOptionalText(optOut?.smartFlow?.confirmSuffixPromptId),
    blocklist080SmartConfirmMenuPromptId: normalizeOptionalText(optOut?.smartFlow?.confirmMenuPromptId),
    blocklist080SmartFailurePromptId: normalizeOptionalText(optOut?.smartFlow?.failurePromptId),
    blocklist080SmartFinalPromptId: normalizeOptionalText(optOut?.smartFlow?.finalPromptId),
    blocklist080SmartInputTimeoutSeconds: optOut?.smartFlow?.inputTimeoutSeconds ?? 0,
    blocklist080SmartMaxRetries: optOut?.smartFlow?.maxRetries ?? 0,
    blocklist080SmartConfirmationMappings: hydrateConfiguredBlocklist080Mappings(optOut?.smartFlow?.confirmationMappings),
    cidEnabled: mapping?.settingsProfile?.cid?.enabled ?? false,
    defaultOutboundCallerId:
      mapping?.settingsProfile?.cid?.defaultOutboundCallerId ?? mapping?.defaultSystemCallerId ?? undefined,
    ...smdr,
  };
}

function renderFieldLabel(label: string, helpText?: string) {
  if (!helpText) {
    return label;
  }

  return (
    <span className="branch-edit-modal__field-label">
      <span>{label}</span>
      <Tooltip title={helpText}>
        <QuestionCircleOutlined className="branch-edit-modal__field-help" />
      </Tooltip>
    </span>
  );
}

export function BranchEditModal({ open, branch, onClose, onSaved }: Props) {
  const [form] = Form.useForm<BranchConfigFormValue>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingData, setMappingData] = useState<MappingResponse | null>(null);
  const [shareRuleOptions, setShareRuleOptions] = useState<
    Array<{ shareRuleId: string; ruleCode: string; ruleName: string; isActive: boolean }>
  >([]);

  useEffect(() => {
    if (!open) return;
    void apiClient
      .get('/admin/settings/share-rules')
      .then((res) => {
        setShareRuleOptions(
          (res.data?.data ?? []).filter((r: any) => r.isActive !== false),
        );
      })
      .catch(() => setShareRuleOptions([]));
  }, [open]);
  const navigate = useNavigate();
  const isEdit = !!branch?.branchId;
  const [activeSection, setActiveSection] = useState<string>('basic');
  const routingQueueSyncRef = useRef(false);
  const previousQueueCountRef = useRef(0);

  useEffect(() => {
    if (open) {
      setActiveSection('basic');
      routingQueueSyncRef.current = false;
      previousQueueCountRef.current = 0;
    }
  }, [open]);

  const routingEnabled = Form.useWatch('routingEnabled', form) ?? false;
  const selectedQueueIds = Form.useWatch('queueIds', form) ?? [];
  const selectedDidIds = Form.useWatch('didIds', form) ?? [];
  const routingRules = Form.useWatch('routingRules', form) ?? [];
  const forwardingEnabled = Form.useWatch('forwardingEnabled', form) ?? false;
  const promptsEnabled = Form.useWatch('promptsEnabled', form) ?? true;
  const defaultPromptId = Form.useWatch('defaultPromptId', form);
  const smartArsEnabled = Form.useWatch('smartArsEnabled', form) ?? false;
  const smartArsActions = Form.useWatch('smartArsActions', form) ?? buildEmptySmartArsActions();
  const recordingEnabled = Form.useWatch('recordingEnabled', form) ?? true;
  const blocklist080Enabled = Form.useWatch('blocklist080Enabled', form) ?? false;
  const blocklist080Mode = Form.useWatch('blocklist080Mode', form) ?? 'IMMEDIATE_OPT_OUT';
  const blocklist080DtmfMappings = Form.useWatch('blocklist080DtmfMappings', form) ?? buildEmptyBlocklist080Mappings();
  const blocklist080SmartConfirmationMappings =
    Form.useWatch('blocklist080SmartConfirmationMappings', form) ?? buildEmptyBlocklist080Mappings();
  const cidEnabled = Form.useWatch('cidEnabled', form) ?? false;
  const smdrEnabled = Form.useWatch('smdrEnabled', form) ?? false;

  const enabledByKey: Record<string, boolean | undefined> = {
    basic: undefined,
    routing: routingEnabled,
    forwarding: forwardingEnabled,
    prompts: promptsEnabled,
    smartArs: smartArsEnabled,
    recording: recordingEnabled,
    blocklist: blocklist080Enabled,
    cid: cidEnabled || smdrEnabled,
  };
  const enabledCount = [
    routingEnabled,
    forwardingEnabled,
    promptsEnabled,
    smartArsEnabled,
    recordingEnabled,
    blocklist080Enabled,
    cidEnabled || smdrEnabled,
  ].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      try {
        if (branch?.branchId) {
          const res = await apiClient.get(`/admin/settings/branches/${branch.branchId}/mappings`);
          const next = (res.data?.data ?? null) as MappingResponse | null;
          setMappingData(next);
          form.setFieldsValue(buildInitialValues(branch, next));
          return;
        }

        const [queuesRes, didsRes, prompts, ivrMenus, forwardingRules, systemRes, smsTemplatesRes] = await Promise.all([
          apiClient.get('/queues'),
          apiClient.get('/asterisk-config/dids'),
          getPrompts(),
          getIvrMenus(),
          getForwardingRules(),
          apiClient.get('/admin/settings/system'),
          apiClient.get('/sms-templates', {
            params: {
              isActive: 'true',
            },
          }),
        ]);

        const next: MappingResponse = {
          branch: null,
          assignedQueueIds: [],
          assignedDidIds: [],
          settingsProfile: undefined,
          availableQueues: (queuesRes.data?.data ?? []).filter((queue: QueueOption & { isActive?: boolean }) => (queue as any).isActive !== false),
          availableDids: (didsRes.data?.data ?? []).filter((did: DidOption & { enabled?: boolean }) => did.enabled !== false),
          availablePrompts: prompts.filter((prompt) => prompt.isActive !== false),
          availableIvrMenus: ivrMenus,
          availableForwardingRules: forwardingRules.filter((rule) => rule.enabled !== false),
          availableSmsTemplates: smsTemplatesRes.data?.data ?? [],
          availableCallerIds: String(systemRes.data?.data?.allowedOutboundCallerIds ?? '')
            .split(/\r?\n|,/)
            .map((item: string) => item.trim())
            .filter(Boolean),
          defaultSystemRecordingEnabled: systemRes.data?.data?.recordingEnabled ?? true,
          defaultSystemCallerId: systemRes.data?.data?.defaultOutboundCallerId ?? null,
        };
        setMappingData(next);
        form.setFieldsValue(buildInitialValues(branch, next));
      } catch (error: any) {
        setMappingData(null);
        message.error(error?.response?.data?.error?.message ?? '지사 설정 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, branch?.branchId, form]);

  useEffect(() => {
    const nextRules = normalizeRoutingRulesForForm(selectedQueueIds, routingRules);
    if (JSON.stringify(nextRules) !== JSON.stringify(routingRules)) {
      form.setFieldValue('routingRules', nextRules);
    }
  }, [form, routingRules, selectedQueueIds]);

  useEffect(() => {
    const nextQueueCount = selectedQueueIds.length;

    if (!routingQueueSyncRef.current) {
      routingQueueSyncRef.current = true;
      previousQueueCountRef.current = nextQueueCount;
      return;
    }

    const previousQueueCount = previousQueueCountRef.current;
    if (nextQueueCount === 0 && routingEnabled) {
      form.setFieldValue('routingEnabled', false);
    } else if (previousQueueCount === 0 && nextQueueCount > 0 && !routingEnabled) {
      form.setFieldValue('routingEnabled', true);
    }

    previousQueueCountRef.current = nextQueueCount;
  }, [form, routingEnabled, selectedQueueIds.length]);

  useEffect(() => {
    const currentRepresentativeDidId = form.getFieldValue('representativeDidId') as string | undefined;
    if (currentRepresentativeDidId && selectedDidIds.includes(currentRepresentativeDidId)) {
      return;
    }

    form.setFieldValue(
      'representativeDidId',
      selectedDidIds.length === 1 ? selectedDidIds[0] : undefined,
    );
  }, [form, selectedDidIds]);

  const queueOptions = useMemo(
    () =>
      (mappingData?.availableQueues ?? []).map((queue) => ({
        value: queue.queueId,
        label: queue.queueDisplayName || queue.queueName,
      })),
    [mappingData?.availableQueues],
  );

  const queueLabelById = useMemo(
    () =>
      Object.fromEntries(
        (mappingData?.availableQueues ?? []).map((queue) => [queue.queueId, queue.queueDisplayName || queue.queueName]),
      ) as Record<string, string>,
    [mappingData?.availableQueues],
  );

  const didOptions = useMemo(
    () =>
      (mappingData?.availableDids ?? []).map((did) => ({
        value: did.id,
        label: did.description ? `${formatPhoneNumber(did.did)} (${did.description})` : formatPhoneNumber(did.did),
      })),
    [mappingData?.availableDids],
  );

  const representativeDidOptions = useMemo(
    () => didOptions.filter((option) => selectedDidIds.includes(String(option.value))),
    [didOptions, selectedDidIds],
  );

  const promptOptions = useMemo(
    () =>
      (mappingData?.availablePrompts ?? []).map((prompt) => ({
        value: prompt.id,
        label: `${prompt.displayName} [${prompt.category}]`,
      })),
    [mappingData?.availablePrompts],
  );
  const smartArsPromptIds = useMemo(() => {
    const byKey = new Map((mappingData?.availablePrompts ?? []).map((prompt) => [prompt.promptKey, prompt.id]));
    return {
      guide: byKey.get('custom/smart_ars_guide'),
      invalid: byKey.get('custom/smart_ars_invalid'),
      fail: byKey.get('custom/smart_ars_fail'),
      info: byKey.get('custom/smart_ars_info'),
    };
  }, [mappingData?.availablePrompts]);

  useEffect(() => {
    if (!promptsEnabled || defaultPromptId || promptOptions.length === 0) {
      return;
    }

    form.setFieldValue('defaultPromptId', String(promptOptions[0]?.value));
  }, [defaultPromptId, form, promptOptions, promptsEnabled]);

  const forwardingOptions = useMemo(
    () =>
      (mappingData?.availableForwardingRules ?? []).map((rule) => ({
        value: rule.id,
        label: `${formatPhoneNumber(rule.did.did)} → ${FORWARD_TYPE_LABEL[rule.forwardType] ?? rule.forwardType} ${rule.forwardType === 'EXTERNAL_NUMBER' ? formatPhoneNumber(rule.targetValue) : rule.targetValue}${
          rule.conditionType === 'TIME_RANGE' ? ' (조건형)' : ''
        }`,
      })),
    [mappingData?.availableForwardingRules],
  );

  const callerIdOptions = useMemo(
    () => (mappingData?.availableCallerIds ?? []).map((callerId) => ({ value: callerId, label: formatPhoneNumber(callerId) })),
    [mappingData?.availableCallerIds],
  );

  const smsTemplateOptions = useMemo(
    () =>
      (mappingData?.availableSmsTemplates ?? []).map((template) => ({
        value: template.templateId,
        label: `${template.templateName} · ${SMS_TEMPLATE_CATEGORY_LABEL[template.category]}`,
      })),
    [mappingData?.availableSmsTemplates],
  );

  const blocklistQueueOptions = useMemo(
    () => queueOptions.filter((option) => selectedQueueIds.includes(String(option.value))),
    [queueOptions, selectedQueueIds],
  );

  const getAvailableDigitOptions = (
    currentIndex: number,
    fieldName: 'blocklist080DtmfMappings' | 'blocklist080SmartConfirmationMappings' | 'smartArsActions',
  ) => {
    const rows = (form.getFieldValue(fieldName) ?? []) as Array<Blocklist080MappingFormValue | SmartArsActionFormValue>;
    const currentDigit = rows[currentIndex]?.digit;
    const usedDigits = new Set(
      rows
        .map((row, index) => (index === currentIndex ? undefined : row?.digit))
        .filter((digit): digit is string => Boolean(digit)),
    );

    return DIGIT_OPTIONS.filter((option) => option.value === currentDigit || !usedDigits.has(option.value));
  };

  const getAvailableSmartArsDigitOptions = (currentIndex: number) => {
    const rows = (form.getFieldValue('smartArsActions') ?? []) as SmartArsActionFormValue[];
    const currentDigit = rows[currentIndex]?.digit;
    const usedDigits = new Set(
      rows
        .map((row, index) => (index === currentIndex ? undefined : row?.digit))
        .filter((digit): digit is string => Boolean(digit)),
    );

    return SMART_ARS_DIGIT_OPTIONS.filter((option) => option.value === currentDigit || !usedDigits.has(option.value));
  };

  const renderSmsTemplateDropdown = (menu: ReactNode) => (
    <>
      {menu}
      <div className="branch-edit-modal__dropdown-footer">
        <Button type="link" size="small" onClick={() => moveTo('/settings/sms-templates')}>
          문자 템플릿 관리
        </Button>
      </div>
    </>
  );

  const sectionSwitch = (fieldName: keyof BranchConfigFormValue, checkedChildren = '사용', unCheckedChildren = '미사용') => (
    <Form.Item name={fieldName} valuePropName="checked" noStyle>
      <Switch
        checkedChildren={checkedChildren}
        unCheckedChildren={unCheckedChildren}
        onClick={(_, event) => {
          event?.stopPropagation();
        }}
      />
    </Form.Item>
  );

  const moveTo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      title={isEdit ? '지사 설정 수정' : '지사 등록'}
      open={open}
      destroyOnClose
      className="branch-edit-modal"
      onCancel={onClose}
      confirmLoading={saving}
      okText={isEdit ? '저장' : '등록'}
      cancelText="닫기"
      width={1120}
      onOk={async () => {
        const values = await form.validateFields();
        if ((values.didIds ?? []).length === 0) {
          message.warning('지사 기본 정보에는 최소 1개의 DID 연결이 필요합니다.');
          return;
        }
        if (!values.representativeDidId) {
          message.warning('지사 대표번호는 반드시 1개 선택해야 합니다.');
          return;
        }
        if (values.smartArsEnabled && values.blocklist080Enabled) {
          message.warning('스마트 ARS와 080 수신거부는 같은 지사에서 동시에 사용할 수 없습니다.');
          return;
        }
        if (!(values.didIds ?? []).includes(values.representativeDidId)) {
          message.warning('대표번호는 연결된 DID 중에서 선택해야 합니다.');
          return;
        }
        if (!values.promptsEnabled || !values.defaultPromptId) {
          message.warning('고객 안내를 위해 기본 멘트는 필수입니다.');
          return;
        }
        const smartArsValidationError = validateSmartArsValues(values, values.queueIds ?? []);
        if (smartArsValidationError) {
          message.warning(smartArsValidationError);
          return;
        }

        const blocklist080ValidationError = validateBlocklist080Values(values, values.queueIds ?? []);
        if (blocklist080ValidationError) {
          message.warning(blocklist080ValidationError);
          return;
        }

        const normalizedRoutingRules = normalizeRoutingRulesForForm(values.queueIds ?? [], values.routingRules ?? []);
        const alwaysCount = normalizedRoutingRules.filter((rule) => rule.conditionType === 'ALWAYS').length;

        if ((values.queueIds ?? []).length > 1 && normalizedRoutingRules.length !== (values.queueIds ?? []).length) {
          message.warning('호 분배룰을 여러 개 선택한 경우 각 룰의 작동 조건을 모두 설정해야 합니다.');
          return;
        }
        if (alwaysCount > 1) {
          message.warning('상시 적용 호 분배룰은 1개만 설정할 수 있습니다.');
          return;
        }
        for (const rule of normalizedRoutingRules) {
          if (rule.conditionType !== 'TIME_RANGE') continue;

          if (!rule.timeStart || !rule.timeEnd || (rule.daysOfWeek ?? []).length === 0) {
            message.warning('조건형 호 분배룰에는 요일과 시작/종료 시간을 모두 설정해야 합니다.');
            return;
          }
          if (!TIME_TEXT_PATTERN.test(rule.timeStart) || !TIME_TEXT_PATTERN.test(rule.timeEnd)) {
            message.warning('호 분배룰 시간은 HH:mm 형식으로 입력해야 합니다.');
            return;
          }
          if (rule.timeStart >= rule.timeEnd) {
            message.warning('호 분배룰 종료 시간은 시작 시간보다 늦어야 합니다.');
            return;
          }
        }

        setSaving(true);
        try {
          let branchId = branch?.branchId;

          const branchPayload = {
            branchCode: values.branchCode,
            branchName: values.branchName,
            description: values.description ?? '',
            isActive: values.isActive,
            vipPromptId: values.vipPromptId || null,
            defaultShareRuleId: values.defaultShareRuleId || null,
          };

          if (branchId) {
            await apiClient.post(`/admin/settings/branches/${branchId}`, branchPayload);
          } else {
            const createRes = await apiClient.post('/admin/settings/branches', branchPayload);
            branchId = createRes.data?.data?.branchId;
          }

          if (!branchId) {
            throw new Error('branchId_missing');
          }

          await apiClient.post(`/admin/settings/branches/${branchId}/mappings`, {
            agentIds: [],
            queueIds: values.queueIds,
            didIds: values.didIds,
            settingsProfile: {
              routing: {
                enabled: values.routingEnabled,
                representativeDidId: values.representativeDidId,
                rules: normalizedRoutingRules,
              },
              forwarding: {
                enabled: values.forwardingEnabled,
                ids: values.forwardingRuleIds ?? [],
              },
              prompts: {
                enabled: values.promptsEnabled,
                ids: values.defaultPromptId ? [values.defaultPromptId] : [],
                queueJoinDelaySeconds: values.promptQueueJoinDelaySeconds ?? 0,
                waitForPlaybackCompletionBeforeQueue: values.waitForPromptCompletionBeforeQueue ?? false,
              },
              smartArs: buildSmartArsPayload(values),
              recording: {
                enabled: values.recordingEnabled,
              },
              blocklist080: buildBlocklist080Payload(values),
              cid: {
                enabled: values.cidEnabled,
                defaultOutboundCallerId: values.cidEnabled ? values.defaultOutboundCallerId ?? null : null,
              },
              smdr: buildSmdrPayload(values),
            },
          });

          message.success(isEdit ? '지사 설정을 저장했습니다.' : '지사를 등록했습니다.');
          onSaved();
          onClose();
        } catch (error: any) {
          message.error(error?.response?.data?.error?.message ?? `지사 ${isEdit ? '저장' : '등록'}에 실패했습니다.`);
        } finally {
          setSaving(false);
        }
      }}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setMappingData(null);
          form.resetFields();
        }
      }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="branch-edit-modal__hero">
          <Space align="start" size={12}>
            <div className="branch-edit-modal__hero-icon">
              <ApartmentOutlined />
            </div>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {isEdit ? '지사 설정 수정' : '신규 지사 등록'}
              </Typography.Title>
              <Typography.Text type="secondary">
                좌측 메뉴에서 항목을 선택해 설정하세요. DID 연결과 운영 기능을 한 번에 저장합니다.
              </Typography.Text>
            </div>
          </Space>
          <Tag color={isEdit ? 'blue' : 'green'}>{isEdit ? '수정' : '신규'}</Tag>
        </div>

        <Form form={form} layout="vertical" disabled={loading} className="branch-edit-modal__form">
          <div className="branch-edit-modal__layout">
            <aside className="branch-edit-modal__nav">
              {SECTIONS.map((section) => {
                const isActive = activeSection === section.key;
                const featureOn = enabledByKey[section.key];
                return (
                  <button
                    type="button"
                    key={section.key}
                    onClick={() => setActiveSection(section.key)}
                    className={`branch-edit-modal__nav-item${isActive ? ' is-active' : ''}`}
                  >
                    <span className="branch-edit-modal__nav-icon">{section.icon}</span>
                    <span className="branch-edit-modal__nav-label">{section.label}</span>
                    {featureOn !== undefined ? (
                      <span
                        className={`branch-edit-modal__nav-dot${featureOn ? ' is-on' : ' is-off'}`}
                        aria-label={featureOn ? '사용' : '미사용'}
                      />
                    ) : null}
                  </button>
                );
              })}
              <div className="branch-edit-modal__nav-footer">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  사용 중 {enabledCount} / 7
                </Typography.Text>
              </div>
            </aside>

            <div className="branch-edit-modal__content">
              <div className={`branch-edit-modal__section${activeSection === 'basic' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>지사 기본 정보</Typography.Title>
                    <Typography.Text type="secondary">
                      지사 식별 정보와 연결할 DID, 대표번호를 설정합니다.
                    </Typography.Text>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('지사 코드', '운영에서 지사를 식별하는 고유 코드입니다.')}
                      name="branchCode"
                      rules={[{ required: true, message: '지사 코드를 입력하세요' }]}
                    >
                      <Input maxLength={32} placeholder="예: j00011" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('지사명', '목록과 운영 화면에 표시되는 지사명입니다.')}
                      name="branchName"
                      rules={[{ required: true, message: '지사명을 입력하세요' }]}
                    >
                      <Input maxLength={128} placeholder="예: 강남지사" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col xs={24} lg={14}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('연결 DID', '지사에서 사용할 DID를 연결합니다. 대표번호는 연결된 DID 중 1개만 선택합니다.')}
                      name="didIds"
                      rules={[{ required: true, message: '지사에 연결할 DID를 선택하세요.' }]}
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        maxTagCount="responsive"
                        placeholder="지사에 연결할 DID를 선택하세요"
                        options={didOptions}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('대표번호', '연결된 DID 중 고객에게 기본으로 노출할 번호를 선택합니다.')}
                      name="representativeDidId"
                      rules={[{ required: true, message: '대표번호를 선택하세요.' }]}
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="대표번호를 선택하세요"
                        options={representativeDidOptions}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="설명" name="description" extra="지사 역할이나 운영 메모를 남길 수 있습니다.">
                  <Input.TextArea rows={4} maxLength={1000} placeholder="예: 서울 남부권 대표 인입 지사" />
                </Form.Item>
                <Form.Item
                  className="branch-edit-modal__compact-item"
                  label={renderFieldLabel('기본 공유규칙', '지사에 적용할 기본 호 분배 룰. 고객별 오버라이드가 없으면 이 룰을 따릅니다. BlueSky ShareRule 매트릭스.')}
                  name="defaultShareRuleId"
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="공유규칙 미사용"
                    options={shareRuleOptions.map((r) => ({
                      value: r.shareRuleId,
                      label: `${r.ruleName} (${r.ruleCode})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item className="branch-edit-modal__compact-item" label="활성 여부" name="isActive" valuePropName="checked">
                  <Switch checkedChildren="활성" unCheckedChildren="비활성" />
                </Form.Item>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'routing' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>호 분배룰 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      여러 개의 호 분배룰을 쓰는 경우 각 룰의 작동 조건을 함께 설정합니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('routingEnabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/settings/queues')}>호 분배룰 관리</Button>
                  </Space>
                </div>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label="사용할 호 분배룰"
                      name="queueIds"
                      extra="지사에서 사용하는 큐를 직접 선택합니다."
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        maxTagCount="responsive"
                        disabled={!routingEnabled}
                        placeholder="지사에서 사용할 큐를 선택하세요"
                        options={queueOptions}
                      />
                    </Form.Item>
                    {selectedQueueIds.length > 1 ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="호 분배룰을 여러 개 선택한 경우 각 룰마다 상시 또는 요일/시간대 조건을 지정해야 합니다."
                      />
                    ) : null}
                    {selectedQueueIds.length > 0 ? (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {(normalizeRoutingRulesForForm(selectedQueueIds, routingRules) ?? []).map((rule, index) => {
                          const conditionType = routingRules[index]?.conditionType ?? rule.conditionType;

                          return (
                            <Card
                              key={rule.queueId}
                              size="small"
                              title={queueLabelById[rule.queueId] ?? rule.queueId}
                              extra={<Tag>{index === 0 ? '우선 검토' : '추가 룰'}</Tag>}
                            >
                              <Form.Item name={['routingRules', index, 'queueId']} hidden>
                                <Input />
                              </Form.Item>
                              <Row gutter={12}>
                                <Col xs={24} md={8}>
                                  <Form.Item className="branch-edit-modal__compact-item" label="작동 조건" name={['routingRules', index, 'conditionType']}>
                                    <Select
                                      disabled={!routingEnabled}
                                      options={[
                                        { value: 'ALWAYS', label: '상시 적용' },
                                        { value: 'TIME_RANGE', label: '요일/시간대 조건' },
                                      ]}
                                    />
                                  </Form.Item>
                                </Col>
                                {conditionType === 'TIME_RANGE' ? (
                                  <>
                                    <Col xs={24} md={8}>
                                      <Form.Item className="branch-edit-modal__compact-item" label="시작 시간" name={['routingRules', index, 'timeStart']}>
                                        <Input disabled={!routingEnabled} placeholder="09:00" maxLength={5} />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                      <Form.Item className="branch-edit-modal__compact-item" label="종료 시간" name={['routingRules', index, 'timeEnd']}>
                                        <Input disabled={!routingEnabled} placeholder="18:00" maxLength={5} />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                      <Form.Item
                                        label="요일"
                                        name={['routingRules', index, 'daysOfWeek']}
                                        extra="예: 평일 주간은 월~금, 야간은 월~일처럼 선택합니다."
                                      >
                                        <Select
                                          mode="multiple"
                                          allowClear
                                          disabled={!routingEnabled}
                                          options={WEEKDAY_OPTIONS}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </>
                                ) : (
                                  <Col xs={24} md={16}>
                                    <Alert
                                      type="info"
                                      showIcon
                                      message="이 호 분배룰은 조건 없이 상시 적용됩니다."
                                    />
                                  </Col>
                                )}
                              </Row>
                            </Card>
                          );
                        })}
                      </Space>
                    ) : null}
                  </Space>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'forwarding' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>착신전환 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      세부 규칙은 착신전환 설정 메뉴에서 만들고 여기서 사용할 규칙만 고릅니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('forwardingEnabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/settings/forwarding')}>착신전환 규칙 관리</Button>
                  </Space>
                </div>
                <Form.Item className="branch-edit-modal__compact-item" label="적용할 착신전환 규칙" name="forwardingRuleIds">
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    disabled={!forwardingEnabled}
                    placeholder="사용할 착신전환 규칙을 선택하세요"
                    options={forwardingOptions}
                  />
                </Form.Item>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'prompts' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>멘트 사용 설정</Typography.Title>
                    <Typography.Text type="secondary">고객 안내를 위해 기본 멘트는 필수입니다.</Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('promptsEnabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/settings/prompts')}>멘트 관리</Button>
                  </Space>
                </div>
                <Row gutter={12}>
                  <Col xs={24} lg={18}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('기본 멘트', '고객 안내를 위해 기본 멘트는 필수이며, 사용 설정 시 첫 번째 활성 멘트를 자동 선택합니다.')}
                      name="defaultPromptId"
                      rules={[{ required: true, message: '기본 멘트를 선택하세요.' }]}
                    >
                      <PromptSelectWithPreview
                        disabled={!promptsEnabled}
                        placeholder="지사 기본 멘트를 선택하세요"
                        options={promptOptions}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={6}>
                    <Form.Item
                      className="branch-edit-modal__compact-item"
                      label={renderFieldLabel('지연(초)', '0초는 멘트 시작과 동시에 큐 진입이며, 지정한 초가 지나면 큐에 진입합니다.')}
                      name="promptQueueJoinDelaySeconds"
                    >
                      <InputNumber min={0} max={300} precision={0} style={{ width: '100%' }} disabled={!promptsEnabled} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  className="branch-edit-modal__compact-item"
                  label={renderFieldLabel('VIP 멘트', '고객 grade=VIP 인 통화 시 사용할 안내 멘트. BlueSky Jisa.m_nMentVipCD 등가. 미설정 시 기본 멘트로 fallback.')}
                  name="vipPromptId"
                >
                  <PromptSelectWithPreview
                    disabled={!promptsEnabled}
                    placeholder="VIP 전용 멘트 선택 (선택 사항)"
                    options={promptOptions}
                  />
                </Form.Item>
                <Form.Item
                  className="branch-edit-modal__compact-item"
                  label={renderFieldLabel('멘트 완료까지 대기', '사용 시 멘트가 끝난 뒤에만 큐에 진입합니다. 끄면 멘트 시작과 동시에 또는 지정 초 후 큐에 진입합니다.')}
                  name="waitForPromptCompletionBeforeQueue"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="완료 후" unCheckedChildren="병행 진입" disabled={!promptsEnabled} />
                </Form.Item>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'smartArs' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>스마트 ARS 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      안내 멘트 후 고객 DTMF 입력에 따라 상담원 연결, 착신전환, SMS, 수신거부, 멘트 재생을 실행합니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('smartArsEnabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/settings/prompts')}>멘트 관리</Button>
                  </Space>
                </div>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('안내 멘트', '고객에게 최초로 재생되는 스마트 ARS 안내 멘트입니다.')}
                        name="smartArsGuidePromptId"
                      >
                        <PromptSelectWithPreview
                          disabled={!smartArsEnabled}
                          options={promptOptions}
                          placeholder="스마트 ARS 안내 멘트"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={6}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('입력 대기(초)', '안내 멘트 재생 후 DTMF 입력을 기다리는 시간입니다.')}
                        name="smartArsTimeoutSeconds"
                      >
                        <InputNumber min={1} max={15} precision={0} style={{ width: '100%' }} disabled={!smartArsEnabled} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={6}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('재시도', '무입력 또는 오입력을 다시 받을 횟수입니다.')}
                        name="smartArsMaxRetries"
                      >
                        <InputNumber min={0} max={10} precision={0} style={{ width: '100%' }} disabled={!smartArsEnabled} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('오류 키 멘트', '정의되지 않은 키를 눌렀을 때 재생합니다.')}
                        name="smartArsInvalidPromptId"
                      >
                        <PromptSelectWithPreview
                          disabled={!smartArsEnabled}
                          options={promptOptions}
                          placeholder="오류 키 안내 멘트"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('실패 멘트', '재시도 초과 또는 액션 실패 시 재생합니다.')}
                        name="smartArsFailPromptId"
                      >
                        <PromptSelectWithPreview
                          disabled={!smartArsEnabled}
                          options={promptOptions}
                          placeholder="스마트 ARS 실패 멘트"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <div className="branch-edit-modal__subpanel">
                    <div className="branch-edit-modal__subpanel-head">
                      <div>
                        <Typography.Text strong>DTMF 동작</Typography.Text>
                        <Typography.Text type="secondary">
                          설정한 행만 저장되며, 같은 키는 한 번만 선택할 수 있습니다.
                        </Typography.Text>
                      </div>
                      <Button
                        type="dashed"
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={!smartArsEnabled}
                        onClick={() => {
                          const rows = form.getFieldValue('smartArsActions') ?? [];
                          form.setFieldValue('smartArsActions', [...rows, createEmptySmartArsAction()]);
                        }}
                      >
                        행 추가
                      </Button>
                      <Button
                        size="small"
                        disabled={!smartArsEnabled}
                        onClick={() => {
                          const actions = buildSmartArsAvailableActionCombinations({
                            queueIds: selectedQueueIds,
                            promptIds: [
                              smartArsPromptIds.info,
                              ...promptOptions.map((option) => String(option.value)),
                            ].filter((value): value is string => Boolean(value)),
                          });
                          if (smartArsPromptIds.guide) {
                            form.setFieldValue('smartArsGuidePromptId', smartArsPromptIds.guide);
                          }
                          if (smartArsPromptIds.invalid) {
                            form.setFieldValue('smartArsInvalidPromptId', smartArsPromptIds.invalid);
                          }
                          if (smartArsPromptIds.fail) {
                            form.setFieldValue('smartArsFailPromptId', smartArsPromptIds.fail);
                          }
                          form.setFieldValue('smartArsActions', actions);
                          if (actions.length === 0) {
                            message.warning('현재 선택 가능한 스마트 ARS 동작이 없습니다.');
                          }
                        }}
                      >
                        가능 조합 채우기
                      </Button>
                    </div>
                    <Form.List name="smartArsActions">
                      {(fields, { remove }) => (
                        <div className="branch-edit-modal__mapping-list">
                          {fields.length === 0 ? (
                            <div className="branch-edit-modal__mapping-empty">
                              스마트 ARS 동작이 아직 없습니다. 고객이 누를 키와 동작을 추가하세요.
                            </div>
                          ) : null}
                          {fields.map((field) => {
                            const actionType = smartArsActions[field.name]?.actionType;
                            const digitOptions = getAvailableSmartArsDigitOptions(field.name);

                            return (
                              <div
                                className="branch-edit-modal__mapping-editor-row branch-edit-modal__mapping-editor-row--smart"
                                key={field.key}
                              >
                                <Form.Item
                                  className="branch-edit-modal__mapping-cell"
                                  label={renderFieldLabel('DTMF', '고객이 누르는 키입니다.')}
                                  name={[field.name, 'digit']}
                                >
                                  <Select
                                    allowClear
                                    disabled={!smartArsEnabled}
                                    options={digitOptions}
                                    placeholder="키"
                                  />
                                </Form.Item>
                                <Form.Item
                                  className="branch-edit-modal__mapping-cell"
                                  label={renderFieldLabel('동작', '선택한 키에 대해 수행할 동작입니다.')}
                                  name={[field.name, 'actionType']}
                                >
                                  <Select
                                    allowClear
                                    disabled={!smartArsEnabled}
                                    options={SMART_ARS_ACTION_OPTIONS}
                                    placeholder="동작 선택"
                                  />
                                </Form.Item>
                                {actionType === 'QUEUE_ROUTE' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('호 분배룰', '현재 지사에 연결된 호 분배룰만 선택할 수 있습니다.')}
                                    name={[field.name, 'queueId']}
                                  >
                                    <Select
                                      allowClear
                                      disabled={!smartArsEnabled}
                                      options={blocklistQueueOptions}
                                      placeholder="호 분배룰 선택"
                                    />
                                  </Form.Item>
                                ) : actionType === 'TRANSFER' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('전화번호', '착신전환 대상 번호입니다.')}
                                    name={[field.name, 'transferNumber']}
                                  >
                                    <Input disabled={!smartArsEnabled} placeholder="01012345678" />
                                  </Form.Item>
                                ) : actionType === 'SEND_SMS' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('문자 템플릿', '발신자 번호로 보낼 템플릿입니다.')}
                                    name={[field.name, 'smsTemplateId']}
                                  >
                                    <Select
                                      allowClear
                                      showSearch
                                      disabled={!smartArsEnabled}
                                      options={smsTemplateOptions}
                                      optionFilterProp="label"
                                      placeholder="문자 템플릿 선택"
                                      dropdownRender={renderSmsTemplateDropdown}
                                    />
                                  </Form.Item>
                                ) : actionType === 'PLAY_PROMPT' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('재생 멘트', '선택 후 재생하고 통화를 종료합니다.')}
                                    name={[field.name, 'promptId']}
                                  >
                                    <Select
                                      allowClear
                                      showSearch
                                      disabled={!smartArsEnabled}
                                      options={promptOptions}
                                      optionFilterProp="label"
                                      placeholder="재생 멘트 선택"
                                    />
                                  </Form.Item>
                                ) : (
                                  <div className="branch-edit-modal__mapping-cell branch-edit-modal__mapping-cell--empty">
                                    추가 설정 없음
                                  </div>
                                )}
                                <Button
                                  danger
                                  type="text"
                                  icon={<DeleteOutlined />}
                                  className="branch-edit-modal__mapping-remove"
                                  disabled={!smartArsEnabled}
                                  onClick={() => remove(field.name)}
                                >
                                  삭제
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Form.List>
                  </div>
                </Space>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'recording' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>녹취 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      녹취 저장 정책과 기본 동작은 시스템 설정에서 관리합니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('recordingEnabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/system')}>시스템 설정</Button>
                  </Space>
                </div>
                <Typography.Text type="secondary">
                  지사 단위에서는 녹취 사용 여부만 결정합니다. 저장 경로, 보관 기간 등은 시스템 설정에서 관리하세요.
                </Typography.Text>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'blocklist' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>080 수신거부 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      수신거부 요청 고객 목록은 수신거부 고객 관리 메뉴에서 관리합니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('blocklist080Enabled')}
                    <Button type="link" size="small" onClick={() => moveTo('/opt-out-customers')}>수신거부 고객 관리</Button>
                  </Space>
                </div>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} lg={10}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('동작 모드', '080 수신거부 처리 방식을 선택합니다. 스마트 수신거부 입력 종료 숫자는 #로 고정됩니다.')}
                        name="blocklist080Mode"
                      >
                        <Select
                          className="branch-edit-modal__mode-select"
                          disabled={!blocklist080Enabled}
                          options={BLOCKLIST080_MODE_OPTIONS}
                          placeholder="080 수신거부 모드를 선택하세요"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={14}>
                      <Form.Item
                        className="branch-edit-modal__compact-item"
                        label={renderFieldLabel('기본 문자 템플릿', '080 수신거부 공통 문자 발송에 사용할 관리형 템플릿입니다.')}
                        name="blocklist080SmsTemplateId"
                      >
                        <Select
                          allowClear
                          showSearch
                          disabled={!blocklist080Enabled}
                          options={smsTemplateOptions}
                          optionFilterProp="label"
                          placeholder="문자 템플릿 선택"
                          dropdownRender={renderSmsTemplateDropdown}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <div className="branch-edit-modal__subpanel">
                    <div className="branch-edit-modal__subpanel-head">
                      <div>
                        <Typography.Text strong>공통 안내</Typography.Text>
                        <Typography.Text type="secondary">
                          모든 모드에서 사용하는 시작/완료 흐름입니다.
                        </Typography.Text>
                      </div>
                      <Tag color={blocklist080Enabled ? 'green' : 'default'}>
                        {blocklist080Enabled ? '사용' : '미사용'}
                      </Tag>
                    </div>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={8}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('시작 멘트', '모든 080 수신거부 흐름 시작 시 재생하는 멘트입니다.')}
                          name="blocklist080BasePromptId"
                        >
                          <PromptSelectWithPreview
                            disabled={!blocklist080Enabled}
                            options={promptOptions}
                            placeholder="080 수신거부 시작 멘트"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={8}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('재생 우선 시간(초)', '0초이면 멘트 재생 중 입력을 즉시 처리합니다. 1초 이상이면 시작 멘트를 먼저 재생한 뒤 입력을 받습니다.')}
                          name="blocklist080BasePromptInputDelaySeconds"
                        >
                          <InputNumber min={0} max={60} style={{ width: '100%' }} disabled={!blocklist080Enabled} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={8}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('완료 멘트', '즉시 또는 일반 DTMF 모드 완료 시 재생하는 멘트입니다.')}
                          name="blocklist080CompletionPromptId"
                        >
                          <PromptSelectWithPreview
                            disabled={!blocklist080Enabled}
                            options={promptOptions}
                            placeholder="즉시/DTMF 완료 멘트"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>

                {blocklist080Enabled && blocklist080Mode === 'DTMF_MENU' ? (
                  <div className="branch-edit-modal__subpanel">
                    <div className="branch-edit-modal__subpanel-head">
                      <div>
                        <Typography.Text strong>DTMF 메뉴</Typography.Text>
                        <Typography.Text type="secondary">
                          필요한 숫자 동작만 추가해 설정합니다.
                        </Typography.Text>
                      </div>
                      <Tag>행 추가</Tag>
                    </div>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={6}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('입력 대기 시간(초)', '고객 입력을 기다리는 시간입니다.')}
                          name="blocklist080DtmfTimeoutSeconds"
                        >
                          <InputNumber min={0} max={60} style={{ width: '100%' }} disabled={!blocklist080Enabled} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={6}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('재시도 횟수', '잘못 입력하거나 입력이 없을 때 재시도할 횟수입니다.')}
                          name="blocklist080DtmfMaxRetries"
                        >
                          <InputNumber min={0} max={10} style={{ width: '100%' }} disabled={!blocklist080Enabled} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('잘못된 입력 멘트', '정의되지 않은 숫자를 입력했을 때 재생합니다.')}
                          name="blocklist080DtmfInvalidPromptId"
                        >
                          <PromptSelectWithPreview
                            disabled={!blocklist080Enabled}
                            options={promptOptions}
                            placeholder="잘못된 입력 안내 멘트"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={12}>
                        <Form.Item
                          className="branch-edit-modal__compact-item"
                          label={renderFieldLabel('입력 지연 멘트', '입력이 없을 때 재생합니다.')}
                          name="blocklist080DtmfTimeoutPromptId"
                        >
                          <PromptSelectWithPreview
                            disabled={!blocklist080Enabled}
                            options={promptOptions}
                            placeholder="입력 지연 안내 멘트"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    {selectedQueueIds.length === 0 ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="현재 지사에 연결된 호 분배룰이 없어 큐 연결 액션을 쓰려면 먼저 호 분배룰을 선택해야 합니다."
                      />
                    ) : null}
                    <Form.List name="blocklist080DtmfMappings">
                      {(fields, { add, remove }) => (
                        <div className="branch-edit-modal__mapping-list">
                          <div className="branch-edit-modal__mapping-list-head">
                            <div className="branch-edit-modal__mapping-list-copy">
                              <Typography.Text strong>사용자 입력(DTMF) 동작 규칙</Typography.Text>
                              <Typography.Text type="secondary">
                                설정한 행만 저장되며, 같은 숫자는 한 번만 선택할 수 있습니다.
                              </Typography.Text>
                            </div>
                            <Button
                              type="dashed"
                              size="small"
                              icon={<PlusOutlined />}
                              disabled={!blocklist080Enabled}
                              onClick={() => add(createEmptyBlocklist080Mapping())}
                            >
                              행 추가
                            </Button>
                          </div>
                          {fields.length === 0 ? (
                            <div className="branch-edit-modal__mapping-empty">
                              숫자 동작이 아직 없습니다. 필요한 항목만 추가하세요.
                            </div>
                          ) : null}
                          {fields.map((field) => {
                            const actionType = blocklist080DtmfMappings[field.name]?.actionType;

                            return (
                              <div
                                className="branch-edit-modal__mapping-editor-row branch-edit-modal__mapping-editor-row--dtmf"
                                key={field.key}
                              >
                                <Form.Item
                                  className="branch-edit-modal__mapping-cell"
                                  label={renderFieldLabel('입력(DTMF)', '고객이 누르는 숫자를 선택합니다.')}
                                  name={[field.name, 'digit']}
                                >
                                  <Select
                                    allowClear
                                    disabled={!blocklist080Enabled}
                                    options={getAvailableDigitOptions(field.name, 'blocklist080DtmfMappings')}
                                    placeholder="입력(DTMF) 선택"
                                  />
                                </Form.Item>
                                <Form.Item
                                  className="branch-edit-modal__mapping-cell"
                                  label={renderFieldLabel('동작', '선택한 숫자에 대해 수행할 동작입니다.')}
                                  name={[field.name, 'actionType']}
                                >
                                  <Select
                                    allowClear
                                    disabled={!blocklist080Enabled}
                                    options={BLOCKLIST080_DTMF_ACTION_OPTIONS}
                                    placeholder="동작 선택"
                                  />
                                </Form.Item>
                                {actionType === 'QUEUE_ROUTE' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('호 분배룰', '현재 지사에 연결된 호 분배룰만 선택할 수 있습니다.')}
                                    name={[field.name, 'queueId']}
                                  >
                                    <Select
                                      allowClear
                                      disabled={!blocklist080Enabled}
                                      options={blocklistQueueOptions}
                                      placeholder="호 분배룰 선택"
                                    />
                                  </Form.Item>
                                ) : actionType === 'SEND_SMS' ? (
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('문자 템플릿', '발송할 080 수신거부 템플릿을 선택합니다.')}
                                    name={[field.name, 'smsTemplateId']}
                                  >
                                    <Select
                                      allowClear
                                      showSearch
                                      disabled={!blocklist080Enabled}
                                      options={smsTemplateOptions}
                                      optionFilterProp="label"
                                      placeholder="문자 템플릿 선택"
                                    />
                                  </Form.Item>
                                ) : (
                                  <div className="branch-edit-modal__mapping-cell branch-edit-modal__mapping-cell--empty">
                                    추가 설정 없음
                                  </div>
                                )}
                                <Button
                                  danger
                                  type="text"
                                  icon={<DeleteOutlined />}
                                  className="branch-edit-modal__mapping-remove"
                                  disabled={!blocklist080Enabled}
                                  onClick={() => remove(field.name)}
                                >
                                  삭제
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Form.List>
                  </div>
                ) : null}

                {blocklist080Enabled && blocklist080Mode === 'SMART_OPT_OUT' ? (
                  <>
                    <div className="branch-edit-modal__subpanel">
                      <div className="branch-edit-modal__subpanel-head">
                        <div>
                          <Typography.Text strong>입력 단계</Typography.Text>
                          <Typography.Text type="secondary">
                            번호 입력과 재시도 흐름을 설정합니다.
                          </Typography.Text>
                        </div>
                        <Tag color="blue">입력 종료 # 고정</Tag>
                      </div>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('번호 입력 멘트', '번호 입력을 시작할 때 재생합니다.')}
                            name="blocklist080SmartInputPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="번호 입력 안내 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('재입력 멘트', '입력 재시도 시 재생합니다.')}
                            name="blocklist080SmartReentryPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="재입력 안내 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('동일번호 안내 멘트', '고객 본인 번호와 동일할 때 재생합니다.')}
                            name="blocklist080SmartSameNumberPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="동일번호 재입력 안내 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={6}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('입력 대기 시간(초)', '입력 대기 제한 시간입니다.')}
                            name="blocklist080SmartInputTimeoutSeconds"
                          >
                            <InputNumber min={0} max={60} style={{ width: '100%' }} disabled={!blocklist080Enabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={6}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('재시도 횟수', '입력을 다시 받을 최대 횟수입니다.')}
                            name="blocklist080SmartMaxRetries"
                          >
                            <InputNumber min={0} max={10} style={{ width: '100%' }} disabled={!blocklist080Enabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('실패 멘트', '재시도 초과 후 재생합니다.')}
                            name="blocklist080SmartFailurePromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="재시도 초과 실패 멘트"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>

                    <div className="branch-edit-modal__subpanel">
                      <div className="branch-edit-modal__subpanel-head">
                        <div>
                          <Typography.Text strong>확인 단계</Typography.Text>
                          <Typography.Text type="secondary">
                            입력 번호 확인과 최종 동작 규칙을 설정합니다.
                          </Typography.Text>
                        </div>
                        <Tag>최종 규칙</Tag>
                      </div>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('확인 앞 멘트', '입력한 번호를 읽어주기 전에 재생합니다.')}
                            name="blocklist080SmartConfirmPrefixPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="입력 확인 앞 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('확인 뒤 멘트', '입력한 번호를 읽어준 뒤 이어서 재생합니다.')}
                            name="blocklist080SmartConfirmSuffixPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="입력 확인 뒤 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('최종 확인 멘트', '등록, 재입력, 문자발송 선택을 안내합니다.')}
                            name="blocklist080SmartConfirmMenuPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="최종 선택 안내 멘트"
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            className="branch-edit-modal__compact-item"
                            label={renderFieldLabel('최종 멘트', '마지막 완료 또는 종료 전에 재생합니다.')}
                            name="blocklist080SmartFinalPromptId"
                          >
                            <PromptSelectWithPreview
                              disabled={!blocklist080Enabled}
                              options={promptOptions}
                              placeholder="최종 완료 멘트"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.List name="blocklist080SmartConfirmationMappings">
                        {(fields, { add, remove }) => (
                          <div className="branch-edit-modal__mapping-list">
                            <div className="branch-edit-modal__mapping-list-head">
                              <div className="branch-edit-modal__mapping-list-copy">
                                <Typography.Text strong>최종 동작 규칙</Typography.Text>
                                <Typography.Text type="secondary">
                                  설정한 행만 저장되며, 같은 숫자는 한 번만 선택할 수 있습니다.
                                </Typography.Text>
                              </div>
                              <Button
                                type="dashed"
                                size="small"
                                icon={<PlusOutlined />}
                                disabled={!blocklist080Enabled}
                                onClick={() => add(createEmptyBlocklist080Mapping())}
                              >
                                행 추가
                              </Button>
                            </div>
                            {fields.length === 0 ? (
                              <div className="branch-edit-modal__mapping-empty">
                                최종 확인 숫자 규칙이 아직 없습니다. 필요한 항목만 추가하세요.
                              </div>
                            ) : null}
                            {fields.map((field) => {
                              const actionType = blocklist080SmartConfirmationMappings[field.name]?.actionType;

                              return (
                                <div
                                  className="branch-edit-modal__mapping-editor-row branch-edit-modal__mapping-editor-row--smart"
                                  key={field.key}
                                >
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('숫자', '고객이 최종 확인 단계에서 누르는 숫자입니다.')}
                                    name={[field.name, 'digit']}
                                  >
                                    <Select
                                      allowClear
                                      disabled={!blocklist080Enabled}
                                      options={getAvailableDigitOptions(field.name, 'blocklist080SmartConfirmationMappings')}
                                      placeholder="숫자 선택"
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    className="branch-edit-modal__mapping-cell"
                                    label={renderFieldLabel('최종 동작', '숫자 입력 후 수행할 최종 동작입니다.')}
                                    name={[field.name, 'actionType']}
                                  >
                                    <Select
                                      allowClear
                                      disabled={!blocklist080Enabled}
                                      options={BLOCKLIST080_SMART_ACTION_OPTIONS}
                                      placeholder="최종 동작 선택"
                                    />
                                  </Form.Item>
                                  {actionType === 'SEND_SMS' ? (
                                    <Form.Item
                                      className="branch-edit-modal__mapping-cell"
                                      label={renderFieldLabel('문자 템플릿', '발송할 080 수신거부 템플릿을 선택합니다.')}
                                      name={[field.name, 'smsTemplateId']}
                                    >
                                      <Select
                                        allowClear
                                        showSearch
                                        disabled={!blocklist080Enabled}
                                        options={smsTemplateOptions}
                                        optionFilterProp="label"
                                        placeholder="문자 템플릿 선택"
                                      />
                                    </Form.Item>
                                  ) : (
                                    <div className="branch-edit-modal__mapping-cell branch-edit-modal__mapping-cell--empty">
                                      추가 설정 없음
                                    </div>
                                  )}
                                  <Button
                                    danger
                                    type="text"
                                    icon={<DeleteOutlined />}
                                    className="branch-edit-modal__mapping-remove"
                                    disabled={!blocklist080Enabled}
                                    onClick={() => remove(field.name)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Form.List>
                    </div>
                  </>
                ) : null}
                </Space>
              </div>

              <div className={`branch-edit-modal__section${activeSection === 'cid' ? ' is-active' : ''}`}>
                <div className="branch-edit-modal__section-head">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>CID 프로그램 연동 설정</Typography.Title>
                    <Typography.Text type="secondary">
                      지사별 발신번호와 프로그램사별 CID 포트를 설정합니다.
                    </Typography.Text>
                  </div>
                  <Space size={8}>
                    {sectionSwitch('cidEnabled', 'CID 사용', 'CID 미사용')}
                    {sectionSwitch('smdrEnabled', '연동 사용', '연동 미사용')}
                    <Button type="link" size="small" onClick={() => moveTo('/system')}>시스템 설정</Button>
                  </Space>
                </div>
                <Form.Item
                  className="branch-edit-modal__compact-item"
                  label={renderFieldLabel('지사 기본 발신번호', '허용 발신번호는 시스템 설정에서 관리하고, 지사에서는 사용할 기본 CID만 선택합니다.')}
                  name="defaultOutboundCallerId"
                >
                  <Select
                    allowClear
                    disabled={!cidEnabled}
                    placeholder="지사 기본 발신번호를 선택하세요"
                    options={callerIdOptions}
                  />
                </Form.Item>
                <Form.List name="smdrPrograms">
                  {(fields) => (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      <Typography.Text strong>프로그램사별 CID 전송</Typography.Text>
                      {fields.map((field) => (
                        <Card key={field.key} size="small">
                          <Row gutter={8} align="middle">
                            <Col xs={24} lg={5}>
                              <Form.Item name={[field.name, 'programKey']} hidden>
                                <Input />
                              </Form.Item>
                              <Typography.Text strong>
                                {CID_PROGRAM_OPTIONS[field.name]?.label ?? '프로그램'}
                              </Typography.Text>
                              <br />
                              <Typography.Text type="secondary">
                                포트 {CID_PROGRAM_OPTIONS[field.name]?.defaultPort ?? '-'}
                              </Typography.Text>
                            </Col>
                            <Col xs={24} lg={16}>
                              <Space wrap>
                                <Form.Item name={[field.name, 'enabled']} valuePropName="checked" noStyle>
                                  <Checkbox disabled={!smdrEnabled}>사용</Checkbox>
                                </Form.Item>
                                <Form.Item name={[field.name, 'inboundEnabled']} valuePropName="checked" noStyle>
                                  <Checkbox disabled={!smdrEnabled}>수신</Checkbox>
                                </Form.Item>
                                <Form.Item name={[field.name, 'outboundEnabled']} valuePropName="checked" noStyle>
                                  <Checkbox disabled={!smdrEnabled}>발신</Checkbox>
                                </Form.Item>
                                <Form.Item name={[field.name, 'includeOriginalCallerId']} valuePropName="checked" noStyle>
                                  <Checkbox disabled={!smdrEnabled}>원번호</Checkbox>
                                </Form.Item>
                              </Space>
                            </Col>
                          </Row>
                        </Card>
                      ))}
                    </Space>
                  )}
                </Form.List>
              </div>
            </div>
          </div>
        </Form>
      </Space>
    </Modal>
  );
}
