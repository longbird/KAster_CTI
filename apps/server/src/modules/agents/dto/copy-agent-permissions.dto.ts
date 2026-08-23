import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export const PERMISSION_COPY_CORE_SCOPES = [
  'queueMembership',
  'branchCidAuth',
  'menuPermissions',
  'agentSettingsProfile',
] as const;

export const PERMISSION_COPY_OPTION_SCOPES = ['outboundCallerIdOverride'] as const;

export const PERMISSION_COPY_SCOPES = [
  ...PERMISSION_COPY_CORE_SCOPES,
  ...PERMISSION_COPY_OPTION_SCOPES,
] as const;

export type PermissionCopyScope = (typeof PERMISSION_COPY_SCOPES)[number];

export class CopyAgentPermissionsDto {
  @ApiProperty({ description: '권한을 복제해 올 소스 상담원' })
  @IsUuidFormat()
  sourceAgentId!: string;

  @ApiProperty({
    description: '복제할 권한 영역. 기본 4개 + 옵션 (outboundCallerIdOverride 는 향후 상담원 단위 예외용).',
    enum: PERMISSION_COPY_SCOPES,
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(PERMISSION_COPY_SCOPES, { each: true })
  scopes!: PermissionCopyScope[];
}
