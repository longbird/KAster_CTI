import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Postgres `uuid` 컬럼이 받아 주는 형태. 8-4-4-4-12 hex 이면 되고 버전·변형 자리는 보지 않는다.
 */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidFormat(value: unknown): boolean {
  return typeof value === 'string' && UUID_FORMAT.test(value);
}

/**
 * 식별자가 UUID <b>형태</b>인지만 본다.
 *
 * `class-validator` 의 `@IsUUID()` 를 쓰지 않는 이유: 그것은 RFC 버전 자리를 함께 검사해서
 * 버전 4 가 아닌 값을 거부한다. 그런데 이 프로젝트가 스스로 만드는 ID 가 그렇다 —
 * 시드 계정(`...0201`)과 앱 상수인 기본 테넌트(`...0001`)는 사람이 읽을 수 있게 고정해 둔
 * 값이라 버전 자리가 0 이다. 그래서 관리자 화면에서 시드 상담원을 호분배룰에 넣을 수 없었다.
 *
 * DB 가 저장해 주는 값을 API 가 거부하면, 넣어 둔 데이터를 API 로는 영영 가리킬 수 없다.
 * 경계 검증이 DB 계약보다 엄격할 이유가 없다.
 */
export function IsUuidFormat(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUuidFormat',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isUuidFormat(value),
        defaultMessage: () => `${propertyName} must be a UUID`,
      },
    });
  };
}
