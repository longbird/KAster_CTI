import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const CONTEXT = {} as ExecutionContext;

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('테넌트 토큰은 그대로 통과시킨다', () => {
    const user = { sub: 'agent-1', tenantId: 'tenant-1', role: 'admin', extension: '1001' };

    expect(guard.handleRequest(null, user, null, CONTEXT)).toBe(user);
  });

  // 플랫폼 관리자 토큰에는 tenantId 가 없다. 통과시키면 tenantId 가 undefined 인 채로
  // 테넌트 쿼리에 들어가 파티션 키 없는 조회가 된다.
  it('플랫폼 관리자 토큰은 거부한다', () => {
    expect(() => guard.handleRequest(null, { sub: 'admin-1', scope: 'platform' }, null, CONTEXT))
      .toThrow(UnauthorizedException);
  });

  it('인증에 실패한 요청은 기존과 같이 401 이다', () => {
    expect(() => guard.handleRequest(null, false, null, CONTEXT)).toThrow(UnauthorizedException);
  });

  it('passport 가 준 오류는 그대로 올린다', () => {
    const err = new Error('boom');

    expect(() => guard.handleRequest(err, null, null, CONTEXT)).toThrow(err);
  });
});
