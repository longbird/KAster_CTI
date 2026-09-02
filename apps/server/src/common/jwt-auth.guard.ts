import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PLATFORM_TOKEN_SCOPE } from '../modules/platform-admin/platform-admin.constants';

// passport-jwt 기반으로 리팩터. 실제 검증은 JwtStrategy 가 담당하고,
// 이 Guard 는 그저 'jwt' 전략을 적용한다는 선언만 담는다.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * 플랫폼 관리자 토큰은 같은 `JWT_SECRET` 으로 서명되므로 서명 검증만으로는 걸러지지 않는다.
   * 그런데 그 토큰에는 `tenantId` 가 없다 — 통과시키면 파티션 키가 undefined 인 채로
   * 테넌트 쿼리에 들어간다. 반대 방향은 `PlatformAdminGuard` 가 막는다.
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const principal = super.handleRequest(err, user, info, context, status);
    if (principal?.scope === PLATFORM_TOKEN_SCOPE) {
      throw new UnauthorizedException('플랫폼 관리자 토큰으로는 테넌트 API 를 호출할 수 없습니다.');
    }
    return principal;
  }
}
