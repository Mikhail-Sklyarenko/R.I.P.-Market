import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NORTH_PAYMENT_METHODS } from '../../providers/payment/north/north.types';

export class CreateWithdrawalDto {
  @IsString()
  toAddress!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  /** Required for NORTH multi-rail; defaults to trc20. */
  @IsOptional()
  @IsIn([...NORTH_PAYMENT_METHODS])
  paymentMethod?: (typeof NORTH_PAYMENT_METHODS)[number];
}
