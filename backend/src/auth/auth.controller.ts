import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { getProvidersConfig } from '../providers/config';
import { extractOpenIdParams } from '../providers/auth/steam-openid.util';
import { MockLoginDto } from './dto/mock-login.dto';
import { SteamLinkDto } from './dto/steam-link.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('config')
  getConfig() {
    const config = getProvidersConfig();
    const allowMockInSteamMode =
      process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE === 'true';
    return {
      authProvider: config.auth,
      steamLoginAvailable: config.auth === 'steam',
      mockLoginAvailable: config.auth !== 'steam' || allowMockInSteamMode,
      mockTradeEnabled: process.env.ENABLE_MOCK_TRADE !== 'false',
      mockDepositEnabled: process.env.ENABLE_MOCK_DEPOSIT !== 'false',
    };
  }

  @ApiQuery({ name: 'returnUrl', required: true })
  @Get('steam/login-url')
  getSteamLoginUrl(@Query('returnUrl') returnUrl?: string) {
    if (!returnUrl) {
      throw new BadRequestException('returnUrl query parameter is required');
    }
    const result = this.authService.getSteamLoginUrl(returnUrl);
    if (!result) {
      throw new BadRequestException(
        'Steam login is not available with the current auth provider',
      );
    }
    return result;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('steam/link-url')
  getSteamLinkUrl(@CurrentUser() user: AuthUser) {
    const result = this.authService.getSteamLinkLoginUrl(user.sub);
    if (!result) {
      throw new BadRequestException(
        'Steam link is not available with the current auth provider',
      );
    }
    return result;
  }

  @Get('steam/callback')
  async steamCallback(
    @Query() query: Record<string, string | string[] | undefined>,
    @Res() res: Response,
  ) {
    const linkState =
      typeof query.link_state === 'string' ? query.link_state : undefined;
    const openidParams = extractOpenIdParams(query);
    if (!openidParams['openid.mode']) {
      throw new BadRequestException('Missing OpenID callback parameters');
    }

    try {
      const authResponse = await this.authService.steamCallback(
        openidParams,
        linkState,
      );
      const redirectUrl = this.authService.buildFrontendCallbackUrl(
        authResponse,
        linkState ? { linked: '1' } : undefined,
      );
      return res.redirect(redirectUrl);
    } catch (error) {
      const frontendOrigin =
        process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      const origin = frontendOrigin.split(',')[0]?.trim() ?? frontendOrigin;
      const code =
        error instanceof AppException ? error.code : ErrorCode.STEAM_AUTH_FAILED;
      const message =
        error instanceof Error ? error.message : 'Steam authentication failed';
      const params = new URLSearchParams({ error: code, message });
      return res.redirect(
        `${origin}/login/steam/callback?${params.toString()}`,
      );
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('steam/link')
  async steamLink(
    @CurrentUser() user: AuthUser,
    @Body() body: SteamLinkDto,
  ) {
    return this.authService.steamLink(user.sub, body.openidParams);
  }

  @Post('mock-login')
  async mockLogin(@Body() body: MockLoginDto) {
    return this.authService.mockLogin(body);
  }
}
