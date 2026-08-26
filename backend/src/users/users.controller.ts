import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserOrExtensionAuthGuard } from '../extension/guards/user-or-extension-auth.guard';
import { UpdateTradeUrlDto } from './dto/update-trade-url.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** I3: extension session may read profile (trade URL) for overlay sell gates. */
  @UseGuards(UserOrExtensionAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getById(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/trade-url')
  async updateTradeUrl(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateTradeUrlDto,
  ) {
    return this.usersService.updateTradeUrl(user.sub, body.tradeUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/steam')
  async unlinkSteam(@CurrentUser() user: AuthUser) {
    return this.usersService.unlinkSteamId(user.sub);
  }
}
