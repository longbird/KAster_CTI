import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { SetQueueMembersDto } from './dto/set-queue-members.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { QueuesService } from './queues.service';

@ApiTags('queues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('queues')
export class QueuesController {
  constructor(
    private readonly queuesService: QueuesService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get('summary')
  async summary(@CurrentUser() user: any) {
    if (user.role === 'supervisor' || user.role === 'admin') {
      await this.menuPermissionService.assertAnyMenuAction(
        user.tenantId,
        user.role,
        ['dashboard', 'queues'],
        'view',
        user.sub,
      );
    }
    return this.queuesService.getSummary(user.tenantId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async list(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'view', user.sub);
    return this.queuesService.listSettings(user.tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async create(@CurrentUser() user: any, @Body() dto: CreateQueueDto) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'create', user.sub);
    if (dto.members !== undefined) {
      await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'operate', user.sub);
    }
    return this.queuesService.create(user.tenantId, dto);
  }

  @Patch(':queueId')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async update(
    @CurrentUser() user: any,
    @Param('queueId') queueId: string,
    @Body() dto: UpdateQueueDto,
  ) {
    const queueFieldsRequested =
      dto.queueDisplayName !== undefined ||
      dto.strategy !== undefined ||
      dto.maxWaitSeconds !== undefined ||
      dto.ringTimeoutSeconds !== undefined ||
      dto.wrapupSeconds !== undefined ||
      dto.autopause !== undefined ||
      dto.overflowRules !== undefined;

    if (queueFieldsRequested) {
      await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'update', user.sub);
    }
    if (dto.members !== undefined) {
      await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'operate', user.sub);
    }
    return this.queuesService.update(user.tenantId, queueId, dto);
  }

  @Delete(':queueId')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async deactivate(@CurrentUser() user: any, @Param('queueId') queueId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'delete', user.sub);
    return this.queuesService.deactivate(user.tenantId, queueId);
  }

  @Get(':queueId/members')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async listMembers(@CurrentUser() user: any, @Param('queueId') queueId: string) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'view', user.sub);
    return this.queuesService.listMembers(user.tenantId, queueId);
  }

  @Put(':queueId/members')
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'admin')
  async setMembers(
    @CurrentUser() user: any,
    @Param('queueId') queueId: string,
    @Body() dto: SetQueueMembersDto,
  ) {
    await this.menuPermissionService.assertMenuAction(user.tenantId, user.role, 'settings/queues', 'operate', user.sub);
    return this.queuesService.setMembers(user.tenantId, queueId, dto.members ?? []);
  }
}
