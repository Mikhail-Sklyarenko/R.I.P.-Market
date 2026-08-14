import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { MAX_BUY_REQUEST_QUANTITY } from '../buy-request.constants';

export class CreateBuyRequestDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxPriceMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BUY_REQUEST_QUANTITY)
  quantity?: number;

  /** Wear for catalog-seeded skin cards (FN/MW/FT/WW/BS). */
  @IsOptional()
  @IsIn(['FN', 'MW', 'FT', 'WW', 'BS'])
  wear?: 'FN' | 'MW' | 'FT' | 'WW' | 'BS';
}
