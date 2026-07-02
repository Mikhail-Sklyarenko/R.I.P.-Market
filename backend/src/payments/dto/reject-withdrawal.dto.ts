import { IsString } from 'class-validator';

export class RejectWithdrawalDto {
  @IsString()
  reason!: string;
}
