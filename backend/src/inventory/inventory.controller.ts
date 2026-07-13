import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { InventoryPriceHintsDto } from './dto/inventory-price-hints.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @ApiQuery({ name: 'forceRefresh', required: false, type: Boolean })
  @Get()
  async getMyInventory(
    @CurrentUser() user: AuthUser,
    @Query('forceRefresh') forceRefresh?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.inventoryService.getUserInventory(user.sub, {
      forceRefresh: forceRefresh === 'true',
      role: user.role,
    });

    if (result.sync.stale) {
      res?.setHeader('X-Inventory-Stale', 'true');
    }
    if (result.sync.warning) {
      res?.setHeader(
        'X-Inventory-Warning',
        result.sync.warning.replace(/[^\x20-\x7E]/g, ''),
      );
    }

    return result;
  }

  @Post('price-hints')
  getPriceHints(@Body() body: InventoryPriceHintsDto) {
    return this.inventoryService.getPriceHints(
      body.marketHashNames,
      body.forceRefresh ?? false,
    );
  }

  @Post(':assetId/check')
  async checkAsset(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
  ) {
    return this.inventoryService.checkAsset(user.sub, assetId);
  }
}
