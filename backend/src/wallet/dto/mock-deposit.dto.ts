import { IsInt, IsPositive } from 'class-validator';

export class MockDepositDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}
