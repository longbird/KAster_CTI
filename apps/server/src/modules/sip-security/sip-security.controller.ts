import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SipSecurityService } from './sip-security.service';

@ApiTags('sip-security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
@Controller('sip-security')
export class SipSecurityController {
  constructor(private readonly service: SipSecurityService) {}

  @Get('blocks')
  @ApiOperation({ summary: 'SIP 공격 임시 차단 목록 조회' })
  @ApiQuery({ name: 'includeExpired', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listBlocks(
    @CurrentUser() user: any,
    @Query('includeExpired') includeExpired?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.listBlocks(user.tenantId, {
      includeExpired: includeExpired === 'true',
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, data, error: null };
  }
}
