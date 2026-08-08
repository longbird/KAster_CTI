import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// conv 26/36 의 글로벌 예외 필터. 모든 실패 응답을 { success:false, data:null, error }
// 공통 envelope 으로 래핑해 프론트가 항상 같은 형태를 파싱하도록 한다.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message: string | undefined;
    // 예외가 직접 붙인 구조화 필드(예: operatingMode)를 envelope 까지 살려 보낸다.
    let extras: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        message = (obj.message as string) ?? exception.message;
        // obj.code 를 먼저 본다. 이걸 놓치면 호출자가 붙인 도메인 코드가 사라지고
        // 상태 코드에서 유도한 일반 코드로 덮여, 프론트가 원인을 구분하지 못한다.
        code = (obj.code as string) ?? (obj.error as string) ?? this.statusToCode(status);
        extras = Object.fromEntries(
          Object.entries(obj).filter(
            ([key]) => !['code', 'error', 'message', 'statusCode'].includes(key),
          ),
        );
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // 대표적인 Prisma 에러만 기본 매핑. 상세 매핑은 후속.
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'Unique constraint violation';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Record not found';
      } else {
        code = `PRISMA_${exception.code}`;
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(`${request?.method} ${request?.url} -> ${status} ${code}`);
      if (exception instanceof Error && exception.stack) {
        this.logger.error(exception.stack);
      }
    }

    response.status(status).json({
      success: false,
      data: null,
      error: { code, message, ...extras },
    });
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'RATE_LIMITED';
      default: return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
