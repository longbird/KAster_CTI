import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function runFilter(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/admin/settings/system' }),
    }),
  } as any;

  new AllExceptionsFilter().catch(exception, host);
  return { status, body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter 구조화된 에러 코드', () => {
  it('예외 본문의 code 를 그대로 보존한다', () => {
    // 이게 깨지면 관리자 앱이 "장애 대응 모드라 저장이 막혔다" 를 일반 503 과 구분하지 못한다.
    const { status, body } = runFilter(
      new ServiceUnavailableException({
        code: 'OPERATING_MODE_RESTRICTED',
        message: 'DB 장애 대응 모드에서는 일반 설정 변경을 저장할 수 없습니다.',
        operatingMode: 'DEGRADED',
      }),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body.error.code).toBe('OPERATING_MODE_RESTRICTED');
  });

  it('code 외의 부가 필드도 error 안에 남긴다', () => {
    const { body } = runFilter(
      new ServiceUnavailableException({
        code: 'OPERATING_MODE_RESTRICTED',
        message: '차단',
        operatingMode: 'RECOVERING',
      }),
    );

    expect(body.error.operatingMode).toBe('RECOVERING');
    expect(body.error.message).toBe('차단');
  });

  it('code 가 없으면 기존처럼 error 필드나 상태 코드에서 유도한다', () => {
    const { body } = runFilter(new HttpException({ message: 'nope' }, HttpStatus.BAD_REQUEST));

    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('nope');
  });

  it('Nest 기본 예외 형태(error 필드)는 그대로 동작한다', () => {
    const { body } = runFilter(new HttpException('Forbidden', HttpStatus.FORBIDDEN));

    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.message).toBe('Forbidden');
  });

  it('statusCode 같은 Nest 내부 필드는 error 로 새어나가지 않는다', () => {
    const { body } = runFilter(
      new HttpException({ statusCode: 400, message: 'bad', code: 'X' }, HttpStatus.BAD_REQUEST),
    );

    expect(body.error.statusCode).toBeUndefined();
    expect(body.error.code).toBe('X');
  });
});
