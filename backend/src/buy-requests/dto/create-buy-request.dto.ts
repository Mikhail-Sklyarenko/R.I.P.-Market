import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class CreateBuyRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxPriceMinor?: number;
}
