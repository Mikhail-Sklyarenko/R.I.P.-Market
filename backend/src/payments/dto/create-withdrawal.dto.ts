import { IsInt, IsString, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  toAddress!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;
}
