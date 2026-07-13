import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
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
  ],
  exports: [CatalogService, SteamMarketPriceService, ReferencePriceService],
})
export class CatalogModule {}
