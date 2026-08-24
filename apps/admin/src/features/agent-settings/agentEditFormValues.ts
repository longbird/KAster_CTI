import { DEFAULT_AGENT_SETTINGS_PROFILE, normalizeAgentSettingsProfile } from './agentSettingProfile';

/**
 * 상담원 편집 모달의 폼 초기값을 만든다.
 *
 * 이 모달은 저장할 때 폼 스토어 전체를 그대로 PATCH 본문으로 보낸다. 그래서 <b>여기에 넣은
 * 키는 화면에 입력칸이 없어도 서버까지 간다.</b> 예전에는 SIP 비밀번호가 빈 문자열로 얹혀
 * 있었고, 서버가 그 빈 값을 삭제로 읽어 이름만 고쳐 저장해도 SIP 비밀번호가 지워졌다.
 * 그 결과가 내선 3304 의 등록 실패였다 (2026-08-24).
 *
 * SIP 비밀번호는 [PBX 설정 > 에이전트 내선] 탭의 전용 저장 버튼에서만 다룬다.
 * 키를 새로 추가할 때는 그 값이 PATCH 로 나가도 되는지 먼저 확인한다.
 */
export function buildAgentEditFormValues(agent: AgentFormSource, loaded?: AgentFormSource | null) {
  const pick = <K extends keyof AgentFormSource>(key: K) => loaded?.[key] ?? agent[key];

  return {
    loginId: pick('loginId'),
    agentName: pick('agentName'),
    extension: pick('extension'),
    extensionDisplayName: pick('extensionDisplayName') ?? '',
    extensionLockMode: pick('extensionLockMode') ?? 'UNLOCKED',
    role: pick('role'),
    defaultQueueId: pick('defaultQueueId') ?? undefined,
    agentGroupId: pick('agentGroupId') ?? undefined,
    isActive: pick('isActive'),
    password: '',
    settingsProfile: loaded
      ? normalizeAgentSettingsProfile(loaded.settingsProfile)
      : DEFAULT_AGENT_SETTINGS_PROFILE,
  };
}

export interface AgentFormSource {
  loginId?: string;
  agentName?: string;
  extension?: string;
  extensionDisplayName?: string | null;
  extensionLockMode?: string | null;
  role?: string;
  defaultQueueId?: string | null;
  agentGroupId?: string | null;
  isActive?: boolean;
  settingsProfile?: unknown;
}
