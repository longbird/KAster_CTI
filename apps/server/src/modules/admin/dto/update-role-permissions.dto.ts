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
  canAccess!: boolean;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [RolePermissionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionItemDto)
  items!: RolePermissionItemDto[];
}
