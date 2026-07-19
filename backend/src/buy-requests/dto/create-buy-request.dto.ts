import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';

export class CreateBuyRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxPriceMinor?: number;

  /** Wear for catalog-seeded skin cards (FN/MW/FT/WW/BS). */
  @IsOptional()
  @IsIn(['FN', 'MW', 'FT', 'WW', 'BS'])
  wear?: 'FN' | 'MW' | 'FT' | 'WW' | 'BS';
}
