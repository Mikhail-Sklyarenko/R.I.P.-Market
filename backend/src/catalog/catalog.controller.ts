import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrderBookQueryDto } from '../order-book/dto/get-order-book-query.dto';
import { OrderBookService } from '../order-book/order-book.service';
import { CatalogService } from './catalog.service';
import { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly orderBookService: OrderBookService,
  ) {}

  @Get('items')
  listItems(@Query() query: ListCatalogItemsQueryDto) {
    return this.catalogService.listItems(query);
  }

  @Get('items/:id/order-book')
  getItemOrderBook(
    @Param('id') itemId: string,
    @Query() query: GetOrderBookQueryDto,
  ) {
    return this.orderBookService.getForItem(itemId, query.wear);
  }

  @Get('items/:id')
  getItem(@Param('id') itemId: string) {
    return this.catalogService.getItem(itemId);
  }

  @Get('popular')
  listPopular(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number(limitRaw) : 12;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 50',
      );
    }
    return this.catalogService.listPopular(limit);
  }

  @Post('steam-prices')
  getSteamPrices(
    @Body()
    body: {
      marketHashNames?: string[];
      cacheOnly?: boolean;
      forceRefresh?: boolean;
    },
  ) {
    const names = body.marketHashNames ?? [];
    if (!Array.isArray(names) || names.length === 0) {
      throw new BadRequestException(
        'marketHashNames must be a non-empty array',
      );
    }
    if (names.length > 40) {
      throw new BadRequestException('marketHashNames max length is 40');
    }
    return this.catalogService.getSteamPrices(names, {
      cacheOnly: body.cacheOnly === true,
      forceRefresh: body.forceRefresh === true,
    });
  }

}
