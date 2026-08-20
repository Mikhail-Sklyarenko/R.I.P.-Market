import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { NORTH_PAYMENT_METHODS } from '../../providers/payment/north/north.types';

export class CreateDepositCheckoutDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsIn([...NORTH_PAYMENT_METHODS])
  paymentMethod!: (typeof NORTH_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
