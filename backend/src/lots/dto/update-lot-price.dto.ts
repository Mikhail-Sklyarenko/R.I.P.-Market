import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class UpdateLotPriceDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  priceMinor!: number;
}
