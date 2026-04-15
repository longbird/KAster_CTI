import { ApiProperty } from '@nestjs/swagger';

// conv 33·35·36 의 공통 응답 형태. 구체적인 데이터 타입은 각 엔드포인트가
// 자체 DTO 에서 정의하고, Swagger 상에서는 이 래퍼의 필드만 공통으로 보인다.
export class ApiErrorDto {
  @ApiProperty({ example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ required: false, type: Object })
  details?: unknown;
}

export class ApiResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ required: false })
  data?: T;

  @ApiProperty({ required: false, type: () => ApiErrorDto, nullable: true })
  error?: ApiErrorDto | null;
}
