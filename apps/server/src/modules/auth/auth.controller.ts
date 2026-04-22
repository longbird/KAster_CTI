import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { LoginDto } from './login.dto';
import { RefreshDto } from './refresh.dto';
import { AuthService } from './auth.service';
import { CreateHandoffDto } from './dto/create-handoff.dto';
import { ExchangeHandoffDto } from './dto/exchange-handoff.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  @ApiOperation({
    summary: '상담원 로그인',
    description: '기본적으로 loginId + extension + password 검증 (bcrypt). supervisor/admin 은 extension 없이도 로그인 가능. 성공 시 access(15m) + refresh(14d) 토큰 쌍 반환.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.login(dto, { userAgent, ipAddress });
  }

  @Post('auth/refresh')
  @ApiOperation({
    summary: 'Refresh token 으로 새 access 발급',
    description: 'refresh 는 요청마다 회전 (이전 것은 revoke 후 새로 발급). 재사용 공격 방지.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @ApiOperation({ summary: '로그아웃', description: 'refresh token 의 revokedAt 을 현재 시각으로 설정. 토큰 없어도 멱등 성공.' })
  @ApiOkResponse({ type: ApiResponseDto })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('auth/logout-all')
  @ApiOperation({ summary: '현재 에이전트의 모든 세션 종료', description: '비밀번호 변경/계정 탈취 의심 시 사용.' })
  @ApiOkResponse({ type: ApiResponseDto })
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me/session')
  @ApiOperation({ summary: '현재 로그인 세션 조회' })
  @ApiOkResponse({ type: ApiResponseDto })
  me(@CurrentUser() user: any) {
    return this.authService.getSession(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('auth/handoff')
  @ApiOperation({
    summary: 'Desktop handoff token 생성',
    description: '현재 로그인한 웹 세션이 60초짜리 1회용 handoff token 을 발급해 Windows 런타임이 교환할 수 있게 한다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  createDesktopHandoff(@CurrentUser() user: any, @Body() dto: CreateHandoffDto) {
    return this.authService.createDesktopHandoff(user, dto);
  }

  @Post('auth/handoff/exchange')
  @ApiOperation({
    summary: 'Desktop handoff token 교환',
    description: '1회용 handoff token 을 access/refresh token 으로 교환한다. 성공하면 같은 token 은 재사용할 수 없다.',
  })
  @ApiOkResponse({ type: ApiResponseDto })
  exchangeDesktopHandoff(@Body() dto: ExchangeHandoffDto) {
    return this.authService.exchangeDesktopHandoff(dto.handoffToken);
  }
}
