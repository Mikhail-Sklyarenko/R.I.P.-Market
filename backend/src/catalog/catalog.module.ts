import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ItemIconService } from './item-icon.service';
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
  ],
  exports: [
    CatalogService,
    SteamMarketPriceService,
    ReferencePriceService,
    ItemIconService,
  ],
})
export class CatalogModule {}
