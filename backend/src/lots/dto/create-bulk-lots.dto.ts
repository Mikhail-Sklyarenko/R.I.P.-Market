import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { MAX_BULK_LISTING_COUNT } from '../bulk-listing.util';

export class CreateBulkLotsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_BULK_LISTING_COUNT)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  inventoryAssetIds!: string[];

  @IsInt()
  @IsPositive()
  priceMinor!: number;
}
