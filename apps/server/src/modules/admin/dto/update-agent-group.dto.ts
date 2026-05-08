import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateAgentGroupDto {
  @ApiProperty({ required: false, example: 'TEAM_A' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message: 'groupCode must be alphanumeric with - or _',
  })
  groupCode?: string;

  @ApiProperty({ required: false, example: '영업 1팀' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
