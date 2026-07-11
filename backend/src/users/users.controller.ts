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
import { UpdateTradeUrlDto } from './dto/update-trade-url.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getById(user.sub);
  }

  @Patch('me/trade-url')
  async updateTradeUrl(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateTradeUrlDto,
  ) {
    return this.usersService.updateTradeUrl(user.sub, body.tradeUrl);
  }

  @Delete('me/steam')
  async unlinkSteam(@CurrentUser() user: AuthUser) {
    return this.usersService.unlinkSteamId(user.sub);
  }
}
