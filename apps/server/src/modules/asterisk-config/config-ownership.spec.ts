import { decideConfigOwnership } from './config-ownership';

describe('decideConfigOwnership', () => {
  const base = { marker: null, ownerId: 'dev-node', allowSharedWrite: false };

  it('남의 디렉터리에는 쓰지 않는다 — 리허설이 운영 설정을 덮어쓴 그 경로', () => {
    // 2026-08-24: 리허설 컨테이너가 재시작할 때마다 운영 pjsip.conf 를 자기 테넌트 기준으로
    // 다시 써서, 내선 endpoint 가 사라지고 전화기 등록이 끊겼다.
    const decision = decideConfigOwnership({ ...base, marker: 'rehearsal-20260501' });

    expect(decision.action).toBe('refuse');
    expect(decision.reason).toContain('rehearsal-20260501');
    expect(decision.reason).toContain('dev-node');
  });

  it('거부 사유는 고치는 방법까지 알려준다', () => {
    const decision = decideConfigOwnership({ ...base, marker: 'other-node' });

    expect(decision.reason).toContain('.kaster-cti-config-owner');
  });

  it('내 것이면 쓴다', () => {
    expect(decideConfigOwnership({ ...base, marker: 'dev-node' }).action).toBe('proceed');
  });

  it('마커가 없으면 내 것으로 표시하고 쓴다', () => {
    const decision = decideConfigOwnership({ ...base, marker: null });

    expect(decision).toMatchObject({ action: 'claim', ownerId: 'dev-node' });
  });

  it('빈 마커도 없는 것으로 본다', () => {
    expect(decideConfigOwnership({ ...base, marker: '   ' }).action).toBe('claim');
  });

  it('마커 앞뒤 공백과 줄바꿈은 무시한다 — 파일에 개행이 붙어도 같은 주인이다', () => {
    expect(decideConfigOwnership({ ...base, marker: 'dev-node\n' }).action).toBe('proceed');
  });

  it('소유자 ID 를 안 준 현장은 예전처럼 동작한다 — 기존 배포를 깨지 않는다', () => {
    expect(decideConfigOwnership({ marker: 'anyone', ownerId: null, allowSharedWrite: false }).action)
      .toBe('proceed');
    expect(decideConfigOwnership({ marker: 'anyone', ownerId: '  ', allowSharedWrite: false }).action)
      .toBe('proceed');
  });

  it('공유 쓰기를 명시적으로 켜면 불일치라도 통과한다', () => {
    expect(decideConfigOwnership({ ...base, marker: 'other-node', allowSharedWrite: true }).action)
      .toBe('proceed');
  });
});
