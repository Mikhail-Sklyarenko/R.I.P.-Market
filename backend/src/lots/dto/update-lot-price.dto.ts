import { IsInt, IsPositive } from 'class-validator';

export class UpdateLotPriceDto {
  @IsInt()
  @IsPositive()
  priceMinor!: number;
}
