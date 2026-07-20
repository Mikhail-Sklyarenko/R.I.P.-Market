import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogPriceBulkImportService } from './catalog-price-bulk-import.service';
import { CatalogPriceRefreshService } from './catalog-price-refresh.service';
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
    CatalogPriceBulkImportService,
    CatalogPriceRefreshService,
    ReferencePriceService,
    ItemIconService,
    ItemIconWarmerService,
  ],
  exports: [
    CatalogService,
    SteamMarketPriceService,
    ReferencePriceService,
    ItemIconService,
    CatalogPriceRefreshService,
  ],
})
export class CatalogModule {}
