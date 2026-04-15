import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// 컨트롤러가 { success, data, error } 형태로 이미 감싸서 반환하면 그대로 통과.
// 그렇지 않으면 자동 래핑. 새 엔드포인트를 추가할 때 envelope 보일러플레이트를
// 줄여준다.
function isEnvelope(value: unknown): value is { success: boolean; data: unknown; error: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in (value as object) &&
    'data' in (value as object)
  );
}

@Injectable()
export class ResponseTransformInterceptor<T = unknown> implements NestInterceptor<T, unknown> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (isEnvelope(value)) return value;
        return { success: true, data: value, error: null };
      }),
    );
  }
}
