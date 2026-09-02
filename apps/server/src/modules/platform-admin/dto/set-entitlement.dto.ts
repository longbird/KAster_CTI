import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetEntitlementDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** 되돌릴 수 없는 기능을 켤 때만 필요하다. 실수로 누른 것과 알고 누른 것을 가른다. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledgeIrreversible?: boolean;
}
