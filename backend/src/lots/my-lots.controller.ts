import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { LotsService } from './lots.service';

@ApiTags('lots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/lots')
export class MyLotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  async listMine(@CurrentUser() user: AuthUser) {
    return this.lotsService.listMyLots(user.sub);
  }
}
