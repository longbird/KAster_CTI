import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list.query.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  private async assertMenuAction(user: any, menuKey: string, action: 'view' | 'create' | 'update' | 'delete' | 'operate' | 'export') {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      menuKey,
      action,
      user.sub,
    );
  }

  private async assertMenuActions(
    user: any,
    menuKeys: string[],
    action: 'view' | 'create' | 'update' | 'delete' | 'operate' | 'export',
  ) {
    for (const menuKey of [...new Set(menuKeys)]) {
      await this.assertMenuAction(user, menuKey, action);
    }
  }

  @Get()
  async list(@CurrentUser() user: any, @Query() query: CustomerListQueryDto) {
    await this.assertMenuAction(user, 'customers', 'view');
    return this.customersService.listCustomers(user.tenantId, query);
  }

  @Get('search')
  async search(@CurrentUser() user: any, @Query('phone') phone: string) {
    await this.assertMenuAction(user, 'customers', 'view');
    return this.customersService.searchByPhone(user.tenantId, phone);
  }

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateCustomerDto) {
    await this.assertMenuAction(user, 'customers', 'create');
    return this.customersService.createCustomer(user.tenantId, dto);
  }

  @Post('import')
  async import(@CurrentUser() user: any, @Body() dto: ImportCustomersDto) {
    await this.assertMenuAction(user, 'customers', 'create');
    return this.customersService.importCustomers(user.tenantId, dto.rows);
  }

  @Get(':customerId')
  async getOne(@CurrentUser() user: any, @Param('customerId') customerId: string) {
    await this.assertMenuAction(user, await this.customersService.getCustomerMenuKey(user.tenantId, customerId), 'view');
    return this.customersService.getById(user.tenantId, customerId);
  }

  @Get(':customerId/history')
  async history(@CurrentUser() user: any, @Param('customerId') customerId: string) {
    await this.assertMenuAction(user, await this.customersService.getCustomerMenuKey(user.tenantId, customerId), 'view');
    return this.customersService.getCustomerHistory(user.tenantId, customerId);
  }

  @Put(':customerId')
  async update(@CurrentUser() user: any, @Param('customerId') customerId: string, @Body() dto: UpdateCustomerDto) {
    await this.assertMenuAction(user, await this.customersService.getCustomerMenuKey(user.tenantId, customerId), 'update');
    return this.customersService.updateCustomer(user.tenantId, customerId, dto);
  }

  @Delete(':customerId')
  async remove(@CurrentUser() user: any, @Param('customerId') customerId: string) {
    await this.assertMenuAction(user, await this.customersService.getCustomerMenuKey(user.tenantId, customerId), 'delete');
    return this.customersService.deleteCustomer(user.tenantId, customerId);
  }
}
