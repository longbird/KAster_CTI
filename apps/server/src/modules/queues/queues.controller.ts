import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueuesService } from './queues.service';
import { UpdateQueueDto } from './dto/update-queue.dto';

@ApiTags('queues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.queuesService.getSummary(user.tenantId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  list(@CurrentUser() user: any) {
    return this.queuesService.listSettings(user.tenantId);
  }

  @Patch(':queueId')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  update(
    @CurrentUser() user: any,
    @Param('queueId') queueId: string,
    @Body() dto: UpdateQueueDto,
  ) {
    return this.queuesService.update(user.tenantId, queueId, dto);
  }
}
