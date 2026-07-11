import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListCatalogItemsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weapon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rarity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wear?: string;

  @ApiPropertyOptional({ description: 'Minimum float value (0–1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatMin?: number;

  @ApiPropertyOptional({ description: 'Maximum float value (0–1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatMax?: number;

  @ApiPropertyOptional({
    enum: ['popular', 'cheapest', 'newest', 'price_desc'],
  })
  @IsOptional()
  @IsIn(['popular', 'cheapest', 'newest', 'price_desc'])
  sort?: 'popular' | 'cheapest' | 'newest' | 'price_desc';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 24;
}
