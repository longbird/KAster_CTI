import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AdminService } from './admin.service';

const ALLOWED_ROLES = new Set(['supervisor', 'admin']);

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: any) {
    // 단순 역할 체크. 본격 RBAC 은 conv 33·36 의 RolesGuard 를 도입하면 됨.
    if (!ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('supervisor or admin required');
    }
    return this.adminService.getDashboard(user.tenantId);
  }
}
