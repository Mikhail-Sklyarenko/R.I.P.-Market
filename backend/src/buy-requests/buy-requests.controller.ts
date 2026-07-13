import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { BuyRequestsService } from './buy-requests.service';
import { CreateBuyRequestDto } from './dto/create-buy-request.dto';

@ApiTags('buy-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('buy-requests')
export class BuyRequestsController {
  constructor(private readonly buyRequestsService: BuyRequestsService) {}

  @Post('items/:itemDefinitionId')
  create(
    @CurrentUser() user: AuthUser,
    @Param('itemDefinitionId') itemDefinitionId: string,
    @Body() body: CreateBuyRequestDto,
  ) {
    return this.buyRequestsService.create(user.sub, itemDefinitionId, body);
  }

  @Get('mine')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('itemDefinitionId') itemDefinitionId?: string,
  ) {
    return this.buyRequestsService.listMine(user.sub, itemDefinitionId);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') buyRequestId: string) {
    return this.buyRequestsService.cancel(user.sub, buyRequestId);
  }
}
