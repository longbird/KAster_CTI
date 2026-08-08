import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OperatingModeService } from './operating-mode.service';
import { WRITE_AVAILABILITY_KEY, WriteKind } from './write-availability.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * DB 장애 대응 모드에서 안전하지 않은 쓰기를 막는다.
 *
 * 500 이 아니라 503 + 구조화된 코드로 답한다. 관리자 앱이 "지금은 저장할 수 없다" 를
 * 사용자에게 설명하려면 원인이 장애 대응 모드라는 사실을 구분해서 받아야 한다.
 */
@Injectable()
export class WriteAvailabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly operatingMode: OperatingModeService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<WriteKind | undefined>(
      WRITE_AVAILABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 데코레이터가 없으면 이 가드의 관심사가 아니다.
    if (!kind) return true;

    // 컨트롤러 클래스 전체에 데코레이터를 붙일 수 있게 조회 메서드는 통과시킨다.
    // 장애 중에도 관리자 화면은 읽혀야 운영자가 상황을 파악한다.
    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(String(request?.method ?? '').toUpperCase())) {
      return true;
    }

    const snapshot = this.operatingMode.snapshot();
    const allowed =
      kind === 'emergency'
        ? snapshot.restrictions.allowEmergencyConfigWrites
        : snapshot.restrictions.allowGeneralConfigWrites;

    if (allowed) return true;

    throw new ServiceUnavailableException({
      code: 'OPERATING_MODE_RESTRICTED',
      message:
        kind === 'emergency'
          ? 'DB 장애 대응 모드에서는 긴급 설정 변경도 적용할 수 없습니다.'
          : 'DB 장애 대응 모드에서는 일반 설정 변경을 저장할 수 없습니다.',
      operatingMode: snapshot.mode,
    });
  }
}
