import { describe, expect, it } from 'vitest';
import { buildAgentEditFormValues } from './agentEditFormValues';

/**
 * 상담원 편집 모달은 폼 스토어 전체를 PATCH 본문으로 보낸다. 여기에 SIP 비밀번호가
 * 얹히면 입력칸이 없어도 서버까지 나가고, 빈 문자열이 삭제로 읽혀 조용히 지워진다.
 * 내선 3304 가 등록되지 않았던 원인이다 (2026-08-24).
 */
describe('buildAgentEditFormValues', () => {
  const agent = {
    loginId: '3304',
    agentName: '강병환4',
    extension: '3304',
    role: 'agent',
    isActive: true,
  };

  it('상세 조회가 SIP 비밀번호를 돌려줘도 폼에 담지 않는다', () => {
    const values = buildAgentEditFormValues(agent, {
      ...agent,
      // 서버 getDetail 은 agent 레코드를 통째로 준다 — sipPassword 가 실제로 들어 있다.
      ...({ sipPassword: '69200000' } as Record<string, unknown>),
    });

    expect(values).not.toHaveProperty('sipPassword');
  });

  it('상세 조회 실패로 되돌아간 경우에도 SIP 비밀번호를 담지 않는다', () => {
    const values = buildAgentEditFormValues(agent, null);

    expect(values).not.toHaveProperty('sipPassword');
  });

  it('상세값이 있으면 그것을 우선하고, 없으면 목록 행 값을 쓴다', () => {
    const values = buildAgentEditFormValues(agent, { ...agent, agentName: '고쳐진 이름' });

    expect(values.agentName).toBe('고쳐진 이름');
    expect(values.extension).toBe('3304');
  });

  it('로그인 비밀번호는 늘 빈 값으로 시작한다', () => {
    expect(buildAgentEditFormValues(agent, agent).password).toBe('');
  });

  it('상세 조회 실패 시 설정 프로필은 기본값으로 되돌린다', () => {
    const values = buildAgentEditFormValues(agent, null);

    expect(values.settingsProfile).toBeDefined();
  });
});
