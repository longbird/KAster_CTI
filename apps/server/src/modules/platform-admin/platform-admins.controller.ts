import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { UpdatePlatformAdminDto } from './dto/update-platform-admin.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';

@ApiTags('platform-admins')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('platform/admins')
@RequiresWriteAvailability('general')
// 계정 관리는 설정 쓰기다. 조회는 WriteAvailabilityGuard 를 그대로 통과한다.
export class PlatformAdminsController {
  constructor(private readonly admins: PlatformAdminsService) {}

  @Get()
  @ApiOperation({ summary: '플랫폼 관리자 목록' })
  @ApiOkResponse({ type: ApiResponseDto })
  list() {
    return this.admins.list();
  }

  @Post()
  @ApiOperation({
    summary: '플랫폼 관리자 생성',
    description: '만들어진 계정은 첫 로그인에서 비밀번호를 바꿔야 한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  create(@Body() dto: CreatePlatformAdminDto) {
    return this.admins.create(dto);
  }

  @Patch(':platformAdminId')
  @ApiOperation({
    summary: '플랫폼 관리자 활성/비활성',
    description: '자기 계정은 비활성화할 수 없다 — 마지막 관리자가 자기를 끄면 아무도 로그인할 수 없다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  update(
    @Param('platformAdminId') platformAdminId: string,
    @Body() dto: UpdatePlatformAdminDto,
    @Req() req: any,
  ) {
    return this.admins.setActive(platformAdminId, dto.isActive, req.platformAdmin.platformAdminId);
  }
}
