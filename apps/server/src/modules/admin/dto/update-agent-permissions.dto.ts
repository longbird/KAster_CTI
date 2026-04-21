import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

const ROLE_CODES = ['agent', 'supervisor', 'admin'] as const;

export class AgentPermissionItemDto {
  @ApiProperty({ example: 'reports/logs' })
  @IsString()
  menuKey!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  canView!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canCreate!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canUpdate!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canDelete!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canOperate!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canExport!: boolean;
}

export class UpdateAgentPermissionsDto {
  @ApiPropertyOptional({ enum: ROLE_CODES, example: 'supervisor' })
  @IsOptional()
  @IsIn(ROLE_CODES)
  baseRoleCode?: string;

  @ApiProperty({ type: [AgentPermissionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentPermissionItemDto)
  items!: AgentPermissionItemDto[];
}
