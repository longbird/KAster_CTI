import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateAgentGroupDto {
  @ApiProperty({ example: 'TEAM_A' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message: 'groupCode must be alphanumeric with - or _',
  })
  groupCode!: string;

  @ApiProperty({ example: '영업 1팀' })
  @IsString()
  @MaxLength(128)
  groupName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
