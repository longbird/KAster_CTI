import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('search')
  search(@CurrentUser() user: any, @Query('phone') phone: string) {
    return this.customersService.searchByPhone(user.tenantId, phone);
  }

  @Get(':customerId')
  getOne(@CurrentUser() user: any, @Param('customerId') customerId: string) {
    return this.customersService.getById(user.tenantId, customerId);
  }
}
