import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ItemIconService } from './item-icon.service';
import { ItemIconWarmerService } from './item-icon-warmer.service';
import { ReferencePriceService } from './reference-price.service';
import { SteamMarketPriceService } from './steam-market-price.service';
import { SteamPriceWarmerService } from './steam-price-warmer.service';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    SteamMarketPriceService,
    SteamPriceWarmerService,
    ReferencePriceService,
    ItemIconService,
    ItemIconWarmerService,
  ],
  exports: [
    CatalogService,
    SteamMarketPriceService,
    ReferencePriceService,
    ItemIconService,
  ],
})
export class CatalogModule {}
