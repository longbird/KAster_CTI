import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export const TREND_RESOLUTIONS = ['PT1M', 'PT5M', 'PT1H', 'P1D'] as const;

export class ListTrendsQueryDto {
  @ApiPropertyOptional({ example: '2026-08-25T00:00:00+09:00', description: '조회 시작 (ISO8601)' })
  @IsISO8601()
  from!: string;

  @ApiPropertyOptional({ example: '2026-08-26T00:00:00+09:00', description: '조회 끝 (ISO8601, 미포함)' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional({
    enum: TREND_RESOLUTIONS,
    description: '구간 해상도. 생략하면 기간 길이에 맞춰 자동으로 고른다.',
  })
  @IsOptional()
  @IsIn(TREND_RESOLUTIONS as unknown as string[])
  resolution?: (typeof TREND_RESOLUTIONS)[number];

  @ApiPropertyOptional({ description: '큐 단위 조회. 생략하면 테넌트 전체 합계.' })
  @IsOptional()
  @IsUUID()
  queueId?: string;
}
