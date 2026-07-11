import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class InventoryPriceHintsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  marketHashNames!: string[];
}
