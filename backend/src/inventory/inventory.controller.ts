import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async getMyInventory(@CurrentUser() user: AuthUser) {
    return this.inventoryService.getUserInventory(user.sub);
  }

  @Post(':assetId/check')
  async checkAsset(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.inventoryService.checkAsset(user.sub, assetId);
  }
}
