import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReverseSettlementHoldDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  reasonCode?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reasonNote!: string;
}
