import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// 엔드포인트에 필요한 역할 중 하나라도 있으면 통과. JwtAuthGuard 뒤에 RolesGuard 가 동작.
// 예: @Roles('supervisor', 'admin')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
