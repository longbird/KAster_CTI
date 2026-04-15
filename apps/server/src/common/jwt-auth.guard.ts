import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// passport-jwt 기반으로 리팩터. 실제 검증은 JwtStrategy 가 담당하고,
// 이 Guard 는 그저 'jwt' 전략을 적용한다는 선언만 담는다.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
