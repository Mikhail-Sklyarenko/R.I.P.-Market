import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExtensionBrowserAssistAssetDto {
  @IsString()
  @MaxLength(64)
  assetId!: string;

  @IsString()
  @MaxLength(256)
  marketHashName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  instanceId?: string;

  @IsOptional()
  @IsBoolean()
  tradable?: boolean;

  @IsOptional()
  @IsBoolean()
  marketable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tradeLockUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  floatValue?: string | null;

  @IsOptional()
  @IsNumber()
  paintSeed?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  wear?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string | null;
}

export class ExtensionBrowserAssistInventoryDto {
  @IsString()
  @Matches(/^\d{17}$/)
  steamId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExtensionBrowserAssistAssetDto)
  assets!: ExtensionBrowserAssistAssetDto[];

  /** When true, mark AVAILABLE assets missing from this snapshot as REMOVED. */
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
