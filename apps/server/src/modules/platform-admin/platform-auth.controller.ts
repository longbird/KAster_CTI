import { Body, Controller, Get, Headers, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { AllowMustChangePassword } from './allow-must-change-password.decorator';
import { ChangePlatformPasswordDto } from './dto/change-platform-password.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformLogoutDto, PlatformRefreshDto } from './dto/platform-refresh.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAuthService } from './platform-auth.service';

// WriteAvailabilityGuard 를 붙이지 않는다 — 장애 대응 모드에서도 로그인은 돼야
// 운영자가 상황을 볼 수 있다. `auth.controller.ts` 와 같은 판단이다.
@ApiTags('platform-auth')
@Controller('platform')
export class PlatformAuthController {
  constructor(private readonly platformAuth: PlatformAuthService) {}

  @Post('auth/login')
  @ApiOperation({
    summary: '플랫폼 관리자 로그인',
    description: 'loginId + password 검증 (bcrypt). access token 에는 tenantId 가 없고 scope=platform 이 들어간다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  login(
    @Body() dto: PlatformLoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.platformAuth.login(dto, { userAgent, ipAddress });
  }

  @Post('auth/refresh')
  @ApiOperation({ summary: '플랫폼 관리자 토큰 재발급', description: 'refresh 는 요청마다 회전한다.' })
  @ApiOkResponse({ type: ApiResponseDto })
  refresh(@Body() dto: PlatformRefreshDto) {
    return this.platformAuth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @ApiOperation({ summary: '플랫폼 관리자 로그아웃', description: '토큰이 없어도 멱등 성공.' })
  @ApiOkResponse({ type: ApiResponseDto })
  logout(@Body() dto: PlatformLogoutDto) {
    return this.platformAuth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @AllowMustChangePassword()
  @Post('auth/password')
  @ApiOperation({
    summary: '플랫폼 관리자 비밀번호 변경',
    description: '초기 비밀번호 상태에서 유일하게 열려 있는 변경 경로다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  changePassword(@Req() req: any, @Body() dto: ChangePlatformPasswordDto) {
    return this.platformAuth.changePassword(req.platformAdmin.platformAdminId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @AllowMustChangePassword()
  @Get('me')
  @ApiOperation({ summary: '현재 플랫폼 관리자 조회' })
  @ApiOkResponse({ type: ApiResponseDto })
  me(@Req() req: any) {
    // 가드가 이미 DB 에서 읽어 실어 준 값이다.
    return req.platformAdmin;
  }
}
