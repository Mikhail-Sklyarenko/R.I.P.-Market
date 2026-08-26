import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExtensionSuggestedPriceItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  marketHashName?: string;

  /** Steam asset id (`assetExternalId` on the platform inventory row). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  steamAssetId?: string;
}

export class ExtensionSuggestedPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ExtensionSuggestedPriceItemDto)
  items!: ExtensionSuggestedPriceItemDto[];

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;

  /** Serve DB/memory cache only — no Steam network fetch. */
  @IsOptional()
  @IsBoolean()
  cacheOnly?: boolean;
}
