import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RolePermissionItemDto {
  @ApiProperty({ example: 'supervisor' })
  @IsString()
  roleCode!: string;

  @ApiProperty({ example: 'reports/logs' })
  @IsString()
  menuKey!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  canView!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  canCreate!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  canUpdate!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canDelete!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  canOperate!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  canExport!: boolean;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [RolePermissionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionItemDto)
  items!: RolePermissionItemDto[];
}
