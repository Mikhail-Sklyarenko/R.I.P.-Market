import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class CreateLotDto {
  @IsUUID()
  inventoryAssetId!: string;

  @IsInt()
  @IsPositive()
  priceMinor!: number;
}
