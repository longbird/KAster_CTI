import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AgentStateService } from '../calls/agent-state.service';
import { AgentsService } from './agents.service';
import { ChangeAgentStatusDto } from './dto/change-agent-status.dto';

const SUPERVISORY_ROLES = new Set(['supervisor', 'admin']);

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentStateService: AgentStateService,
    private readonly agentsService: AgentsService,
  ) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.agentsService.listForTenant(user.tenantId);
  }

  @Get(':agentId')
  detail(@CurrentUser() user: any, @Param('agentId') agentId: string) {
    return this.agentsService.getDetail(user.tenantId, agentId);
  }

  @Get(':agentId/history')
  history(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.agentsService.getHistory(
      user.tenantId,
      agentId,
      limit ? Number(limit) : 50,
    );
  }

  @Post(':agentId/status')
  async changeStatus(
    @CurrentUser() user: any,
    @Param('agentId') agentId: string,
    @Body() dto: ChangeAgentStatusDto,
  ) {
    // 본인 또는 supervisor/admin 만 상태 변경 허용.
    if (user.sub !== agentId && !SUPERVISORY_ROLES.has(user.role)) {
      throw new ForbiddenException('본인 또는 supervisor/admin 만 허용');
    }
    const row = await this.agentStateService.changeStatus(
      agentId,
      dto.statusCode,
      dto.reasonCode,
    );
    return { success: true, data: row, error: null };
  }
}
