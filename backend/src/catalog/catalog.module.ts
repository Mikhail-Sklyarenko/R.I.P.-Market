import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ReferencePriceService } from './reference-price.service';
import { SteamMarketPriceService } from './steam-market-price.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, SteamMarketPriceService, ReferencePriceService],
  exports: [CatalogService, SteamMarketPriceService, ReferencePriceService],
})
export class CatalogModule {}
