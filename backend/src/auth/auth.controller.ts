import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { getProvidersConfig } from '../providers/config';
import { MockLoginDto } from './dto/mock-login.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('config')
  getConfig() {
    const config = getProvidersConfig();
    return {
      authProvider: config.auth,
      steamLoginAvailable: config.auth === 'steam',
      mockLoginAvailable: true,
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
      throw new BadRequestException('Steam login is not available with the current auth provider');
    }
    return result;
  }

  @Post('mock-login')
  async mockLogin(@Body() body: MockLoginDto) {
    return this.authService.mockLogin(body);
  }
}
