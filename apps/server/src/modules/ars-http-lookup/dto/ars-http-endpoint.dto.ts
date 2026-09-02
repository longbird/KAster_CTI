import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpsertArsHttpEndpointDto {
  @ApiProperty({ description: '관리자에 보이는 이름' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ['GET', 'POST'], default: 'GET' })
  @IsOptional()
  @IsIn(['GET', 'POST'])
  method?: string;

  @ApiProperty({ description: 'https 필수. 사설 대역일 때만 http 를 받는다.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  url: string;

  @ApiPropertyOptional({
    description: '{ "파라미터명": "CALLER|COLLECTED|ENTRY_DID|LINKEDID|LITERAL:..." }',
  })
  @IsOptional()
  @IsObject()
  requestMapping?: Record<string, string>;

  @ApiPropertyOptional({ enum: ['NONE', 'BEARER', 'HEADER'], default: 'NONE' })
  @IsOptional()
  @IsIn(['NONE', 'BEARER', 'HEADER'])
  authType?: string;

  @ApiPropertyOptional({ description: 'authType=HEADER 일 때 쓸 헤더 이름' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  authHeaderName?: string;

  @ApiPropertyOptional({
    description:
      '인증 값(평문). 저장 시 암호화되며 **어떤 응답으로도 다시 나오지 않는다**. '
      + '수정에서 생략하면 기존 값을 유지한다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  authSecret?: string;

  @ApiProperty({ description: '응답에서 값을 꺼낼 점 표기 경로 (예: data.customer.grade)' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  resultPath: string;

  @ApiPropertyOptional({ enum: ['EXISTS', 'EQUALS', 'IN'], default: 'EXISTS' })
  @IsOptional()
  @IsIn(['EXISTS', 'EQUALS', 'IN'])
  matchMode?: string;

  @ApiPropertyOptional({ description: 'EQUALS 는 한 값, IN 은 쉼표로 구분한 목록' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(256)
  matchValue?: string;

  @ApiPropertyOptional({ minimum: 500, maximum: 5000, default: 2000 })
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(5000)
  timeoutMs?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestArsHttpEndpointDto {
  @ApiPropertyOptional({ description: '발신번호 자리에 넣어볼 값' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  caller?: string;

  @ApiPropertyOptional({ description: '입력받은 번호 자리에 넣어볼 값' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  collected?: string;

  @ApiPropertyOptional({ description: '대표번호 자리에 넣어볼 값' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  entryDid?: string;
}
