import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** `agentStatusHistory.statusCode` / `reasonCode` 가 `VarChar(32)` 다. */
const STATUS_CODE_MAX_LENGTH = 32;

/** 앞뒤 공백을 떼고 넘긴다. 안 떼면 `" AVAILABLE"` 이 그대로 저장돼 판정에서 다른 값이 된다. */
const Trimmed = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ChangeAgentStatusDto {
  /**
   * 상태 코드의 <b>목록</b>은 여기서 막지 않는다. 서버에 정해진 목록이 없고, 모르는 코드는
   * "행이 있으니 로그인해 있다" 로 읽는 것이 `shouldPauseQueue` 의 설계다. 목록을 여기서
   * 새로 만들면 판정이 두 벌이 된다. 길이와 빈 값만 본다 — 그건 DB 계약이다.
   */
  @ApiProperty()
  @Trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(STATUS_CODE_MAX_LENGTH)
  statusCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(STATUS_CODE_MAX_LENGTH)
  reasonCode?: string;
}
