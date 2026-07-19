import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class InventoryPriceHintsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  marketHashNames!: string[];

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;

  /** Serve DB/memory cache only — no Steam network fetch. */
  @IsOptional()
  @IsBoolean()
  cacheOnly?: boolean;
}
