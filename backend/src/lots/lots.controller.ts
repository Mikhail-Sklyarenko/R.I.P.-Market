import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { CreateLotDto } from './dto/create-lot.dto';
import { LotsService } from './lots.service';

@ApiTags('lots')
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateLotDto) {
    return this.lotsService.create(user.sub, body);
  }

  @Get()
  async listActive() {
    return this.lotsService.listActive();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AuthUser, @Param('id') lotId: string) {
    return this.lotsService.cancel(user.sub, lotId);
  }

  @Get(':id')
  async getById(@Param('id') lotId: string) {
    return this.lotsService.getById(lotId);
  }
}
