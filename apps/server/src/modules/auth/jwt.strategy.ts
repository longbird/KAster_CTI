import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// cti-runtime-fileset 의 관용 JwtStrategy 를 차용.
// passport-jwt 가 Authorization 헤더에서 Bearer 토큰 파싱, 서명 검증, 만료 검사를
// 자동으로 처리. validate() 의 반환값이 request.user 에 들어간다.
export interface JwtPayload {
  sub: string;
  role: string;
  extension: string;
  tenantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'change_me'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
