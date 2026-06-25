import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class ManualAdjustmentDto {
  @IsInt()
  amountMinor!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
