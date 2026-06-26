import { IsOptional, IsString } from 'class-validator';

export class UpdateTradeReferenceDto {
  @IsOptional()
  @IsString()
  offerId?: string;

  @IsOptional()
  @IsString()
  tradeUrl?: string;
}
